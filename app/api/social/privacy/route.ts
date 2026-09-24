import {
  failure,
  readBody,
  response,
  userClient,
} from '@/lib/community-server';
import {
  getSocialPrivacy,
  updateSocialPrivacy,
} from '@/lib/social-community-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { user } = await userClient();
    return response({
      privacy: await getSocialPrivacy(user.id),
    });
  } catch (error) {
    return failure(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const { user } = await userClient();
    const body = await readBody(request);

    const next: {
      showOnlineToFriends?: boolean;
      showActivityToFriends?: boolean;
    } = {};

    if (typeof body.showOnlineToFriends === 'boolean') {
      next.showOnlineToFriends = body.showOnlineToFriends;
    }
    if (typeof body.showActivityToFriends === 'boolean') {
      next.showActivityToFriends = body.showActivityToFriends;
    }

    if (!Object.keys(next).length) {
      return response({ error: 'Нет изменений.' }, 400);
    }

    return response({
      privacy: await updateSocialPrivacy(user.id, next),
    });
  } catch (error) {
    return failure(error);
  }
}
