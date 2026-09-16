import 'server-only';

import { adminClient, ApiError, ensureAnime } from '@/lib/community-server';
import { coveredSeconds, mergePlayedRanges } from '@/lib/played-coverage';

const MAX_EPISODE_MS = 28_800_000;
const SESSION_TTL_MS = 2 * 60 * 60 * 1000;
const MAX_HEARTBEAT_GAP_MS = 30_000;
const MAX_ACCEPTED_MS = 20_000;

type PlayedRange = [number, number];

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
    .select('coverage_ms,active_ms,ranked_ms,completed_at,resume_position_ms,last_watched_at')
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
        coverage_ms: 0,
        active_ms: 0,
        ranked_ms: episodeRow.ranked_enabled ? 0 : null,
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

  return {
    sessionId: session.id as string,
    expiresAt: session.expires_at as string,
    episodeId: episodeRow.id as string,
    durationMs: (episodeRow.duration_ms as number | null) ?? null,
    ranked: Boolean(episodeRow.ranked_enabled),
    progress: existingProgress
      ? {
          coverageMs: Number(existingProgress.coverage_ms ?? 0),
          activeMs: Number(existingProgress.active_ms ?? 0),
          rankedMs: existingProgress.ranked_ms == null ? null : Number(existingProgress.ranked_ms),
          completedAt: (existingProgress.completed_at as string | null) ?? null,
          resumePositionMs: Number(existingProgress.resume_position_ms ?? 0),
          lastWatchedAt: (existingProgress.last_watched_at as string | null) ?? null,
        }
      : {
          coverageMs: 0,
          activeMs: 0,
          rankedMs: episodeRow.ranked_enabled ? 0 : null,
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
    .select('id,anime_id,episode_number,duration_ms,ranked_enabled')
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

  let acceptedMs = 0;
  let reason = 'first_sample';
  let acceptedRange: PlayedRange | null = null;

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
      const maxPlausibleAdvance = Math.min(
        MAX_EPISODE_MS,
        Math.round(wallDelta * 2.25 + 1_500),
      );

      if (positionDelta > maxPlausibleAdvance) {
        reason = 'seek_forward';
      } else {
        acceptedMs = Math.min(MAX_ACCEPTED_MS, Math.max(0, Math.round(wallDelta)));
        reason = 'accepted';
        acceptedRange = [lastPosition, input.positionMs];
      }
    }
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

  const { data: progress, error: progressError } = await watch
    .from('progress')
    .select('watched_ranges,coverage_ms,active_ms,ranked_ms,completed_at,resume_position_ms,last_watched_at')
    .eq('user_id', input.userId)
    .eq('episode_id', session.episode_id)
    .maybeSingle();
  throwIfError(progressError);

  let ranges = normalizeRanges(progress?.watched_ranges);
  if (acceptedRange) {
    ranges = mergePlayedRanges(ranges, acceptedRange[0], acceptedRange[1]);
  }

  const coverageMs = Math.round(coveredSeconds(ranges));
  const activeMs = Number(progress?.active_ms ?? 0) + acceptedMs;
  const rankedMs = episode.ranked_enabled
    ? Number(progress?.ranked_ms ?? 0) + acceptedMs
    : progress?.ranked_ms == null
      ? null
      : Number(progress.ranked_ms);
  const durationMs = episode.duration_ms == null ? null : Number(episode.duration_ms);
  const completedNow = Boolean(
    durationMs && durationMs > 0 && coverageMs >= Math.floor(durationMs * 0.9),
  );
  const completedAt = progress?.completed_at || (completedNow ? receivedAt : null);

  const { error: progressSaveError } = await watch.from('progress').upsert(
    {
      user_id: input.userId,
      episode_id: session.episode_id,
      watched_ranges: ranges,
      coverage_ms: coverageMs,
      active_ms: activeMs,
      ranked_ms: rankedMs,
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
      'resume_position_ms,coverage_ms,active_ms,completed_at,last_watched_at',
    )
    .eq('user_id', userId)
    .eq('episode_id', episode.id)
    .maybeSingle();
  throwIfError(progressError);

  if (!progress) return null;

  return {
    episode: Number(episode.episode_number),
    positionMs: Math.round(asNonNegativeNumber(progress.resume_position_ms)),
    durationMs:
      episode.duration_ms == null
        ? null
        : Math.round(asNonNegativeNumber(episode.duration_ms)),
    coverageMs: Math.round(asNonNegativeNumber(progress.coverage_ms)),
    activeMs: Math.round(asNonNegativeNumber(progress.active_ms)),
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
