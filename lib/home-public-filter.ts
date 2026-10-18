import type { Anime } from '@/types/anime';

/** Metadata-only public home eligibility. Never guess whether unknown art is safe.
 * TODO: persist normalized content ratings in saved catalogue metadata. */
export function isHomePublicSafe(anime: Anime): boolean {
  const attributes = anime as unknown as Record<string, unknown>;
  if (attributes.isAdult === true || attributes.adult === true) return false;
  if ((anime.genres || []).some(genre => /^hentai$/i.test(genre))) return false;
  const rating = String(attributes.ageRating ?? attributes.contentRating ?? '').trim();
  return !/(?:18\+|r-?18|nc-?17|adults?\s*only|xxx|hentai)/i.test(rating);
}

/** Deterministic ID deduplication with editorial group precedence. */
export function uniqueHomeGroups(popular: Anime[], ongoing: Anime[]) {
  const seen = new Set<number>();
  const unique = (group: Anime[]) => group.filter(anime => {
    if (!anime || !Number.isSafeInteger(anime.id) || anime.id <= 0 || !isHomePublicSafe(anime) || seen.has(anime.id)) return false;
    seen.add(anime.id);
    return true;
  });
  return { popular: unique(popular), ongoing: unique(ongoing) };
}
