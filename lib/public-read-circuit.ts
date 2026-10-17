/** * Per-process outage backoff for OPTIONAL PUBLIC Supabase reads only.
 * Never reuse this on authentication, payments, writes, RLS or sessions.
 * This stores no IPs, credentials or user data. A successful probe resets
 * the cooldown; an open gate naturally permits a new probe after expiry.
 */
export function createPublicReadCircuit(
  cooldownMs: number,
  clock: () => number = Date.now,
) {
  let retryAt = 0;
  const duration = Math.max(1_000, Math.floor(cooldownMs));

  return {
    isOpen(): boolean {
      return clock() < retryAt;
    },
    recordSuccess(): void {
      retryAt = 0;
    },
    recordFailure(): void {
      retryAt = Math.max(retryAt, clock() + duration);
    },
    retryAfterSeconds(): number {
      return Math.max(0, Math.ceil((retryAt - clock()) / 1000));
    },
  };
}
