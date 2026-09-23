import 'server-only';

import { createHmac } from 'node:crypto';
import { isIP } from 'node:net';

import { adminClient } from '@/lib/community-server';
import { optionalServerSecret } from '@/lib/env/server';

export type RateLimitPolicy = {
  scope: string;
  limit: number;
  windowSeconds: number;
};

type DualRateLimitPolicy = {
  ip: RateLimitPolicy;
  user: RateLimitPolicy;
};

function clientAddress(request: Request) {
  /*
   * Once Cloudflare origin authentication is enabled, CF-Connecting-IP is
   * trusted only when the request also carries our private edge secret.
   * Before that, keep using Vercel's canonical forwarding header so a client
   * cannot spoof its rate-limit identity through the direct deployment URL.
   */
  const edgeSecret = process.env.ANIMEBOX_EDGE_ORIGIN_SECRET?.trim();
  const edgeVerified =
    Boolean(edgeSecret) &&
    request.headers.get('x-animebox-edge-verify') === edgeSecret;

  if (edgeVerified) {
    const cloudflare = request.headers.get('cf-connecting-ip')?.trim();
    if (cloudflare && isIP(cloudflare)) return cloudflare;
  }

  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return forwarded && isIP(forwarded) ? forwarded : 'unknown';
}

function digestKey(key: string) {
  const secret = optionalServerSecret('SUPABASE_SERVICE_ROLE_KEY');
  if (!secret) throw new Error('Rate limiting is not configured');
  return createHmac('sha256', secret).update(key).digest('hex');
}

export async function consumeRateLimit(key: string, policy: RateLimitPolicy) {
  const { data, error } = await adminClient().rpc('consume_api_rate_bucket', {
    p_scope: policy.scope,
    p_key_hash: digestKey(key),
    p_window_seconds: policy.windowSeconds,
    p_max_requests: policy.limit,
  });

  if (error || typeof data !== 'boolean') {
    console.error('[API rate limit] unavailable', policy.scope, error);
    throw new Error('Rate limiting is unavailable');
  }
  return data;
}

export async function consumeIpRateLimit(request: Request, policy: RateLimitPolicy) {
  return consumeRateLimit(`ip:${clientAddress(request)}`, policy);
}

export async function consumeUserRateLimit(userId: string, policy: RateLimitPolicy) {
  return consumeRateLimit(`user:${userId}`, policy);
}

export async function consumeIpAndUserRateLimit(
  request: Request,
  userId: string,
  policy: DualRateLimitPolicy,
) {
  const [ipAllowed, userAllowed] = await Promise.all([
    consumeIpRateLimit(request, policy.ip),
    consumeUserRateLimit(userId, policy.user),
  ]);
  return ipAllowed && userAllowed;
}

export function rateLimitResponse(
  retryAfterSeconds = 60,
  message = 'Слишком много запросов. Попробуй чуть позже.',
) {
  return Response.json(
    { error: message },
    {
      status: 429,
      headers: {
        'Cache-Control': 'private, no-store',
        'Retry-After': String(Math.max(1, Math.ceil(retryAfterSeconds))),
      },
    },
  );
}

export function rateLimitUnavailableResponse() {
  return Response.json(
    { error: 'Защита API временно недоступна. Попробуй ещё раз через минуту.' },
    {
      status: 503,
      headers: {
        'Cache-Control': 'private, no-store',
        'Retry-After': '60',
      },
    },
  );
}

export async function enforceIpRateLimit(
  request: Request,
  policy: RateLimitPolicy,
): Promise<Response | null> {
  try {
    return (await consumeIpRateLimit(request, policy))
      ? null
      : rateLimitResponse(policy.windowSeconds);
  } catch (error) {
    console.error('[API rate limit] IP guard failed', policy.scope, error);
    return rateLimitUnavailableResponse();
  }
}

export async function enforceUserRateLimit(
  userId: string,
  policy: RateLimitPolicy,
): Promise<Response | null> {
  try {
    return (await consumeUserRateLimit(userId, policy))
      ? null
      : rateLimitResponse(policy.windowSeconds);
  } catch (error) {
    console.error('[API rate limit] user guard failed', policy.scope, error);
    return rateLimitUnavailableResponse();
  }
}

export async function enforceIpAndUserRateLimit(
  request: Request,
  userId: string,
  policy: DualRateLimitPolicy,
): Promise<Response | null> {
  try {
    return (await consumeIpAndUserRateLimit(request, userId, policy))
      ? null
      : rateLimitResponse(Math.max(policy.ip.windowSeconds, policy.user.windowSeconds));
  } catch (error) {
    console.error('[API rate limit] dual guard failed', policy.ip.scope, policy.user.scope, error);
    return rateLimitUnavailableResponse();
  }
}

export async function cleanupApiRateBuckets(retentionSeconds = 2 * 60 * 60) {
  const cutoff = new Date(Date.now() - retentionSeconds * 1000).toISOString();
  const { error } = await adminClient()
    .from('api_rate_buckets')
    .delete()
    .lt('window_start', cutoff);

  if (error) {
    console.error('[API rate limit] cleanup failed', error);
    throw error;
  }
}
