import {
  countUnreadSocialNotifications,
  listSocialNotifications,
  markSocialNotificationsRead,
} from '@/lib/social-notifications-server';
import {
  failure,
  readBody,
  response,
  userClient,
} from '@/lib/community-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { user } = await userClient();
    const url = new URL(request.url);
    const limit = Number(url.searchParams.get('limit') ?? 30);

    const [notifications, unread] = await Promise.all([
      listSocialNotifications(user.id, limit),
      countUnreadSocialNotifications(user.id),
    ]);

    return response({ notifications, unread });
  } catch (error) {
    return failure(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const { user } = await userClient();
    const body = await readBody(request);
    const ids = Array.isArray(body.ids)
      ? body.ids.map(Number).filter((value) => Number.isSafeInteger(value) && value > 0)
      : [];

    if (body.all !== true && ids.length === 0) {
      return response({ error: 'Некорректные уведомления.' }, 400);
    }

    await markSocialNotificationsRead(
      user.id,
      body.all === true ? undefined : ids,
    );

    return response({ ok: true });
  } catch (error) {
    return failure(error);
  }
}
