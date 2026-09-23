import {
  markNotificationInboxRead,
  notificationFailure,
  notificationResponse,
  requireNotificationUser,
} from '@/lib/notifications-server';
import { readJsonBody } from '@/lib/community-server';
import { enforceIpAndUserRateLimit } from '@/lib/api-rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PATCH(request: Request) {
  try {
    const { user } = await requireNotificationUser();
    const limited = await enforceIpAndUserRateLimit(request, user.id, {
      ip: { scope: 'notification_inbox_write_ip', limit: 120, windowSeconds: 60 },
      user: { scope: 'notification_inbox_write_user', limit: 90, windowSeconds: 60 },
    });
    if (limited) return limited;

    const body = await readJsonBody(request);

    const ids = Array.isArray(body.ids)
      ? body.ids
          .map((value) => Number(value))
          .filter((value) => Number.isSafeInteger(value) && value > 0)
          .slice(0, 50)
      : [];

    if (body.all !== true && ids.length === 0) {
      return notificationResponse(
        { ok: false, error: 'invalid_delivery_ids' },
        400,
      );
    }

    await markNotificationInboxRead(
      user.id,
      body.all === true ? undefined : ids,
    );

    return notificationResponse({ ok: true });
  } catch (error) {
    return notificationFailure(error);
  }
}
