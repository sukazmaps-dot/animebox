import {
  failure,
  response,
  userClient,
} from '@/lib/community-server';
import { getFriendActivity } from '@/lib/social-community-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { user } = await userClient();
    const rawLimit = Number(
      new URL(request.url).searchParams.get('limit') ?? 24,
    );
    const limit =
      Number.isSafeInteger(rawLimit) && rawLimit > 0
        ? Math.min(40, rawLimit)
        : 24;

    return response({
      activity: await getFriendActivity(user.id, limit),
    });
  } catch (error) {
    return failure(error);
  }
}
