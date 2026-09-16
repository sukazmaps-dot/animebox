import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  getAnimesWithShikimori,
} from '@/lib/combined-anime';
import {
  isCatalogMood,
  rankAnimeByCatalogMood,
} from '@/lib/catalog-moods';

import type {
  GetAnimesOptions,
  AniListListOrder,
} from '@/lib/anilist';

export const runtime = 'nodejs';
export const revalidate = 900;

export async function GET(
  request: NextRequest,
) {
  const params = request.nextUrl.searchParams;

  const requestedLimit = Number.parseInt(
    params.get('limit') ?? '20',
    10,
  );

  const requestedPage = Number.parseInt(
    params.get('page') ?? '1',
    10,
  );

  const limit = Number.isFinite(requestedLimit)
    ? Math.min(50, Math.max(1, requestedLimit))
    : 20;

  const page = Number.isFinite(requestedPage)
    ? Math.max(1, requestedPage)
    : 1;

  const orderRaw = params.get('order');
  const search = params.get('search') ?? undefined;

  const status = params.get('status') === 'ongoing'
    ? 'ongoing'
    : undefined;

  const genreRaw = params.get('genre');
  const moodRaw = params.get('mood');
  const mood = isCatalogMood(moodRaw) ? moodRaw : 'any';

  /*
   * Mood is a second ranking axis, not a fake genre. When it is active we
   * retrieve a wider candidate pool, keep AniList/Shikimori genre filtering,
   * then rerank those candidates by atmosphere. This lets combinations like
   * "Drama + Стекло" work without mixing mood IDs into genre IDs.
   */
  const upstreamLimit = mood === 'any'
    ? limit
    : Math.min(50, Math.max(limit * 3, 30));

  const options: GetAnimesOptions = {
    limit: upstreamLimit,
    page,
    order:
      orderRaw === 'popularity'
        ? ('popularity' as AniListListOrder)
        : 'ranked',
    status,
    search,
    genre: genreRaw ?? undefined,
  };

  try {
    const candidates = await getAnimesWithShikimori(options);
    const anime = rankAnimeByCatalogMood(candidates, mood).slice(0, limit);

    return NextResponse.json(
      { anime },
      {
        headers: {
          'Cache-Control':
            search?.trim()
              ? 'private, max-age=60, stale-while-revalidate=120'
              : 'public, max-age=300, s-maxage=900, stale-while-revalidate=3600',
        },
      },
    );
  } catch (error) {
    console.error('Anime list API error:', error);

    return NextResponse.json(
      {
        error: 'Не удалось загрузить список аниме',
      },
      { status: 502 },
    );
  }
}
