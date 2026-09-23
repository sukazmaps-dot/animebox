import {
  getTelegramProfile,
  getNotificationDeliverySummary,
  getNotificationInbox,
  getNotificationServiceHealth,
  notificationFailure,
  notificationResponse,
  requireNotificationUser,
  sendTelegramMessage,
  NotificationError,
} from '@/lib/notifications-server';
import { readJsonBody } from '@/lib/community-server';

import { enforceIpAndUserRateLimit } from '@/lib/api-rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { client, user } = await requireNotificationUser();

    const [
      settingsResult,
      subscriptionsResult,
      telegramProfile,
      serviceHealth,
      lastDelivery,
      inbox,
    ] = await Promise.all([
        client
          .from('notification_settings')
          .select('telegram_enabled, telegram_verified_at, updated_at')
          .eq('user_id', user.id)
          .maybeSingle(),
        client
          .from('anime_notification_subscriptions')
          .select('anime_id, anime_slug, anime_title, enabled, min_episode, created_at, updated_at')
          .eq('user_id', user.id)
          .order('updated_at', { ascending: false }),
        getTelegramProfile(user.id),
        getNotificationServiceHealth(),
        getNotificationDeliverySummary(user.id),
        getNotificationInbox(user.id, 24),
      ]);

    if (settingsResult.error) throw settingsResult.error;
    if (subscriptionsResult.error) throw subscriptionsResult.error;

    return notificationResponse({
      ok: true,
      telegramLinked: Boolean(telegramProfile?.telegram_id),
      telegramEnabled: settingsResult.data?.telegram_enabled === true,
      telegramVerifiedAt: settingsResult.data?.telegram_verified_at ?? null,
      subscriptions: subscriptionsResult.data ?? [],
      serviceHealth,
      lastDelivery,
      inbox,
      unreadCount: inbox.filter((item) => !item.readAt).length,
    });
  } catch (error) {
    return notificationFailure(error);
  }
}

export async function POST(request: Request) {
  try {
    const { client, user } = await requireNotificationUser();
    const limited = await enforceIpAndUserRateLimit(request, user.id, {
      ip: { scope: 'notification_settings_write_ip', limit: 40, windowSeconds: 60 },
      user: { scope: 'notification_settings_write_user', limit: 30, windowSeconds: 60 },
    });
    if (limited) return limited;

    const body = await readJsonBody(request);

    if (typeof body.telegramEnabled !== 'boolean') {
      throw new NotificationError(
        400,
        'invalid_settings',
        'Некорректные настройки уведомлений.',
      );
    }

    const telegramEnabled = body.telegramEnabled;
    let telegramVerifiedAt: string | null = null;

    if (telegramEnabled) {
      const telegramProfile = await getTelegramProfile(user.id);

      if (!telegramProfile?.telegram_id) {
        throw new NotificationError(
          409,
          'telegram_not_linked',
          'Сначала привяжи Telegram к AnimeBox.',
        );
      }

      const { data: current, error: currentError } = await client
        .from('notification_settings')
        .select('telegram_verified_at')
        .eq('user_id', user.id)
        .maybeSingle();

      if (currentError) throw currentError;

      telegramVerifiedAt = current?.telegram_verified_at ?? null;

      if (!telegramVerifiedAt) {
        await sendTelegramMessage({
          chatId: String(telegramProfile.telegram_id),
          text:
            '🔔 <b>Уведомления AnimeBox включены</b>\n\n' +
            'Теперь я смогу сообщать тебе о новых сериях выбранных тайтлов.',
          webAppUrl: 'https://youranimebox.com/notifications',
          buttonText: 'Открыть уведомления',
        });

        telegramVerifiedAt = new Date().toISOString();
      }
    }

    const { error } = await client
      .from('notification_settings')
      .upsert(
        {
          user_id: user.id,
          telegram_enabled: telegramEnabled,
          ...(telegramVerifiedAt
            ? { telegram_verified_at: telegramVerifiedAt }
            : {}),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' },
      );

    if (error) throw error;

    return notificationResponse({
      ok: true,
      telegramEnabled,
      telegramVerifiedAt,
    });
  } catch (error) {
    return notificationFailure(error);
  }
}
