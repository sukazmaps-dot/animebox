import 'server-only';

import { createSupabaseAdmin } from '@/lib/supabase/admin';
import type { EntitlementKey } from '@/lib/payments/entitlements';

export const PREMIUM_ENTITLEMENTS: EntitlementKey[] = [
  'adFree',
  'premiumBadge',
  'profileStudio',
  'premiumThemes',
];

export type PremiumSubscription = {
  id: string;
  userId: string;
  plan: 'monthly' | 'yearly' | 'manual';
  status: 'active' | 'grace_period' | 'expired' | 'cancelled' | 'refunded';
  source: string;
  transactionId: string | null;
  startsAt: string;
  endsAt: string;
  cancelledAt: string | null;
};

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

async function expirePremiumForUser(userId: string) {
  const admin = createSupabaseAdmin();
  const now = new Date().toISOString();

  const { data: expired, error } = await admin
    .from('premium_subscriptions')
    .select('id')
    .eq('user_id', userId)
    .in('status', ['active', 'grace_period'])
    .lte('ends_at', now);

  if (error) throw error;

  const ids = (expired ?? []).map((item) => item.id as string);
  if (!ids.length) return;

  const { error: subscriptionError } = await admin
    .from('premium_subscriptions')
    .update({ status: 'expired', updated_at: now })
    .in('id', ids);

  if (subscriptionError) throw subscriptionError;

  const { error: entitlementError } = await admin
    .from('user_entitlements')
    .update({ active: false, updated_at: now })
    .eq('user_id', userId)
    .eq('source', 'premium')
    .in('source_id', ids);

  if (entitlementError) throw entitlementError;
}

export async function getPremiumStatus(userId: string) {
  const admin = createSupabaseAdmin();
  const now = new Date().toISOString();

  await expirePremiumForUser(userId);

  const { data, error } = await admin
    .from('premium_subscriptions')
    .select('id,user_id,plan,status,source,transaction_id,starts_at,ends_at,cancelled_at')
    .eq('user_id', userId)
    .in('status', ['active', 'grace_period'])
    .gt('ends_at', now)
    .order('ends_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;

  return data ? mapSubscription(data as unknown as Record<string, unknown>) : null;
}

export async function grantPremium({
  userId,
  days,
  actorUserId,
  reason,
}: {
  userId: string;
  days: number;
  actorUserId: string;
  reason?: string | null;
}) {
  const admin = createSupabaseAdmin();
  const now = new Date();
  const startsAt = now.toISOString();
  const endsAt = new Date(now.getTime() + days * 86_400_000).toISOString();

  const { data: subscription, error } = await admin
    .from('premium_subscriptions')
    .insert({
      user_id: userId,
      plan: 'manual',
      status: 'active',
      source: 'admin',
      starts_at: startsAt,
      ends_at: endsAt,
      metadata: {
        actor_user_id: actorUserId,
        reason: reason?.trim() || null,
      },
    })
    .select('id,user_id,plan,status,source,transaction_id,starts_at,ends_at,cancelled_at')
    .single();

  if (error) throw error;

  const sourceId = subscription.id as string;
  const { error: entitlementError } = await admin.from('user_entitlements').upsert(
    PREMIUM_ENTITLEMENTS.map((entitlement) => ({
      user_id: userId,
      entitlement,
      source: 'premium',
      source_id: sourceId,
      active: true,
      starts_at: startsAt,
      expires_at: endsAt,
      metadata: {
        plan: 'manual',
        actor_user_id: actorUserId,
      },
      updated_at: startsAt,
    })),
    { onConflict: 'user_id,entitlement,source,source_id' },
  );

  if (entitlementError) throw entitlementError;

  return mapSubscription(subscription as unknown as Record<string, unknown>);
}

export async function revokePremium({
  subscriptionId,
  actorUserId,
  reason,
}: {
  subscriptionId: string;
  actorUserId: string;
  reason?: string | null;
}) {
  const admin = createSupabaseAdmin();
  const now = new Date().toISOString();

  const { data: subscription, error: lookupError } = await admin
    .from('premium_subscriptions')
    .select('id,user_id,starts_at,status')
    .eq('id', subscriptionId)
    .single();
  if (lookupError) throw lookupError;

  if (!['active', 'grace_period'].includes(subscription.status)) {
    return { changed: false, userId: subscription.user_id as string };
  }

  const startsAtMs = Date.parse(subscription.starts_at);
  const safeEndsAt = new Date(
    Math.max(Date.now(), Number.isFinite(startsAtMs) ? startsAtMs + 1000 : Date.now()),
  ).toISOString();

  const { error } = await admin
    .from('premium_subscriptions')
    .update({
      status: 'cancelled',
      cancelled_at: now,
      ends_at: safeEndsAt,
      updated_at: now,
      metadata: {
        revoked_by: actorUserId,
        revoke_reason: reason?.trim() || null,
      },
    })
    .eq('id', subscriptionId);
  if (error) throw error;

  const { error: entitlementError } = await admin
    .from('user_entitlements')
    .update({ active: false, updated_at: now })
    .eq('user_id', subscription.user_id)
    .eq('source', 'premium')
    .eq('source_id', subscriptionId);
  if (entitlementError) throw entitlementError;

  return { changed: true, userId: subscription.user_id as string };
}
