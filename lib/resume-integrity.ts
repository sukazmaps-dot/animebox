export const RESUME_LOCAL_FUTURE_SKEW_MS = 60_000;
export const RESUME_LOCAL_NEWER_WINDOW_MS = 10 * 60_000;
export const RESUME_LOCAL_ONLY_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export type ResumeMergeSource =
  | 'none'
  | 'completed'
  | 'server'
  | 'local'
  | 'local_newer';

export type ResumeMergeDecision = {
  source: ResumeMergeSource;
  positionSeconds: number;
  localWins: boolean;
};

export function resumeEndGuardMs(durationMs: number) {
  if (!Number.isFinite(durationMs) || durationMs <= 0) return 20_000;
  return Math.min(20_000, Math.max(6_000, durationMs * 0.04));
}

export function canonicalResumePositionMs(input: {
  positionMs: number | null | undefined;
  durationMs?: number | null;
  completed?: boolean;
}) {
  if (input.completed) return 0;

  const rawPosition = Number(input.positionMs ?? 0);
  if (!Number.isFinite(rawPosition) || rawPosition <= 0) return 0;

  const durationMs =
    input.durationMs != null &&
    Number.isFinite(input.durationMs) &&
    input.durationMs > 0
      ? Math.max(1_000, Math.round(input.durationMs))
      : null;

  const positionMs = Math.max(
    0,
    Math.round(
      durationMs == null
        ? rawPosition
        : Math.min(rawPosition, durationMs),
    ),
  );

  if (
    durationMs != null &&
    durationMs - positionMs <= resumeEndGuardMs(durationMs)
  ) {
    return 0;
  }

  return positionMs;
}

function plausibleLocalTimestamp(updatedAt: number, nowMs: number) {
  return (
    Number.isFinite(updatedAt) &&
    updatedAt > 0 &&
    updatedAt <= nowMs + RESUME_LOCAL_FUTURE_SKEW_MS &&
    nowMs - updatedAt <= RESUME_LOCAL_ONLY_MAX_AGE_MS
  );
}

export function chooseResumeCandidate(input: {
  serverCompleted: boolean;
  serverUsable: boolean;
  serverPositionSeconds: number;
  serverUpdatedAt: number;
  localUsable: boolean;
  localPositionSeconds: number;
  localUpdatedAt: number;
  nowMs?: number;
}): ResumeMergeDecision {
  if (input.serverCompleted) {
    return {
      source: 'completed',
      positionSeconds: 0,
      localWins: false,
    };
  }

  const nowMs = input.nowMs ?? Date.now();
  const localTimestampPlausible = plausibleLocalTimestamp(
    input.localUpdatedAt,
    nowMs,
  );

  if (input.serverUsable) {
    if (!input.localUsable || !localTimestampPlausible) {
      return {
        source: 'server',
        positionSeconds: Math.max(
          0,
          Math.floor(input.serverPositionSeconds),
        ),
        localWins: false,
      };
    }

    const localAheadMs =
      input.localUpdatedAt - Math.max(0, input.serverUpdatedAt);
    const localPlausiblyNewer =
      localAheadMs > 2_000 &&
      localAheadMs <= RESUME_LOCAL_NEWER_WINDOW_MS;

    if (localPlausiblyNewer) {
      return {
        source: 'local_newer',
        positionSeconds: Math.max(
          0,
          Math.floor(input.localPositionSeconds),
        ),
        localWins: true,
      };
    }

    return {
      source: 'server',
      positionSeconds: Math.max(
        0,
        Math.floor(input.serverPositionSeconds),
      ),
      localWins: false,
    };
  }

  if (input.localUsable && localTimestampPlausible) {
    return {
      source: 'local',
      positionSeconds: Math.max(
        0,
        Math.floor(input.localPositionSeconds),
      ),
      localWins: true,
    };
  }

  return {
    source: 'none',
    positionSeconds: 0,
    localWins: false,
  };
}
