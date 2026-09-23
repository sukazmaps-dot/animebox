import { NextResponse } from 'next/server';

import {
  listBoostyUsersForRecheck,
  verifyBoostyPremiumForUser,
} from '@/lib/boosty-premium';

import { isCronAuthorized } from '@/lib/server-request-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!isCronAuthorized(request)) {
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
