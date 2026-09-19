import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';

import { reconcileAllPremiumLifecycle } from '@/lib/premium-server';

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
    const requestedLimit = Number(url.searchParams.get('limit') || '500');
    const result = await reconcileAllPremiumLifecycle(requestedLimit);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error('[Premium lifecycle cron]', error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'premium_lifecycle_cron_failed',
      },
      { status: 500 },
    );
  }
}
