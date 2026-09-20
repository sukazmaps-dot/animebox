import 'server-only';

import {
  adminClient,
  ApiError,
  ensureAnime,
  ensureAnimeArtwork,
} from '@/lib/community-server';
import { coveredSeconds, mergePlayedRanges } from '@/lib/played-coverage';
import type { WatchTitleOverview } from '@/types/watch';

const MAX_EPISODE_MS = 28_800_000;
const SESSION_TTL_MS = 2 * 60 * 60 * 1000;
const MAX_HEARTBEAT_GAP_MS = 30_000;
const MAX_ACCEPTED_MS = 20_000;
const MIN_PROVIDER_SKIP_MS = 15_000;
const MAX_PROVIDER_SKIP_MS = 240_000;
const MAX_PROVIDER_EXCLUDED_MS = 360_000;
const MAX_PROVIDER_EXCLUDED_RATIO = 0.3;
const PROVIDER_SKIP_FROM_TOLERANCE_MS = 30_000;
const PROVIDER_SKIP_AFTER_TOLERANCE_MS = 30_000;

// Fallback for providers that perform the native OP/ED jump but do not expose
// a dedicated postMessage event to the parent page. The skipped interval never
// becomes watched/active time; it is only removed from the completion denominator.
const MIN_INFERRED_SKIP_MS = 30_000;
const MAX_INFERRED_SKIP_MS = 180_000;
const MAX_INFERRED_OPENING_START_MS = 240_000;
const ENDING_INFERRED_START_RATIO = 0.7;
const ENDING_INFERRED_TARGET_RATIO = 0.9;

type PlayedRange = [number, number];
type ProviderSkipKind = 'opening' | 'ending';

type ProviderSkipInput = {
  kind: ProviderSkipKind;
  fromMs: number;
  toMs: number;
  origin?: string | null;
};

type WatchStartInput = {
  userId: string;
  animeId: number;
  episode: number;
  requiredEpisodes?: number | null;
  sourceUrl?: string | null;
  messageOrigin?: string | null;
  positionMs?: number | null;
  durationMs?: number | null;
};

type WatchHeartbeatInput = {
  userId: string;
  sessionId: string;
  seq: number;
  positionMs: number;
  durationMs?: number | null;
  providerSkip?: ProviderSkipInput | null;
};

function watchClient() {
  return adminClient().schema('animebox_watch');
}

function throwIfError(error: { message?: string } | null) {
  if (!error) return;

  const message = error.message || 'Supabase watch error';

  if (
    message.includes('schema must be one of') ||
    message.includes('Invalid schema') ||
    message.includes('PGRST106')
  ) {
    throw new ApiError(
      503,
      'Схема animebox_watch не открыта для серверного Data API Supabase. Добавь animebox_watch в Exposed schemas; RLS всё равно оставляет таблицы закрытыми для браузера.',
    );
  }

  throw error;
}

function isUniqueViolation(error: unknown) {
  return Boolean(
    error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code?: string }).code === '23505',
  );
}

function normalizedOrigin(value?: string | null) {
  if (!value) return null;

  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function normalizeRanges(value: unknown): PlayedRange[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item): PlayedRange | null => {
      if (!Array.isArray(item) || item.length !== 2) return null;
      const start = Number(item[0]);
      const end = Number(item[1]);
      if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start) {
        return null;
      }
      return [Math.round(start), Math.round(end)];
    })
    .filter((item): item is PlayedRange => Boolean(item));
}


function mergeRanges(ranges: PlayedRange[]) {
  let merged: PlayedRange[] = [];
  for (const [start, end] of ranges) {
    merged = mergePlayedRanges(merged, start, end);
  }
  return merged;
}

function rangesCoverageMs(ranges: PlayedRange[]) {
  return Math.max(0, Math.round(coveredSeconds(mergeRanges(ranges))));
}

function overlapCoverageMs(a: PlayedRange[], b: PlayedRange[]) {
  const left = mergeRanges(a);
  const right = mergeRanges(b);
  let total = 0;
  let i = 0;
  let j = 0;

  while (i < left.length && j < right.length) {
    const start = Math.max(left[i][0], right[j][0]);
    const end = Math.min(left[i][1], right[j][1]);
    if (end > start) total += end - start;

    if (left[i][1] < right[j][1]) i += 1;
    else j += 1;
  }

  return Math.max(0, Math.round(total));
}

function effectiveWatchProgress(
  watchedRanges: PlayedRange[],
  excludedRanges: PlayedRange[],
  durationMs: number | null,
) {
  const rawCoverageMs = rangesCoverageMs(watchedRanges);
  const excludedMs = rangesCoverageMs(excludedRanges);
  const watchedInsideExcludedMs = overlapCoverageMs(watchedRanges, excludedRanges);
  const coverageMs = Math.max(0, rawCoverageMs - watchedInsideExcludedMs);
  const eligibleDurationMs =
    durationMs && durationMs > 0
      ? Math.max(1, durationMs - Math.min(durationMs, excludedMs))
      : null;

  return {
    rawCoverageMs,
    coverageMs,
    excludedMs,
    eligibleDurationMs,
  };
}

function validateProviderSkip(input: {
  skip?: ProviderSkipInput | null;
  lastPosition: number;
  currentPosition: number;
  durationMs: number | null;
  messageOrigins: unknown;
  existingExcludedRanges: PlayedRange[];
}) {
  const skip = input.skip;
  if (!skip || (skip.kind !== 'opening' && skip.kind !== 'ending')) return null;

  const fromMs = safePosition(skip.fromMs);
  const toMs = safePosition(skip.toMs);
  if (fromMs == null || toMs == null || toMs <= fromMs) return null;

  const skippedMs = toMs - fromMs;
  if (skippedMs < MIN_PROVIDER_SKIP_MS || skippedMs > MAX_PROVIDER_SKIP_MS) {
    return null;
  }

  if (
    fromMs < input.lastPosition - 2_000 ||
    fromMs - input.lastPosition > PROVIDER_SKIP_FROM_TOLERANCE_MS ||
    toMs > input.currentPosition ||
    input.currentPosition - toMs > PROVIDER_SKIP_AFTER_TOLERANCE_MS
  ) {
    return null;
  }

  const origin = normalizedOrigin(skip.origin);
  const allowedOrigins = Array.isArray(input.messageOrigins)
    ? input.messageOrigins
        .filter((item): item is string => typeof item === 'string')
        .map((item) => normalizedOrigin(item))
        .filter((item): item is string => Boolean(item))
    : [];

  if (!origin || !allowedOrigins.includes(origin)) return null;

  if (input.durationMs && input.durationMs > 0) {
    if (toMs > input.durationMs + 5_000) return null;

    if (
      skip.kind === 'opening' &&
      fromMs > Math.min(600_000, Math.floor(input.durationMs * 0.25))
    ) {
      return null;
    }

    if (skip.kind === 'ending' && toMs < Math.floor(input.durationMs * 0.65)) {
      return null;
    }
  }

  const excludedRanges = mergePlayedRanges(
    mergeRanges(input.existingExcludedRanges),
    fromMs,
    toMs,
  );
  const excludedMs = rangesCoverageMs(excludedRanges);
  const maxExcludedMs = input.durationMs
    ? Math.min(
        MAX_PROVIDER_EXCLUDED_MS,
        Math.floor(input.durationMs * MAX_PROVIDER_EXCLUDED_RATIO),
      )
    : MAX_PROVIDER_EXCLUDED_MS;

  if (excludedMs > maxExcludedMs) return null;

  return {
    kind: skip.kind,
    range: [fromMs, toMs] as PlayedRange,
    excludedRanges,
  };
}

function rangeLooksLikeOpening(range: PlayedRange, durationMs: number | null) {
  const [start] = range;
  const maxStart = durationMs && durationMs > 0
    ? Math.min(MAX_INFERRED_OPENING_START_MS, Math.floor(durationMs * 0.25))
    : MAX_INFERRED_OPENING_START_MS;
  return start <= maxStart;
}

function rangeLooksLikeEnding(range: PlayedRange, durationMs: number | null) {
  if (!durationMs || durationMs <= 0) return false;
  const [, end] = range;
  return end >= Math.floor(durationMs * ENDING_INFERRED_TARGET_RATIO);
}

function inferProviderLikeSkip(input: {
  lastPosition: number;
  currentPosition: number;
  durationMs: number | null;
  existingExcludedRanges: PlayedRange[];
}) {
  const fromMs = input.lastPosition;
  const toMs = input.currentPosition;
  const skippedMs = toMs - fromMs;

  if (skippedMs < MIN_INFERRED_SKIP_MS || skippedMs > MAX_INFERRED_SKIP_MS) {
    return null;
  }

  const mergedExisting = mergeRanges(input.existingExcludedRanges);

  const maxOpeningStart = input.durationMs && input.durationMs > 0
    ? Math.min(MAX_INFERRED_OPENING_START_MS, Math.floor(input.durationMs * 0.25))
    : MAX_INFERRED_OPENING_START_MS;

  const openingAlreadyExcluded = mergedExisting.some((range) =>
    rangeLooksLikeOpening(range, input.durationMs),
  );

  if (!openingAlreadyExcluded && fromMs <= maxOpeningStart) {
    const excludedRanges = mergePlayedRanges(mergedExisting, fromMs, toMs);
    return {
      kind: 'opening' as const,
      range: [fromMs, toMs] as PlayedRange,
      excludedRanges,
    };
  }

  if (input.durationMs && input.durationMs > 0) {
    const endingAlreadyExcluded = mergedExisting.some((range) =>
      rangeLooksLikeEnding(range, input.durationMs),
    );
    const endingStart = Math.floor(input.durationMs * ENDING_INFERRED_START_RATIO);
    const endingTarget = Math.floor(input.durationMs * ENDING_INFERRED_TARGET_RATIO);

    if (
      !endingAlreadyExcluded &&
      fromMs >= endingStart &&
      toMs >= endingTarget &&
      toMs <= input.durationMs + 5_000
    ) {
      const excludedRanges = mergePlayedRanges(mergedExisting, fromMs, toMs);
      return {
        kind: 'ending' as const,
        range: [fromMs, toMs] as PlayedRange,
        excludedRanges,
      };
    }
  }

  return null;
}

function safePosition(value?: number | null) {
  if (value == null) return null;
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_EPISODE_MS) return null;
  return value;
}

function safeDuration(value?: number | null) {
  if (value == null) return null;
  if (!Number.isSafeInteger(value) || value < 1_000 || value > MAX_EPISODE_MS) return null;
  return value;
}

export async function startWatchSession(input: WatchStartInput) {
  await ensureAnime(input.animeId);

  const admin = adminClient();
  const watch = watchClient();

  const { data: catalog, error: catalogError } = await admin
    .from('anime_catalog')
    .select('total_episodes,finished')
    .eq('id', input.animeId)
    .maybeSingle();
  throwIfError(catalogError);

  const { data: existingTitle, error: titleReadError } = await watch
    .from('titles')
    .select('required_episodes,finalized')
    .eq('anime_id', input.animeId)
    .maybeSingle();
  throwIfError(titleReadError);

  const catalogEpisodes = Number(catalog?.total_episodes ?? 0);
  const hintedEpisodes = Number(input.requiredEpisodes ?? 0);
  const existingRequired = Number(existingTitle?.required_episodes ?? 0);
  const requiredEpisodes = Math.max(
    1,
    input.episode,
    Number.isSafeInteger(catalogEpisodes) ? catalogEpisodes : 0,
    Number.isSafeInteger(hintedEpisodes) ? hintedEpisodes : 0,
    Number.isSafeInteger(existingRequired) ? existingRequired : 0,
  );

  const { error: titleSaveError } = await watch.from('titles').upsert(
    {
      anime_id: input.animeId,
      required_episodes: requiredEpisodes,
      finalized: Boolean(existingTitle?.finalized || (catalog?.finished && catalogEpisodes > 0)),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'anime_id' },
  );
  throwIfError(titleSaveError);

  const { data: existingEpisode, error: episodeReadError } = await watch
    .from('episodes')
    .select('id,duration_ms,source_url,message_origins,required,ranked_enabled')
    .eq('anime_id', input.animeId)
    .eq('episode_number', input.episode)
    .maybeSingle();
  throwIfError(episodeReadError);

  const sourceUrl = typeof input.sourceUrl === 'string' && input.sourceUrl.length <= 4_000
    ? input.sourceUrl
    : null;
  const eventOrigin = normalizedOrigin(input.messageOrigin);
  const sourceOrigin = normalizedOrigin(sourceUrl);
  const origins = Array.from(
    new Set(
      [
        ...(Array.isArray(existingEpisode?.message_origins)
          ? existingEpisode.message_origins.filter((item): item is string => typeof item === 'string')
          : []),
        eventOrigin,
        sourceOrigin,
      ].filter((item): item is string => Boolean(item)),
    ),
  ).slice(0, 12);

  const durationMs = safeDuration(input.durationMs) ?? existingEpisode?.duration_ms ?? null;

  const episodePayload = {
    anime_id: input.animeId,
    episode_number: input.episode,
    duration_ms: durationMs,
    source_url: sourceUrl ?? existingEpisode?.source_url ?? null,
    message_origins: origins,
    required: existingEpisode?.required ?? true,
    // Ranked mode is never enabled from browser-supplied metadata.
    // It may be enabled later only after trusted server-side verification.
    ranked_enabled: existingEpisode?.ranked_enabled ?? false,
  };

  const { data: episodeRow, error: episodeSaveError } = await watch
    .from('episodes')
    .upsert(episodePayload, { onConflict: 'anime_id,episode_number' })
    .select('id,duration_ms,ranked_enabled')
    .single();
  throwIfError(episodeSaveError);
  if (!episodeRow) throw new ApiError(503, 'Не удалось создать запись серии для трекера.');

  const now = Date.now();
  const expiresAt = new Date(now + SESSION_TTL_MS).toISOString();
  const initialPosition = safePosition(input.positionMs);

  // Progress must be ready before we create the active session.
  // Otherwise an error here would leave a zombie session with ended_at = null,
  // and the one-active-session unique index would block every future start.
  const { data: existingProgress, error: progressReadError } = await watch
    .from('progress')
    .select('watched_ranges,excluded_ranges,coverage_ms,active_ms,ranked_ms,completed_at,resume_position_ms,last_watched_at')
    .eq('user_id', input.userId)
    .eq('episode_id', episodeRow.id)
    .maybeSingle();
  throwIfError(progressReadError);

  if (!existingProgress) {
    const { error: progressInsertError } = await watch.from('progress').upsert(
      {
        user_id: input.userId,
        episode_id: episodeRow.id,
        watched_ranges: [],
        excluded_ranges: [],
        coverage_ms: 0,
        active_ms: 0,
        resume_position_ms: initialPosition ?? 0,
        last_watched_at: new Date(now).toISOString(),
        updated_at: new Date(now).toISOString(),
      },
      { onConflict: 'user_id,episode_id', ignoreDuplicates: true },
    );
    throwIfError(progressInsertError);
  }

  const closePreviousActiveSession = async () => {
    const endedAt = new Date().toISOString();
    const { error } = await watch
      .from('sessions')
      .update({ ended_at: endedAt, last_active: false })
      .eq('user_id', input.userId)
      .is('ended_at', null);
    throwIfError(error);
  };

  // A new playback supersedes any stale/open playback for this user.
  // The unique partial index remains in place as a database-level guard
  // against parallel ranked sessions.
  await closePreviousActiveSession();

  let session: { id: string; expires_at: string } | null = null;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const { data, error } = await watch
      .from('sessions')
      .insert({
        user_id: input.userId,
        episode_id: episodeRow.id,
        expires_at: expiresAt,
        last_received_at: new Date().toISOString(),
        last_position_ms: initialPosition,
        last_active: false,
        last_seq: 0,
      })
      .select('id,expires_at')
      .single();

    if (!error && data) {
      session = data as { id: string; expires_at: string };
      break;
    }

    // Two tabs can race between closing the old session and inserting a new one.
    // If that happens, close the winner once and retry. The database unique
    // index is still the final source of truth.
    if (attempt === 0 && isUniqueViolation(error)) {
      await closePreviousActiveSession();
      continue;
    }

    throwIfError(error);
  }

  if (!session) {
    throw new ApiError(503, 'Не удалось создать сессию просмотра.');
  }

  const startDurationMs = (episodeRow.duration_ms as number | null) ?? null;
  const startProgress = existingProgress
    ? effectiveWatchProgress(
        normalizeRanges(existingProgress.watched_ranges),
        normalizeRanges(existingProgress.excluded_ranges),
        startDurationMs,
      )
    : {
        rawCoverageMs: 0,
        coverageMs: 0,
        excludedMs: 0,
        eligibleDurationMs: startDurationMs,
      };

  return {
    sessionId: session.id as string,
    expiresAt: session.expires_at as string,
    episodeId: episodeRow.id as string,
    durationMs: startDurationMs,
    ranked: Boolean(episodeRow.ranked_enabled),
    progress: existingProgress
      ? {
          coverageMs: startProgress.coverageMs,
          activeMs: Number(existingProgress.active_ms ?? 0),
          excludedMs: startProgress.excludedMs,
          eligibleDurationMs: startProgress.eligibleDurationMs,
          rankedMs: existingProgress.ranked_ms == null ? null : Number(existingProgress.ranked_ms),
          completedAt: (existingProgress.completed_at as string | null) ?? null,
          resumePositionMs: Number(existingProgress.resume_position_ms ?? 0),
          lastWatchedAt: (existingProgress.last_watched_at as string | null) ?? null,
        }
      : {
          coverageMs: 0,
          activeMs: 0,
          excludedMs: 0,
          eligibleDurationMs: startDurationMs,
          rankedMs: null,
          completedAt: null,
          resumePositionMs: initialPosition ?? 0,
          lastWatchedAt: new Date(now).toISOString(),
        },
  };
}

export async function recordWatchHeartbeat(input: WatchHeartbeatInput) {
  const watch = watchClient();

  const { data: session, error: sessionError } = await watch
    .from('sessions')
    .select('id,episode_id,created_at,expires_at,ended_at,last_received_at,last_position_ms,last_active,last_seq')
    .eq('id', input.sessionId)
    .eq('user_id', input.userId)
    .maybeSingle();
  throwIfError(sessionError);

  if (!session) throw new ApiError(404, 'Сессия просмотра не найдена.');
  if (session.ended_at) throw new ApiError(409, 'Сессия просмотра уже завершена.');

  const now = Date.now();
  if (Date.parse(session.expires_at) <= now) {
    await watch.from('sessions').update({ ended_at: new Date(now).toISOString(), last_active: false }).eq('id', input.sessionId);
    throw new ApiError(410, 'Сессия просмотра истекла.');
  }

  if (input.seq <= Number(session.last_seq ?? 0)) {
    const { data: duplicate } = await watch
      .from('heartbeats')
      .select('accepted_ms,reason,position_ms')
      .eq('session_id', input.sessionId)
      .eq('seq', input.seq)
      .maybeSingle();

    return {
      acceptedMs: Number(duplicate?.accepted_ms ?? 0),
      reason: duplicate?.reason ?? 'duplicate',
      completed: false,
      coverageMs: null,
      activeMs: null,
    };
  }

  const { data: episode, error: episodeError } = await watch
    .from('episodes')
    .select('id,anime_id,episode_number,duration_ms,ranked_enabled,message_origins')
    .eq('id', session.episode_id)
    .single();
  throwIfError(episodeError);
  if (!episode) throw new ApiError(503, 'Серия сессии просмотра не найдена.');

  const heartbeatDuration = safeDuration(input.durationMs);
  if (episode.duration_ms == null && heartbeatDuration != null) {
    const { error: durationSaveError } = await watch
      .from('episodes')
      .update({ duration_ms: heartbeatDuration })
      .eq('id', session.episode_id)
      .is('duration_ms', null);
    throwIfError(durationSaveError);
    episode.duration_ms = heartbeatDuration;
  }

  const lastPosition = session.last_position_ms == null ? null : Number(session.last_position_ms);
  const lastReceived = Date.parse(session.last_received_at);
  const wallDelta = Number.isFinite(lastReceived) ? Math.max(0, now - lastReceived) : 0;
  const positionDelta = lastPosition == null ? 0 : input.positionMs - lastPosition;

  const durationMs = episode.duration_ms == null ? null : Number(episode.duration_ms);

  const { data: progress, error: progressError } = await watch
    .from('progress')
    .select('watched_ranges,excluded_ranges,coverage_ms,active_ms,ranked_ms,completed_at,resume_position_ms,last_watched_at')
    .eq('user_id', input.userId)
    .eq('episode_id', session.episode_id)
    .maybeSingle();
  throwIfError(progressError);

  let ranges = normalizeRanges(progress?.watched_ranges);
  let excludedRanges = normalizeRanges(progress?.excluded_ranges);
  let acceptedMs = 0;
  let reason = 'first_sample';
  const acceptedRanges: PlayedRange[] = [];

  if (lastPosition != null) {
    if (input.seq !== Number(session.last_seq ?? 0) + 1) {
      reason = 'sequence_gap';
    } else if (wallDelta < 350) {
      reason = 'too_soon';
    } else if (wallDelta > MAX_HEARTBEAT_GAP_MS) {
      reason = 'stale_gap';
    } else if (positionDelta <= 0) {
      reason = positionDelta < -1_500 ? 'seek_backward' : 'idle';
    } else {
      const explicitProviderSkip = validateProviderSkip({
        skip: input.providerSkip,
        lastPosition,
        currentPosition: input.positionMs,
        durationMs,
        messageOrigins: episode.message_origins,
        existingExcludedRanges: excludedRanges,
      });

      // Kodik currently performs the native opening jump in some embeds without
      // sending a usable skip postMessage to the parent page. In that case the
      // server may infer ONE tightly constrained OP/ED jump from the timeline.
      // This does not award watched time for the skipped interval.
      const inferredProviderSkip = explicitProviderSkip
        ? null
        : inferProviderLikeSkip({
            lastPosition,
            currentPosition: input.positionMs,
            durationMs,
            existingExcludedRanges: excludedRanges,
          });
      const providerSkip = explicitProviderSkip ?? inferredProviderSkip;

      if (providerSkip) {
        const [skipFrom, skipTo] = providerSkip.range;
        const playedBefore = Math.max(0, skipFrom - lastPosition);
        const playedAfter = Math.max(0, input.positionMs - skipTo);
        const playedAdvance = playedBefore + playedAfter;
        const maxPlausibleAdvance = Math.min(
          MAX_EPISODE_MS,
          Math.round(wallDelta * 2.25 + 1_500),
        );

        if (playedAdvance <= maxPlausibleAdvance) {
          excludedRanges = providerSkip.excludedRanges;
          if (skipFrom > lastPosition) {
            acceptedRanges.push([lastPosition, skipFrom]);
          }
          if (input.positionMs > skipTo) {
            acceptedRanges.push([skipTo, input.positionMs]);
          }
          acceptedMs = Math.min(
            MAX_ACCEPTED_MS,
            Math.max(0, Math.round(Math.min(wallDelta, playedAdvance))),
          );
          reason = explicitProviderSkip
            ? `accepted_provider_skip_${providerSkip.kind}`
            : `accepted_inferred_${providerSkip.kind}_skip`;
        } else {
          reason = 'seek_forward';
        }
      } else {
        const maxPlausibleAdvance = Math.min(
          MAX_EPISODE_MS,
          Math.round(wallDelta * 2.25 + 1_500),
        );

        if (positionDelta > maxPlausibleAdvance) {
          reason = 'seek_forward';
        } else {
          acceptedMs = Math.min(
            MAX_ACCEPTED_MS,
            Math.max(0, Math.round(wallDelta)),
          );
          reason = 'accepted';
          acceptedRanges.push([lastPosition, input.positionMs]);
        }
      }
    }
  }

  for (const [rangeStart, rangeEnd] of acceptedRanges) {
    ranges = mergePlayedRanges(ranges, rangeStart, rangeEnd);
  }

  const receivedAt = new Date(now).toISOString();

  const { error: heartbeatError } = await watch.from('heartbeats').insert({
    session_id: input.sessionId,
    seq: input.seq,
    received_at: receivedAt,
    position_ms: input.positionMs,
    accepted_ms: acceptedMs,
    reason,
  });
  throwIfError(heartbeatError);

  const watchProgress = effectiveWatchProgress(ranges, excludedRanges, durationMs);
  const rawCoverageMs = watchProgress.rawCoverageMs;
  const coverageMs = watchProgress.coverageMs;
  const excludedMs = watchProgress.excludedMs;
  const eligibleDurationMs = watchProgress.eligibleDurationMs;
  const activeMs = Number(progress?.active_ms ?? 0) + acceptedMs;
  const completedNow = Boolean(
    eligibleDurationMs &&
      eligibleDurationMs > 0 &&
      coverageMs >= Math.floor(eligibleDurationMs * 0.9),
  );
  const completedAt = progress?.completed_at || (completedNow ? receivedAt : null);

  const { error: progressSaveError } = await watch.from('progress').upsert(
    {
      user_id: input.userId,
      episode_id: session.episode_id,
      watched_ranges: ranges,
      excluded_ranges: excludedRanges,
      coverage_ms: rawCoverageMs,
      active_ms: activeMs,
      completed_at: completedAt,
      resume_position_ms: input.positionMs,
      last_watched_at: receivedAt,
      updated_at: receivedAt,
    },
    { onConflict: 'user_id,episode_id' },
  );
  throwIfError(progressSaveError);

  const { error: sessionSaveError } = await watch
    .from('sessions')
    .update({
      last_received_at: receivedAt,
      last_position_ms: input.positionMs,
      last_active: acceptedMs > 0,
      last_seq: input.seq,
    })
    .eq('id', input.sessionId)
    .eq('user_id', input.userId);
  throwIfError(sessionSaveError);

  return {
    acceptedMs,
    reason,
    completed: Boolean(completedAt),
    newlyCompleted: !progress?.completed_at && completedNow,
    coverageMs,
    activeMs,
    durationMs,
    excludedMs,
    eligibleDurationMs,
    animeId: Number(episode.anime_id),
    episode: Number(episode.episode_number),
  };
}

export type WatchSummary = {
  trackedEpisodes: number;
  completedEpisodes: number;
  activeMs: number;
  coverageMs: number;
  rankedMs: number;
  lastWatchedAt: string | null;
};

export type EpisodeWatchState = {
  episode: number;
  positionMs: number;
  durationMs: number | null;
  coverageMs: number;
  activeMs: number;
  excludedMs: number;
  eligibleDurationMs: number | null;
  completed: boolean;
  watchedAt: string | null;
};

function asNonNegativeNumber(value: unknown) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

export async function getWatchSummary(userId: string): Promise<WatchSummary> {
  const watch = watchClient();

  const { data, error } = await watch.rpc('user_watch_summary', {
    p_user_id: userId,
  });
  throwIfError(error);

  const row = Array.isArray(data) ? data[0] : data;

  if (!row || typeof row !== 'object') {
    return {
      trackedEpisodes: 0,
      completedEpisodes: 0,
      activeMs: 0,
      coverageMs: 0,
      rankedMs: 0,
      lastWatchedAt: null,
    };
  }

  const record = row as Record<string, unknown>;

  return {
    trackedEpisodes: asNonNegativeNumber(record.tracked_episodes),
    completedEpisodes: asNonNegativeNumber(record.completed_episodes),
    activeMs: asNonNegativeNumber(record.active_ms),
    coverageMs: asNonNegativeNumber(record.coverage_ms),
    rankedMs: asNonNegativeNumber(record.ranked_ms),
    lastWatchedAt:
      typeof record.last_watched_at === 'string'
        ? record.last_watched_at
        : null,
  };
}

export async function getTrackedWatchMinutes(userId: string) {
  const summary = await getWatchSummary(userId);
  return Math.floor(summary.activeMs / 60_000);
}

export async function getLatestWatchState(
  userId: string,
  animeId: number,
): Promise<EpisodeWatchState | null> {
  const watch = watchClient();

  const { data, error } = await watch.rpc('latest_watch_state', {
    p_user_id: userId,
    p_anime_id: animeId,
  });
  throwIfError(error);

  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== 'object') return null;

  const record = row as Record<string, unknown>;

  return {
    episode: Math.max(1, Math.round(asNonNegativeNumber(record.episode) || 1)),
    positionMs: Math.round(asNonNegativeNumber(record.position_ms)),
    durationMs:
      record.duration_ms == null
        ? null
        : Math.round(asNonNegativeNumber(record.duration_ms)),
    coverageMs: Math.round(asNonNegativeNumber(record.coverage_ms)),
    activeMs: Math.round(asNonNegativeNumber(record.active_ms)),
    excludedMs: 0,
    eligibleDurationMs:
      record.duration_ms == null
        ? null
        : Math.round(asNonNegativeNumber(record.duration_ms)),
    completed: Boolean(record.completed),
    watchedAt:
      typeof record.watched_at === 'string'
        ? record.watched_at
        : null,
  };
}

export async function getEpisodeWatchState(
  userId: string,
  animeId: number,
  episodeNumber: number,
): Promise<EpisodeWatchState | null> {
  const watch = watchClient();

  const { data: episode, error: episodeError } = await watch
    .from('episodes')
    .select('id,episode_number,duration_ms')
    .eq('anime_id', animeId)
    .eq('episode_number', episodeNumber)
    .maybeSingle();
  throwIfError(episodeError);

  if (!episode) return null;

  const { data: progress, error: progressError } = await watch
    .from('progress')
    .select(
      'resume_position_ms,watched_ranges,excluded_ranges,coverage_ms,active_ms,completed_at,last_watched_at',
    )
    .eq('user_id', userId)
    .eq('episode_id', episode.id)
    .maybeSingle();
  throwIfError(progressError);

  if (!progress) return null;

  const episodeDurationMs =
    episode.duration_ms == null
      ? null
      : Math.round(asNonNegativeNumber(episode.duration_ms));
  const episodeProgress = effectiveWatchProgress(
    normalizeRanges(progress.watched_ranges),
    normalizeRanges(progress.excluded_ranges),
    episodeDurationMs,
  );

  return {
    episode: Number(episode.episode_number),
    positionMs: Math.round(asNonNegativeNumber(progress.resume_position_ms)),
    durationMs: episodeDurationMs,
    coverageMs: episodeProgress.coverageMs,
    activeMs: Math.round(asNonNegativeNumber(progress.active_ms)),
    excludedMs: episodeProgress.excludedMs,
    eligibleDurationMs: episodeProgress.eligibleDurationMs,
    completed: Boolean(progress.completed_at),
    watchedAt:
      typeof progress.last_watched_at === 'string'
        ? progress.last_watched_at
        : null,
  };
}

export async function getCompletedEpisodes(
  userId: string,
  animeId: number,
): Promise<number[]> {
  const watch = watchClient();

  const { data: episodes, error: episodesError } = await watch
    .from('episodes')
    .select('id,episode_number')
    .eq('anime_id', animeId)
    .order('episode_number', { ascending: true });
  throwIfError(episodesError);

  const rows = episodes ?? [];
  if (rows.length === 0) return [];

  const episodeById = new Map<string, number>();
  for (const row of rows) {
    if (typeof row.id === 'string') {
      episodeById.set(row.id, Number(row.episode_number));
    }
  }

  const ids = Array.from(episodeById.keys());
  if (ids.length === 0) return [];

  const { data: progress, error: progressError } = await watch
    .from('progress')
    .select('episode_id')
    .eq('user_id', userId)
    .in('episode_id', ids)
    .not('completed_at', 'is', null);
  throwIfError(progressError);

  return (progress ?? [])
    .map((row) => episodeById.get(String(row.episode_id)))
    .filter(
      (value): value is number =>
        typeof value === 'number' && Number.isSafeInteger(value) && value > 0,
    )
    .sort((a, b) => a - b);
}

const WATCH_QUERY_CHUNK = 100;

function chunkValues<T>(values: T[], size = WATCH_QUERY_CHUNK) {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

function safeTimestamp(value: unknown) {
  if (typeof value !== 'string') return 0;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function watchPercent(coverageMs: number, eligibleDurationMs: number | null) {
  if (!eligibleDurationMs || eligibleDurationMs <= 0) return null;

  return Math.min(
    100,
    Math.max(0, Math.round((coverageMs / eligibleDurationMs) * 100)),
  );
}

export async function getTitleWatchOverviews(
  userId: string,
  animeIds: number[],
): Promise<WatchTitleOverview[]> {
  const normalizedAnimeIds = [
    ...new Set(
      animeIds
        .map((value) => Number(value))
        .filter(
          (value) => Number.isSafeInteger(value) && value > 0,
        ),
    ),
  ];

  if (normalizedAnimeIds.length === 0) return [];

  const watch = watchClient();
  const admin = adminClient();

  const episodeRows: Array<{
    id: string;
    anime_id: number;
    episode_number: number;
    duration_ms: number | null;
  }> = [];

  for (const batch of chunkValues(normalizedAnimeIds)) {
    const { data, error } = await watch
      .from('episodes')
      .select('id,anime_id,episode_number,duration_ms')
      .in('anime_id', batch);
    throwIfError(error);

    for (const row of data ?? []) {
      if (typeof row.id !== 'string') continue;
      episodeRows.push({
        id: row.id,
        anime_id: Number(row.anime_id),
        episode_number: Number(row.episode_number),
        duration_ms:
          row.duration_ms == null ? null : Number(row.duration_ms),
      });
    }
  }

  const catalogRows: Array<{
    id: number;
    title: string;
    total_episodes: number | null;
    finished: boolean;
    poster_url: string | null;
    slug: string | null;
  }> = [];

  for (const batch of chunkValues(normalizedAnimeIds)) {
    const { data, error } = await admin
      .from('anime_catalog')
      .select('id,title,total_episodes,finished,poster_url,slug')
      .in('id', batch);

    if (error) throw error;

    for (const row of data ?? []) {
      catalogRows.push({
        id: Number(row.id),
        title:
          typeof row.title === 'string' && row.title.trim()
            ? row.title.trim()
            : `Аниме #${row.id}`,
        total_episodes:
          row.total_episodes == null ? null : Number(row.total_episodes),
        finished: Boolean(row.finished),
        poster_url:
          typeof row.poster_url === 'string' && row.poster_url.trim()
            ? row.poster_url.trim()
            : null,
        slug:
          typeof row.slug === 'string' && row.slug.trim()
            ? row.slug.trim()
            : null,
      });
    }
  }

  const catalogByAnime = new Map(
    catalogRows.map((row) => [row.id, row] as const),
  );
  const episodeById = new Map(
    episodeRows.map((row) => [row.id, row] as const),
  );

  const progressRows: Array<{
    episode_id: string;
    watched_ranges: unknown;
    excluded_ranges: unknown;
    active_ms: number;
    completed_at: string | null;
    resume_position_ms: number;
    last_watched_at: string | null;
  }> = [];

  const episodeIds = episodeRows.map((row) => row.id);

  for (const batch of chunkValues(episodeIds)) {
    const { data, error } = await watch
      .from('progress')
      .select(
        'episode_id,watched_ranges,excluded_ranges,active_ms,completed_at,resume_position_ms,last_watched_at',
      )
      .eq('user_id', userId)
      .in('episode_id', batch);
    throwIfError(error);

    for (const row of data ?? []) {
      progressRows.push({
        episode_id: String(row.episode_id),
        watched_ranges: row.watched_ranges,
        excluded_ranges: row.excluded_ranges,
        active_ms: Number(row.active_ms ?? 0),
        completed_at:
          typeof row.completed_at === 'string' ? row.completed_at : null,
        resume_position_ms: Number(row.resume_position_ms ?? 0),
        last_watched_at:
          typeof row.last_watched_at === 'string'
            ? row.last_watched_at
            : null,
      });
    }
  }

  const state = new Map<
    number,
    WatchTitleOverview & { latestTimestamp: number }
  >();

  for (const animeId of normalizedAnimeIds) {
    const catalog = catalogByAnime.get(animeId);
    state.set(animeId, {
      animeId,
      title: catalog?.title ?? `Аниме #${animeId}`,
      slug: catalog?.slug ?? null,
      posterUrl: catalog?.poster_url ?? null,
      totalEpisodes: catalog?.total_episodes ?? null,
      trackedEpisodes: 0,
      completedEpisodes: 0,
      activeMs: 0,
      latestEpisode: null,
      resumeEpisode: null,
      resumePositionMs: 0,
      durationMs: null,
      progressPercent: null,
      latestCompleted: false,
      fullyCompleted: false,
      lastWatchedAt: null,
      latestTimestamp: 0,
    });
  }

  for (const progress of progressRows) {
    const episode = episodeById.get(progress.episode_id);
    if (!episode) continue;

    const current = state.get(episode.anime_id);
    if (!current) continue;

    current.trackedEpisodes += 1;
    current.activeMs += Math.max(0, progress.active_ms);

    const completed = Boolean(progress.completed_at);
    if (completed) current.completedEpisodes += 1;

    const watchedAt = safeTimestamp(progress.last_watched_at);

    if (
      current.latestEpisode == null ||
      watchedAt >= current.latestTimestamp
    ) {
      const effective = effectiveWatchProgress(
        normalizeRanges(progress.watched_ranges),
        normalizeRanges(progress.excluded_ranges),
        episode.duration_ms,
      );

      current.latestTimestamp = watchedAt;
      current.latestEpisode = episode.episode_number;
      current.resumePositionMs = Math.max(
        0,
        Math.round(progress.resume_position_ms),
      );
      current.durationMs = episode.duration_ms;
      current.progressPercent = completed
        ? 100
        : watchPercent(
            effective.coverageMs,
            effective.eligibleDurationMs,
          );
      current.latestCompleted = completed;
      current.lastWatchedAt = progress.last_watched_at;
    }
  }

  return [...state.values()].map((item) => {
    const catalog = catalogByAnime.get(item.animeId);
    const totalEpisodes =
      catalog?.total_episodes != null && catalog.total_episodes > 0
        ? catalog.total_episodes
        : null;
    const fullyCompleted = Boolean(
      catalog?.finished &&
        totalEpisodes &&
        item.completedEpisodes >= totalEpisodes,
    );

    const resumeEpisode =
      !fullyCompleted &&
      item.latestEpisode != null &&
      !item.latestCompleted
        ? item.latestEpisode
        : null;

    return {
      animeId: item.animeId,
      title: item.title,
      slug: item.slug,
      posterUrl: item.posterUrl,
      totalEpisodes,
      trackedEpisodes: item.trackedEpisodes,
      completedEpisodes: item.completedEpisodes,
      activeMs: item.activeMs,
      latestEpisode: item.latestEpisode,
      resumeEpisode,
      resumePositionMs:
        resumeEpisode == null ? 0 : item.resumePositionMs,
      durationMs: item.durationMs,
      progressPercent: item.progressPercent,
      latestCompleted: item.latestCompleted,
      fullyCompleted,
      lastWatchedAt: item.lastWatchedAt,
    };
  });
}

export async function getRecentWatchTitles(
  userId: string,
  limit = 4,
): Promise<WatchTitleOverview[]> {
  const safeLimit = Math.min(12, Math.max(1, Math.floor(limit)));
  const watch = watchClient();

  const { data: recentProgress, error: progressError } = await watch
    .from('progress')
    .select('episode_id,last_watched_at')
    .eq('user_id', userId)
    .order('last_watched_at', { ascending: false })
    .limit(Math.max(24, safeLimit * 12));
  throwIfError(progressError);

  const episodeIds = [
    ...new Set(
      (recentProgress ?? [])
        .map((row) => String(row.episode_id || ''))
        .filter(Boolean),
    ),
  ];

  if (episodeIds.length === 0) return [];

  const episodeById = new Map<string, number>();

  for (const batch of chunkValues(episodeIds)) {
    const { data, error } = await watch
      .from('episodes')
      .select('id,anime_id')
      .in('id', batch);
    throwIfError(error);

    for (const row of data ?? []) {
      if (typeof row.id === 'string') {
        episodeById.set(row.id, Number(row.anime_id));
      }
    }
  }

  const recentAnimeIds: number[] = [];
  const seen = new Set<number>();

  for (const row of recentProgress ?? []) {
    const animeId = episodeById.get(String(row.episode_id));
    if (!animeId || seen.has(animeId)) continue;
    seen.add(animeId);
    recentAnimeIds.push(animeId);
  }

  const overviews = await getTitleWatchOverviews(
    userId,
    recentAnimeIds,
  );

  const recent = overviews
    .filter(
      (item) =>
        item.trackedEpisodes > 0 &&
        item.resumeEpisode != null,
    )
    .sort(
      (a, b) =>
        safeTimestamp(b.lastWatchedAt) -
        safeTimestamp(a.lastWatchedAt),
    )
    .slice(0, safeLimit);

  return Promise.all(
    recent.map(async (item) => {
      if (item.slug) return item;

      try {
        const catalog = await ensureAnimeArtwork(item.animeId);

        return {
          ...item,
          title: catalog.title || item.title,
          slug: catalog.slug ?? item.slug,
          posterUrl: catalog.poster_url ?? item.posterUrl,
          totalEpisodes:
            catalog.total_episodes ?? item.totalEpisodes,
        };
      } catch (error) {
        console.warn(
          `[watch] artwork metadata unavailable for anime ${item.animeId}`,
          error,
        );
        return item;
      }
    }),
  );
}

export async function getWatchSessionAcceptedMs(
  userId: string,
  sessionId: string,
) {
  const watch = watchClient();
  const { data, error } = await watch.rpc('session_accepted_ms', {
    p_user_id: userId,
    p_session_id: sessionId,
  });
  throwIfError(error);

  const value = Number(Array.isArray(data) ? data[0] : data);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

export async function endWatchSession(input: {
  userId: string;
  sessionId: string;
  positionMs?: number | null;
}) {
  const watch = watchClient();
  const now = new Date().toISOString();
  const positionMs = safePosition(input.positionMs);

  const { data: session, error: sessionReadError } = await watch
    .from('sessions')
    .select('episode_id')
    .eq('id', input.sessionId)
    .eq('user_id', input.userId)
    .maybeSingle();
  throwIfError(sessionReadError);

  const payload: Record<string, unknown> = {
    ended_at: now,
    last_received_at: now,
    last_active: false,
  };

  if (positionMs != null) payload.last_position_ms = positionMs;

  const { error } = await watch
    .from('sessions')
    .update(payload)
    .eq('id', input.sessionId)
    .eq('user_id', input.userId)
    .is('ended_at', null);
  throwIfError(error);

  if (session?.episode_id && positionMs != null) {
    const { error: progressError } = await watch
      .from('progress')
      .update({
        resume_position_ms: positionMs,
        last_watched_at: now,
        updated_at: now,
      })
      .eq('user_id', input.userId)
      .eq('episode_id', session.episode_id);
    throwIfError(progressError);
  }

  return { ended: true };
}
