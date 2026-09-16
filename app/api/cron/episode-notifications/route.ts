import { timingSafeEqual } from 'node:crypto';

import { createSupabaseAdmin } from '@/lib/supabase/admin';
import {
  escapeTelegramHtml,
  sendTelegramMessage,
  NotificationError,
} from '@/lib/notifications-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const ANILIST_API_URL = 'https://graphql.anilist.co';
const LOOKBACK_SECONDS = 6 * 60 * 60;
const FUTURE_GRACE_SECONDS = 60;
const MAX_PAGES = 8;
const RETRY_AFTER_MS = 10 * 60 * 1000;

const AIRING_QUERY = `
  query EpisodeNotificationSchedule(
    $page: Int
    $perPage: Int
    $from: Int
    $to: Int
  ) {
    Page(page: $page, perPage: $perPage) {
      pageInfo {
        hasNextPage
      }
      airingSchedules(
        airingAt_greater: $from
        airingAt_lesser: $to
        sort: TIME
      ) {
        id
        airingAt
        episode
        media {
          id
          title {
            romaji
            english
            native
          }
        }
      }
    }
  }
`;

type AiringItem = {
  id: number;
  airingAt: number;
  episode: number;
  media?: {
    id: number;
    title?: {
      romaji?: string | null;
      english?: string | null;
      native?: string | null;
    } | null;
  } | null;
};

type AiringResponse = {
  data?: {
    Page?: {
      pageInfo?: {
        hasNextPage?: boolean | null;
      } | null;
      airingSchedules?: Array<AiringItem | null> | null;
    } | null;
  };
  errors?: Array<{ message?: string }>;
};

type SubscriptionRow = {
  user_id: string;
  anime_id: number;
  anime_slug: string;
  anime_title: string;
  min_episode: number;
  enabled: boolean;
};

type DeliveryRow = {
  id: number;
  status: 'pending' | 'sent' | 'failed';
  attempts: number;
  attempted_at: string | null;
};

function secureEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);

  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function authorizeCron(request: Request) {
  const expected = process.env.CRON_SECRET?.trim();
  const provided = request.headers.get('x-cron-secret')?.trim() ?? '';

  if (!expected || !provided || !secureEqual(expected, provided)) {
    return false;
  }

  return true;
}

async function fetchRecentAiringItems(nowSeconds: number) {
  const from = nowSeconds - LOOKBACK_SECONDS;
  const to = nowSeconds + FUTURE_GRACE_SECONDS;
  const items: AiringItem[] = [];

  let page = 1;
  let hasNextPage = true;

  while (hasNextPage && page <= MAX_PAGES) {
    const response = await fetch(ANILIST_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      cache: 'no-store',
      body: JSON.stringify({
        query: AIRING_QUERY,
        variables: {
          page,
          perPage: 50,
          from,
          to,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`AniList HTTP ${response.status}`);
    }

    const payload = (await response.json()) as AiringResponse;

    if (payload.errors?.length) {
      throw new Error(payload.errors[0]?.message ?? 'AniList GraphQL error');
    }

    const pageData = payload.data?.Page;

    for (const item of pageData?.airingSchedules ?? []) {
      if (
        item?.media?.id &&
        Number.isSafeInteger(item.episode) &&
        item.episode > 0 &&
        item.airingAt <= nowSeconds
      ) {
        items.push(item);
      }
    }

    hasNextPage = pageData?.pageInfo?.hasNextPage === true;
    page += 1;
  }

  return Array.from(
    new Map(items.map((item) => [`${item.media!.id}:${item.episode}`, item])).values(),
  );
}

function scheduleTitle(item: AiringItem) {
  return (
    item.media?.title?.english?.trim() ||
    item.media?.title?.romaji?.trim() ||
    item.media?.title?.native?.trim() ||
    ''
  );
}

export async function POST(request: Request) {
  if (!authorizeCron(request)) {
    return Response.json(
      { ok: false, error: 'unauthorized' },
      { status: 401, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const startedAt = Date.now();
  const admin = createSupabaseAdmin();
  const nowSeconds = Math.floor(Date.now() / 1000);

  try {
    const airingItems = await fetchRecentAiringItems(nowSeconds);

    if (!airingItems.length) {
      return Response.json(
        { ok: true, checked: 0, matched: 0, sent: 0, failed: 0 },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const animeIds = [...new Set(airingItems.map((item) => item.media!.id))];

    const { data: subscriptionsData, error: subscriptionsError } = await admin
      .from('anime_notification_subscriptions')
      .select('user_id, anime_id, anime_slug, anime_title, min_episode, enabled')
      .eq('enabled', true)
      .in('anime_id', animeIds);

    if (subscriptionsError) throw subscriptionsError;

    const subscriptions = (subscriptionsData ?? []) as SubscriptionRow[];

    if (!subscriptions.length) {
      return Response.json(
        {
          ok: true,
          checked: airingItems.length,
          matched: 0,
          sent: 0,
          failed: 0,
        },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const userIds = [...new Set(subscriptions.map((item) => item.user_id))];

    const [profilesResult, settingsResult] = await Promise.all([
      admin
        .from('profiles')
        .select('id, telegram_id')
        .in('id', userIds),
      admin
        .from('notification_settings')
        .select('user_id, telegram_enabled, telegram_verified_at')
        .eq('telegram_enabled', true)
        .in('user_id', userIds),
    ]);

    if (profilesResult.error) throw profilesResult.error;
    if (settingsResult.error) throw settingsResult.error;

    const telegramByUser = new Map<string, string>();
    for (const row of profilesResult.data ?? []) {
      if (row.telegram_id != null) {
        telegramByUser.set(row.id, String(row.telegram_id));
      }
    }

    const enabledUsers = new Set(
      (settingsResult.data ?? [])
        .filter((row) => row.telegram_enabled && row.telegram_verified_at)
        .map((row) => row.user_id),
    );

    const schedulesByAnime = new Map<number, AiringItem[]>();
    for (const item of airingItems) {
      const animeId = item.media!.id;
      const bucket = schedulesByAnime.get(animeId) ?? [];
      bucket.push(item);
      schedulesByAnime.set(animeId, bucket);
    }

    let matched = 0;
    let sent = 0;
    let failed = 0;
    let skipped = 0;

    for (const subscription of subscriptions) {
      if (!enabledUsers.has(subscription.user_id)) continue;

      const chatId = telegramByUser.get(subscription.user_id);
      if (!chatId) continue;

      const schedules = schedulesByAnime.get(subscription.anime_id) ?? [];

      for (const schedule of schedules) {
        if (schedule.episode < Math.max(1, subscription.min_episode)) continue;

        matched += 1;

        const { data: existingData, error: existingError } = await admin
          .from('notification_deliveries')
          .select('id, status, attempts, attempted_at')
          .eq('user_id', subscription.user_id)
          .eq('anime_id', subscription.anime_id)
          .eq('episode', schedule.episode)
          .eq('channel', 'telegram')
          .maybeSingle();

        if (existingError) throw existingError;

        const existing = existingData as DeliveryRow | null;

        if (existing?.status === 'sent') {
          skipped += 1;
          continue;
        }

        if (
          existing?.status === 'pending' &&
          existing.attempted_at &&
          Date.now() - Date.parse(existing.attempted_at) < RETRY_AFTER_MS
        ) {
          skipped += 1;
          continue;
        }

        if (
          existing?.status === 'failed' &&
          existing.attempted_at &&
          Date.now() - Date.parse(existing.attempted_at) < RETRY_AFTER_MS
        ) {
          skipped += 1;
          continue;
        }

        const attemptedAt = new Date().toISOString();
        const nextAttempts = (existing?.attempts ?? 0) + 1;

        let deliveryId = existing?.id ?? null;

        if (deliveryId) {
          const { error } = await admin
            .from('notification_deliveries')
            .update({
              status: 'pending',
              attempts: nextAttempts,
              attempted_at: attemptedAt,
              error_code: null,
            })
            .eq('id', deliveryId);

          if (error) throw error;
        } else {
          const { data, error } = await admin
            .from('notification_deliveries')
            .insert({
              user_id: subscription.user_id,
              anime_id: subscription.anime_id,
              episode: schedule.episode,
              channel: 'telegram',
              status: 'pending',
              attempts: nextAttempts,
              attempted_at: attemptedAt,
            })
            .select('id')
            .single();

          if (error) {
            if ((error as { code?: string }).code === '23505') {
              skipped += 1;
              continue;
            }
            throw error;
          }

          deliveryId = data.id;
        }

        const title = subscription.anime_title || scheduleTitle(schedule) || 'Аниме';
        const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://youranimebox.com').replace(/\/$/, '');
        const watchUrl = `${siteUrl}/anime/${encodeURIComponent(subscription.anime_slug)}/episode/${schedule.episode}`;

        try {
          const telegram = await sendTelegramMessage({
            chatId,
            text:
              `🔔 <b>${escapeTelegramHtml(title)}</b>\n\n` +
              `Вышла <b>${schedule.episode}-я серия</b> по расписанию AnimeBox.\n` +
              'Можно сразу открыть страницу просмотра.',
            webAppUrl: watchUrl,
            buttonText: `▶ Смотреть ${schedule.episode} серию`,
          });

          const { error } = await admin
            .from('notification_deliveries')
            .update({
              status: 'sent',
              telegram_message_id: telegram.messageId,
              sent_at: new Date().toISOString(),
              error_code: null,
            })
            .eq('id', deliveryId);

          if (error) throw error;
          sent += 1;
        } catch (error) {
          failed += 1;

          const code =
            error instanceof NotificationError
              ? error.code
              : 'telegram_send_failed';

          await admin
            .from('notification_deliveries')
            .update({
              status: 'failed',
              error_code: code,
            })
            .eq('id', deliveryId);

          if (code === 'telegram_write_access_required') {
            await admin
              .from('notification_settings')
              .update({
                telegram_enabled: false,
                telegram_verified_at: null,
                updated_at: new Date().toISOString(),
              })
              .eq('user_id', subscription.user_id);
          }

          console.warn('[Episode notifications] Telegram delivery failed:', {
            userId: subscription.user_id,
            animeId: subscription.anime_id,
            episode: schedule.episode,
            code,
          });
        }
      }
    }

    return Response.json(
      {
        ok: true,
        checked: airingItems.length,
        matched,
        sent,
        failed,
        skipped,
        durationMs: Date.now() - startedAt,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    console.error('[Episode notifications] cron failed:', error);

    return Response.json(
      {
        ok: false,
        error: 'cron_failed',
        durationMs: Date.now() - startedAt,
      },
      {
        status: 500,
        headers: { 'Cache-Control': 'no-store' },
      },
    );
  }
}

export async function GET() {
  return Response.json(
    {
      ok: true,
      service: 'animebox-episode-notifications',
      method: 'POST',
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
