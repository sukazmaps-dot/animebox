export const ASYNC_RESUME_PLAYBACK_GUARD_SECONDS = 5;

export type ActiveResumeOrigin =
  | 'none'
  | 'local'
  | 'local_newer'
  | 'server'
  | 'source_switch';

/**
 * Async local/server resume reconciliation is allowed to change the target
 * only before meaningful playback has begun. Once the viewer is already
 * watching, or a source-switch continuity target is armed, a late API response
 * must never pull the active player backwards.
 */
export function shouldAcceptAsyncResumeDecision(input: {
  observedPositionSeconds: number;
  activeOrigin: ActiveResumeOrigin;
}) {
  if (input.activeOrigin === 'source_switch') return false;

  const observed = Number.isFinite(input.observedPositionSeconds)
    ? Math.max(0, input.observedPositionSeconds)
    : 0;

  return observed <= ASYNC_RESUME_PLAYBACK_GUARD_SECONDS;
}
