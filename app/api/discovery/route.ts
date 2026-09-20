import { NextRequest, NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';

import { getAnimesWithShikimori } from '@/lib/combined-anime';
import { parseSmartDiscoveryQuery, rankSmartDiscoveryCandidates } from '@/lib/smart-discovery';
import { rankAnimeForSmartSearch } from '@/lib/smart-search';
import type { Anime } from '@/types/anime';

export const runtime = 'nodejs';

const loadCandidates = unstable_cache(
  async (genre: string | null, page: number) => getAnimesWithShikimori({
    page,
    limit: 50,
    order: page % 2 === 0 ? 'popularity' : 'ranked',
    genre: genre || undefined,
  }),
  ['animebox-smart-discovery-v1'],
  { revalidate: 900 },
);

function mergeUnique(...groups: Anime[][]) {
  const map = new Map<number, Anime>();
  for (const group of groups) {
    for (const anime of group) if (!map.has(anime.id)) map.set(anime.id, anime);
  }
  return [...map.values()];
}

export async function GET(request: NextRequest) {
  const rawQuery = request.nextUrl.searchParams.get('q')?.trim() ?? '';
  const requestedLimit = Number.parseInt(request.nextUrl.searchParams.get('limit') ?? '20', 10);
  const limit = Number.isFinite(requestedLimit) ? Math.min(40, Math.max(5, requestedLimit)) : 20;
  const intent = parseSmartDiscoveryQuery(rawQuery);

  if (!rawQuery || !intent.isDiscovery) {
    return NextResponse.json({ items: [], intent, seed: null }, { status: 400 });
  }

  try {
    let seed: Anime | null = null;
    if (intent.similarTo) {
      const seedCandidates = await getAnimesWithShikimori({
        page: 1,
        limit: 8,
        order: 'ranked',
        search: intent.similarTo,
      });
      seed = rankAnimeForSmartSearch(seedCandidates, intent.similarTo)[0] ?? null;
    }

    const primaryGenre = intent.includeGenres[0] ?? seed?.genres?.[0] ?? null;
    const first = await loadCandidates(primaryGenre, 1);
    const needMore = first.length < Math.max(limit * 2, 30);
    const second = needMore ? await loadCandidates(primaryGenre, 2) : [];
    const candidates = mergeUnique(first, second).filter((anime) => anime.id !== seed?.id);
    const ranked = rankSmartDiscoveryCandidates(candidates, intent, { seed }).slice(0, limit);

    return NextResponse.json(
      {
        items: ranked,
        seed: seed ? { id: seed.id, title: seed.title, episodes: seed.episodes, genres: seed.genres } : null,
        intent,
      },
      {
        headers: {
          'Cache-Control': 'private, max-age=60, stale-while-revalidate=180',
        },
      },
    );
  } catch (error) {
    console.error('[Smart Discovery]', error);
    return NextResponse.json({ items: [], intent, seed: null, error: 'discovery_failed' }, { status: 502 });
  }
}
