import 'server-only';

import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { PREMIUM_ENTITLEMENTS, type PremiumSubscription } from '@/lib/premium-server';

function mapSubscription(row: Record<string, unknown>): PremiumSubscription {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    plan: row.plan as PremiumSubscription['plan'],
    status: row.status as PremiumSubscription['status'],
    source: String(row.source),
    transactionId: typeof row.transaction_id === 'string' ? row.transaction_id : null,
    startsAt: String(row.starts_at),
    endsAt: String(row.ends_at),
    cancelledAt: typeof row.cancelled_at === 'string' ? row.cancelled_at : null,
  };
}

export async function activatePremiumFromPayment({
  userId,
  plan,
  durationDays,
  transactionId,
  provider,
}: {
  userId: string;
  plan: 'monthly' | 'yearly';
  durationDays: number;
  transactionId: string;
  provider: string;
}) {
  const admin = createSupabaseAdmin();

  const { data: existing, error: existingError } = await admin
    .from('premium_subscriptions')
    .select('id,user_id,plan,status,source,transaction_id,starts_at,ends_at,cancelled_at')
    .eq('transaction_id', transactionId)
    .maybeSingle();

  if (existingError) throw existingError;
  if (existing) {
    return mapSubscription(existing as unknown as Record<string, unknown>);
  }

  const now = new Date();
  const nowIso = now.toISOString();

  const { data: latest, error: latestError } = await admin
    .from('premium_subscriptions')
    .select('ends_at')
    .eq('user_id', userId)
    .in('status', ['active', 'grace_period'])
    .gt('ends_at', nowIso)
    .order('ends_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestError) throw latestError;

  const latestEndMs = latest?.ends_at ? Date.parse(latest.ends_at) : NaN;
  const startsAtMs =
    Number.isFinite(latestEndMs) && latestEndMs > now.getTime()
      ? latestEndMs
      : now.getTime();

  const startsAt = new Date(startsAtMs).toISOString();
  const endsAt = new Date(
    startsAtMs + durationDays * 86_400_000,
  ).toISOString();

  const { data: subscription, error } = await admin
    .from('premium_subscriptions')
    .insert({
      user_id: userId,
      plan,
      status: 'active',
      source: provider,
      transaction_id: transactionId,
      starts_at: startsAt,
      ends_at: endsAt,
      metadata: {
        duration_days: durationDays,
        transaction_id: transactionId,
      },
    })
    .select('id,user_id,plan,status,source,transaction_id,starts_at,ends_at,cancelled_at')
    .single();

  if (error) {
    if (error.code === '23505') {
      const { data: duplicate, error: duplicateError } = await admin
        .from('premium_subscriptions')
        .select('id,user_id,plan,status,source,transaction_id,starts_at,ends_at,cancelled_at')
        .eq('transaction_id', transactionId)
        .single();

      if (duplicateError) throw duplicateError;
      return mapSubscription(duplicate as unknown as Record<string, unknown>);
    }
    throw error;
  }

  const sourceId = subscription.id as string;
  const { error: entitlementError } = await admin
    .from('user_entitlements')
    .upsert(
      PREMIUM_ENTITLEMENTS.map((entitlement) => ({
        user_id: userId,
        entitlement,
        source: 'premium',
        source_id: sourceId,
        active: true,
        starts_at: startsAt,
        expires_at: endsAt,
        metadata: {
          plan,
          provider,
          transaction_id: transactionId,
        },
        updated_at: nowIso,
      })),
      { onConflict: 'user_id,entitlement,source,source_id' },
    );

  if (entitlementError) throw entitlementError;

  return mapSubscription(subscription as unknown as Record<string, unknown>);
}
