export type PlaybackEngineKind = 'native' | 'hls' | 'kodik' | 'iframe';

export type PlaybackPhase =
  | 'idle'
  | 'loading'
  | 'ready'
  | 'playing'
  | 'paused'
  | 'buffering'
  | 'recovering'
  | 'ended'
  | 'error';

export type PlaybackEngineState = {
  engine: PlaybackEngineKind;
  phase: PlaybackPhase;
  positionSeconds: number;
  durationSeconds: number | null;
  playing: boolean;
  buffering: boolean;
  recoveryAttempt: number;
  error: string | null;
  updatedAt: number;
};

export type PlaybackEngineEvent =
  | { type: 'load' }
  | { type: 'ready'; durationSeconds?: number | null }
  | { type: 'play' }
  | { type: 'pause' }
  | { type: 'buffering' }
  | { type: 'time'; positionSeconds: number; durationSeconds?: number | null }
  | { type: 'recover'; attempt: number }
  | { type: 'ended' }
  | { type: 'error'; message: string };

export const HLS_NETWORK_RECOVERY_LIMIT = 3;
export const HLS_MEDIA_RECOVERY_LIMIT = 2;
export const PLAYBACK_RECOVERY_WINDOW_MS = 20_000;

export function createPlaybackEngineState(
  engine: PlaybackEngineKind,
): PlaybackEngineState {
  return {
    engine,
    phase: 'idle',
    positionSeconds: 0,
    durationSeconds: null,
    playing: false,
    buffering: false,
    recoveryAttempt: 0,
    error: null,
    updatedAt: Date.now(),
  };
}

export function reducePlaybackEngineState(
  state: PlaybackEngineState,
  event: PlaybackEngineEvent,
): PlaybackEngineState {
  const now = Date.now();

  switch (event.type) {
    case 'load':
      return {
        ...state,
        phase: 'loading',
        playing: false,
        buffering: true,
        recoveryAttempt: 0,
        error: null,
        updatedAt: now,
      };

    case 'ready':
      return {
        ...state,
        phase: 'ready',
        buffering: false,
        durationSeconds:
          event.durationSeconds ?? state.durationSeconds,
        error: null,
        updatedAt: now,
      };

    case 'play':
      return {
        ...state,
        phase: 'playing',
        playing: true,
        buffering: false,
        error: null,
        updatedAt: now,
      };

    case 'pause':
      return {
        ...state,
        phase: 'paused',
        playing: false,
        buffering: false,
        updatedAt: now,
      };

    case 'buffering':
      return {
        ...state,
        phase: 'buffering',
        buffering: true,
        updatedAt: now,
      };

    case 'time':
      return {
        ...state,
        positionSeconds: Math.max(0, event.positionSeconds),
        durationSeconds:
          event.durationSeconds ?? state.durationSeconds,
        updatedAt: now,
      };

    case 'recover':
      return {
        ...state,
        phase: 'recovering',
        buffering: true,
        recoveryAttempt: Math.max(1, event.attempt),
        error: null,
        updatedAt: now,
      };

    case 'ended':
      return {
        ...state,
        phase: 'ended',
        playing: false,
        buffering: false,
        updatedAt: now,
      };

    case 'error':
      return {
        ...state,
        phase: 'error',
        playing: false,
        buffering: false,
        error: event.message,
        updatedAt: now,
      };
  }
}

export function clampPlaybackVolume(value: number) {
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 1));
}

export function clampPlaybackRate(value: number) {
  return Math.min(2, Math.max(0.25, Number.isFinite(value) ? value : 1));
}

export function clampPlaybackPosition(
  value: number,
  durationSeconds?: number | null,
) {
  const normalized = Math.max(0, Number.isFinite(value) ? value : 0);
  if (
    durationSeconds == null ||
    !Number.isFinite(durationSeconds) ||
    durationSeconds <= 0
  ) {
    return normalized;
  }

  return Math.min(normalized, Math.max(0, durationSeconds - 0.05));
}

export function canAttemptRecovery(input: {
  attempts: number;
  limit: number;
  firstAttemptAt: number | null;
  now?: number;
}) {
  if (input.attempts >= input.limit) return false;
  if (input.firstAttemptAt == null) return true;

  return (
    (input.now ?? Date.now()) - input.firstAttemptAt <=
    PLAYBACK_RECOVERY_WINDOW_MS
  );
}
