import { failure, response, userClient } from '@/lib/community-server';
import { getUserEntitlements } from '@/lib/entitlements-server';
import { getUserChallengesSnapshot } from '@/lib/challenges-server';
import { normalizeProgression } from '@/lib/progression';
import { getTitleWatchOverviews } from '@/lib/watch-server';

export async function GET() {
  try {
    const { client, user } = await userClient();

    const [{ data, error }, entitlements, challenges] = await Promise.all([
      client.rpc('my_community_profile'),
      getUserEntitlements(user.id).catch(() => null),
      getUserChallengesSnapshot(user.id),
    ]);
    if (error) throw error;

    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      return response(data);
    }

    const profile = data as Record<string, unknown>;
    const rawLibrary = Array.isArray(profile.library)
      ? profile.library
      : [];

    const animeIds = rawLibrary
      .map((item) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) {
          return null;
        }

        const id = Number(
          (item as Record<string, unknown>).anime_id,
        );

        return Number.isSafeInteger(id) && id > 0 ? id : null;
      })
      .filter((value): value is number => value !== null);

    const overviews = await getTitleWatchOverviews(user.id, animeIds);
    const progressByAnime = new Map(
      overviews.map((item) => [item.animeId, item] as const),
    );

    return response({
      ...profile,
      progression: normalizeProgression(
        profile.progression,
        Boolean(entitlements?.premiumBadge),
      ),
      challenges,
      featuredAchievements: Array.isArray(profile.featured_achievements)
        ? profile.featured_achievements.filter(
            (code): code is string => typeof code === 'string',
          )
        : [],
      library: rawLibrary.map((item) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) {
          return item;
        }

        const row = item as Record<string, unknown>;
        const animeId = Number(row.anime_id);

        return {
          ...row,
          progress:
            Number.isSafeInteger(animeId) && animeId > 0
              ? progressByAnime.get(animeId) ?? null
              : null,
        };
      }),
    });
  } catch (error) {
    return failure(error);
  }
}
