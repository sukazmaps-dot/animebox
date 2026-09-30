import type { Anime } from '@/types/anime';

export type RecommendationFranchiseSignal = {
  familyKey: string | null;
  seasonNumber: number | null;
  partNumber: number | null;
  requiresPrevious: boolean;
  continuation: boolean;
  continuationScore: number;
  blockedByPrerequisite: boolean;
};

type FranchiseHistoryRecord = {
  maxSeason: number;
  partsBySeason: Map<number, number>;
  animeIds: Set<number>;
};

export type RecommendationFranchiseHistoryIndex =
  Map<string, FranchiseHistoryRecord>;

function animeTitles(anime: Anime): string[] {
  return [
    anime.title?.russian,
    anime.russian,
    anime.title?.romaji,
    anime.title?.english,
    anime.title?.native,
    anime.name,
  ].filter(
    (value): value is string =>
      typeof value === 'string' && Boolean(value.trim()),
  );
}

function normalizeTitle(value: string): string {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase('ru-RU')
    .replace(/ё/g, 'е')
    .replace(/[’'`]/g, '')
    .replace(/[–—]/g, '-')
    .replace(/[^\p{L}\p{N}#.:\-]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function positiveSequenceNumber(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 && parsed <= 99
    ? parsed
    : null;
}

function seasonNumber(value: string): number | null {
  const normalized = normalizeTitle(value);
  const patterns = [
    /(?:^|\s)(\d{1,2})\s*(?:st|nd|rd|th|-?й|-?я|-?ый|-?ая)?\s*(?:season|сезон)(?=\s|$|[.:,;!?-])/iu,
    /(?:^|\s)(?:season|сезон)\s*[:#.-]?\s*(\d{1,2})(?=\s|$|[.:,;!?-])/iu,
    /第\s*(\d{1,2})\s*期/u,
  ];

  for (const pattern of patterns) {
    const number = positiveSequenceNumber(normalized.match(pattern)?.[1]);
    if (number) return number;
  }

  return null;
}

function partNumber(value: string): number | null {
  const normalized = normalizeTitle(value);
  const patterns = [
    /(?:^|\s)(?:part|часть|cour|кур)\s*[:#.-]?\s*(\d{1,2})(?=\s|$|[.:,;!?-])/iu,
    /(?:^|\s)(\d{1,2})\s*(?:st|nd|rd|th)?\s*(?:part|часть|cour|кур)(?=\s|$|[.:,;!?-])/iu,
  ];

  for (const pattern of patterns) {
    const number = positiveSequenceNumber(normalized.match(pattern)?.[1]);
    if (number) return number;
  }

  return null;
}

function stripSequenceMarkers(value: string): string {
  return normalizeTitle(value)
    .replace(/(?:^|\s)\d{1,2}\s*(?:st|nd|rd|th|-?й|-?я|-?ый|-?ая)?\s*(?:season|сезон)(?=\s|$|[.:,;!?-])/giu, ' ')
    .replace(/(?:^|\s)(?:season|сезон)\s*[:#.-]?\s*\d{1,2}(?=\s|$|[.:,;!?-])/giu, ' ')
    .replace(/第\s*\d{1,2}\s*期/gu, ' ')
    .replace(/(?:^|\s)(?:part|часть|cour|кур)\s*[:#.-]?\s*\d{1,2}(?=\s|$|[.:,;!?-])/giu, ' ')
    .replace(/(?:^|\s)\d{1,2}\s*(?:st|nd|rd|th)?\s*(?:part|часть|cour|кур)(?=\s|$|[.:,;!?-])/giu, ' ')
    .replace(/[#:.;,_|/\\-]+$/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function recommendationFranchiseKeys(anime: Anime): string[] {
  const keys = animeTitles(anime)
    .map(stripSequenceMarkers)
    .filter((value) => value.length >= 3);

  return [...new Set(keys)].slice(0, 6);
}

function sequenceOf(anime: Anime) {
  const titles = animeTitles(anime);

  return {
    seasonNumber:
      titles.map(seasonNumber).find((value): value is number => value != null) ??
      null,
    partNumber:
      titles.map(partNumber).find((value): value is number => value != null) ??
      null,
  };
}

export function buildRecommendationFranchiseHistoryIndex(
  history: Anime[],
): RecommendationFranchiseHistoryIndex {
  const index: RecommendationFranchiseHistoryIndex = new Map();

  for (const anime of history) {
    if (!anime || !Number.isSafeInteger(anime.id) || anime.id <= 0) continue;

    const keys = recommendationFranchiseKeys(anime);
    if (!keys.length) continue;

    const sequence = sequenceOf(anime);
    const season = sequence.seasonNumber ?? 1;
    const part = sequence.partNumber ?? 1;

    for (const key of keys) {
      const record = index.get(key) ?? {
        maxSeason: 0,
        partsBySeason: new Map<number, number>(),
        animeIds: new Set<number>(),
      };

      record.maxSeason = Math.max(record.maxSeason, season);
      record.partsBySeason.set(
        season,
        Math.max(record.partsBySeason.get(season) ?? 0, part),
      );
      record.animeIds.add(anime.id);
      index.set(key, record);
    }
  }

  return index;
}

export function recommendationFranchiseSignal(
  anime: Anime,
  historyIndex: RecommendationFranchiseHistoryIndex,
): RecommendationFranchiseSignal {
  const keys = recommendationFranchiseKeys(anime);
  const sequence = sequenceOf(anime);
  const season = sequence.seasonNumber ?? 1;
  const part = sequence.partNumber ?? 1;
  const requiresPrevious = season > 1 || part > 1;

  let matchedKey: string | null = null;
  let record: FranchiseHistoryRecord | null = null;

  for (const key of keys) {
    const candidateRecord = historyIndex.get(key);
    if (!candidateRecord) continue;
    matchedKey = key;
    record = candidateRecord;
    break;
  }

  let continuation = false;
  let continuationScore = 0;

  if (record && requiresPrevious) {
    if (part > 1) {
      const observedPart = record.partsBySeason.get(season) ?? 0;
      continuation =
        record.maxSeason >= season &&
        observedPart >= part - 1 &&
        observedPart < part;
      continuationScore = continuation ? 0.88 : 0;
    } else if (season > 1) {
      continuation =
        record.maxSeason >= season - 1 &&
        record.maxSeason < season;
      continuationScore = continuation ? 1 : 0;
    }
  }

  const alreadyObserved = Boolean(record?.animeIds.has(anime.id));
  const blockedByPrerequisite =
    requiresPrevious &&
    !continuation &&
    !alreadyObserved;

  return {
    familyKey: matchedKey ?? keys[0] ?? null,
    seasonNumber: sequence.seasonNumber,
    partNumber: sequence.partNumber,
    requiresPrevious,
    continuation,
    continuationScore,
    blockedByPrerequisite,
  };
}

export function dedupeFranchiseRecommendationFamilies<
  T extends {
    anime: Anime;
    franchiseFamilyKey?: string | null;
    franchiseContinuation?: boolean;
  },
>(items: T[]): T[] {
  const output: T[] = [];
  const familyIndex = new Map<string, number>();

  for (const item of items) {
    const family = item.franchiseFamilyKey?.trim() || null;
    if (!family) {
      output.push(item);
      continue;
    }

    const existingIndex = familyIndex.get(family);
    if (existingIndex == null) {
      familyIndex.set(family, output.length);
      output.push(item);
      continue;
    }

    const existing = output[existingIndex];
    if (
      item.franchiseContinuation &&
      existing &&
      !existing.franchiseContinuation
    ) {
      output[existingIndex] = item;
    }
  }

  return output;
}
