import 'server-only';

import { unstable_cache } from 'next/cache';
import { getAnimesWithShikimori } from '@/lib/combined-anime';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { findAnimeGenre, animeTaxonomyValueMatches } from '@/lib/anime-taxonomy';
import { localAnimeSearchHitToAnime } from '@/lib/search-index-server';
import type { Anime } from '@/types/anime';

class EmptyGenreResult extends Error {}

// Cache only successful, genre-correct collections. Errors do not become an
// hour-long empty collection; the route remains dynamic while this data caches.
const primaryGenreCollection = unstable_cache(async (genre: string) => {
  const items = await getAnimesWithShikimori({ page: 1, limit: 24, order: 'popularity', genres: [genre] }, { signal: AbortSignal.timeout(5_000) });
  const option = findAnimeGenre(genre);
  const matching = option ? items.filter(item => animeTaxonomyValueMatches(item.genres, option)) : [];
  if (!matching.length) throw new EmptyGenreResult('Empty genre collection');
  return matching;
}, ['seo-genre-collection-v2'], { revalidate: 3600 });

export async function getGenreLandingCollection(genre: string, label: string): Promise<{
  items: Anime[]; status: 'ready' | 'fallback' | 'empty' | 'unavailable';
}> {
  let empty = false;
  try {
    return { items: await primaryGenreCollection(genre), status: 'ready' };
  } catch (error) {
    empty = error instanceof EmptyGenreResult;
    console.warn('[SEO genre collection]', genre, error instanceof Error ? error.message : 'source_unavailable');
  }
  try {
    // Durable catalog documents contain real genre assignments and local posters.
    // Do not hydrate via the provider that just failed, or return unrelated titles.
    const option = findAnimeGenre(genre);
    if (!option) return { items: [], status: 'empty' };
    const { data, error } = await createSupabaseAdmin().from('anime_search_documents')
      .select('anime_id,title,slug,poster_url,genres')
      .overlaps('genres', [...new Set([genre, label, ...option.aliases])]).not('poster_url', 'is', null)
      .order('anime_id', { ascending: false }).limit(24);
    if (error) throw error;
    const items = (data ?? []).filter(row => animeTaxonomyValueMatches(row.genres, option))
      .map(row => localAnimeSearchHitToAnime({ animeId: Number(row.anime_id), title: row.title,
        slug: row.slug, posterUrl: row.poster_url, genres: row.genres,
        score: 0, matchedText: null, matchKind: null }));
    if (items.length) return { items, status: 'fallback' };
    return { items: [], status: empty ? 'empty' : 'unavailable' };
  } catch (error) {
    console.warn('[SEO genre local fallback]', genre, error instanceof Error ? error.message : 'fallback_unavailable');
    return { items: [], status: 'unavailable' };
  }
}
