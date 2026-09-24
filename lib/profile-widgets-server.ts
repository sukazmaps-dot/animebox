import 'server-only';

import { adminClient } from '@/lib/community-server';
import {
  DEFAULT_PROFILE_WIDGET_LAYOUT,
  PROFILE_WIDGET_KEYS,
  type ProfileActivityItem,
  type ProfileAnimeWidgetItem,
  type ProfileWidgetKey,
  type ProfileWidgetLayoutItem,
  type ProfileWidgetsData,
} from '@/types/profile-widgets';

type CatalogRow = {
  id: number | string;
  title: string;
  poster_url: string | null;
  slug: string | null;
  genres: string[] | null;
  total_episodes: number | null;
};

type FavoriteRow = {
  anime_id: number | string;
  position: number | string;
  updated_at: string;
};

type RatingRow = {
  anime_id: number | string;
  score: number | string;
  updated_at: string;
};

type LibraryRow = {
  anime_id: number | string;
  status: string;
  updated_at: string;
};

type WidgetRow = {
  widget_key: string;
  position: number | string;
  visible: boolean;
};

const libraryLabels: Record<string, string> = {
  watching: 'Добавил в «Смотрю»',
  planned: 'Добавил в планы',
  completed: 'Отметил как просмотренное',
  dropped: 'Отметил как брошенное',
};

function safeId(value: unknown) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function asCatalogItem(row: CatalogRow): ProfileAnimeWidgetItem | null {
  const animeId = safeId(row.id);
  if (!animeId) return null;

  return {
    animeId,
    title: typeof row.title === 'string' && row.title.trim()
      ? row.title.trim()
      : `Аниме #${animeId}`,
    slug: typeof row.slug === 'string' && row.slug.trim()
      ? row.slug.trim()
      : null,
    posterUrl: typeof row.poster_url === 'string' && row.poster_url.trim()
      ? row.poster_url.trim()
      : null,
    genres: Array.isArray(row.genres)
      ? row.genres.filter((value): value is string => typeof value === 'string' && Boolean(value.trim()))
      : [],
    totalEpisodes:
      typeof row.total_episodes === 'number' && Number.isFinite(row.total_episodes)
        ? Math.max(0, Math.trunc(row.total_episodes))
        : null,
  };
}

function normalizeLayout(rows: WidgetRow[] | null | undefined): ProfileWidgetLayoutItem[] {
  const byKey = new Map<ProfileWidgetKey, ProfileWidgetLayoutItem>();

  for (const row of rows ?? []) {
    if (!PROFILE_WIDGET_KEYS.includes(row.widget_key as ProfileWidgetKey)) continue;
    const key = row.widget_key as ProfileWidgetKey;
    const position = Number(row.position);

    byKey.set(key, {
      key,
      position: Number.isFinite(position) ? Math.max(0, Math.trunc(position)) : 99,
      visible: row.visible !== false,
    });
  }

  for (const fallback of DEFAULT_PROFILE_WIDGET_LAYOUT) {
    if (!byKey.has(fallback.key)) {
      byKey.set(fallback.key, { ...fallback });
    }
  }

  return [...byKey.values()].sort((a, b) => a.position - b.position);
}

export async function getProfileWidgetsData(userId: string): Promise<ProfileWidgetsData> {
  const admin = adminClient();

  const [widgetsResult, favoritesResult, ratingsResult, libraryResult] = await Promise.all([
    admin
      .from('profile_widgets')
      .select('widget_key,position,visible')
      .eq('user_id', userId)
      .order('position', { ascending: true }),
    admin
      .from('profile_favorite_anime')
      .select('anime_id,position,updated_at')
      .eq('user_id', userId)
      .order('position', { ascending: true })
      .limit(6),
    admin
      .from('anime_ratings')
      .select('anime_id,score,updated_at')
      .eq('user_id', userId)
      .order('score', { ascending: false })
      .order('updated_at', { ascending: false }),
    admin
      .from('anime_library')
      .select('anime_id,status,updated_at')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(60),
  ]);

  if (widgetsResult.error) throw widgetsResult.error;
  if (favoritesResult.error) throw favoritesResult.error;
  if (ratingsResult.error) throw ratingsResult.error;
  if (libraryResult.error) throw libraryResult.error;

  const favoriteRows = (favoritesResult.data ?? []) as FavoriteRow[];
  const ratingRows = (ratingsResult.data ?? []) as RatingRow[];
  const libraryRows = (libraryResult.data ?? []) as LibraryRow[];

  const allIds = [
    ...favoriteRows.map((row) => safeId(row.anime_id)),
    ...ratingRows.map((row) => safeId(row.anime_id)),
    ...libraryRows.map((row) => safeId(row.anime_id)),
  ].filter((value): value is number => Boolean(value));

  const uniqueIds = [...new Set(allIds)];

  const catalogResult = uniqueIds.length
    ? await admin
        .from('anime_catalog')
        .select('id,title,poster_url,slug,genres,total_episodes')
        .in('id', uniqueIds)
    : { data: [], error: null };

  if (catalogResult.error) throw catalogResult.error;

  const catalog = new Map<number, ProfileAnimeWidgetItem>();
  for (const raw of (catalogResult.data ?? []) as CatalogRow[]) {
    const item = asCatalogItem(raw);
    if (item) catalog.set(item.animeId, item);
  }

  const favorites = favoriteRows.flatMap((row) => {
    const animeId = safeId(row.anime_id);
    const item = animeId ? catalog.get(animeId) : null;
    if (!item) return [];

    return [{
      ...item,
      position: Math.max(0, Math.trunc(Number(row.position) || 0)),
    }];
  });

  const watching = libraryRows
    .filter((row) => row.status === 'watching')
    .flatMap((row) => {
      const animeId = safeId(row.anime_id);
      const item = animeId ? catalog.get(animeId) : null;
      if (!item) return [];

      return [{
        ...item,
        status: 'watching' as const,
        updatedAt: row.updated_at,
      }];
    })
    .slice(0, 6);

  const ratings = ratingRows.flatMap((row) => {
    const animeId = safeId(row.anime_id);
    const item = animeId ? catalog.get(animeId) : null;
    const score = Number(row.score);
    if (!item || !Number.isFinite(score)) return [];

    return [{
      ...item,
      score: Math.max(1, Math.min(10, Math.trunc(score))),
      updatedAt: row.updated_at,
    }];
  });

  const ratingScores = ratings.map((item) => item.score);
  const ratingSummary = {
    count: ratingScores.length,
    average: ratingScores.length
      ? Number((ratingScores.reduce((sum, score) => sum + score, 0) / ratingScores.length).toFixed(1))
      : null,
  };

  const genreWeights = new Map<string, number>();

  const addGenres = (animeId: number, weight: number) => {
    const item = catalog.get(animeId);
    if (!item) return;
    for (const rawGenre of item.genres) {
      const genre = rawGenre.trim();
      if (!genre) continue;
      genreWeights.set(genre, (genreWeights.get(genre) ?? 0) + weight);
    }
  };

  for (const row of libraryRows) {
    const animeId = safeId(row.anime_id);
    if (animeId) addGenres(animeId, 1);
  }

  for (const row of ratingRows) {
    const animeId = safeId(row.anime_id);
    const score = Number(row.score);
    if (animeId && Number.isFinite(score)) {
      addGenres(animeId, score >= 9 ? 3 : score >= 7 ? 2 : 1);
    }
  }

  for (const row of favoriteRows) {
    const animeId = safeId(row.anime_id);
    if (animeId) addGenres(animeId, 4);
  }

  const totalGenreWeight = [...genreWeights.values()].reduce((sum, value) => sum + value, 0);
  const genres = [...genreWeights.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ru'))
    .slice(0, 6)
    .map(([name, weight]) => ({
      name,
      weight,
      share: totalGenreWeight > 0 ? Math.round((weight / totalGenreWeight) * 100) : 0,
    }));

  const activity: ProfileActivityItem[] = [];

  for (const row of ratingRows.slice(0, 10)) {
    const animeId = safeId(row.anime_id);
    const item = animeId ? catalog.get(animeId) : null;
    const score = Number(row.score);
    if (!item || !Number.isFinite(score)) continue;

    activity.push({
      id: `rating:${animeId}:${row.updated_at}`,
      kind: 'rating',
      animeId,
      title: item.title,
      slug: item.slug,
      posterUrl: item.posterUrl,
      label: 'Поставил оценку',
      value: `${Math.trunc(score)}/10`,
      occurredAt: row.updated_at,
    });
  }

  for (const row of libraryRows.slice(0, 14)) {
    const animeId = safeId(row.anime_id);
    const item = animeId ? catalog.get(animeId) : null;
    if (!item) continue;

    activity.push({
      id: `library:${animeId}:${row.updated_at}`,
      kind: 'library',
      animeId,
      title: item.title,
      slug: item.slug,
      posterUrl: item.posterUrl,
      label: libraryLabels[row.status] ?? 'Обновил библиотеку',
      value: null,
      occurredAt: row.updated_at,
    });
  }

  activity.sort(
    (a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt),
  );

  return {
    layout: normalizeLayout((widgetsResult.data ?? []) as WidgetRow[]),
    favorites,
    watching,
    ratings: ratings.slice(0, 6),
    genres,
    activity: activity.slice(0, 6),
    ratingSummary,
  };
}
