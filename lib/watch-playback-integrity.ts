export const MAX_SUPPORTED_PLAYBACK_RATE = 2;
export const PLAYBACK_RATE_TOLERANCE = 0.25;
export const PLAYBACK_ADVANCE_GRACE_MS = 1_500;
export const ACCELERATED_PLAYBACK_RATE_THRESHOLD = 1.15;
export const MAX_ACCEPTED_REAL_WATCH_MS = 20_000;

function finiteNonNegative(value: number) {
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

export function maxPlausiblePlaybackAdvanceMs(wallDeltaMs: number) {
  const wallDelta = finiteNonNegative(wallDeltaMs);

  return Math.max(
    0,
    Math.round(
      wallDelta * (MAX_SUPPORTED_PLAYBACK_RATE + PLAYBACK_RATE_TOLERANCE) +
        PLAYBACK_ADVANCE_GRACE_MS,
    ),
  );
}

export type PlaybackAdvanceInspection = {
  plausible: boolean;
  accelerated: boolean;
  inferredRate: number;
  maxPlausibleAdvanceMs: number;
};

export function inspectPlaybackAdvance(input: {
  wallDeltaMs: number;
  mediaAdvanceMs: number;
}): PlaybackAdvanceInspection {
  const wallDelta = finiteNonNegative(input.wallDeltaMs);
  const mediaAdvance = finiteNonNegative(input.mediaAdvanceMs);
  const maxPlausibleAdvance = maxPlausiblePlaybackAdvanceMs(wallDelta);
  const inferredRate = wallDelta > 0 ? mediaAdvance / wallDelta : 0;

  return {
    plausible:
      wallDelta > 0 &&
      mediaAdvance > 0 &&
      mediaAdvance <= maxPlausibleAdvance,
    accelerated:
      wallDelta > 0 &&
      inferredRate > ACCELERATED_PLAYBACK_RATE_THRESHOLD,
    inferredRate,
    maxPlausibleAdvanceMs: maxPlausibleAdvance,
  };
}

/**
 * Watch-time is wall-clock time, not media timeline distance.
 *
 * A viewer watching 20 seconds at 2x consumes about 40 seconds of content,
 * but only earns 20 seconds of active watch-time. This keeps XP, challenges,
 * leaderboards and other time-based rewards neutral to playback speed.
 */
export function acceptedRealWatchMs(
  wallDeltaMs: number,
  maxAcceptedMs = MAX_ACCEPTED_REAL_WATCH_MS,
) {
  const wallDelta = finiteNonNegative(wallDeltaMs);
  const cap = finiteNonNegative(maxAcceptedMs);

  return Math.max(0, Math.round(Math.min(wallDelta, cap)));
}

export const EPISODE_COMPLETION_COVERAGE_RATIO = 0.9;
export const MIN_COMPLETION_ACTIVE_MS = 45_000;
export const MIN_FULL_DURATION_ACTIVE_RATIO = 0.35;

export function trustedEpisodeLimit(input: {
  catalogEpisodes?: number | null;
  verifiedMaxEpisode?: number | null;
}) {
  const values = [input.catalogEpisodes, input.verifiedMaxEpisode]
    .map((value) => Number(value))
    .filter(
      (value) =>
        Number.isSafeInteger(value) &&
        value > 0 &&
        value <= 100_000,
    );

  return values.length ? Math.max(...values) : null;
}

export type EpisodeCompletionIntegrity = {
  completed: boolean;
  coverageMet: boolean;
  activeTimeMet: boolean;
  targetCoverageMs: number;
  requiredActiveMs: number;
};

export function episodeCompletionIntegrity(input: {
  coverageMs: number;
  activeMs: number;
  eligibleDurationMs: number | null;
  durationMs: number | null;
}): EpisodeCompletionIntegrity {
  const coverage = finiteNonNegative(input.coverageMs);
  const active = finiteNonNegative(input.activeMs);
  const eligible =
    input.eligibleDurationMs == null
      ? 0
      : finiteNonNegative(input.eligibleDurationMs);
  const duration =
    input.durationMs == null ? 0 : finiteNonNegative(input.durationMs);

  if (eligible <= 0) {
    return {
      completed: false,
      coverageMet: false,
      activeTimeMet: false,
      targetCoverageMs: 0,
      requiredActiveMs: MIN_COMPLETION_ACTIVE_MS,
    };
  }

  const targetCoverageMs = Math.max(
    1,
    Math.floor(eligible * EPISODE_COMPLETION_COVERAGE_RATIO),
  );

  // A legitimate 2x viewer may cover media twice as fast as wall-clock time,
  // but completion must still carry the corresponding amount of real active
  // time. The full-duration floor also prevents oversized OP/ED exclusions
  // from shrinking the anti-cheat requirement too far.
  const requiredActiveMs = Math.max(
    MIN_COMPLETION_ACTIVE_MS,
    Math.ceil(targetCoverageMs / MAX_SUPPORTED_PLAYBACK_RATE),
    Math.ceil(duration * MIN_FULL_DURATION_ACTIVE_RATIO),
  );

  const coverageMet = coverage >= targetCoverageMs;
  const activeTimeMet = active >= requiredActiveMs;

  return {
    completed: coverageMet && activeTimeMet,
    coverageMet,
    activeTimeMet,
    targetCoverageMs,
    requiredActiveMs,
  };
}
