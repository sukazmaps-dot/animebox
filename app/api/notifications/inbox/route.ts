import {
  markNotificationInboxRead,
  notificationFailure,
  notificationResponse,
  requireNotificationUser,
} from '@/lib/notifications-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PATCH(request: Request) {
  try {
    const { user } = await requireNotificationUser();
    const body = (await request.json().catch(() => ({}))) as {
      ids?: unknown;
      all?: unknown;
    };

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
