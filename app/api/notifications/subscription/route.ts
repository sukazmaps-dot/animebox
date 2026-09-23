import {
  escapeTelegramHtml,
  getTelegramProfile,
  getAnimeNotificationEligibility,
  notificationFailure,
  notificationResponse,
  positiveAnimeId,
  requireNotificationUser,
  safeEpisode,
  safeSlug,
  safeTitle,
  sendTelegramMessage,
  NotificationError,
} from '@/lib/notifications-server';
import { readJsonBody } from '@/lib/community-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { client, user } = await requireNotificationUser();
    const animeId = positiveAnimeId(
      new URL(request.url).searchParams.get('animeId'),
    );

    const [
      subscriptionResult,
      settingsResult,
      telegramProfile,
      eligibility,
    ] = await Promise.all([
        client
          .from('anime_notification_subscriptions')
          .select('anime_id, enabled, min_episode, anime_slug, anime_title, created_at, updated_at')
          .eq('user_id', user.id)
          .eq('anime_id', animeId)
          .maybeSingle(),
        client
          .from('notification_settings')
          .select('telegram_enabled, telegram_verified_at')
          .eq('user_id', user.id)
          .maybeSingle(),
        getTelegramProfile(user.id),
        getAnimeNotificationEligibility(animeId),
      ]);

    if (subscriptionResult.error) throw subscriptionResult.error;
    if (settingsResult.error) throw settingsResult.error;

    return notificationResponse({
      ok: true,
      telegramLinked: Boolean(telegramProfile?.telegram_id),
      telegramReady: Boolean(
        settingsResult.data?.telegram_enabled &&
          settingsResult.data?.telegram_verified_at,
      ),
      enabled: subscriptionResult.data?.enabled === true,
      animeFinished: eligibility.finished,
      subscription: subscriptionResult.data ?? null,
    });
  } catch (error) {
    return notificationFailure(error);
  }
}

export async function POST(request: Request) {
  try {
    const { client, user } = await requireNotificationUser();
    const body = await readJsonBody(request);

    const animeId = positiveAnimeId(body.animeId);
    const enabled = body.enabled === true;

    if (!enabled) {
      const { error } = await client
        .from('anime_notification_subscriptions')
        .update({
          enabled: false,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', user.id)
        .eq('anime_id', animeId);

      if (error) throw error;

      return notificationResponse({
        ok: true,
        enabled: false,
      });
    }

    const episodesAired = safeEpisode(body.episodesAired);
    const animeSlug = safeSlug(body.animeSlug, animeId);
    const animeTitle = safeTitle(body.animeTitle);
    const eligibility = await getAnimeNotificationEligibility(animeId);

    if (eligibility.finished) {
      throw new NotificationError(
        409,
        'anime_finished',
        'Тайтл уже завершён — новых серий по расписанию не ожидается.',
      );
    }

    const telegramProfile = await getTelegramProfile(user.id);
    const telegramId = telegramProfile?.telegram_id;

    if (telegramId == null) {
      throw new NotificationError(
        409,
        'telegram_not_linked',
        'Сначала привяжи Telegram к AnimeBox.',
      );
    }

    const { data: settings, error: settingsError } = await client
      .from('notification_settings')
      .select('telegram_enabled, telegram_verified_at')
      .eq('user_id', user.id)
      .maybeSingle();

    if (settingsError) throw settingsError;

    let telegramVerifiedAt = settings?.telegram_verified_at ?? null;

    if (!telegramVerifiedAt) {
      await sendTelegramMessage({
        chatId: String(telegramId),
        text:
          '🔔 <b>Уведомления AnimeBox подключены</b>\n\n' +
          `Теперь я смогу сообщать о новых сериях, на которые ты подпишешься.\n\n` +
          `Первый тайтл: <b>${escapeTelegramHtml(animeTitle)}</b>`,
        webAppUrl: `https://youranimebox.com/anime/${encodeURIComponent(animeSlug)}`,
        buttonText: 'Открыть AnimeBox',
      });

      telegramVerifiedAt = new Date().toISOString();
    }

    const { error: saveSettingsError } = await client
      .from('notification_settings')
      .upsert(
        {
          user_id: user.id,
          telegram_enabled: true,
          telegram_verified_at: telegramVerifiedAt,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' },
      );

    if (saveSettingsError) throw saveSettingsError;

    const { error: saveSubscriptionError } = await client
      .from('anime_notification_subscriptions')
      .upsert(
        {
          user_id: user.id,
          anime_id: animeId,
          anime_slug: animeSlug,
          anime_title: animeTitle,
          enabled: true,
          min_episode: Math.max(1, episodesAired + 1),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,anime_id' },
      );

    if (saveSubscriptionError) throw saveSubscriptionError;

    return notificationResponse({
      ok: true,
      enabled: true,
      telegramReady: true,
      minEpisode: Math.max(1, episodesAired + 1),
    });
  } catch (error) {
    return notificationFailure(error);
  }
}
