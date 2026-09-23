import 'server-only';

import { adminClient, ensureAnime } from '@/lib/community-server';
import { resolveAnimeRoute } from '@/lib/anime-route';
import type {
  EpisodeTimelineLookupStatus,
  EpisodeTimelineMeta,
  EpisodeTimelineSegment,
} from '@/types/episode-timeline';

const ANISKIP_BASE = 'https://api.aniskip.com/v2/skip-times';
const MAX_MEDIA_SECONDS = 8 * 60 * 60;
const FOUND_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const EMPTY_TTL_MS = 12 * 60 * 60 * 1000;
const ERROR_TTL_MS = 30 * 60 * 1000;
const MISSING_IDENTITY_TTL_MS = 7 * 24 * 60 * 60 * 1000;

type TimelineRow = {
  anime_id: number | string;
  episode_number: number;
  duration_ms: number | null;
  opening_start_ms: number | null;
  opening_end_ms: number | null;
  ending_start_ms: number | null;
  ending_end_ms: number | null;
  recap_start_ms: number | null;
  recap_end_ms: number | null;
  skip_source: string | null;
  skip_confidence: number | null;
  skip_lookup_status: EpisodeTimelineLookupStatus;
  skip_checked_at: string | null;
};

type AniSkipItem = {
  skipType?: unknown;
  interval?: {
    startTime?: unknown;
    endTime?: unknown;
  } | null;
  episodeLength?: unknown;
};

function finiteSeconds(value: unknown) {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) && number >= 0 && number <= MAX_MEDIA_SECONDS
    ? number
    : null;
}

function normalizeDurationMs(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return null;
  const rounded = Math.round(value);
  return rounded >= 1_000 && rounded <= MAX_MEDIA_SECONDS * 1_000
    ? rounded
    : null;
}

function segmentFromSeconds(
  item: AniSkipItem | undefined,
  durationMs: number | null,
): EpisodeTimelineSegment | null {
  const start = finiteSeconds(item?.interval?.startTime);
  const end = finiteSeconds(item?.interval?.endTime);

  if (start == null || end == null || end <= start) return null;

  const startMs = Math.round(start * 1000);
  const endMs = Math.round(end * 1000);

  if (durationMs != null && endMs > durationMs + 30_000) return null;

  return { startMs, endMs };
}

function segmentFromRow(
  start: number | null,
  end: number | null,
): EpisodeTimelineSegment | null {
  if (
    start == null ||
    end == null ||
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start < 0 ||
    end <= start
  ) {
    return null;
  }

  return { startMs: start, endMs: end };
}

function rowToTimeline(row: TimelineRow): EpisodeTimelineMeta {
  return {
    animeId: Number(row.anime_id),
    episode: Number(row.episode_number),
    durationMs: row.duration_ms == null ? null : Number(row.duration_ms),
    opening: segmentFromRow(row.opening_start_ms, row.opening_end_ms),
    ending: segmentFromRow(row.ending_start_ms, row.ending_end_ms),
    recap: segmentFromRow(row.recap_start_ms, row.recap_end_ms),
    skipSource: row.skip_source,
    skipConfidence:
      row.skip_confidence == null ? null : Number(row.skip_confidence),
    lookupStatus: row.skip_lookup_status,
    checkedAt: row.skip_checked_at,
  };
}

function cacheTtl(status: EpisodeTimelineLookupStatus) {
  if (status === 'found') return FOUND_TTL_MS;
  if (status === 'empty') return EMPTY_TTL_MS;
  if (status === 'missing_identity') return MISSING_IDENTITY_TTL_MS;
  if (status === 'error') return ERROR_TTL_MS;
  return 0;
}

function isFresh(row: TimelineRow | null) {
  if (!row?.skip_checked_at) return false;
  const checkedAt = Date.parse(row.skip_checked_at);
  if (!Number.isFinite(checkedAt)) return false;
  return Date.now() - checkedAt < cacheTtl(row.skip_lookup_status);
}

async function loadTimelineRow(animeId: number, episode: number) {
  const { data, error } = await adminClient()
    .from('episode_timeline_meta')
    .select(
      'anime_id,episode_number,duration_ms,opening_start_ms,opening_end_ms,ending_start_ms,ending_end_ms,recap_start_ms,recap_end_ms,skip_source,skip_confidence,skip_lookup_status,skip_checked_at',
    )
    .eq('anime_id', animeId)
    .eq('episode_number', episode)
    .maybeSingle();

  if (error) throw error;
  return (data as TimelineRow | null) ?? null;
}

export async function getEpisodeTimelineForSeo(
  animeId: number,
  episode: number,
): Promise<{
  durationMs: number | null;
  contentUrl: string | null;
  playerUrl: string | null;
  videoVerifiedAt: string | null;
} | null> {
  const { data, error } = await adminClient()
    .from('episode_timeline_meta')
    .select('duration_ms,video_content_url,video_player_url,video_verified_at')
    .eq('anime_id', animeId)
    .eq('episode_number', episode)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const videoVerifiedAt =
    typeof data.video_verified_at === 'string' ? data.video_verified_at : null;

  const verifiedAtMs = videoVerifiedAt ? Date.parse(videoVerifiedAt) : Number.NaN;

  if (
    !videoVerifiedAt ||
    !Number.isFinite(verifiedAtMs) ||
    Date.now() - verifiedAtMs > 30 * 24 * 60 * 60 * 1000
  ) {
    return {
      durationMs: data.duration_ms == null ? null : Number(data.duration_ms),
      contentUrl: null,
      playerUrl: null,
      videoVerifiedAt,
    };
  }

  return {
    durationMs: data.duration_ms == null ? null : Number(data.duration_ms),
    contentUrl: safeHttpsUrl(data.video_content_url),
    playerUrl: safeHttpsUrl(data.video_player_url),
    videoVerifiedAt,
  };
}

function safeHttpsUrl(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return null;

  try {
    const url = new URL(value.startsWith('//') ? `https:${value}` : value);
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

export function canonicalEpisodePlayerUrl(
  value: string,
  episode: number,
): string | null {
  const normalized = safeHttpsUrl(value);
  if (!normalized) return null;

  try {
    const url = new URL(normalized);
    url.searchParams.set('episode', String(episode));
    url.searchParams.set('only_episode', 'true');
    url.searchParams.set('hide_selectors', 'true');
    url.searchParams.set('translations', 'false');
    return url.toString();
  } catch {
    return null;
  }
}

export async function recordEpisodePlayerUrl(input: {
  animeId: number;
  episode: number;
  playerUrl: string;
}) {
  const playerUrl = canonicalEpisodePlayerUrl(input.playerUrl, input.episode);
  if (!playerUrl) return;

  await ensureAnime(input.animeId);

  const now = new Date().toISOString();
  const { error } = await adminClient()
    .from('episode_timeline_meta')
    .upsert(
      {
        anime_id: input.animeId,
        episode_number: input.episode,
        video_player_url: playerUrl,
        video_verified_at: now,
        updated_at: now,
      },
      { onConflict: 'anime_id,episode_number' },
    );

  if (error) {
    console.warn('[episode-timeline] player URL cache failed:', error.message);
  }
}

async function fetchAniSkip(
  malId: number,
  episode: number,
  durationMs: number | null,
) {
  const url = new URL(`${ANISKIP_BASE}/${malId}/${episode}`);
  for (const type of ['op', 'ed', 'recap']) {
    url.searchParams.append('types', type);
  }

  if (durationMs != null) {
    url.searchParams.set('episodeLength', String(Math.max(1, Math.round(durationMs / 1000))));
  }

  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(4_500),
    cache: 'no-store',
  });

  if (response.status === 404) {
    return { results: [] as AniSkipItem[] };
  }

  if (!response.ok) {
    throw new Error(`AniSkip HTTP ${response.status}`);
  }

  const payload = (await response.json()) as {
    results?: unknown;
  };

  return {
    results: Array.isArray(payload?.results)
      ? (payload.results as AniSkipItem[])
      : [],
  };
}

function typeOf(item: AniSkipItem) {
  return typeof item.skipType === 'string' ? item.skipType.toLowerCase() : '';
}

function firstByType(items: AniSkipItem[], kinds: string[]) {
  return items.find((item) => kinds.includes(typeOf(item)));
}

export async function resolveEpisodeTimeline(input: {
  animeId: number;
  episode: number;
  observedDurationMs?: number | null;
}): Promise<EpisodeTimelineMeta> {
  const { animeId, episode } = input;

  if (
    !Number.isSafeInteger(animeId) ||
    animeId <= 0 ||
    !Number.isSafeInteger(episode) ||
    episode <= 0 ||
    episode > 10_000
  ) {
    throw new Error('Invalid episode timeline identity.');
  }

  const observedDurationMs = normalizeDurationMs(input.observedDurationMs);
  const existing = await loadTimelineRow(animeId, episode);

  if (existing && isFresh(existing)) {
    return rowToTimeline(existing);
  }

  const anime = await resolveAnimeRoute(String(animeId));
  if (!anime) throw new Error('Anime not found.');

  await ensureAnime(animeId);

  const malId = Number(anime.idMal ?? anime.mal_id ?? 0);
  const now = new Date().toISOString();

  if (!Number.isSafeInteger(malId) || malId <= 0) {
    const { data, error } = await adminClient()
      .from('episode_timeline_meta')
      .upsert(
        {
          anime_id: animeId,
          episode_number: episode,
          duration_ms: observedDurationMs ?? existing?.duration_ms ?? null,
          skip_lookup_status: 'missing_identity',
          skip_source: null,
          skip_checked_at: now,
          updated_at: now,
        },
        { onConflict: 'anime_id,episode_number' },
      )
      .select(
        'anime_id,episode_number,duration_ms,opening_start_ms,opening_end_ms,ending_start_ms,ending_end_ms,recap_start_ms,recap_end_ms,skip_source,skip_confidence,skip_lookup_status,skip_checked_at',
      )
      .single();

    if (error) throw error;
    return rowToTimeline(data as TimelineRow);
  }

  const fallbackDurationMs =
    observedDurationMs ??
    normalizeDurationMs(
      Number.isFinite(Number(anime.duration))
        ? Number(anime.duration) * 60_000
        : null,
    ) ??
    existing?.duration_ms ??
    null;

  try {
    const { results } = await fetchAniSkip(malId, episode, fallbackDurationMs);

    const resultDurationSeconds = results
      .map((item) => finiteSeconds(item.episodeLength))
      .filter((value): value is number => value != null && value > 0)
      .sort((a, b) => b - a)[0];

    const durationMs =
      observedDurationMs ??
      normalizeDurationMs(
        resultDurationSeconds == null ? null : resultDurationSeconds * 1000,
      ) ??
      fallbackDurationMs;

    const opening = segmentFromSeconds(
      firstByType(results, ['op', 'mixed-op']),
      durationMs,
    );
    const ending = segmentFromSeconds(
      firstByType(results, ['ed', 'mixed-ed']),
      durationMs,
    );
    const recap = segmentFromSeconds(
      firstByType(results, ['recap']),
      durationMs,
    );

    const found = Boolean(opening || ending || recap);
    const payload = {
      anime_id: animeId,
      episode_number: episode,
      duration_ms: durationMs,
      opening_start_ms: opening?.startMs ?? null,
      opening_end_ms: opening?.endMs ?? null,
      ending_start_ms: ending?.startMs ?? null,
      ending_end_ms: ending?.endMs ?? null,
      recap_start_ms: recap?.startMs ?? null,
      recap_end_ms: recap?.endMs ?? null,
      skip_source: 'aniskip',
      skip_confidence: null,
      skip_lookup_status: found ? 'found' : 'empty',
      skip_checked_at: now,
      updated_at: now,
    };

    const { data, error } = await adminClient()
      .from('episode_timeline_meta')
      .upsert(payload, { onConflict: 'anime_id,episode_number' })
      .select(
        'anime_id,episode_number,duration_ms,opening_start_ms,opening_end_ms,ending_start_ms,ending_end_ms,recap_start_ms,recap_end_ms,skip_source,skip_confidence,skip_lookup_status,skip_checked_at',
      )
      .single();

    if (error) throw error;
    return rowToTimeline(data as TimelineRow);
  } catch (error) {
    console.warn('[episode-timeline] AniSkip lookup failed:', error);

    const { data, error: saveError } = await adminClient()
      .from('episode_timeline_meta')
      .upsert(
        {
          anime_id: animeId,
          episode_number: episode,
          duration_ms: fallbackDurationMs,
          skip_lookup_status: 'error',
          skip_source: 'aniskip',
          skip_checked_at: now,
          updated_at: now,
        },
        { onConflict: 'anime_id,episode_number' },
      )
      .select(
        'anime_id,episode_number,duration_ms,opening_start_ms,opening_end_ms,ending_start_ms,ending_end_ms,recap_start_ms,recap_end_ms,skip_source,skip_confidence,skip_lookup_status,skip_checked_at',
      )
      .single();

    if (saveError) throw saveError;
    return rowToTimeline(data as TimelineRow);
  }
}
