import {
  adminClient,
  failure,
  response,
  userClient,
} from '@/lib/community-server';
import type { LibraryStatus } from '@/lib/community-client';
import { getTitleWatchOverviews } from '@/lib/watch-server';

const VALID_STATUS = new Set<LibraryStatus>([
  'watching',
  'planned',
  'completed',
  'dropped',
]);

type CatalogRelation = {
  title?: string | null;
  slug?: string | null;
};

type TrackerLibraryItem = {
  anime_id: number;
  title: string;
  slug: string | null;
  status: LibraryStatus;
};

function normalizedVisibleTitle(value: string) {
  return value.trim().toLocaleLowerCase('ru-RU').replace(/\s+/g, ' ');
}

function trackerQualifierFromSlug(slug: string | null | undefined) {
  if (!slug) return null;

  const normalized = slug.toLowerCase();

  if (/(?:^|-)final-season(?:-|$)/.test(normalized)) {
    return 'Финальный сезон';
  }

  if (/(?:^|-)final-part(?:-|$)/.test(normalized)) {
    return 'Финальная часть';
  }

  const stageRange = normalized.match(
    /(?:^|-)(\d+)(?:st|nd|rd|th)-(\d+)(?:st|nd|rd|th)-stage(?:-|$)/,
  );
  if (stageRange) {
    return `Стадии ${Number(stageRange[1])}–${Number(stageRange[2])}`;
  }

  const stage = normalized.match(
    /(?:^|-)(\d+)(?:st|nd|rd|th)-stage(?:-|$)/,
  );
  if (stage) {
    return `Стадия ${Number(stage[1])}`;
  }

  const season =
    normalized.match(/(?:^|-)season-(\d+)(?:-|$)/) ??
    normalized.match(/(?:^|-)(\d+)(?:st|nd|rd|th)-season(?:-|$)/);
  if (season) {
    return `Сезон ${Number(season[1])}`;
  }

  const part =
    normalized.match(/(?:^|-)part-(\d+)(?:-|$)/) ??
    normalized.match(/(?:^|-)(\d+)(?:st|nd|rd|th)-part(?:-|$)/);
  if (part) {
    return `Часть ${Number(part[1])}`;
  }

  const cour =
    normalized.match(/(?:^|-)cour-(\d+)(?:-|$)/) ??
    normalized.match(/(?:^|-)(\d+)(?:st|nd|rd|th)-cour(?:-|$)/);
  if (cour) {
    return `Кур ${Number(cour[1])}`;
  }

  const movie =
    normalized.match(/(?:^|-)movie-(\d+)(?:-|$)/) ??
    normalized.match(/(?:^|-)film-(\d+)(?:-|$)/);
  if (movie) {
    return `Фильм ${Number(movie[1])}`;
  }

  return null;
}

function disambiguateDuplicateTitles(items: TrackerLibraryItem[]) {
  const titleCounts = new Map<string, number>();

  for (const item of items) {
    const key = normalizedVisibleTitle(item.title);
    titleCounts.set(key, (titleCounts.get(key) ?? 0) + 1);
  }

  const fallbackIndex = new Map<string, number>();

  return items.map((item) => {
    const key = normalizedVisibleTitle(item.title);
    if ((titleCounts.get(key) ?? 0) <= 1) return item;

    const qualifier = trackerQualifierFromSlug(item.slug);
    if (qualifier) {
      return {
        ...item,
        title: `${item.title} · ${qualifier}`,
      };
    }

    const index = (fallbackIndex.get(key) ?? 0) + 1;
    fallbackIndex.set(key, index);

    // This fallback is intentionally rare. It prevents visually identical
    // tracker rows when upstream catalog entries have the same translated
    // title but no parseable season/part marker in their slug.
    return {
      ...item,
      title: `${item.title} · Версия ${index}`,
    };
  });
}

export async function GET() {
  try {
    const { user } = await userClient();
    const admin = adminClient();

    const { data, error } = await admin
      .from('anime_library')
      .select('anime_id,status,updated_at,anime_catalog!inner(title,slug)')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false });

    if (error) throw error;

    const stats: Record<LibraryStatus, number> = {
      watching: 0,
      planned: 0,
      completed: 0,
      dropped: 0,
    };

    // The database should already enforce one row per user/anime pair, but
    // legacy/imported data must not be allowed to inflate tracker counts.
    // Rows are ordered newest-first, so the first occurrence wins.
    const seenAnimeIds = new Set<number>();
    const canonicalLibrary: TrackerLibraryItem[] = [];

    for (const row of data ?? []) {
      const animeId = Number(row.anime_id);
      if (!Number.isSafeInteger(animeId) || animeId <= 0) continue;
      if (seenAnimeIds.has(animeId)) continue;

      const status = row.status as LibraryStatus;
      if (!VALID_STATUS.has(status)) continue;

      const relation = row.anime_catalog as
        | CatalogRelation
        | CatalogRelation[]
        | null;
      const catalog = Array.isArray(relation) ? relation[0] : relation;

      seenAnimeIds.add(animeId);
      stats[status] += 1;
      canonicalLibrary.push({
        anime_id: animeId,
        title: catalog?.title?.trim() || `Аниме #${animeId}`,
        slug: catalog?.slug?.trim() || null,
        status,
      });
    }

    const library = disambiguateDuplicateTitles(canonicalLibrary);

    const overviews = await getTitleWatchOverviews(
      user.id,
      library.map((item) => item.anime_id),
    );
    const progressByAnime = new Map(
      overviews.map((item) => [item.animeId, item] as const),
    );

    return response({
      stats,
      library: library.map((item) => ({
        ...item,
        progress: progressByAnime.get(item.anime_id) ?? null,
      })),
    });
  } catch (error) {
    return failure(error);
  }
}
