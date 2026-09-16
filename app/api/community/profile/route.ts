import { failure, response, userClient } from '@/lib/community-server';
import { getWatchSummary } from '@/lib/watch-server';

export async function GET() {
  try {
    const { client, user } = await userClient();

    const [{ data, error }, watchSummary] = await Promise.all([
      client.rpc('my_community_profile'),
      getWatchSummary(user.id),
    ]);

    if (error) throw error;

    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      return response(data);
    }

    const profile = data as Record<string, unknown>;
    const rawStats = profile.stats;

    if (!rawStats || typeof rawStats !== 'object' || Array.isArray(rawStats)) {
      return response(data);
    }

    return response({
      ...profile,
      stats: {
        ...(rawStats as Record<string, unknown>),
        episodes: watchSummary.completedEpisodes,
        minutes: Math.floor(watchSummary.activeMs / 60_000),
      },
    });
  } catch (error) {
    return failure(error);
  }
}
