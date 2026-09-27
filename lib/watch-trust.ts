export type WatchTrustState = 'normal' | 'suspicious' | 'high_risk';

export const WATCH_TRUST_VERSION = 'watch-trust-v1';
export const WATCH_TRUST_SUSPICIOUS_SCORE = 30;
export const WATCH_TRUST_HIGH_RISK_SCORE = 70;

export type WatchTrustSignalCode =
  | 'repeated_seek_forward'
  | 'rapid_heartbeat_abuse'
  | 'sequence_instability'
  | 'stale_heartbeat_pattern'
  | 'high_rejection_ratio'
  | 'extreme_rejection_ratio'
  | 'accelerated_with_rejections'
  | 'session_churn'
  | 'extreme_session_churn'
  | 'completion_pressure'
  | 'impossible_completion_pressure'
  | 'accepted_time_over_wall_clock';

export type WatchTrustSignal = {
  code: WatchTrustSignalCode;
  points: number;
};

export type WatchTrustMetrics = {
  heartbeatCount: number;
  acceptedHeartbeatCount: number;
  acceleratedHeartbeatCount: number;
  seekForwardCount: number;
  tooSoonCount: number;
  sequenceGapCount: number;
  staleGapCount: number;
  duplicateCount: number;
  idleCount: number;
  acceptedMs: number;
  sessionWallMs: number;
  recentSessions60m: number;
  recentCompletions60m: number;
  completionDemandMs60m: number;
};

export type WatchTrustAssessment = {
  version: typeof WATCH_TRUST_VERSION;
  state: WatchTrustState;
  score: number;
  rewardEligible: boolean;
  signals: WatchTrustSignal[];
  metrics: WatchTrustMetrics;
};

function nonNegative(value: number) {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function ratio(part: number, total: number) {
  if (total <= 0) return 0;
  return Math.max(0, Math.min(1, part / total));
}

export function emptyWatchTrustMetrics(): WatchTrustMetrics {
  return {
    heartbeatCount: 0,
    acceptedHeartbeatCount: 0,
    acceleratedHeartbeatCount: 0,
    seekForwardCount: 0,
    tooSoonCount: 0,
    sequenceGapCount: 0,
    staleGapCount: 0,
    duplicateCount: 0,
    idleCount: 0,
    acceptedMs: 0,
    sessionWallMs: 0,
    recentSessions60m: 0,
    recentCompletions60m: 0,
    completionDemandMs60m: 0,
  };
}

export function assessWatchTrust(raw: WatchTrustMetrics): WatchTrustAssessment {
  const metrics: WatchTrustMetrics = {
    heartbeatCount: Math.floor(nonNegative(raw.heartbeatCount)),
    acceptedHeartbeatCount: Math.floor(nonNegative(raw.acceptedHeartbeatCount)),
    acceleratedHeartbeatCount: Math.floor(nonNegative(raw.acceleratedHeartbeatCount)),
    seekForwardCount: Math.floor(nonNegative(raw.seekForwardCount)),
    tooSoonCount: Math.floor(nonNegative(raw.tooSoonCount)),
    sequenceGapCount: Math.floor(nonNegative(raw.sequenceGapCount)),
    staleGapCount: Math.floor(nonNegative(raw.staleGapCount)),
    duplicateCount: Math.floor(nonNegative(raw.duplicateCount)),
    idleCount: Math.floor(nonNegative(raw.idleCount)),
    acceptedMs: Math.floor(nonNegative(raw.acceptedMs)),
    sessionWallMs: Math.floor(nonNegative(raw.sessionWallMs)),
    recentSessions60m: Math.floor(nonNegative(raw.recentSessions60m)),
    recentCompletions60m: Math.floor(nonNegative(raw.recentCompletions60m)),
    completionDemandMs60m: Math.floor(nonNegative(raw.completionDemandMs60m)),
  };

  const signals: WatchTrustSignal[] = [];
  const add = (code: WatchTrustSignalCode, points: number) => {
    signals.push({ code, points });
  };

  if (metrics.seekForwardCount >= 8) add('repeated_seek_forward', 50);
  else if (metrics.seekForwardCount >= 3) add('repeated_seek_forward', 25);

  if (metrics.tooSoonCount >= 6) add('rapid_heartbeat_abuse', 35);
  else if (metrics.tooSoonCount >= 3) add('rapid_heartbeat_abuse', 18);

  if (metrics.sequenceGapCount >= 6) add('sequence_instability', 18);
  else if (metrics.sequenceGapCount >= 3) add('sequence_instability', 9);

  if (metrics.staleGapCount >= 6) add('stale_heartbeat_pattern', 12);
  else if (metrics.staleGapCount >= 3) add('stale_heartbeat_pattern', 6);

  const rejected =
    metrics.seekForwardCount +
    metrics.tooSoonCount +
    metrics.sequenceGapCount +
    metrics.staleGapCount;
  const rejectedRatio = ratio(rejected, metrics.heartbeatCount);

  if (metrics.heartbeatCount >= 8 && rejectedRatio >= 0.55) {
    add('extreme_rejection_ratio', 38);
  } else if (metrics.heartbeatCount >= 8 && rejectedRatio >= 0.3) {
    add('high_rejection_ratio', 18);
  }

  const acceleratedRatio = ratio(
    metrics.acceleratedHeartbeatCount,
    metrics.acceptedHeartbeatCount,
  );
  if (
    metrics.acceptedHeartbeatCount >= 10 &&
    acceleratedRatio >= 0.8 &&
    rejected >= 3
  ) {
    // 2x itself is legitimate. It only becomes a weak signal when paired with
    // repeated server-side rejects in the same session.
    add('accelerated_with_rejections', 10);
  }

  if (metrics.recentSessions60m >= 24) add('extreme_session_churn', 28);
  else if (metrics.recentSessions60m >= 12) add('session_churn', 12);

  if (metrics.completionDemandMs60m >= 90 * 60_000) {
    add('impossible_completion_pressure', 55);
  } else if (metrics.completionDemandMs60m >= 70 * 60_000) {
    add('completion_pressure', 24);
  }

  if (
    metrics.sessionWallMs > 0 &&
    metrics.acceptedMs > metrics.sessionWallMs + 25_000
  ) {
    add('accepted_time_over_wall_clock', 70);
  }

  const score = Math.min(
    100,
    signals.reduce((total, signal) => total + signal.points, 0),
  );

  const state: WatchTrustState =
    score >= WATCH_TRUST_HIGH_RISK_SCORE
      ? 'high_risk'
      : score >= WATCH_TRUST_SUSPICIOUS_SCORE
        ? 'suspicious'
        : 'normal';

  return {
    version: WATCH_TRUST_VERSION,
    state,
    score,
    // Heuristics must never delete user progress. They only gate competitive
    // rewards when several independent signals reach a high-confidence score.
    rewardEligible: state !== 'high_risk',
    signals,
    metrics,
  };
}

export function minimumCompletionDemandMs(durationMs: number | null | undefined) {
  const duration = Number(durationMs ?? 0);
  if (!Number.isFinite(duration) || duration <= 0) return 0;

  // Mirrors the hard full-duration floor from episodeCompletionIntegrity().
  // This deliberately underestimates required real time to avoid false flags.
  return Math.max(45_000, Math.ceil(duration * 0.35));
}
