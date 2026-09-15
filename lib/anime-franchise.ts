import {
  getAnimeRelationsById,
  type AniListFranchiseMedia,
  type AniListRelationType,
} from '@/lib/anilist';

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


export type FranchiseSeasonItem = FranchiseItem;

const SEASON_RELATIONS = new Set<AniListRelationType>([
  'PREQUEL',
  'SEQUEL',
]);

/**
 * Возвращает только основную цепочку сезонов вокруг текущего тайтла.
 * Спин-оффы, фильмы, side story и alternative сюда не попадают.
 */
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

  return franchise.items
    .filter((item) => seasonIds.has(item.id) && item.category === 'series')
    .sort(compareReleaseDates);
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
