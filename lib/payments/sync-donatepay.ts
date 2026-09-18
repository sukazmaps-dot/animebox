import 'server-only';

import { createSupabaseAdmin } from '@/lib/supabase/admin';
import {
  fetchDonatePayTransactions,
  isDonatePayConfigured,
} from '@/lib/payments/providers/donatepay';
import { recordPaymentTransaction } from '@/lib/payments/service';

const PROVIDER = 'donatepay';

function maxNumericId(values: string[]) {
  let max: bigint | null = null;
  for (const value of values) {
    if (!/^\d+$/.test(value)) continue;
    const id = BigInt(value);
    if (max == null || id > max) max = id;
  }
  return max?.toString() ?? null;
}

export async function syncDonatePayTransactions() {
  if (!isDonatePayConfigured()) {
    throw new Error('DONATEPAY_API_TOKEN is not configured.');
  }

  const admin = createSupabaseAdmin();
  const { data: state, error: stateError } = await admin
    .from('payment_provider_sync_state')
    .select('cursor,last_synced_at')
    .eq('provider', PROVIDER)
    .maybeSingle();
  if (stateError) throw stateError;

  const cursor = typeof state?.cursor === 'string' ? state.cursor : null;
  const startedAt = Date.now();

  try {
    // One DonatePay request per sync run. Historical clients document a strict
    // rate limit, so cron/manual retries remain intentionally conservative.
    const transactions = await fetchDonatePayTransactions({ after: cursor, limit: 100 });
    const ordered = [...transactions].sort((a, b) => {
      if (/^\d+$/.test(a.id) && /^\d+$/.test(b.id)) {
        const left = BigInt(a.id);
        const right = BigInt(b.id);
        return left < right ? -1 : left > right ? 1 : 0;
      }
      return a.createdAt.localeCompare(b.createdAt);
    });

    let imported = 0;
    for (const item of ordered) {
      const result = await recordPaymentTransaction({
        userId: null,
        provider: PROVIDER,
        productCode: 'donation_once',
        externalId: item.id,
        status: 'paid',
        amount: item.amount,
        currency: item.currency,
        providerStatus: 'Success',
        providerCreatedAt: item.createdAt,
        paidAt: item.createdAt,
        metadata: {
          donor_name: item.donorName,
          comment: item.comment,
          payment_system: item.paymentSystem,
          commission: item.commission,
          to_cash: item.toCash,
          to_pay: item.toPay,
          // Deliberately do not persist vars.user_ip from DonatePay.
        },
        eventType: 'payment.paid',
        eventDetails: { source: 'donatepay_sync' },
      });
      if (result.created) imported += 1;
    }

    const nextCursor = maxNumericId(transactions.map((item) => item.id)) ?? cursor;
    const syncedAt = new Date().toISOString();

    const { error: saveStateError } = await admin
      .from('payment_provider_sync_state')
      .upsert(
        {
          provider: PROVIDER,
          cursor: nextCursor,
          last_synced_at: syncedAt,
          last_error: null,
          metadata: {
            last_batch_count: transactions.length,
            last_imported_count: imported,
            initial_sync_latest_only: !cursor,
            duration_ms: Date.now() - startedAt,
          },
          updated_at: syncedAt,
        },
        { onConflict: 'provider' },
      );
    if (saveStateError) throw saveStateError;

    return {
      configured: true,
      scanned: transactions.length,
      imported,
      cursor: nextCursor,
      initialSync: !cursor,
      durationMs: Date.now() - startedAt,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'DonatePay sync failed';
    await admin
      .from('payment_provider_sync_state')
      .upsert(
        {
          provider: PROVIDER,
          cursor,
          last_error: message.slice(0, 1000),
          metadata: { duration_ms: Date.now() - startedAt },
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'provider' },
      );
    throw error;
  }
}
