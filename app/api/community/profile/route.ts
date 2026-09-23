import { failure, response, userClient } from '@/lib/community-server';
import { normalizeProgression } from '@/lib/progression';
import { watchTitleOverviewsFromRpcRows } from '@/lib/watch-server';

export async function GET() {
  try {
    const { client } = await userClient();

    const { data, error } = await client.rpc('my_community_profile_bundle');
    if (error) throw error;

    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      return response(data);
    }

    const profile = data as Record<string, unknown>;
    const rawLibrary = Array.isArray(profile.library)
      ? profile.library
      : [];
    const overviews = watchTitleOverviewsFromRpcRows(
      profile.watch_overview_rows,
    );
    const progressByAnime = new Map(
      overviews.map((item) => [item.animeId, item] as const),
    );

    const {
      watch_overview_rows: _watchOverviewRows,
      premium_badge: premiumBadge,
      featured_achievements: featuredAchievements,
      ...publicProfile
    } = profile;

    return response({
      ...publicProfile,
      progression: normalizeProgression(
        profile.progression,
        Boolean(premiumBadge),
      ),
      challenges: profile.challenges ?? null,
      featuredAchievements: Array.isArray(featuredAchievements)
        ? featuredAchievements.filter(
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
