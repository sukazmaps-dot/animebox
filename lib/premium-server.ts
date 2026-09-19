import 'server-only';

import { createSupabaseAdmin } from '@/lib/supabase/admin';
import type { EntitlementKey } from '@/lib/payments/entitlements';

export const PREMIUM_ENTITLEMENTS: EntitlementKey[] = [
  'adFree',
  'premiumBadge',
  'profileStudio',
  'premiumThemes',
];

export type PremiumSubscriptionStatus =
  | 'active'
  | 'grace_period'
  | 'expired'
  | 'cancelled'
  | 'refunded';

export type PremiumSubscription = {
  id: string;
  userId: string;
  plan: 'monthly' | 'yearly' | 'manual';
  status: PremiumSubscriptionStatus;
  source: string;
  transactionId: string | null;
  startsAt: string;
  endsAt: string;
  cancelledAt: string | null;
  autoRenew: boolean;
  autoRenewCancelledAt: string | null;
  telegramSubscriptionChargeId: string | null;
};

export type PremiumLifecycleSource =
  | 'telegram_stars'
  | 'boosty'
  | 'manual'
  | 'mixed'
  | 'other';

export type EffectivePremiumState = {
  active: boolean;
  state: 'inactive' | 'active' | 'grace_period';
  source: PremiumLifecycleSource;
  sources: PremiumLifecycleSource[];
  subscription: PremiumSubscription | null;
  subscriptions: PremiumSubscription[];
  startsAt: string | null;
  endsAt: string | null;
  graceUntil: string | null;
  autoRenew: boolean;
};

const SUBSCRIPTION_SELECT =
  'id,user_id,plan,status,source,transaction_id,starts_at,ends_at,cancelled_at,auto_renew,auto_renew_cancelled_at,telegram_subscription_charge_id';

function mapSubscription(row: Record<string, unknown>): PremiumSubscription {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    plan: row.plan as PremiumSubscription['plan'],
    status: row.status as PremiumSubscriptionStatus,
    source: String(row.source),
    transactionId: typeof row.transaction_id === 'string' ? row.transaction_id : null,
    startsAt: String(row.starts_at),
    endsAt: String(row.ends_at),
    cancelledAt: typeof row.cancelled_at === 'string' ? row.cancelled_at : null,
    autoRenew: row.auto_renew === true,
    autoRenewCancelledAt:
      typeof row.auto_renew_cancelled_at === 'string'
        ? row.auto_renew_cancelled_at
        : null,
    telegramSubscriptionChargeId:
      typeof row.telegram_subscription_charge_id === 'string'
        ? row.telegram_subscription_charge_id
        : null,
  };
}

function normalizeSource(source: string): Exclude<PremiumLifecycleSource, 'mixed'> {
  if (source === 'telegram_stars') return 'telegram_stars';
  if (source === 'boosty_telegram') return 'boosty';
  if (source === 'admin') return 'manual';
  return 'other';
}

function sortLiveSubscriptions(items: PremiumSubscription[]) {
  return [...items].sort((left, right) => {
    if (left.status !== right.status) {
      if (left.status === 'active') return -1;
      if (right.status === 'active') return 1;
    }
    return Date.parse(right.endsAt) - Date.parse(left.endsAt);
  });
}

async function syncEntitlementsForSubscriptions(
  userId: string,
  subscriptions: PremiumSubscription[],
) {
  const admin = createSupabaseAdmin();
  const now = new Date().toISOString();

  // Premium access is derived from live subscriptions. Resetting only the
  // Premium-owned rows makes this reconciliation idempotent and leaves sponsor
  // compatibility or future entitlement sources untouched.
  const { error: clearError } = await admin
    .from('user_entitlements')
    .update({ active: false, updated_at: now })
    .eq('user_id', userId)
    .eq('source', 'premium')
    .eq('active', true);

  if (clearError) throw clearError;
  if (!subscriptions.length) return;

  const rows = subscriptions.flatMap((subscription) =>
    PREMIUM_ENTITLEMENTS.map((entitlement) => ({
      user_id: userId,
      entitlement,
      source: 'premium',
      source_id: subscription.id,
      active: true,
      starts_at: subscription.startsAt,
      expires_at: subscription.endsAt,
      metadata: {
        plan: subscription.plan,
        provider: normalizeSource(subscription.source),
        subscription_source: subscription.source,
      },
      updated_at: now,
    })),
  );

  const { error } = await admin.from('user_entitlements').upsert(rows, {
    onConflict: 'user_id,entitlement,source,source_id',
  });

  if (error) throw error;
}

export async function reconcilePremiumForUser(userId: string) {
  const admin = createSupabaseAdmin();
  const now = new Date().toISOString();

  const { data: expired, error: expiredLookupError } = await admin
    .from('premium_subscriptions')
    .select('id')
    .eq('user_id', userId)
    .in('status', ['active', 'grace_period'])
    .lte('ends_at', now);

  if (expiredLookupError) throw expiredLookupError;

  const expiredIds = (expired ?? []).map((item) => String(item.id));
  if (expiredIds.length) {
    const { error: subscriptionError } = await admin
      .from('premium_subscriptions')
      .update({ status: 'expired', auto_renew: false, updated_at: now })
      .in('id', expiredIds);
    if (subscriptionError) throw subscriptionError;
  }

  const { data: liveRows, error: liveError } = await admin
    .from('premium_subscriptions')
    .select(SUBSCRIPTION_SELECT)
    .eq('user_id', userId)
    .in('status', ['active', 'grace_period'])
    .gt('ends_at', now)
    .order('ends_at', { ascending: false });

  if (liveError) throw liveError;

  const subscriptions = (liveRows ?? []).map((row) =>
    mapSubscription(row as unknown as Record<string, unknown>),
  );

  await syncEntitlementsForSubscriptions(userId, subscriptions);
  return subscriptions;
}

export async function getEffectivePremiumState(
  userId: string,
): Promise<EffectivePremiumState> {
  const subscriptions = sortLiveSubscriptions(await reconcilePremiumForUser(userId));

  if (!subscriptions.length) {
    return {
      active: false,
      state: 'inactive',
      source: 'other',
      sources: [],
      subscription: null,
      subscriptions: [],
      startsAt: null,
      endsAt: null,
      graceUntil: null,
      autoRenew: false,
    };
  }

  const activeSubscriptions = subscriptions.filter((item) => item.status === 'active');
  const primary = activeSubscriptions[0] ?? subscriptions[0];
  const sourceSet = [...new Set(subscriptions.map((item) => normalizeSource(item.source)))];
  const furthest = [...subscriptions].sort(
    (left, right) => Date.parse(right.endsAt) - Date.parse(left.endsAt),
  )[0];
  const earliestStart = [...subscriptions].sort(
    (left, right) => Date.parse(left.startsAt) - Date.parse(right.startsAt),
  )[0];
  const state = activeSubscriptions.length ? 'active' : 'grace_period';

  return {
    active: true,
    state,
    source: sourceSet.length > 1 ? 'mixed' : sourceSet[0] ?? 'other',
    sources: sourceSet,
    subscription: primary,
    subscriptions,
    startsAt: earliestStart?.startsAt ?? primary.startsAt,
    endsAt: furthest?.endsAt ?? primary.endsAt,
    graceUntil: state === 'grace_period' ? furthest?.endsAt ?? primary.endsAt : null,
    autoRenew: subscriptions.some((item) => item.autoRenew),
  };
}

export async function getPremiumStatus(userId: string) {
  return (await getEffectivePremiumState(userId)).subscription;
}

export async function getPremiumRecurringSubscription(userId: string) {
  const admin = createSupabaseAdmin();
  const now = new Date().toISOString();

  await reconcilePremiumForUser(userId);

  const { data, error } = await admin
    .from('premium_subscriptions')
    .select(SUBSCRIPTION_SELECT)
    .eq('user_id', userId)
    .eq('plan', 'monthly')
    .eq('source', 'telegram_stars')
    .in('status', ['active', 'grace_period'])
    .gt('ends_at', now)
    .not('telegram_subscription_charge_id', 'is', null)
    .order('created_at', { ascending: false })
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
  const nowIso = now.toISOString();

  // Manual grants accumulate instead of spawning a pile of overlapping admin
  // subscriptions. External providers stay untouched; manual access simply
  // overlays them and the resolver chooses the furthest valid access window.
  const { data: currentManual, error: lookupError } = await admin
    .from('premium_subscriptions')
    .select(SUBSCRIPTION_SELECT)
    .eq('user_id', userId)
    .eq('plan', 'manual')
    .eq('source', 'admin')
    .in('status', ['active', 'grace_period'])
    .order('ends_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lookupError) throw lookupError;

  const currentEndsAt = currentManual?.ends_at ? Date.parse(String(currentManual.ends_at)) : NaN;
  const baseMs = Number.isFinite(currentEndsAt) && currentEndsAt > Date.now()
    ? currentEndsAt
    : Date.now();
  const endsAt = new Date(baseMs + days * 86_400_000).toISOString();

  let subscriptionRow: Record<string, unknown>;

  if (currentManual?.id) {
    const { data, error } = await admin
      .from('premium_subscriptions')
      .update({
        status: 'active',
        ends_at: endsAt,
        cancelled_at: null,
        auto_renew: false,
        updated_at: nowIso,
        metadata: {
          actor_user_id: actorUserId,
          reason: reason?.trim() || null,
          extended_at: nowIso,
          extended_days: days,
        },
      })
      .eq('id', currentManual.id)
      .select(SUBSCRIPTION_SELECT)
      .single();
    if (error) throw error;
    subscriptionRow = data as unknown as Record<string, unknown>;
  } else {
    const { data, error } = await admin
      .from('premium_subscriptions')
      .insert({
        user_id: userId,
        plan: 'manual',
        status: 'active',
        source: 'admin',
        starts_at: nowIso,
        ends_at: endsAt,
        auto_renew: false,
        metadata: {
          actor_user_id: actorUserId,
          reason: reason?.trim() || null,
        },
      })
      .select(SUBSCRIPTION_SELECT)
      .single();
    if (error) throw error;
    subscriptionRow = data as unknown as Record<string, unknown>;
  }

  await reconcilePremiumForUser(userId);
  return mapSubscription(subscriptionRow);
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
      auto_renew: false,
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

  await reconcilePremiumForUser(String(subscription.user_id));

  return { changed: true, userId: subscription.user_id as string };
}

export async function reconcileAllPremiumLifecycle(limit = 500) {
  const admin = createSupabaseAdmin();
  const now = new Date().toISOString();
  const safeLimit = Math.max(1, Math.min(2000, Math.round(limit)));

  const { data: rows, error } = await admin
    .from('premium_subscriptions')
    .select(SUBSCRIPTION_SELECT)
    .in('status', ['active', 'grace_period'])
    .order('ends_at', { ascending: true })
    .limit(safeLimit);

  if (error) throw error;

  const subscriptions = (rows ?? []).map((row) =>
    mapSubscription(row as unknown as Record<string, unknown>),
  );
  const expired = subscriptions.filter((item) => Date.parse(item.endsAt) <= Date.now());
  const live = subscriptions.filter((item) => Date.parse(item.endsAt) > Date.now());

  if (expired.length) {
    const expiredIds = expired.map((item) => item.id);
    const { error: updateError } = await admin
      .from('premium_subscriptions')
      .update({ status: 'expired', auto_renew: false, updated_at: now })
      .in('id', expiredIds);
    if (updateError) throw updateError;

    const { error: entitlementError } = await admin
      .from('user_entitlements')
      .update({ active: false, updated_at: now })
      .eq('source', 'premium')
      .in('source_id', expiredIds);
    if (entitlementError) throw entitlementError;
  }

  if (live.length) {
    const rowsToUpsert = live.flatMap((subscription) =>
      PREMIUM_ENTITLEMENTS.map((entitlement) => ({
        user_id: subscription.userId,
        entitlement,
        source: 'premium',
        source_id: subscription.id,
        active: true,
        starts_at: subscription.startsAt,
        expires_at: subscription.endsAt,
        metadata: {
          plan: subscription.plan,
          provider: normalizeSource(subscription.source),
          subscription_source: subscription.source,
        },
        updated_at: now,
      })),
    );

    const { error: entitlementError } = await admin.from('user_entitlements').upsert(
      rowsToUpsert,
      { onConflict: 'user_id,entitlement,source,source_id' },
    );
    if (entitlementError) throw entitlementError;
  }

  return {
    checked: subscriptions.length,
    live: live.length,
    expired: expired.length,
    active: live.filter((item) => item.status === 'active').length,
    gracePeriod: live.filter((item) => item.status === 'grace_period').length,
  };
}
