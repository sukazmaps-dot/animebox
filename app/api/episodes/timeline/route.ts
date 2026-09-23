import { NextRequest, NextResponse } from 'next/server';

import { enforceIpRateLimit } from '@/lib/api-rate-limit';
import { resolveEpisodeTimeline } from '@/lib/episode-timeline-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function positiveInteger(value: string | null) {
  if (!value || !/^\d+$/.test(value)) return null;
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

export async function GET(request: NextRequest) {
  const limited = await enforceIpRateLimit(request, {
    scope: 'episode_timeline_ip',
    limit: 30,
    windowSeconds: 60,
  });
  if (limited) return limited;

  const animeId = positiveInteger(request.nextUrl.searchParams.get('animeId'));
  const episode = positiveInteger(request.nextUrl.searchParams.get('episode'));
  const durationSeconds = Number(
    request.nextUrl.searchParams.get('durationSeconds') ?? 0,
  );

  if (!animeId || !episode || episode > 10_000) {
    return NextResponse.json(
      { ok: false, error: 'invalid_episode_identity' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const observedDurationMs =
    Number.isFinite(durationSeconds) &&
    durationSeconds >= 1 &&
    durationSeconds <= 28_800
      ? Math.round(durationSeconds * 1000)
      : null;

  try {
    const timeline = await resolveEpisodeTimeline({
      animeId,
      episode,
      observedDurationMs,
    });

    return NextResponse.json(
      { ok: true, timeline },
      {
        headers: {
          'Cache-Control': 'private, no-store, max-age=0',
          'X-Content-Type-Options': 'nosniff',
        },
      },
    );
  } catch (error) {
    console.error('[episode-timeline] request failed:', error);

    return NextResponse.json(
      { ok: false, error: 'timeline_unavailable' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
