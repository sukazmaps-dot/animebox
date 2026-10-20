import type { Anime, AnimeDate, AnimeImage } from '@/types/anime';

const text = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const nonnegative = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const positive = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0;

function mergeDate(primary: AnimeDate | null | undefined, fallback: AnimeDate | null | undefined) {
  if (!primary) return fallback ?? null;
  if (!fallback || (positive(primary.year) && positive(fallback.year) && primary.year !== fallback.year)) return primary;
  if (positive(primary.month) && positive(fallback.month) && primary.month !== fallback.month) return primary;
  return {
    year: positive(primary.year) ? primary.year : fallback.year,
    month: positive(primary.month) ? primary.month : fallback.month,
    day: positive(primary.day) ? primary.day : fallback.day,
  };
}

export function mergeAnimeImageSources(primary: AnimeImage | null | undefined, fallback: AnimeImage | null | undefined) {
  if (!primary) return fallback ?? null;
  if (!fallback) return primary;
  const result = {...primary};
  for (const key of ['extraLarge','large','medium','original','preview','color'] as const) {
    if (!text(result[key]) && text(fallback[key])) result[key] = fallback[key];
  }
  const primaryUrls = new Set([primary.extraLarge, primary.large, primary.medium, primary.original, primary.preview]);
  result.fallbackUrls = [...new Set([
    ...(primary.fallbackUrls ?? []),
    fallback.extraLarge, fallback.large, fallback.medium, fallback.original, fallback.preview,
    ...(fallback.fallbackUrls ?? []),
  ].filter((url): url is string => text(url) && !primaryUrls.has(url)))].slice(0, 6);
  return result;
}

/** Fill missing known fields of one title, without changing result membership or fresh values. */
export function mergeAnimeMetadata(primary: Anime, fallback: Anime | undefined): Anime {
  if (!fallback || primary.id !== fallback.id) return primary;
  const primaryMal = primary.idMal ?? primary.mal_id;
  const fallbackMal = fallback.idMal ?? fallback.mal_id;
  if (positive(primaryMal) && positive(fallbackMal) && primaryMal !== fallbackMal) return primary;

  const result: Anime = {...primary, title: {...primary.title}};
  // Coordinates belong to their art, not to an unrelated fallback image.
  if (!primary.mobileHeroPosition &&
      (!text(primary.mobileHeroImage) || primary.mobileHeroImage === fallback.mobileHeroImage)) {
    result.mobileHeroPosition = fallback.mobileHeroPosition;
  }
  for (const key of ['russian','romaji','english','native'] as const) {
    const a = primary.title?.[key], b = fallback.title?.[key];
    const mislabeled = (key === 'russian' && text(b) && /[А-Яа-яЁё]/.test(b) && (!text(a) || !/[А-Яа-яЁё]/.test(a))) ||
      (key === 'romaji' && text(a) && /[А-Яа-яЁё]/.test(a) && text(b) && !/[А-Яа-яЁё]/.test(b));
    if ((!text(a) || mislabeled) && text(b)) result.title[key] = b;
  }
  for (const key of ['slug','name','russian','description','format','kind','status','bannerImage','mobileHeroImage'] as const) {
    if (!text(result[key]) && text(fallback[key])) result[key] = fallback[key];
  }
  for (const key of ['idMal','mal_id','episodes','duration','score','averageScore'] as const) {
    if (!positive(result[key]) && positive(fallback[key])) result[key] = fallback[key];
  }
  for (const key of ['episodesAired','popularity','favourites'] as const) {
    if (!nonnegative(result[key]) && nonnegative(fallback[key])) result[key] = fallback[key];
  }
  for (const key of ['genres','tags','studios'] as const) {
    if (!Array.isArray(result[key]) || result[key].length === 0) {
      if (Array.isArray(fallback[key]) && fallback[key].length > 0) result[key] = [...fallback[key]];
    }
  }
  result.synonyms = [...new Set([...(primary.synonyms ?? []), ...(fallback.synonyms ?? [])])];
  result.startDate = mergeDate(primary.startDate, fallback.startDate);
  result.endDate = mergeDate(primary.endDate, fallback.endDate);
  result.coverImage = mergeAnimeImageSources(primary.coverImage, fallback.coverImage);
  result.image = mergeAnimeImageSources(primary.image, fallback.image);
  return result;
}

/** Incoming first-page order and membership are authoritative. Old data only fills matching IDs. */
export function enrichAnimeCards(incoming: Anime[], previous: Anime[]) {
  const byId = new Map(previous.map(anime => [anime.id, anime]));
  return incoming.map(anime => mergeAnimeMetadata(anime, byId.get(anime.id)));
}

export function mergeAnimePages(current: Anime[], incoming: Anime[]) {
  const byId = new Map(current.map(anime => [anime.id, anime]));
  for (const anime of incoming) byId.set(anime.id, mergeAnimeMetadata(anime, byId.get(anime.id)));
  return [...byId.values()];
}

/** A partial provider fallback may enrich, but cannot retract this query's
 * already verified results. A healthy response still owns membership/order.
 * Registry degradation deliberately fails closed instead of reviving previews.
 */
export function reconcileCatalogFirstPage(
  incoming: Anime[],
  previous: Anime[],
  options: {
    sameScope: boolean;
    partial: boolean;
    registryDegraded: boolean;
    excludedIds?: number[];
    preview?: boolean;
  },
) {
  const excluded = new Set(options.excludedIds ?? []);
  const allowedIncoming = incoming.filter(anime => !excluded.has(anime.id));
  const allowedPrevious = options.sameScope
    ? previous.filter(anime => !excluded.has(anime.id))
    : [];
  if (options.partial && !options.registryDegraded) {
    // Index shells supplement saved/provider fields, never replace known values.
    if (options.preview) {
      const existing = new Map(allowedPrevious.map(anime => [anime.id, anime]));
      return mergeAnimePages(allowedPrevious, allowedIncoming.map(anime => {
        const known = existing.get(anime.id);
        return known ? mergeAnimeMetadata(known, anime) : anime;
      }));
    }
    return mergeAnimePages(allowedPrevious, allowedIncoming);
  }
  return enrichAnimeCards(allowedIncoming, allowedPrevious);
}
