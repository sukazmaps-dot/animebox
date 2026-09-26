import { NextResponse } from 'next/server';

import {
  listBoostyUsersForRecheck,
  verifyBoostyPremiumForUser,
} from '@/lib/boosty-premium';
import { beginOperationalJob } from '@/lib/operational-job-server';
import { isCronAuthorized } from '@/lib/server-request-auth';
import { createSystemJobObserver } from '@/lib/system-observability-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json(
      { ok: false, error: 'unauthorized' },
      { status: 401, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const observer = createSystemJobObserver('boosty-premium');
  const permit = await beginOperationalJob('boosty-premium', {
    budgetMs: 50_000,
    leaseTtlSeconds: 90,
  });

  if (!permit.allowed) {
    await observer.skipped(permit.reason, { degraded: permit.degraded });
    return NextResponse.json(
      { ok: true, skipped: true, reason: permit.reason },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }

  try {
    const url = new URL(request.url);
    const rawLimit = Number(url.searchParams.get('limit') || '100');
    const requestedLimit = Number.isFinite(rawLimit)
      ? Math.min(100, Math.max(1, Math.round(rawLimit)))
      : 100;
    const users = await listBoostyUsersForRecheck(requestedLimit);

    const result = {
      checked: 0,
      active: 0,
      gracePeriod: 0,
      notMember: 0,
      errors: 0,
      budgetExhausted: false,
    };

    // Sequential checks are intentional. Stop before the serverless deadline
    // instead of allowing Vercel to terminate the function mid-write.
    for (const userId of users) {
      if (permit.shouldStop(6_000)) {
        result.budgetExhausted = true;
        break;
      }

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

    const summary = {
      ...result,
      remainingMs: permit.remainingMs(),
    };

    if (result.errors > 0 || result.budgetExhausted) {
      await observer.degraded(
        result.budgetExhausted
          ? 'boosty_budget_exhausted'
          : 'boosty_verification_errors',
        summary,
      );
    } else {
      await observer.success(summary);
    }

    return NextResponse.json(
      { ok: true, ...summary },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    await observer.failed(error);
    console.error('[Boosty Premium cron]', error);
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : 'boosty_premium_cron_failed',
      },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  } finally {
    await permit.release();
  }
}
