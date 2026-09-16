import {
  getTelegramProfile,
  notificationFailure,
  notificationResponse,
  requireNotificationUser,
  NotificationError,
} from '@/lib/notifications-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { client, user } = await requireNotificationUser();

    const [settingsResult, subscriptionsResult, telegramProfile] =
      await Promise.all([
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
      ]);

    if (settingsResult.error) throw settingsResult.error;
    if (subscriptionsResult.error) throw subscriptionsResult.error;

    return notificationResponse({
      ok: true,
      telegramLinked: Boolean(telegramProfile?.telegram_id),
      telegramEnabled: settingsResult.data?.telegram_enabled === true,
      telegramVerifiedAt: settingsResult.data?.telegram_verified_at ?? null,
      subscriptions: subscriptionsResult.data ?? [],
    });
  } catch (error) {
    return notificationFailure(error);
  }
}

export async function POST(request: Request) {
  try {
    const { client, user } = await requireNotificationUser();
    const body = (await request.json()) as Record<string, unknown>;

    if (typeof body.telegramEnabled !== 'boolean') {
      throw new NotificationError(
        400,
        'invalid_settings',
        'Некорректные настройки уведомлений.',
      );
    }

    const telegramEnabled = body.telegramEnabled;

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

      if (!current?.telegram_verified_at) {
        throw new NotificationError(
          409,
          'telegram_not_verified',
          'Сначала включи уведомления у любого тайтла или отправь тестовое сообщение.',
        );
      }
    }

    const { error } = await client
      .from('notification_settings')
      .upsert(
        {
          user_id: user.id,
          telegram_enabled: telegramEnabled,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' },
      );

    if (error) throw error;

    return notificationResponse({
      ok: true,
      telegramEnabled,
    });
  } catch (error) {
    return notificationFailure(error);
  }
}
