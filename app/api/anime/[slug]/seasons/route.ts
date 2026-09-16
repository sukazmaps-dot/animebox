import { NextResponse } from 'next/server';

import { getAnimeFranchiseWithShikimori } from '@/lib/combined-anime';
import { getPrimarySeasonItems } from '@/lib/anime-franchise';
import { registerAnime } from '@/lib/anime-registry';
import type {
  EpisodeExtraItem,
  EpisodeSeasonTab,
  EpisodeSeasonsResponse,
} from '@/types/episode-seasons';

export const runtime = 'nodejs';
export const revalidate = 3600;

function mediaTitle(item: {
  title: {
    russian?: string | null;
    romaji?: string | null;
    english?: string | null;
    native?: string | null;
  };
}): string {
  return (
    item.title.russian ||
    item.title.romaji ||
    item.title.english ||
    item.title.native ||
    'Без названия'
  );
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const animeId = Number(slug);

  if (!Number.isSafeInteger(animeId) || animeId <= 0) {
    return NextResponse.json(
      { error: 'Invalid anime id' },
      { status: 400 },
    );
  }

  try {
    const franchise = await getAnimeFranchiseWithShikimori(animeId, {
      maxRequests: 16,
    });

    if (!franchise) {
      const empty: EpisodeSeasonsResponse = {
        seasons: [],
        extras: [],
        partial: false,
      };

      return NextResponse.json(empty, {
        headers: {
          'Cache-Control': 'public, s-maxage=900, stale-while-revalidate=3600',
        },
      });
    }

    const registeredItems = franchise.items.map(registerAnime);
    const primarySeasons = getPrimarySeasonItems(franchise).map(registerAnime);

    const seasons: EpisodeSeasonTab[] = primarySeasons.map((item, index) => ({
      id: item.id,
      slug: item.slug,
      label: `Сезон ${index + 1}`,
      title: mediaTitle(item),
      episodes:
        typeof item.episodes === 'number' && item.episodes > 0
          ? Array.from({ length: item.episodes }, (_, episodeIndex) => episodeIndex + 1)
          : [],
      year: item.startDate?.year ?? null,
      isCurrent: item.id === animeId,
    }));

    const extras: EpisodeExtraItem[] = registeredItems
      .filter((item) =>
        item.category === 'movies' ||
        item.category === 'ova' ||
        item.category === 'specials',
      )
      .map((item) => ({
        id: item.id,
        slug: item.slug,
        title: mediaTitle(item),
        format: item.format ?? null,
        year: item.startDate?.year ?? null,
      }));

    const payload: EpisodeSeasonsResponse = {
      seasons,
      extras,
      partial: franchise.partial,
    };

    return NextResponse.json(payload, {
      headers: {
        'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
      },
    });
  } catch (error) {
    console.error('Episode season selector failed:', error);

    return NextResponse.json(
      {
        seasons: [],
        extras: [],
        partial: true,
      } satisfies EpisodeSeasonsResponse,
      {
        status: 200,
        headers: {
          'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
        },
      },
    );
  }
}
