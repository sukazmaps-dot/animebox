import { NextResponse } from 'next/server';
import { optionalServerSecret } from '@/lib/env/server';

import { reconcileStarPayments } from '@/lib/star-reconciliation';

import { isCronAuthorized } from '@/lib/server-request-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const botToken = optionalServerSecret('TELEGRAM_BOT_TOKEN');
  if (!botToken) {
    return NextResponse.json({ ok: false, error: 'bot_not_configured' }, { status: 500 });
  }

  try {
    const result = await reconcileStarPayments({ botToken, transactionLimit: 100 });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error('[Stars reconcile cron]', error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'reconciliation_failed' },
      { status: 500 },
    );
  }
}
