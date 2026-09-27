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
