import type {
  EpisodeTimelineMeta,
  EpisodeTimelineSegment,
} from '@/types/episode-timeline';

export const MAX_AUTO_OPENING_SEGMENT_SECONDS = 4 * 60;
export const MIN_AUTO_OPENING_SEGMENT_SECONDS = 8;
export const MAX_AUTO_OPENING_START_SECONDS = 15 * 60;
export const MAX_AUTO_OPENING_START_RATIO = 0.35;
export const MAX_AUTO_OPENING_END_RATIO = 0.45;

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
