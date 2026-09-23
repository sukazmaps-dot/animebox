import 'server-only';

import { createHmac } from 'node:crypto';
import { isIP } from 'node:net';

import { adminClient } from '@/lib/community-server';
import { optionalServerSecret } from '@/lib/env/server';

type RateLimit = { scope: string; limit: number; windowSeconds: number };

function clientAddress(request: Request) {
  // Vercel replaces X-Forwarded-For at its edge. Never trust arbitrary
  // CF-Connecting-IP headers, which can be forged via the direct Vercel URL.
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return forwarded && isIP(forwarded) ? forwarded : 'unknown';
}

export async function consumeRateLimit(key: string, policy: RateLimit) {
  const secret = optionalServerSecret('SUPABASE_SERVICE_ROLE_KEY');
  if (!secret) throw new Error('Rate limiting is not configured');

  const digest = createHmac('sha256', secret).update(key).digest('hex');
  const { data, error } = await adminClient().rpc('consume_api_rate_bucket', {
    p_scope: policy.scope,
    p_key_hash: digest,
    p_window_seconds: policy.windowSeconds,
    p_max_requests: policy.limit,
  });

  // Fail closed: silently skipping a missing RPC would disable the protection.
  if (error || typeof data !== 'boolean') {
    console.error('[API rate limit] unavailable', policy.scope, error);
    throw new Error('Rate limiting is unavailable');
  }
  return data;
}

export async function consumeIpRateLimit(request: Request, policy: RateLimit) {
  return consumeRateLimit(`ip:${clientAddress(request)}`, policy);
}

export function rateLimitResponse() {
  return Response.json(
    { error: 'Слишком много запросов. Попробуй через минуту.' },
    { status: 429, headers: { 'Cache-Control': 'private, no-store', 'Retry-After': '60' } },
  );
}
