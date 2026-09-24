import { NextResponse } from 'next/server';

import { isDonatePayConfigured } from '@/lib/payments/providers/donatepay';
import { syncDonatePayTransactions } from '@/lib/payments/sync-donatepay';

import { isCronAuthorized } from '@/lib/server-request-auth';
import { createSystemJobObserver } from '@/lib/system-observability-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const observer = createSystemJobObserver('donatepay-sync');

  if (!isDonatePayConfigured()) {
    await observer.skipped('donatepay_not_configured');
    return NextResponse.json({ ok: false, error: 'donatepay_not_configured' }, { status: 503 });
  }

  try {
    const result = await syncDonatePayTransactions();
    await observer.success(result);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    await observer.failed(error);
    console.error('[DonatePay sync cron]', error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'donatepay_sync_failed' },
      { status: 500 },
    );
  }
}
