import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';

import { reconcileStarPayments } from '@/lib/star-reconciliation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function secureEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function authorized(request: Request) {
  const expected = process.env.CRON_SECRET?.trim();
  const direct = request.headers.get('x-cron-secret')?.trim() ?? '';
  const bearer = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim() ?? '';
  return Boolean(expected && ((direct && secureEqual(direct, expected)) || (bearer && secureEqual(bearer, expected))));
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim();
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
