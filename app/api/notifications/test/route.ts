import {
  getTelegramProfile,
  notificationFailure,
  notificationResponse,
  requireNotificationUser,
  sendTelegramMessage,
  NotificationError,
} from '@/lib/notifications-server';
import { assertBrowserMutationRequest } from '@/lib/community-server';

import { enforceIpAndUserRateLimit } from '@/lib/api-rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    assertBrowserMutationRequest(request);
    const { client, user } = await requireNotificationUser();
    const limited = await enforceIpAndUserRateLimit(request, user.id, {
      ip: { scope: 'notification_test_ip', limit: 12, windowSeconds: 600 },
      user: { scope: 'notification_test_user', limit: 5, windowSeconds: 600 },
    });
    if (limited) return limited;
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
