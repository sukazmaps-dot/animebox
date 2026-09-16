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

  const { data: session, error: sessionError } = await watch
    .from('sessions')
    .insert({
      user_id: input.userId,
      episode_id: episodeRow.id,
      expires_at: expiresAt,
      last_received_at: new Date(now).toISOString(),
      last_position_ms: initialPosition,
      last_active: false,
      last_seq: 0,
    })
    .select('id,expires_at')
    .single();
  throwIfError(sessionError);
  if (!session) throw new ApiError(503, 'Не удалось создать сессию просмотра.');

  const { data: existingProgress, error: progressReadError } = await watch
    .from('progress')
    .select('coverage_ms,active_ms,ranked_ms,completed_at')
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
        updated_at: new Date(now).toISOString(),
      },
      { onConflict: 'user_id,episode_id', ignoreDuplicates: true },
    );
    throwIfError(progressInsertError);
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
        }
      : {
          coverageMs: 0,
          activeMs: 0,
          rankedMs: episodeRow.ranked_enabled ? 0 : null,
          completedAt: null,
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
    .select('watched_ranges,coverage_ms,active_ms,ranked_ms,completed_at')
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
    animeId: Number(episode.anime_id),
    episode: Number(episode.episode_number),
  };
}

export async function endWatchSession(input: {
  userId: string;
  sessionId: string;
  positionMs?: number | null;
}) {
  const watch = watchClient();
  const now = new Date().toISOString();
  const positionMs = safePosition(input.positionMs);

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

  return { ended: true };
}
