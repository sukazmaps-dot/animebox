import {
  actOnFriendship,
  getFriendshipStatus,
  listFriends,
  removeFriend,
  requestFriendship,
} from '@/lib/friends-server';
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
    const targetUserId = url.searchParams.get('userId')?.trim();

    if (targetUserId) {
      return response(await getFriendshipStatus(user.id, targetUserId));
    }

    return response(await listFriends(user.id));
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request) {
  try {
    const { user } = await userClient();
    const body = await readBody(request);
    const targetUserId =
      typeof body.userId === 'string' ? body.userId.trim() : '';

    return response(await requestFriendship(user.id, targetUserId), 201);
  } catch (error) {
    return failure(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const { user } = await userClient();
    const body = await readBody(request);

    const friendshipId =
      typeof body.friendshipId === 'string' ? body.friendshipId.trim() : '';
    const action =
      body.action === 'accept' ||
      body.action === 'decline' ||
      body.action === 'cancel'
        ? body.action
        : null;

    if (!action) {
      return response({ error: 'Некорректное действие.' }, 400);
    }

    return response(await actOnFriendship(user.id, friendshipId, action));
  } catch (error) {
    return failure(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const { user } = await userClient();
    const url = new URL(request.url);
    const targetUserId = url.searchParams.get('userId')?.trim() ?? '';

    return response(await removeFriend(user.id, targetUserId));
  } catch (error) {
    return failure(error);
  }
}
