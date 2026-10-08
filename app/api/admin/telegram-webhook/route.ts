import { requireAdmin, requireAdminMutation, writeAdminAudit } from '@/lib/admin-server';
import { ApiError, readJsonBody, response } from '@/lib/community-server';
import { getTelegramWebhookStatus, repairTelegramWebhook, TelegramWebhookError } from '@/lib/telegram-webhook-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function failure(error: unknown) {
  if (error instanceof ApiError) return response({ ok: false, error: error.message }, error.status);
  if (error instanceof TelegramWebhookError) return response({ ok: false, error: error.message }, 502);
  return response({ ok: false, error: 'Не удалось выполнить операцию с webhook.' }, 503);
}

export async function GET() {
  try {
    await requireAdmin(['owner', 'admin']);
    return response({ ok: true, status: await getTelegramWebhookStatus() });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request) {
  try {
    const { user, role } = await requireAdminMutation(request, ['owner']);
    const body = await readJsonBody(request, { maxBytes: 1024 });
    if (body.action !== 'repair') throw new ApiError(400, 'Неизвестное действие.');
    await writeAdminAudit({
      actorId: user.id, actorRole: role, action: 'telegram_webhook_repair_attempt',
      targetType: 'telegram_webhook', request,
    });
    const status = await repairTelegramWebhook();
    let auditRecorded = true;
    try { await writeAdminAudit({
      actorId: user.id,
      actorRole: role,
      action: 'telegram_webhook_repair',
      targetType: 'telegram_webhook',
      details: { urlMatches: status.urlMatches, pendingUpdates: status.pendingUpdates },
      request,
    }); } catch {
      auditRecorded = false;
      console.error('[Telegram recovery] result_audit_unavailable');
    }
    return response({ ok: true, status, warning: auditRecorded ? null : 'Webhook восстановлен, но запись результата в журнал недоступна.' });
  } catch (error) {
    return failure(error);
  }
}
