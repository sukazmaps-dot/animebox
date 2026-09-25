import type {
  EpisodeTimelineMeta,
  EpisodeTimelineSegment,
} from '@/types/episode-timeline';

export const MAX_AUTO_OPENING_SEGMENT_SECONDS = 4 * 60;
export const MIN_AUTO_OPENING_SEGMENT_SECONDS = 8;
export const MAX_AUTO_OPENING_START_SECONDS = 15 * 60;
export const MAX_AUTO_OPENING_START_RATIO = 0.35;
export const MAX_AUTO_OPENING_END_RATIO = 0.45;

// Automatic seeking is intentionally stricter than the manual "skip opening"
// action. Long-form/special episodes and unusually large jumps fall back to a
// user-controlled button instead of trusting metadata blindly.
export const MAX_AUTOMATIC_OPENING_JUMP_SECONDS = 150;
export const MIN_AUTOMATIC_OPENING_JUMP_SECONDS = 5;
export const MAX_AUTOMATIC_OPENING_SEGMENT_RATIO = 0.18;
export const MAX_AUTOMATIC_EPISODE_DURATION_SECONDS = 45 * 60;
export const AUTO_OPENING_ENTRY_WINDOW_SECONDS = 30;
export const MIN_AUTOMATIC_SKIP_CONFIDENCE = 0.65;

export type OpeningSkipSafetyReason =
  | 'ok'
  | 'missing_timeline'
  | 'timeline_not_found'
  | 'missing_opening'
  | 'invalid_opening'
  | 'opening_too_short'
  | 'opening_too_long'
  | 'duration_unknown'
  | 'duration_mismatch'
  | 'opening_starts_too_late'
  | 'opening_ends_too_late'
  | 'opening_too_close_to_end';

export type OpeningSkipSafetyDecision = {
  safe: boolean;
  reason: OpeningSkipSafetyReason;
  startSeconds: number | null;
  targetSeconds: number | null;
  segmentSeconds: number | null;
  durationSeconds: number | null;
};

export type OpeningAutoSkipSafetyReason =
  | OpeningSkipSafetyReason
  | 'long_form_requires_manual_skip'
  | 'low_confidence'
  | 'position_unknown'
  | 'outside_opening'
  | 'recent_explicit_seek'
  | 'entered_opening_too_late'
  | 'opening_too_large_for_episode'
  | 'automatic_jump_too_small'
  | 'automatic_jump_too_large';

export type OpeningAutoSkipSafetyDecision = Omit<
  OpeningSkipSafetyDecision,
  'reason'
> & {
  reason: OpeningAutoSkipSafetyReason;
  jumpSeconds: number | null;
};

function finitePositiveSeconds(value: number | null | undefined) {
  return value != null && Number.isFinite(value) && value > 0
    ? value
    : null;
}

export function timelineDurationSeconds(
  timeline: Pick<EpisodeTimelineMeta, 'durationMs'> | null | undefined,
) {
  if (!timeline?.durationMs || !Number.isFinite(timeline.durationMs)) {
    return null;
  }

  return timeline.durationMs > 0
    ? timeline.durationMs / 1000
    : null;
}

export function durationMismatchToleranceSeconds(
  observedDurationSeconds: number,
) {
  return Math.max(90, observedDurationSeconds * 0.08);
}

export function timelineDurationMatchesObserved(
  timelineDurationMs: number | null | undefined,
  observedDurationSeconds: number | null | undefined,
) {
  const observed = finitePositiveSeconds(observedDurationSeconds);
  if (observed == null) return true;

  const timelineSeconds =
    timelineDurationMs != null &&
    Number.isFinite(timelineDurationMs) &&
    timelineDurationMs > 0
      ? timelineDurationMs / 1000
      : null;

  if (timelineSeconds == null) return false;

  return (
    Math.abs(timelineSeconds - observed) <=
    durationMismatchToleranceSeconds(observed)
  );
}

function openingSegmentSeconds(
  opening: EpisodeTimelineSegment | null | undefined,
) {
  if (
    !opening ||
    !Number.isFinite(opening.startMs) ||
    !Number.isFinite(opening.endMs) ||
    opening.startMs < 0 ||
    opening.endMs <= opening.startMs
  ) {
    return null;
  }

  return {
    startSeconds: opening.startMs / 1000,
    targetSeconds: opening.endMs / 1000,
    segmentSeconds: (opening.endMs - opening.startMs) / 1000,
  };
}

function unsafe(
  reason: OpeningSkipSafetyReason,
  values?: Partial<OpeningSkipSafetyDecision>,
): OpeningSkipSafetyDecision {
  return {
    safe: false,
    reason,
    startSeconds: values?.startSeconds ?? null,
    targetSeconds: values?.targetSeconds ?? null,
    segmentSeconds: values?.segmentSeconds ?? null,
    durationSeconds: values?.durationSeconds ?? null,
  };
}

export function openingSkipSafetyDecision(input: {
  timeline: EpisodeTimelineMeta | null | undefined;
  observedDurationSeconds?: number | null;
  requireObservedDuration?: boolean;
}): OpeningSkipSafetyDecision {
  const { timeline } = input;

  if (!timeline) return unsafe('missing_timeline');
  if (timeline.lookupStatus !== 'found') {
    return unsafe('timeline_not_found');
  }
  if (!timeline.opening) return unsafe('missing_opening');

  const opening = openingSegmentSeconds(timeline.opening);
  if (!opening) return unsafe('invalid_opening');

  if (opening.segmentSeconds < MIN_AUTO_OPENING_SEGMENT_SECONDS) {
    return unsafe('opening_too_short', opening);
  }

  if (opening.segmentSeconds > MAX_AUTO_OPENING_SEGMENT_SECONDS) {
    return unsafe('opening_too_long', opening);
  }

  const observedDurationSeconds = finitePositiveSeconds(
    input.observedDurationSeconds,
  );
  const storedDurationSeconds = timelineDurationSeconds(timeline);

  if (input.requireObservedDuration && observedDurationSeconds == null) {
    return unsafe('duration_unknown', opening);
  }

  if (
    observedDurationSeconds != null &&
    storedDurationSeconds != null &&
    !timelineDurationMatchesObserved(
      timeline.durationMs,
      observedDurationSeconds,
    )
  ) {
    return unsafe('duration_mismatch', {
      ...opening,
      durationSeconds: observedDurationSeconds,
    });
  }

  const durationSeconds =
    observedDurationSeconds ?? storedDurationSeconds;

  if (durationSeconds == null) {
    return unsafe('duration_unknown', opening);
  }

  const maxOpeningStartSeconds = Math.min(
    MAX_AUTO_OPENING_START_SECONDS,
    durationSeconds * MAX_AUTO_OPENING_START_RATIO,
  );

  if (opening.startSeconds > maxOpeningStartSeconds) {
    return unsafe('opening_starts_too_late', {
      ...opening,
      durationSeconds,
    });
  }

  if (
    opening.targetSeconds >
    durationSeconds * MAX_AUTO_OPENING_END_RATIO
  ) {
    return unsafe('opening_ends_too_late', {
      ...opening,
      durationSeconds,
    });
  }

  const minimumTailSeconds = Math.max(
    30,
    Math.min(90, durationSeconds * 0.04),
  );

  if (
    opening.targetSeconds >
    durationSeconds - minimumTailSeconds
  ) {
    return unsafe('opening_too_close_to_end', {
      ...opening,
      durationSeconds,
    });
  }

  return {
    safe: true,
    reason: 'ok',
    ...opening,
    durationSeconds,
  };
}


function autoUnsafe(
  base: OpeningSkipSafetyDecision,
  reason: OpeningAutoSkipSafetyReason,
  jumpSeconds: number | null = null,
): OpeningAutoSkipSafetyDecision {
  return {
    ...base,
    safe: false,
    reason,
    jumpSeconds,
  };
}

/**
 * Defense-in-depth policy for automatic opening seeks.
 *
 * openingSkipSafetyDecision() answers whether metadata describes a plausible
 * opening. This function answers the stricter question: is it safe to force a
 * seek at this exact playback position?
 *
 * Manual skip remains available when automatic seeking is rejected for a
 * long-form episode, late entry, explicit user seek or jump-budget reason.
 */
export function openingAutoSkipSafetyDecision(input: {
  timeline: EpisodeTimelineMeta | null | undefined;
  observedDurationSeconds?: number | null;
  positionSeconds?: number | null;
  recentExplicitSeek?: boolean;
}): OpeningAutoSkipSafetyDecision {
  const base = openingSkipSafetyDecision({
    timeline: input.timeline,
    observedDurationSeconds: input.observedDurationSeconds,
    requireObservedDuration: true,
  });

  if (!base.safe) {
    return {
      ...base,
      reason: base.reason,
      jumpSeconds: null,
    };
  }

  const durationSeconds = base.durationSeconds;
  const startSeconds = base.startSeconds;
  const targetSeconds = base.targetSeconds;
  const segmentSeconds = base.segmentSeconds;

  if (
    durationSeconds == null ||
    startSeconds == null ||
    targetSeconds == null ||
    segmentSeconds == null
  ) {
    return autoUnsafe(base, 'duration_unknown');
  }

  if (durationSeconds > MAX_AUTOMATIC_EPISODE_DURATION_SECONDS) {
    return autoUnsafe(base, 'long_form_requires_manual_skip');
  }

  const confidence = input.timeline?.skipConfidence;
  if (
    confidence != null &&
    Number.isFinite(confidence) &&
    confidence < MIN_AUTOMATIC_SKIP_CONFIDENCE
  ) {
    return autoUnsafe(base, 'low_confidence');
  }

  const positionSeconds =
    input.positionSeconds != null &&
    Number.isFinite(input.positionSeconds) &&
    input.positionSeconds >= 0
      ? input.positionSeconds
      : null;

  if (positionSeconds == null) {
    return autoUnsafe(base, 'position_unknown');
  }

  if (
    positionSeconds < startSeconds ||
    positionSeconds >= targetSeconds
  ) {
    return autoUnsafe(base, 'outside_opening');
  }

  if (input.recentExplicitSeek) {
    return autoUnsafe(base, 'recent_explicit_seek');
  }

  if (
    positionSeconds >
    startSeconds + AUTO_OPENING_ENTRY_WINDOW_SECONDS
  ) {
    return autoUnsafe(base, 'entered_opening_too_late');
  }

  if (
    segmentSeconds / durationSeconds >
    MAX_AUTOMATIC_OPENING_SEGMENT_RATIO
  ) {
    return autoUnsafe(base, 'opening_too_large_for_episode');
  }

  const jumpSeconds = targetSeconds - positionSeconds;

  if (jumpSeconds < MIN_AUTOMATIC_OPENING_JUMP_SECONDS) {
    return autoUnsafe(base, 'automatic_jump_too_small', jumpSeconds);
  }

  if (jumpSeconds > MAX_AUTOMATIC_OPENING_JUMP_SECONDS) {
    return autoUnsafe(base, 'automatic_jump_too_large', jumpSeconds);
  }

  return {
    ...base,
    reason: 'ok',
    jumpSeconds,
  };
}
