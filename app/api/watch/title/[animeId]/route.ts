import {
  failure,
  response,
  userClient,
} from '@/lib/community-server';
import { getTitleWatchOverviews } from '@/lib/watch-server';

export async function GET(
  _request: Request,
  context: { params: Promise<{ animeId: string }> },
) {
  try {
    const { user } = await userClient();
    const { animeId: rawAnimeId } = await context.params;
    const animeId = Number(rawAnimeId);

    if (!Number.isSafeInteger(animeId) || animeId <= 0) {
      return response({ item: null }, 400);
    }

    const [item = null] = await getTitleWatchOverviews(user.id, [animeId]);
    return response({ item });
  } catch (error) {
    return failure(error);
  }
}
