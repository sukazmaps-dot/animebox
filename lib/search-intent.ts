import type { Anime } from '@/types/anime';

export type AnimeSearchIntent = {
  original: string;
  normalized: string;
  titleQuery: string;
  seasonNumber: number | null;
  partNumber: number | null;
  episodeNumber: number | null;
  watchIntent: boolean;
};

export type TitleContinuationHints = {
  seasonNumber: number | null;
  partNumber: number | null;
  continuationStem: string;
};

const WATCH_NOISE = [
  /(?:^|\s)смотреть(?=\s|$|[.,!?;:])/giu,
  /(?:^|\s)посмотреть(?=\s|$|[.,!?;:])/giu,
  /(?:^|\s)аниме(?=\s|$|[.,!?;:])/giu,
  /(?:^|\s)онлайн(?=\s|$|[.,!?;:])/giu,
  /(?:^|\s)online(?=\s|$|[.,!?;:])/giu,
  /(?:^|\s)watch(?=\s|$|[.,!?;:])/giu,
  /(?:^|\s)бесплатно(?=\s|$|[.,!?;:])/giu,
  /(?:^|\s)все\s+серии(?=\s|$|[.,!?;:])/giu,
  /(?:^|\s)все\s+эпизоды(?=\s|$|[.,!?;:])/giu,
];

const EN_ORDINALS: Record<string, number> = {
  first: 1,
  second: 2,
  third: 3,
  fourth: 4,
  fifth: 5,
  sixth: 6,
  seventh: 7,
  eighth: 8,
  ninth: 9,
  tenth: 10,
};

const RU_ORDINALS: Record<string, number> = {
  первый: 1,
  первая: 1,
  второй: 2,
  вторая: 2,
  третий: 3,
  третья: 3,
  четвертый: 4,
  четвёртый: 4,
  четвертая: 4,
  четвёртая: 4,
  пятый: 5,
  пятая: 5,
  шестой: 6,
  шестая: 6,
  седьмой: 7,
  седьмая: 7,
  восьмой: 8,
  восьмая: 8,
  девятый: 9,
  девятая: 9,
  десятый: 10,
  десятая: 10,
};

function compactSpaces(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function normalizeForParsing(value: string) {
  return compactSpaces(
    value
      .normalize('NFKC')
      .toLocaleLowerCase('ru-RU')
      .replace(/[«»“”„]/g, '"')
      .replace(/[–—]/g, '-'),
  );
}

function finitePositive(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 && parsed <= 999
    ? parsed
    : null;
}

function wordOrdinal(value: string): number | null {
  const normalized = normalizeForParsing(value);
  return EN_ORDINALS[normalized] ?? RU_ORDINALS[normalized] ?? null;
}

function extractSeasonNumber(value: string): number | null {
  const normalized = normalizeForParsing(value);

  const patterns = [
    // Prefer `2 сезон` over the following token. Without this precedence a
    // query like `2 сезон 4 серия` could be misread as `сезон 4`.
    /(?:^|\s)(\d{1,3})\s*(?:-?й|-?я|-?ый|-?ая|st|nd|rd|th)?\s*(?:season|сезон)(?=\s|$|[.:,;!?])/iu,
    /(?:^|\s)(?:season|сезон)\s*[:#.-]?\s*(\d{1,3})(?=\s|$|[.:,;!?])/iu,
    /(?:^|\s)s\s*[-_.]?\s*(\d{1,2})(?=\s|$|[.:,;!?])/iu,
    /第\s*(\d{1,2})\s*期/u,
  ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    const number = finitePositive(match?.[1]);
    if (number) return number;
  }

  const wordMatch = normalized.match(
    /(?:^|\s)(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|перв(?:ый|ая)|втор(?:ой|ая)|трет(?:ий|ья)|четв[её]рт(?:ый|ая)|пят(?:ый|ая)|шест(?:ой|ая)|седьм(?:ой|ая)|восьм(?:ой|ая)|девят(?:ый|ая)|десят(?:ый|ая))\s+(?:season|сезон)/iu,
  );

  return wordMatch ? wordOrdinal(wordMatch[1]) : null;
}

function extractPartNumber(value: string): number | null {
  const normalized = normalizeForParsing(value);
  const patterns = [
    /(?:^|\s)(?:part|часть|cour|кур)\s*[:#.-]?\s*(\d{1,3})(?=\s|$|[.:,;!?])/iu,
    /(?:^|\s)(\d{1,3})\s*(?:st|nd|rd|th)?\s*(?:part|часть|cour|кур)(?=\s|$|[.:,;!?])/iu,
  ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    const number = finitePositive(match?.[1]);
    if (number) return number;
  }

  return null;
}

function extractEpisodeNumber(value: string): number | null {
  const normalized = normalizeForParsing(value);
  const patterns = [
    /(?:^|\s)(?:серия|серии|эпизод|episode|ep)\s*[:#.-]?\s*(\d{1,4})(?=\s|$|[.:,;!?])/iu,
    /(?:^|\s)(\d{1,4})\s*(?:серия|серии|эпизод|episode|ep)(?=\s|$|[.:,;!?])/iu,
  ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    const number = finitePositive(match?.[1]);
    if (number) return number;
  }

  return null;
}

function stripStructuredMarkers(value: string) {
  return compactSpaces(
    value
      .replace(/(?:^|\s)(?:season|сезон)\s*[:#.-]?\s*\d{1,3}(?=\s|$|[.:,;!?])/giu, ' ')
      .replace(/(?:^|\s)\d{1,3}\s*(?:-?й|-?я|-?ый|-?ая|st|nd|rd|th)?\s*(?:season|сезон)(?=\s|$|[.:,;!?])/giu, ' ')
      .replace(/(?:^|\s)s\s*[-_.]?\s*\d{1,2}(?=\s|$|[.:,;!?])/giu, ' ')
      .replace(/(?:^|\s)(?:first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|перв(?:ый|ая)|втор(?:ой|ая)|трет(?:ий|ья)|четв[её]рт(?:ый|ая)|пят(?:ый|ая)|шест(?:ой|ая)|седьм(?:ой|ая)|восьм(?:ой|ая)|девят(?:ый|ая)|десят(?:ый|ая))\s+(?:season|сезон)(?=\s|$|[.:,;!?])/giu, ' ')
      .replace(/第\s*\d{1,2}\s*期/gu, ' ')
      .replace(/(?:^|\s)(?:part|часть|cour|кур)\s*[:#.-]?\s*\d{1,3}(?=\s|$|[.:,;!?])/giu, ' ')
      .replace(/(?:^|\s)\d{1,3}\s*(?:st|nd|rd|th)?\s*(?:part|часть|cour|кур)(?=\s|$|[.:,;!?])/giu, ' ')
      .replace(/(?:^|\s)(?:серия|серии|эпизод|episode|ep)\s*[:#.-]?\s*\d{1,4}(?=\s|$|[.:,;!?])/giu, ' ')
      .replace(/(?:^|\s)\d{1,4}\s*(?:серия|серии|эпизод|episode|ep)(?=\s|$|[.:,;!?])/giu, ' '),
  );
}

export function parseAnimeSearchIntent(raw: string): AnimeSearchIntent {
  const original = raw.trim();
  const normalized = normalizeForParsing(original);
  const seasonNumber = extractSeasonNumber(normalized);
  const partNumber = extractPartNumber(normalized);
  const episodeNumber = extractEpisodeNumber(normalized);
  const watchIntent = /(?:^|\s)(смотреть|посмотреть|watch|онлайн|online)(?=\s|$|[.,!?;:])/iu.test(normalized);

  let titleQuery = stripStructuredMarkers(normalized);
  for (const pattern of WATCH_NOISE) titleQuery = titleQuery.replace(pattern, ' ');

  titleQuery = compactSpaces(
    titleQuery
      .replace(/^[\s:;,.\-–—|]+|[\s:;,.\-–—|]+$/g, '')
      .replace(/\s{2,}/g, ' '),
  );

  // Never turn a meaningful query into an empty upstream search.
  if (!titleQuery) titleQuery = normalized;

  return {
    original,
    normalized,
    titleQuery,
    seasonNumber,
    partNumber,
    episodeNumber,
    watchIntent,
  };
}

function normalizeTitleForComparison(value: string) {
  return compactSpaces(
    value
      .normalize('NFKC')
      .toLocaleLowerCase('ru-RU')
      .replace(/[’'`]/g, '')
      .replace(/[^\p{L}\p{N}]+/gu, ' '),
  );
}

function continuationStem(value: string) {
  return compactSpaces(
    normalizeTitleForComparison(value)
      .replace(/\b(?:part|часть|cour|кур)\s*\d{1,3}\b/giu, ' ')
      .replace(/\b\d{1,3}(?:st|nd|rd|th)?\s*(?:part|cour)\b/giu, ' '),
  );
}

export function getTitleContinuationHints(value: string): TitleContinuationHints {
  return {
    seasonNumber: extractSeasonNumber(value),
    partNumber: extractPartNumber(value),
    continuationStem: continuationStem(value),
  };
}

function animeTitles(anime: Anime): string[] {
  return [
    anime.title?.russian,
    anime.title?.romaji,
    anime.title?.english,
    anime.title?.native,
    anime.russian,
    anime.name,
  ].filter((value): value is string => typeof value === 'string' && Boolean(value.trim()));
}

function releaseTimestamp(anime: Anime) {
  const year = anime.startDate?.year ?? 9999;
  const month = anime.startDate?.month ?? 12;
  const day = anime.startDate?.day ?? 31;
  return year * 10_000 + month * 100 + day;
}

function isSeriesLike(anime: Anime) {
  const format = (anime.format ?? anime.kind ?? '').toLocaleLowerCase('ru-RU');
  return (
    format.includes('тв') ||
    format === 'tv' ||
    format.includes('ona') ||
    format.includes('сериал')
  );
}

function stemSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  if ((a.includes(b) || b.includes(a)) && Math.min(a.length, b.length) >= 8) return 0.92;

  const left = new Set(a.split(/\s+/).filter((token) => token.length >= 2));
  const right = new Set(b.split(/\s+/).filter((token) => token.length >= 2));
  if (!left.size || !right.size) return 0;
  let shared = 0;
  for (const token of left) if (right.has(token)) shared += 1;
  return shared / Math.max(left.size, right.size);
}

function normalizedSearchSeasonNumbers(candidates: Anime[]) {
  const seriesChronology = candidates
    .filter(isSeriesLike)
    .slice()
    .sort((a, b) => releaseTimestamp(a) - releaseTimestamp(b) || a.id - b.id);

  const result = new Map<number, number>();
  let nextSeason = 1;
  let previous: { season: number; stems: string[] } | null = null;

  for (const anime of seriesChronology) {
    const hints = animeTitles(anime).map(getTitleContinuationHints);
    const declaredSeason = hints.find((hint) => hint.seasonNumber)?.seasonNumber ?? null;
    const declaredPart = hints.find((hint) => hint.partNumber)?.partNumber ?? null;
    const stems = hints.map((hint) => hint.continuationStem).filter(Boolean);

    const previousValue = previous;
    const splitContinuation: boolean = Boolean(
      previousValue &&
      declaredPart &&
      declaredPart >= 2 &&
      stems.some((stem) =>
        previousValue.stems.some(
          (previousStem) => stemSimilarity(stem, previousStem) >= 0.72,
        ),
      ),
    );

    const season: number = declaredSeason
      ? declaredSeason
      : splitContinuation && previousValue
        ? previousValue.season
        : Math.max(nextSeason, (previousValue?.season ?? 0) + 1);

    result.set(anime.id, season);
    nextSeason = Math.max(nextSeason, season + 1);
    previous = { season, stems };
  }

  return result;
}

/**
 * Reorders an already relevant search candidate set for human queries such as
 * "смотреть джоджо 5 сезон". It never invents a result: only candidates that
 * AniList/Shikimori returned can move to the top.
 */
export function rankAnimeForSearchIntent(
  candidates: Anime[],
  intent: AnimeSearchIntent,
): Anime[] {
  if (!intent.seasonNumber && !intent.partNumber) return candidates;

  const normalizedSeasonNumber = normalizedSearchSeasonNumbers(candidates);
  const query = normalizeTitleForComparison(intent.titleQuery);

  return candidates
    .map((anime, originalIndex) => {
      const titles = animeTitles(anime);
      const hints = titles.map(getTitleContinuationHints);
      const normalizedTitles = titles.map(normalizeTitleForComparison);
      let score = 0;

      if (isSeriesLike(anime)) score += 90;
      else score -= 120;

      if (
        query &&
        normalizedTitles.some((title) => title === query || title.includes(query) || query.includes(title))
      ) {
        score += 80;
      }

      if (intent.seasonNumber) {
        if (hints.some((hint) => hint.seasonNumber === intent.seasonNumber)) score += 1_200;
        if (normalizedSeasonNumber.get(anime.id) === intent.seasonNumber) score += 700;
        // `Part 5` can be a narrative part (JoJo) rather than Season 5, so it
        // is only a weak hint when the user explicitly wrote "season".
        if (hints.some((hint) => hint.partNumber === intent.seasonNumber)) score += 120;
      }

      if (
        intent.partNumber &&
        hints.some((hint) => hint.partNumber === intent.partNumber)
      ) {
        score += 900;
      }

      return { anime, originalIndex, score };
    })
    .sort((a, b) => b.score - a.score || a.originalIndex - b.originalIndex)
    .map(({ anime }) => anime);
}
