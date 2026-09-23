import {
  getTelegramProfile,
  notificationFailure,
  notificationResponse,
  requireNotificationUser,
  sendTelegramMessage,
  NotificationError,
} from '@/lib/notifications-server';
import { assertBrowserMutationRequest } from '@/lib/community-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  assertBrowserMutationRequest(request);
  try {
    const { client, user } = await requireNotificationUser();
    const telegramProfile = await getTelegramProfile(user.id);

    if (!telegramProfile?.telegram_id) {
      throw new NotificationError(
        409,
        'telegram_not_linked',
        'Сначала привяжи Telegram к AnimeBox.',
      );
    }

    await sendTelegramMessage({
      chatId: String(telegramProfile.telegram_id),
      text:
        '✅ <b>Тест AnimeBox</b>\n\n' +
        'Telegram-уведомления работают. Когда выйдет новая серия подписанного тайтла, сообщение придёт сюда.',
      webAppUrl: 'https://youranimebox.com/notifications',
      buttonText: 'Настройки уведомлений',
    });

    const now = new Date().toISOString();

    const { error } = await client
      .from('notification_settings')
      .upsert(
        {
          user_id: user.id,
          telegram_enabled: true,
          telegram_verified_at: now,
          updated_at: now,
        },
        { onConflict: 'user_id' },
      );

    if (error) throw error;

    return notificationResponse({
      ok: true,
      telegramEnabled: true,
      telegramVerifiedAt: now,
    });
  } catch (error) {
    return notificationFailure(error);
  }
}
