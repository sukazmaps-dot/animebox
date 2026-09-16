import type { Anime } from '@/types/anime';

// Keep AniList and MAL namespaces separate; also catch duplicate MAL aliases.
function keys(anime: Anime): string[] {
  const result = [`anilist:${anime.id}`];
  for (const id of [anime.idMal, anime.mal_id]) {
    if (id != null && id > 0) result.push(`mal:${id}`);
  }
  return result;
}

export function filterRecommendations(candidates: Anime[], displayedOngoing: Anime[]): Anime[] {
  const seen = new Set(displayedOngoing.flatMap(keys));
  return candidates.filter((anime) => {
    const ids = keys(anime);
    if (ids.some((id) => seen.has(id))) return false;
    ids.forEach((id) => seen.add(id));
    return true;
  });
}
