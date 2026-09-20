import {
  failure,
  response,
  userClient,
} from '@/lib/community-server';
import { getRecentWatchTitles } from '@/lib/watch-server';

export async function GET(request: Request) {
  try {
    const { user } = await userClient();
    const rawLimit = Number(
      new URL(request.url).searchParams.get('limit') || 4,
    );
    const limit =
      Number.isSafeInteger(rawLimit) && rawLimit > 0
        ? Math.min(12, rawLimit)
        : 4;

    const items = await getRecentWatchTitles(user.id, limit);
    return response({ items });
  } catch (error) {
    return failure(error);
  }
}
