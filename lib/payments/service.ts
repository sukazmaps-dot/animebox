import 'server-only';

import { createSupabaseAdmin } from '@/lib/supabase/admin';
import type {
  PaymentProvider,
  PaymentStatus,
  RecordPaymentTransactionInput,
} from '@/lib/payments/types';

export async function recordPaymentEvent({
  transactionId,
  eventType,
  actorUserId,
  providerEventId,
  details = {},
}: {
  transactionId: string;
  eventType: string;
  actorUserId?: string | null;
  providerEventId?: string | null;
  details?: Record<string, unknown>;
}) {
  const supabase = createSupabaseAdmin();
  const { error } = await supabase.from('payment_events').insert({
    transaction_id: transactionId,
    event_type: eventType,
    actor_user_id: actorUserId ?? null,
    provider_event_id: providerEventId ?? null,
    details,
  });

  if (error && error.code !== '23505') throw error;
}

export async function recordPaymentTransaction(
  input: RecordPaymentTransactionInput,
) {
  const supabase = createSupabaseAdmin();
  const now = new Date().toISOString();

  const { data: inserted, error } = await supabase
    .from('payment_transactions')
    .upsert(
      {
        user_id: input.userId ?? null,
        provider: input.provider,
        product_code: input.productCode,
        external_id: input.externalId,
        external_user_id: input.externalUserId ?? null,
        status: input.status,
        amount: input.amount,
        currency: input.currency.toUpperCase(),
        provider_status: input.providerStatus ?? null,
        provider_created_at: input.providerCreatedAt ?? null,
        paid_at: input.paidAt ?? (input.status === 'paid' ? now : null),
        refunded_at: input.refundedAt ?? null,
        metadata: input.metadata ?? {},
        updated_at: now,
      },
      {
        onConflict: 'provider,external_id',
        ignoreDuplicates: true,
      },
    )
    .select('id,user_id,status')
    .maybeSingle();

  if (error) throw error;

  if (inserted?.id) {
    await recordPaymentEvent({
      transactionId: inserted.id,
      eventType:
        input.eventType ??
        (input.status === 'paid' ? 'payment.paid' : 'payment.created'),
      details: input.eventDetails ?? {
        provider: input.provider,
        external_id: input.externalId,
      },
    });

    return { id: inserted.id as string, created: true };
  }

  const { data: existing, error: lookupError } = await supabase
    .from('payment_transactions')
    .select('id,user_id,status')
    .eq('provider', input.provider)
    .eq('external_id', input.externalId)
    .maybeSingle();

  if (lookupError) throw lookupError;
  if (!existing?.id) {
    throw new Error('Unified payment transaction was not created or found.');
  }

  // A payment can arrive before the Telegram/AnimeBox account is linked.
  // Once we know the user, fill only the missing user_id; never overwrite a
  // previously linked owner from a provider sync.
  if (!existing.user_id && input.userId) {
    const { error: linkError } = await supabase
      .from('payment_transactions')
      .update({ user_id: input.userId, updated_at: now })
      .eq('id', existing.id)
      .is('user_id', null);
    if (linkError) throw linkError;
  }

  return { id: existing.id as string, created: false };
}

export async function updatePaymentTransactionByExternalId({
  provider,
  externalId,
  status,
  providerStatus,
  refundedAt,
  eventType,
  eventDetails = {},
}: {
  provider: PaymentProvider;
  externalId: string;
  status?: PaymentStatus;
  providerStatus?: string | null;
  refundedAt?: string | null;
  eventType?: string;
  eventDetails?: Record<string, unknown>;
}) {
  const supabase = createSupabaseAdmin();
  const { data: existing, error: lookupError } = await supabase
    .from('payment_transactions')
    .select('id,status,provider_status,refunded_at')
    .eq('provider', provider)
    .eq('external_id', externalId)
    .maybeSingle();

  if (lookupError) throw lookupError;
  if (!existing?.id) return { found: false, changed: false };

  const statusChanged = status !== undefined && existing.status !== status;
  const providerStatusChanged =
    providerStatus !== undefined && existing.provider_status !== providerStatus;
  const refundedAtChanged =
    refundedAt !== undefined && existing.refunded_at !== refundedAt;
  const changed = statusChanged || providerStatusChanged || refundedAtChanged;

  if (changed) {
    const patch: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (status !== undefined) patch.status = status;
    if (providerStatus !== undefined) patch.provider_status = providerStatus;
    if (refundedAt !== undefined) patch.refunded_at = refundedAt;

    const { error } = await supabase
      .from('payment_transactions')
      .update(patch)
      .eq('id', existing.id);
    if (error) throw error;
  }

  if (eventType && changed) {
    await recordPaymentEvent({
      transactionId: existing.id,
      eventType,
      details: eventDetails,
    });
  }

  return { found: true, changed, id: existing.id as string };
}
