import {
  getAnimeRelationsById,
  type AniListFranchiseMedia,
  type AniListRelationType,
} from '@/lib/anilist';
import { getTitleContinuationHints } from '@/lib/search-intent';

export type FranchiseCategory =
  | 'series' | 'movies' | 'ova' | 'specials' | 'spinOffs' | 'other';

export type FranchiseItem = AniListFranchiseMedia & {
  title: AniListFranchiseMedia['title'] & { russian?: string | null };
  category: FranchiseCategory;
  isCurrent: boolean;
};

export type FranchiseLink = {
  fromId: number;
  toId: number;
  relationType: AniListRelationType;
};

export type AnimeFranchise = {
  currentId: number;
  items: FranchiseItem[];
  groups: Record<FranchiseCategory, FranchiseItem[]>;
  // Тип связи относится к паре fromId → toId, а не ко всей франшизе.
  links: FranchiseLink[];
  partial: boolean;
  failedIds: number[];
  unexpandedIds: number[];
};


export type FranchiseSeasonItem = FranchiseItem & {
  seasonNumber: number;
  partNumber: number | null;
  label: string;
};

const SEASON_RELATIONS = new Set<AniListRelationType>([
  'PREQUEL',
  'SEQUEL',
]);

/**
 * Возвращает основную цепочку TV/ONA, но не считает каждый split-cour новым
 * сезоном. Например `Season 3` + `Season 3 Part 2` получают один номер
 * сезона и разные части. Фильмы/OVA/spin-off сюда по-прежнему не попадают.
 */
function franchiseTitles(item: FranchiseItem): string[] {
  return [
    item.title.russian,
    item.title.romaji,
    item.title.english,
    item.title.native,
  ].filter((value): value is string => typeof value === 'string' && Boolean(value.trim()));
}

function stemTokens(value: string): Set<string> {
  return new Set(
    value
      .toLocaleLowerCase('ru-RU')
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .split(/\s+/)
      .filter((token) => token.length >= 2),
  );
}

function stemSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  if ((a.includes(b) || b.includes(a)) && Math.min(a.length, b.length) >= 8) return 0.92;

  const left = stemTokens(a);
  const right = stemTokens(b);
  if (!left.size || !right.size) return 0;
  let shared = 0;
  for (const token of left) if (right.has(token)) shared += 1;
  return shared / Math.max(left.size, right.size);
}

function titleHints(item: FranchiseItem) {
  return franchiseTitles(item).map(getTitleContinuationHints);
}

function explicitSeason(item: FranchiseItem): number | null {
  return titleHints(item).find((hint) => hint.seasonNumber)?.seasonNumber ?? null;
}

function explicitPart(item: FranchiseItem): number | null {
  return titleHints(item).find((hint) => hint.partNumber)?.partNumber ?? null;
}

function isSplitContinuation(previous: FranchiseItem, current: FranchiseItem): boolean {
  const currentPart = explicitPart(current);
  if (!currentPart || currentPart < 2) return false;

  const previousStems = titleHints(previous).map((hint) => hint.continuationStem).filter(Boolean);
  const currentStems = titleHints(current).map((hint) => hint.continuationStem).filter(Boolean);

  return currentStems.some((currentStem) =>
    previousStems.some((previousStem) => stemSimilarity(previousStem, currentStem) >= 0.72),
  );
}

function normalizeSeasonChain(items: FranchiseItem[]): FranchiseSeasonItem[] {
  const normalized: FranchiseSeasonItem[] = [];
  let nextSeasonNumber = 1;

  for (const item of items) {
    const previous = normalized.at(-1);
    const declaredSeason = explicitSeason(item);
    const declaredPart = explicitPart(item);

    let seasonNumber: number;
    if (declaredSeason) {
      seasonNumber = declaredSeason;
    } else if (previous && isSplitContinuation(previous, item)) {
      seasonNumber = previous.seasonNumber;
    } else {
      seasonNumber = Math.max(nextSeasonNumber, (previous?.seasonNumber ?? 0) + 1);
    }

    nextSeasonNumber = Math.max(nextSeasonNumber, seasonNumber + 1);
    normalized.push({
      ...item,
      seasonNumber,
      partNumber: declaredPart,
      label: `Сезон ${seasonNumber}`,
    });
  }

  const bySeason = new Map<number, FranchiseSeasonItem[]>();
  for (const item of normalized) {
    const group = bySeason.get(item.seasonNumber) ?? [];
    group.push(item);
    bySeason.set(item.seasonNumber, group);
  }

  for (const group of bySeason.values()) {
    if (group.length <= 1) continue;
    group.forEach((item, index) => {
      const partNumber = item.partNumber ?? index + 1;
      item.partNumber = partNumber;
      item.label = `Сезон ${item.seasonNumber} · Часть ${partNumber}`;
    });
  }

  return normalized;
}

export function getPrimarySeasonItems(
  franchise: AnimeFranchise,
): FranchiseSeasonItem[] {
  const itemsById = new Map(
    franchise.items.map((item) => [item.id, item]),
  );
  const current = itemsById.get(franchise.currentId);

  if (!current || current.category !== 'series') return [];

  const seasonIds = new Set<number>([franchise.currentId]);
  let changed = true;

  while (changed) {
    changed = false;

    for (const link of franchise.links) {
      if (!SEASON_RELATIONS.has(link.relationType)) continue;

      const from = itemsById.get(link.fromId);
      const to = itemsById.get(link.toId);
      if (!from || !to || from.category !== 'series' || to.category !== 'series') {
        continue;
      }

      if (seasonIds.has(link.fromId) && !seasonIds.has(link.toId)) {
        seasonIds.add(link.toId);
        changed = true;
      }

      if (seasonIds.has(link.toId) && !seasonIds.has(link.fromId)) {
        seasonIds.add(link.fromId);
        changed = true;
      }
    }
  }

  const chain = franchise.items
    .filter((item) => seasonIds.has(item.id) && item.category === 'series')
    .sort(compareReleaseDates);

  return normalizeSeasonChain(chain);
}

export const FRANCHISE_CATEGORY_LABELS: Record<FranchiseCategory, string> = {
  series: 'Сериалы / сезоны',
  movies: 'Фильмы',
  ova: 'OVA',
  specials: 'Спецвыпуски',
  spinOffs: 'Спин-оффы',
  other: 'Другие части',
};

// Общий персонаж или вселенная ещё не означают одну серию произведений.
const FRANCHISE_RELATIONS = new Set<AniListRelationType>([
  'PREQUEL', 'SEQUEL', 'PARENT', 'SIDE_STORY', 'SUMMARY',
  'ALTERNATIVE', 'SPIN_OFF', 'COMPILATION', 'CONTAINS',
]);

function categoryOf(media: AniListFranchiseMedia, spinOff: boolean): FranchiseCategory {
  if (spinOff) return 'spinOffs';
  switch (media.format) {
    case 'TV':
    case 'TV_SHORT':
    case 'ONA': return 'series';
    case 'MOVIE': return 'movies';
    case 'OVA': return 'ova';
    case 'SPECIAL': return 'specials';
    default: return 'other';
  }
}

function compareReleaseDates(a: AniListFranchiseMedia, b: AniListFranchiseMedia): number {
  // Неизвестная дата идёт в конец; это порядок выхода, не сюжетная хронология.
  for (const part of ['year', 'month', 'day'] as const) {
    const difference = (a.startDate?.[part] ?? 9999) - (b.startDate?.[part] ?? 9999);
    if (difference) return difference;
  }
  return a.id - b.id;
}

/** Full TV/ONA prequel/sequel chain, bounded and cached. Side stories stay direct links. */
const franchiseCache = new Map<number, { expires: number; data: AnimeFranchise }>();
export async function getAnimeFranchise(
  id: number | string,
  options: { signal?: AbortSignal; maxRequests?: number } = {},
): Promise<AnimeFranchise | null> {
  const currentId = Number(id);
  if (!Number.isSafeInteger(currentId) || currentId <= 0) return null;
  const cached = franchiseCache.get(currentId);
  if (cached && cached.expires > Date.now()) return cached.data;
  const mediaById = new Map<number, AniListFranchiseMedia>();
  const links: FranchiseLink[] = [];
  const spinOffIds = new Set<number>();
  const queue = [currentId];
  const queued = new Set(queue);
  const expanded = new Set<number>();
  const failedIds: number[] = [];
  const budget = Math.max(1, Math.min(options.maxRequests ?? 12, 40));
  let requests = 0;
  while (queue.length && requests < budget) {
    options.signal?.throwIfAborted();
    const nextId = queue.shift()!;
    requests++;
    let result;
    try { result = await getAnimeRelationsById(nextId, { signal: options.signal }); }
    catch { options.signal?.throwIfAborted(); failedIds.push(nextId); break; }
    if (!result || result.id !== nextId || result.type !== 'ANIME') {
      if (nextId === currentId) return null;
      failedIds.push(nextId); break;
    }
    const { relations, ...root } = result;
    mediaById.set(root.id, root);
    expanded.add(root.id);
    for (const { node, relationType } of relations) {
      if (node.type !== 'ANIME' || !FRANCHISE_RELATIONS.has(relationType) || node.id === root.id) continue;
      const primary = SEASON_RELATIONS.has(relationType) && categoryOf(root, false) === 'series' && categoryOf(node, false) === 'series';
      // Expand only the primary chain; don't crawl the entire shared universe.
      if (root.id !== currentId && !primary) continue;
      mediaById.set(node.id, node);
      links.push({ fromId: root.id, toId: node.id, relationType });
      if (relationType === 'SPIN_OFF') spinOffIds.add(node.id);
      if (primary && !queued.has(node.id)) { queue.push(node.id); queued.add(node.id); }
    }
  }
  const items: FranchiseItem[] = [...mediaById.values()].sort(compareReleaseDates).map(media => ({
    ...media, category: categoryOf(media, spinOffIds.has(media.id)), isCurrent: media.id === currentId,
  }));
  const groups: AnimeFranchise['groups'] = { series: [], movies: [], ova: [], specials: [], spinOffs: [], other: [] };
  for (const item of items) groups[item.category].push(item);
  const unexpandedIds = [...queued].filter(value => !expanded.has(value) && !failedIds.includes(value));
  const data = { currentId, items, groups, links, partial: Boolean(failedIds.length || unexpandedIds.length), failedIds, unexpandedIds };
  if (franchiseCache.size >= 100) franchiseCache.delete(franchiseCache.keys().next().value!);
  franchiseCache.set(currentId, { expires: Date.now() + (data.partial ? 30_000 : 3_600_000), data });
  return data;
}
