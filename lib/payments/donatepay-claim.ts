import 'server-only';

import { createHash, randomBytes } from 'node:crypto';

import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { recordPaymentEvent } from '@/lib/payments/service';

const PROVIDER = 'donatepay';
const CLAIM_TTL_MS = 2 * 60 * 60 * 1000;
const CLAIM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CLAIM_RE = /\bABX-([A-Z2-9]{4})-([A-Z2-9]{4})-([A-Z2-9]{4})\b/i;

export type DonatePayClaimStatus = {
  id: string;
  status: 'pending' | 'claimed' | 'expired' | 'cancelled';
  createdAt: string;
  expiresAt: string;
  claimedAt: string | null;
  transaction: null | {
    id: string;
    amount: number;
    currency: string;
    paidAt: string | null;
  };
};

function hashClaimCode(code: string) {
  return createHash('sha256').update(code.toUpperCase()).digest('hex');
}

function generateClaimCode() {
  const bytes = randomBytes(12);
  let body = '';

  for (const byte of bytes) {
    body += CLAIM_ALPHABET[byte % CLAIM_ALPHABET.length];
  }

  return `ABX-${body.slice(0, 4)}-${body.slice(4, 8)}-${body.slice(8, 12)}`;
}

export function extractDonatePayClaimCode(comment: string | null | undefined) {
  if (!comment) return null;
  const match = comment.toUpperCase().match(CLAIM_RE);
  if (!match) return null;
  return `ABX-${match[1]}-${match[2]}-${match[3]}`;
}

async function expireStaleClaims(userId?: string) {
  const admin = createSupabaseAdmin();
  let query = admin
    .from('payment_claim_intents')
    .update({
      status: 'expired',
      updated_at: new Date().toISOString(),
    })
    .eq('provider', PROVIDER)
    .eq('status', 'pending')
    .lte('expires_at', new Date().toISOString());

  if (userId) query = query.eq('user_id', userId);

  const { error } = await query;
  if (error) throw error;
}

export async function createDonatePayClaimIntent(userId: string) {
  const admin = createSupabaseAdmin();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + CLAIM_TTL_MS).toISOString();

  await expireStaleClaims(userId);

  const { error: cancelError } = await admin
    .from('payment_claim_intents')
    .update({
      status: 'cancelled',
      updated_at: now.toISOString(),
    })
    .eq('user_id', userId)
    .eq('provider', PROVIDER)
    .eq('status', 'pending');

  if (cancelError) throw cancelError;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const claimCode = generateClaimCode();
    const claimHash = hashClaimCode(claimCode);

    const { data, error } = await admin
      .from('payment_claim_intents')
      .insert({
        user_id: userId,
        provider: PROVIDER,
        claim_hash: claimHash,
        status: 'pending',
        expires_at: expiresAt,
        updated_at: now.toISOString(),
      })
      .select('id,created_at,expires_at')
      .single();

    if (!error && data) {
      return {
        id: data.id as string,
        claimCode,
        createdAt: data.created_at as string,
        expiresAt: data.expires_at as string,
      };
    }

    if (error?.code !== '23505') throw error;
  }

  throw new Error('Не удалось создать уникальный код DonatePay.');
}

export async function getLatestDonatePayClaim(
  userId: string,
): Promise<DonatePayClaimStatus | null> {
  const admin = createSupabaseAdmin();
  await expireStaleClaims(userId);

  const { data: claim, error } = await admin
    .from('payment_claim_intents')
    .select('id,status,transaction_id,created_at,expires_at,claimed_at')
    .eq('user_id', userId)
    .eq('provider', PROVIDER)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!claim) return null;

  let transaction: DonatePayClaimStatus['transaction'] = null;

  if (claim.transaction_id) {
    const { data: payment, error: paymentError } = await admin
      .from('payment_transactions')
      .select('id,amount,currency,paid_at')
      .eq('id', claim.transaction_id)
      .maybeSingle();

    if (paymentError) throw paymentError;
    if (payment) {
      transaction = {
        id: payment.id as string,
        amount: Number(payment.amount),
        currency: String(payment.currency),
        paidAt: payment.paid_at as string | null,
      };
    }
  }

  return {
    id: claim.id as string,
    status: claim.status as DonatePayClaimStatus['status'],
    createdAt: claim.created_at as string,
    expiresAt: claim.expires_at as string,
    claimedAt: claim.claimed_at as string | null,
    transaction,
  };
}

export async function tryClaimDonatePayTransaction({
  transactionId,
  comment,
}: {
  transactionId: string;
  comment: string | null | undefined;
}) {
  const claimCode = extractDonatePayClaimCode(comment);
  if (!claimCode) return { claimed: false as const, reason: 'no_code' as const };

  const admin = createSupabaseAdmin();
  const now = new Date().toISOString();
  const claimHash = hashClaimCode(claimCode);

  const { data: claim, error: claimError } = await admin
    .from('payment_claim_intents')
    .select('id,user_id,status,expires_at,transaction_id')
    .eq('provider', PROVIDER)
    .eq('claim_hash', claimHash)
    .eq('status', 'pending')
    .gt('expires_at', now)
    .maybeSingle();

  if (claimError) throw claimError;
  if (!claim) return { claimed: false as const, reason: 'claim_not_found' as const };

  const { data: payment, error: paymentError } = await admin
    .from('payment_transactions')
    .select('id,user_id,provider,status')
    .eq('id', transactionId)
    .maybeSingle();

  if (paymentError) throw paymentError;
  if (!payment || payment.provider !== PROVIDER || payment.status !== 'paid') {
    return { claimed: false as const, reason: 'invalid_payment' as const };
  }

  if (payment.user_id && payment.user_id !== claim.user_id) {
    return { claimed: false as const, reason: 'already_owned' as const };
  }

  if (!payment.user_id) {
    const { error: linkError } = await admin
      .from('payment_transactions')
      .update({
        user_id: claim.user_id,
        updated_at: now,
      })
      .eq('id', transactionId)
      .is('user_id', null);

    if (linkError) throw linkError;
  }

  const { data: claimedRow, error: updateClaimError } = await admin
    .from('payment_claim_intents')
    .update({
      status: 'claimed',
      transaction_id: transactionId,
      claimed_at: now,
      updated_at: now,
    })
    .eq('id', claim.id)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle();

  if (updateClaimError) throw updateClaimError;
  if (!claimedRow) return { claimed: false as const, reason: 'claim_race' as const };

  await recordPaymentEvent({
    transactionId,
    eventType: 'payment.claimed',
    details: {
      provider: PROVIDER,
      claim_id: claim.id,
      source: 'donatepay_comment_code',
    },
  });

  return {
    claimed: true as const,
    userId: claim.user_id as string,
    claimId: claim.id as string,
  };
}

export async function backfillPendingDonatePayClaims(limit = 100) {
  const admin = createSupabaseAdmin();
  await expireStaleClaims();

  const { data: payments, error } = await admin
    .from('payment_transactions')
    .select('id,metadata')
    .eq('provider', PROVIDER)
    .eq('status', 'paid')
    .is('user_id', null)
    .order('created_at', { ascending: false })
    .limit(Math.min(200, Math.max(1, limit)));

  if (error) throw error;

  let claimed = 0;

  for (const payment of payments ?? []) {
    const metadata = payment.metadata && typeof payment.metadata === 'object'
      ? (payment.metadata as Record<string, unknown>)
      : null;
    const comment = typeof metadata?.comment === 'string' ? metadata.comment : null;
    if (!comment) continue;

    const result = await tryClaimDonatePayTransaction({
      transactionId: payment.id,
      comment,
    });

    if (result.claimed) claimed += 1;
  }

  return claimed;
}
