import { requireAdmin } from '@/lib/admin-server';
import { consumeRateLimit } from '@/lib/api-rate-limit';
import { ApiError, failure } from '@/lib/community-server';
import { optionalServerSecret } from '@/lib/env/server';
import { diagnoseTelegramWebhook } from '@/lib/telegram/webhook-health';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { user } = await requireAdmin(['owner']);
    const permitted = await consumeRateLimit(`telegram-health:${user.id}`, {
      scope: 'telegram_health_owner', limit: 10, windowSeconds: 60,
    });
    if (!permitted) throw new ApiError(429, 'Подожди минуту перед повторной проверкой Telegram.');
    const health = await diagnoseTelegramWebhook({
      token: optionalServerSecret('TELEGRAM_BOT_TOKEN'),
      secret: optionalServerSecret('TELEGRAM_WEBHOOK_SECRET'),
    });
    return Response.json({ ok: true, health }, {
      headers: { 'Cache-Control': 'private, no-store', 'CDN-Cache-Control': 'no-store' },
    });
  } catch (error) {
    if (error instanceof ApiError) return failure(error);
    return Response.json({ ok: false, error: 'telegram_health_unavailable' }, {
      status: 503, headers: { 'Cache-Control': 'private, no-store' },
    });
  }
}
