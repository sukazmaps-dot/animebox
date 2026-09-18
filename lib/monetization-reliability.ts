import 'server-only';

import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { recordPaymentEvent } from '@/lib/payments/service';

export type PaymentIntegrityStatus =
  | 'ok'
  | 'needs_review'
  | 'disputed'
  | 'reconciliation_error';

export async function claimMonetizationOperation({
  operationKey,
  operationType,
  targetType,
  targetId,
  actorUserId,
  metadata = {},
}: {
  operationKey: string;
  operationType: string;
  targetType: string;
  targetId: string;
  actorUserId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const admin = createSupabaseAdmin();
  const now = new Date().toISOString();

  const { data, error } = await admin
    .from('monetization_operation_claims')
    .insert({
      operation_key: operationKey,
      operation_type: operationType,
      target_type: targetType,
      target_id: targetId,
      status: 'processing',
      actor_user_id: actorUserId ?? null,
      metadata,
      updated_at: now,
    })
    .select('id,status')
    .single();

  if (!error && data) {
    return { claimed: true as const, id: String(data.id), status: 'processing' as const };
  }

  if (error?.code === '42P01' || error?.code === 'PGRST205') {
    return { claimed: true as const, id: null, status: 'processing' as const, degraded: true as const };
  }

  if (error?.code !== '23505') throw error;

  const { data: existing, error: lookupError } = await admin
    .from('monetization_operation_claims')
    .select('id,status')
    .eq('operation_key', operationKey)
    .single();
  if (lookupError) throw lookupError;

  if (existing.status === 'failed') {
    const { data: retried, error: retryError } = await admin
      .from('monetization_operation_claims')
      .update({
        status: 'processing',
        error: null,
        actor_user_id: actorUserId ?? null,
        metadata,
        updated_at: now,
        completed_at: null,
      })
      .eq('id', existing.id)
      .eq('status', 'failed')
      .select('id,status')
      .maybeSingle();
    if (retryError) throw retryError;
    if (retried) {
      return { claimed: true as const, id: String(retried.id), status: 'processing' as const };
    }
  }

  return {
    claimed: false as const,
    id: String(existing.id),
    status: existing.status as 'processing' | 'completed' | 'failed',
  };
}

export async function finishMonetizationOperation({
  id,
  status,
  error,
  metadata,
}: {
  id: string | null;
  status: 'completed' | 'failed';
  error?: string | null;
  metadata?: Record<string, unknown>;
}) {
  if (!id) return;
  const admin = createSupabaseAdmin();
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {
    status,
    error: error ?? null,
    updated_at: now,
    completed_at: status === 'completed' ? now : null,
  };
  if (metadata) patch.metadata = metadata;

  const { error: updateError } = await admin
    .from('monetization_operation_claims')
    .update(patch)
    .eq('id', id);
  if (updateError) throw updateError;
}

export async function setPaymentIntegrityStatus({
  transactionId,
  status,
  note,
  actorUserId,
}: {
  transactionId: string;
  status: PaymentIntegrityStatus;
  note?: string | null;
  actorUserId: string;
}) {
  const admin = createSupabaseAdmin();
  const now = new Date().toISOString();
  const normalizedNote = note?.trim().slice(0, 1000) || null;

  const { data: payment, error: lookupError } = await admin
    .from('payment_transactions')
    .select('id,integrity_status,integrity_note')
    .eq('id', transactionId)
    .single();
  if (lookupError) throw lookupError;

  const changed =
    payment.integrity_status !== status ||
    (payment.integrity_note ?? null) !== normalizedNote;

  if (!changed) return { changed: false };

  const { error } = await admin
    .from('payment_transactions')
    .update({
      integrity_status: status,
      integrity_note: normalizedNote,
      reviewed_at: now,
      reviewed_by: actorUserId,
      updated_at: now,
    })
    .eq('id', transactionId);
  if (error) throw error;

  await recordPaymentEvent({
    transactionId,
    eventType: 'payment.integrity_reviewed',
    actorUserId,
    details: {
      from: payment.integrity_status,
      to: status,
      note: normalizedNote,
    },
  });

  return { changed: true };
}
