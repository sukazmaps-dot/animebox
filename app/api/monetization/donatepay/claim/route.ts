import { NextResponse } from 'next/server';

import { ApiError, failure, readBody, response, userClient } from '@/lib/community-server';
import { SUPPORT_URL } from '@/lib/monetization';
import {
  createDonatePayClaimIntent,
  getLatestDonatePayClaim,
} from '@/lib/payments/donatepay-claim';
import { isDonatePayConfigured } from '@/lib/payments/providers/donatepay';
import { syncDonatePayTransactions } from '@/lib/payments/sync-donatepay';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { user } = await userClient();
    const url = new URL(request.url);
    const wantsSync = url.searchParams.get('sync') === '1';
    let syncError: string | null = null;

    if (wantsSync && isDonatePayConfigured()) {
      try {
        await syncDonatePayTransactions({ respectCooldown: true });
      } catch (error) {
        syncError = error instanceof Error ? error.message : 'DonatePay sync failed';
      }
    }

    const claim = await getLatestDonatePayClaim(user.id);

    return response({
      ok: true,
      configured: isDonatePayConfigured(),
      claim,
      syncError,
    });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request) {
  try {
    const { user } = await userClient();
    const body = await readBody(request);
    const action = typeof body.action === 'string' ? body.action : 'create';

    if (action !== 'create') {
      throw new ApiError(400, 'Неизвестное действие.');
    }

    if (!isDonatePayConfigured()) {
      return NextResponse.json(
        { ok: false, error: 'DonatePay пока не настроен.' },
        { status: 503 },
      );
    }

    const intent = await createDonatePayClaimIntent(user.id);

    return response({
      ok: true,
      configured: true,
      claimCode: intent.claimCode,
      claim: {
        id: intent.id,
        status: 'pending',
        createdAt: intent.createdAt,
        expiresAt: intent.expiresAt,
        claimedAt: null,
        transaction: null,
      },
      supportUrl: SUPPORT_URL,
    });
  } catch (error) {
    return failure(error);
  }
}
