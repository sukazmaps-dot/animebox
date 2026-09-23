import 'server-only';

import { timingSafeEqual } from 'node:crypto';

import { optionalServerSecret } from '@/lib/env/server';

export function secureServerSecretEqual(
  expected: string | null | undefined,
  candidate: string | null | undefined,
) {
  if (!expected || !candidate) return false;

  const left = Buffer.from(expected);
  const right = Buffer.from(candidate);

  return left.length === right.length && timingSafeEqual(left, right);
}

export function isCronAuthorized(request: Request) {
  const expected = optionalServerSecret('CRON_SECRET');
  if (!expected) return false;

  const direct = request.headers.get('x-cron-secret')?.trim() ?? '';
  const authorization = request.headers.get('authorization')?.trim() ?? '';
  const bearer = authorization.replace(/^Bearer\s+/i, '').trim();

  return (
    secureServerSecretEqual(expected, direct) ||
    secureServerSecretEqual(expected, bearer)
  );
}
