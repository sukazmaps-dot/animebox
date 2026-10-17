import 'server-only';

import { createHmac, randomBytes } from 'node:crypto';
import { isIP } from 'node:net';

/**
 * Per-instance fail-operational guard for *read-only/public* endpoints, the
 * Telegram membership check and best-effort telemetry. Never use for login,
 * payments, uploads or authenticated mutations: those keep the shared
 * fail-closed database buckets from lib/api-rate-limit.ts.
 *
 * Cloudflare is responsible for a global per-IP edge budget. A process-local
 * limiter cannot enforce one budget across replicas, so keep this deliberately
 * small and bounded even when the shared database is unreachable.
 */
export type PublicRateLimitPolicy = {
  scope: string;
  limit: number;
  windowSeconds: number;
};

type Bucket = { count: number; resetAt: number };
const MAX_BUCKETS = 4096;
const buckets = new Map<string, Bucket>();
// On a unique-IP flood, do not scan the full 4096-entry map per request.
let nextExpirySweepAt = 0;
// This secret never leaves the process; raw IPs are not stored or logged.
const processSalt = randomBytes(32);

function clientAddress(request: Request): string {
  const edgeSecret = process.env.ANIMEBOX_EDGE_ORIGIN_SECRET?.trim();
  if (edgeSecret && request.headers?.get('x-animebox-edge-verify') === edgeSecret) {
    const cf = request.headers.get('cf-connecting-ip')?.trim();
    if (cf && isIP(cf)) return cf;
  }
  const forwarded = request.headers?.get('x-forwarded-for')?.split(',')[0]?.trim();
  return forwarded && isIP(forwarded) ? forwarded : 'unknown';
}

function pruneExpired(now: number) {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

function hashedBucketKey(request: Request, scope: string): string {
  return scope + ':' + createHmac('sha256', processSalt)
    .update(clientAddress(request)).digest('hex');
}

function limitedResponse(retryAfterSeconds: number) {
  return Response.json(
    { error: 'Слишком много запросов. Попробуй чуть позже.' },
    {
      status: 429,
      headers: {
        'Cache-Control': 'private, no-store',
        'Retry-After': String(Math.max(1, Math.ceil(retryAfterSeconds))),
      },
    },
  );
}

export function enforcePublicIpRateLimit(
  request: Request,
  policy: PublicRateLimitPolicy,
): Response | null {
  const now = Date.now();
  // All policies originate in code, not client input.
  const duration = Math.max(1, Math.floor(policy.windowSeconds)) * 1000;
  const max = Math.max(1, Math.floor(policy.limit));
  const key = hashedBucketKey(request, policy.scope);
  const bucket = buckets.get(key);

  if (bucket && bucket.resetAt > now) {
    // Each request is counted, including requests served by an in-memory cache.
    if (bucket.count >= max) {
      return limitedResponse((bucket.resetAt - now) / 1000);
    }
    bucket.count++;
    return null;
  }

  if (bucket) buckets.delete(key);
  if (buckets.size >= MAX_BUCKETS) {
    // Under saturation, cost is O(1) per rejected request. Expired buckets
    // are swept at most once each second, never on every attacker identity.
    if (now >= nextExpirySweepAt) {
      nextExpirySweepAt = now + 1_000;
      pruneExpired(now);
    }
    // Never evict an active bucket just to admit arbitrary new identities.
    if (buckets.size >= MAX_BUCKETS) return limitedResponse(policy.windowSeconds);
  }

  buckets.set(key, { count: 1, resetAt: now + duration });
  return null;
}
