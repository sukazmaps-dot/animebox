import { NextRequest, NextResponse } from 'next/server';

import { enforceIpRateLimit } from '@/lib/api-rate-limit';
import { getPlayerSourcePolicy } from '@/lib/player-source-control';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const limited = await enforceIpRateLimit(request, {
    scope: 'player_source_policy_ip',
    limit: 240,
    windowSeconds: 60,
  });
  if (limited) return limited;

  const animeId = Number(request.nextUrl.searchParams.get('animeId'));
  const seasonParam = request.nextUrl.searchParams.get('season');
  const episode = Number(request.nextUrl.searchParams.get('episode'));

  const season =
    seasonParam == null || seasonParam === ''
      ? null
      : Number(seasonParam);

  if (
    !Number.isSafeInteger(animeId) ||
    animeId <= 0 ||
    !Number.isSafeInteger(episode) ||
    episode <= 0 ||
    (season != null && (!Number.isSafeInteger(season) || season <= 0))
  ) {
    return NextResponse.json(
      { ok: false, error: 'invalid_request' },
      { status: 400 },
    );
  }

  const policy = await getPlayerSourcePolicy({
    animeId,
    season,
    episode,
  });

  return NextResponse.json(policy, {
    headers: {
      'Cache-Control': 'private, no-store, max-age=0',
    },
  });
}
