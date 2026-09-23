import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { optionalServerSecret } from '@/lib/env/server';

import {
  listBoostyUsersForRecheck,
  verifyBoostyPremiumForUser,
} from '@/lib/boosty-premium';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function secureEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function authorized(request: Request) {
  const expected = optionalServerSecret('CRON_SECRET');
  const direct = request.headers.get('x-cron-secret')?.trim() ?? '';
  const bearer = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim() ?? '';
  return Boolean(
    expected &&
      ((direct && secureEqual(direct, expected)) ||
        (bearer && secureEqual(bearer, expected))),
  );
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const requestedLimit = Number(url.searchParams.get('limit') || '100');
    const users = await listBoostyUsersForRecheck(requestedLimit);

    const result = {
      checked: 0,
      active: 0,
      gracePeriod: 0,
      notMember: 0,
      errors: 0,
    };

    // Sequential checks are intentional: Telegram Bot API is external and
    // there's no reason for a maintenance cron to create a burst.
    for (const userId of users) {
      try {
        const status = await verifyBoostyPremiumForUser(userId, { force: true });
        result.checked += 1;
        if (status.state === 'active') result.active += 1;
        else if (status.state === 'grace_period') result.gracePeriod += 1;
        else if (status.state === 'not_member') result.notMember += 1;
        else if (status.state === 'error') result.errors += 1;
      } catch (error) {
        result.checked += 1;
        result.errors += 1;
        console.error('[Boosty Premium cron]', { userId, error });
      }
    }

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error('[Boosty Premium cron]', error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'boosty_premium_cron_failed',
      },
      { status: 500 },
    );
  }
}
