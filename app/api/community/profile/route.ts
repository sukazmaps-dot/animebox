import { failure, response, userClient } from '@/lib/community-server';
import { getTitleWatchOverviews } from '@/lib/watch-server';

export async function GET() {
  try {
    const { client, user } = await userClient();

    const { data, error } = await client.rpc('my_community_profile');
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
