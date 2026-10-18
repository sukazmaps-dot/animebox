/**
 * Shared, deterministic client-only heartbeat retry policy.
 * Presence is optional telemetry; never turn server-side 429/503 into success.
 * Backoff prevents transient Supabase outages from producing recurring request bursts.
 */
const BASE_MS = 60_000;
const CAP_MS = 5 * 60_000;

export function presenceRetryDelayMs(
  failureCount: number,
  retryAfterHeader: string | null,
): number {
  const count = Number.isFinite(failureCount)
    ? Math.min(4, Math.max(1, Math.trunc(failureCount))) : 1;
  const backoff = Math.min(CAP_MS, BASE_MS * 2 ** (count - 1));
  const retryAfterSeconds = retryAfterHeader == null ? NaN : Number(retryAfterHeader);
  const retryAfterMs = Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
    ? Math.min(CAP_MS, Math.ceil(retryAfterSeconds * 1000))
    : 0;
  return Math.max(backoff, retryAfterMs);
}
