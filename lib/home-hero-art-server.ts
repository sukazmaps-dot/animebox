import 'server-only';

import { getAnimesByIds } from '@/lib/anilist';
import { createPublicResultCache } from '@/lib/public-result-cache';
import type { Anime } from '@/types/anime';

// One batch per feed cache fill, never one provider request per card.
const loadArt = createPublicResultCache<Anime[]>({
  ttlMs: 15 * 60_000,
  maxEntries: 16,
  cacheWhen: items => items.length > 0,
});

/** Art alone is optional: scores, order, titles and availability stay authoritative. */
export async function enrichHomeHeroArt(animes: Anime[]): Promise<Anime[]> {
  const ids = [...new Set(animes.filter(item => !item.bannerImage)
    .map(item => item.id).filter(id => Number.isSafeInteger(id) && id > 0))]
    .slice(0, 24).sort((a, b) => a - b);
  if (!ids.length) return animes;
  try {
    const art = await loadArt(ids.join(','), () => getAnimesByIds(ids, {
      signal: AbortSignal.timeout(2_000),
    }));
    const byId = new Map(art.map(item => [item.id, item]));
    return animes.map(item => {
      const match = byId.get(item.id);
      if (!match) return item;
      const mal = item.idMal ?? item.mal_id;
      const otherMal = match.idMal ?? match.mal_id;
      if (mal && otherMal && mal !== otherMal) return item;
      return {
        ...item,
        bannerImage: item.bannerImage || match.bannerImage,
        // AniList's real extraLarge URL may differ from saved poster_url.
        coverImage: {
          ...match.coverImage, ...item.coverImage,
          extraLarge: match.coverImage?.extraLarge || item.coverImage?.extraLarge,
        },
      };
    });
  } catch {
    return animes;
  }
}
