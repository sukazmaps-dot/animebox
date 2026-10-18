import 'server-only';
import type { Anime } from '@/types/anime';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { createPublicResultCache } from '@/lib/public-result-cache';
import { mergeAnimeImageSources } from '@/lib/anime-metadata-merge';

type PosterRow = { mal_id: number; poster_url: string | null };
const posters = createPublicResultCache<PosterRow[]>({
  ttlMs: 10 * 60_000, maxEntries: 64, maxBytes: 1024 * 1024,
  cacheWhen: rows => rows.length > 0,
});

/** Existing metadata only: no provider calls, storage writes or ranking changes. */
export async function enrichAnimePosterSources(animes: Anime[]): Promise<Anime[]> {
  const ids = [...new Set(animes.map(anime => anime.idMal ?? anime.mal_id)
    .filter((id): id is number => Number.isSafeInteger(id) && Number(id) > 0))]
    .sort((a, b) => a - b).slice(0, 50);
  if (!ids.length) return animes;
  try {
    const rows = await posters(ids.join(','), async () => {
      const { data, error } = await createSupabaseAdmin()
        .from('anime_shikimori_metadata').select('mal_id,poster_url').in('mal_id', ids)
        .abortSignal(AbortSignal.timeout(1200));
      if (error) throw new Error(error.message);
      return (data ?? []) as PosterRow[];
    });
    const byId = new Map(rows.map(row => [Number(row.mal_id), row.poster_url]));
    return animes.map(anime => {
      const url = byId.get(Number(anime.idMal ?? anime.mal_id));
      return url ? { ...anime, coverImage: mergeAnimeImageSources(anime.coverImage, { original: url }) } : anime;
    });
  } catch {
    // Optional posters cannot turn an otherwise valid catalogue into an outage.
    return animes;
  }
}
