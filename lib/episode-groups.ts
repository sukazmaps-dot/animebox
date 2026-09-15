export type EpisodeGroupKind = 'arc' | 'range';

export type EpisodeGroup = {
  id: string;
  title: string;
  from: number;
  to: number;
  kind: EpisodeGroupKind;
};

export type ManualEpisodeGroup = {
  title: string;
  from: number;
  to: number;
};

export const DEFAULT_EPISODES_PER_GROUP = 50;

/**
 * Проверенные сюжетные арки можно добавлять сюда по AniList ID.
 *
 * Важно: не называем автоматические диапазоны "сезонами" — сезон и арка
 * являются редакционными данными. Если разметки нет, UI честно показывает
 * диапазоны 1–50, 51–100 и т.д.
 */
const MANUAL_EPISODE_GROUPS: Record<number, ManualEpisodeGroup[]> = {
  // Пример структуры:
  // 12345: [
  //   { title: 'Арка 1', from: 1, to: 12 },
  //   { title: 'Арка 2', from: 13, to: 24 },
  // ],
};

function createRangeGroups(
  from: number,
  to: number,
  chunkSize = DEFAULT_EPISODES_PER_GROUP,
): EpisodeGroup[] {
  if (from > to) return [];

  const groups: EpisodeGroup[] = [];

  for (let start = from; start <= to; start += chunkSize) {
    const end = Math.min(start + chunkSize - 1, to);

    groups.push({
      id: `range-${start}-${end}`,
      title: `${start}–${end}`,
      from: start,
      to: end,
      kind: 'range',
    });
  }

  return groups;
}

function normalizeManualGroups(
  groups: ManualEpisodeGroup[],
  episodeCount: number,
): EpisodeGroup[] {
  const normalized = groups
    .map((group) => ({
      title: group.title.trim(),
      from: Math.max(1, Math.floor(group.from)),
      to: Math.min(episodeCount, Math.floor(group.to)),
    }))
    .filter((group) => group.title && group.from <= group.to)
    .sort((a, b) => a.from - b.from || a.to - b.to);

  if (!normalized.length) return [];

  const result: EpisodeGroup[] = [];
  let cursor = 1;

  for (const group of normalized) {
    // Пересекающиеся редакционные диапазоны пропускаем, чтобы один эпизод
    // не появлялся сразу в двух секциях.
    if (group.from < cursor) continue;

    if (cursor < group.from) {
      result.push(...createRangeGroups(cursor, group.from - 1));
    }

    result.push({
      id: `arc-${group.from}-${group.to}`,
      title: group.title,
      from: group.from,
      to: group.to,
      kind: 'arc',
    });

    cursor = group.to + 1;
  }

  if (cursor <= episodeCount) {
    result.push(...createRangeGroups(cursor, episodeCount));
  }

  return result;
}

export function getEpisodeGroups(
  animeId: number | string,
  episodeCount: number,
): EpisodeGroup[] {
  const count = Math.max(0, Math.floor(episodeCount));
  if (count <= 0) return [];

  const numericAnimeId = Number(animeId);
  const manual = Number.isSafeInteger(numericAnimeId)
    ? MANUAL_EPISODE_GROUPS[numericAnimeId]
    : undefined;

  if (manual?.length) {
    const normalized = normalizeManualGroups(manual, count);
    if (normalized.length) return normalized;
  }

  return createRangeGroups(1, count);
}

export function findEpisodeGroupIndex(
  groups: EpisodeGroup[],
  episode: number,
): number {
  if (!groups.length) return 0;

  const normalizedEpisode = Math.max(1, Math.floor(episode));
  const index = groups.findIndex(
    (group) => normalizedEpisode >= group.from && normalizedEpisode <= group.to,
  );

  return index >= 0 ? index : 0;
}
