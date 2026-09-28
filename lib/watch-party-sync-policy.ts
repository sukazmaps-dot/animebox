export const WATCH_PARTY_DRIFT_SEEK_SECONDS = 1.75;
export const WATCH_PARTY_DRIFT_CRITICAL_SECONDS = 6;
export const WATCH_PARTY_DRIFT_SEEK_COOLDOWN_MS = 6_000;

export type WatchPartySyncDecision =
  | { kind: 'none'; driftSeconds: number }
  | { kind: 'state'; driftSeconds: number }
  | { kind: 'seek'; driftSeconds: number };

export function decideWatchPartySync(input: {
  localPositionSeconds: number;
  remotePositionSeconds: number;
  localPlaying: boolean;
  remotePlaying: boolean;
  lastCorrectionAt: number;
  nowMs?: number;
}): WatchPartySyncDecision {
  const local = Number.isFinite(input.localPositionSeconds)
    ? Math.max(0, input.localPositionSeconds)
    : 0;
  const remote = Number.isFinite(input.remotePositionSeconds)
    ? Math.max(0, input.remotePositionSeconds)
    : 0;
  const driftSeconds = Math.abs(local - remote);

  if (input.localPlaying !== input.remotePlaying) {
    return { kind: 'state', driftSeconds };
  }

  if (driftSeconds < WATCH_PARTY_DRIFT_SEEK_SECONDS) {
    return { kind: 'none', driftSeconds };
  }

  const nowMs = input.nowMs ?? Date.now();
  const withinCooldown =
    nowMs - Math.max(0, input.lastCorrectionAt) <
    WATCH_PARTY_DRIFT_SEEK_COOLDOWN_MS;

  if (
    withinCooldown &&
    driftSeconds < WATCH_PARTY_DRIFT_CRITICAL_SECONDS
  ) {
    return { kind: 'none', driftSeconds };
  }

  return { kind: 'seek', driftSeconds };
}
