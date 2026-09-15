import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  getAnimesWithShikimori,
} from '@/lib/combined-anime';

import type {
  GetAnimesOptions,
  AniListListOrder,
} from '@/lib/anilist';

export const runtime = 'nodejs';
export const revalidate = 900;

export async function GET(
  request: NextRequest,
) {
  const params =
    request.nextUrl.searchParams;

  const limit = Number.parseInt(
    params.get('limit') ?? '20',
    10,
  );

  const page = Number.parseInt(
    params.get('page') ?? '1',
    10,
  );

  const orderRaw =
    params.get('order');

  const search =
    params.get('search') ??
    undefined;

  const status =
    params.get('status') ===
    'ongoing'
      ? 'ongoing'
      : undefined;

  const genreRaw =
    params.get('genre');

  const options: GetAnimesOptions = {
    limit:
      Number.isFinite(limit)
        ? limit
        : 20,

    page:
      Number.isFinite(page)
        ? page
        : 1,

    order:
      orderRaw === 'popularity'
        ? ('popularity' as AniListListOrder)
        : 'ranked',

    status,
    search,
    genre:
      genreRaw ?? undefined,
  };

  try {
    const anime =
      await getAnimesWithShikimori(
        options,
      );

    return NextResponse.json(
      { anime },
      {
        headers: {
          // Браузер: 5 минут
          // CDN/server cache: 15 минут
          // stale: ещё 1 час
          'Cache-Control':
            search?.trim()
              ? 'private, max-age=60, stale-while-revalidate=120'
              : 'public, max-age=300, s-maxage=900, stale-while-revalidate=3600',
        },
      },
    );
  } catch (error) {
    console.error(
      'Anime list API error:',
      error,
    );

    return NextResponse.json(
      {
        error:
          'Не удалось загрузить список аниме',
      },
      { status: 502 },
    );
  }
}