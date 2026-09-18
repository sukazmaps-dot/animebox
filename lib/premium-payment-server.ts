import 'server-only';

import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { PREMIUM_ENTITLEMENTS, type PremiumSubscription } from '@/lib/premium-server';

const SUBSCRIPTION_SELECT =
  'id,user_id,plan,status,source,transaction_id,starts_at,ends_at,cancelled_at,auto_renew,auto_renew_cancelled_at,telegram_subscription_charge_id';

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

async function upsertEntitlements({
  userId,
  subscriptionId,
  startsAt,
  endsAt,
  plan,
  provider,
  transactionId,
}: {
  userId: string;
  subscriptionId: string;
  startsAt: string;
  endsAt: string;
  plan: 'monthly' | 'yearly';
  provider: string;
  transactionId: string;
}) {
  const admin = createSupabaseAdmin();
  const now = new Date().toISOString();

  const { error } = await admin
    .from('user_entitlements')
    .upsert(
      PREMIUM_ENTITLEMENTS.map((entitlement) => ({
        user_id: userId,
        entitlement,
        source: 'premium',
        source_id: subscriptionId,
        active: true,
        starts_at: startsAt,
        expires_at: endsAt,
        metadata: {
          plan,
          provider,
          transaction_id: transactionId,
        },
        updated_at: now,
      })),
      { onConflict: 'user_id,entitlement,source,source_id' },
    );

  if (error) throw error;
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
    .select(SUBSCRIPTION_SELECT)
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
  const endsAt = new Date(startsAtMs + durationDays * 86_400_000).toISOString();

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
      auto_renew: false,
      metadata: {
        duration_days: durationDays,
        transaction_id: transactionId,
      },
    })
    .select(SUBSCRIPTION_SELECT)
    .single();

  if (error) {
    if (error.code === '23505') {
      const { data: duplicate, error: duplicateError } = await admin
        .from('premium_subscriptions')
        .select(SUBSCRIPTION_SELECT)
        .eq('transaction_id', transactionId)
        .single();

      if (duplicateError) throw duplicateError;
      return mapSubscription(duplicate as unknown as Record<string, unknown>);
    }
    throw error;
  }

  await upsertEntitlements({
    userId,
    subscriptionId: subscription.id as string,
    startsAt,
    endsAt,
    plan,
    provider,
    transactionId,
  });

  return mapSubscription(subscription as unknown as Record<string, unknown>);
}

export async function activateOrRenewTelegramPremium({
  userId,
  plan,
  durationDays,
  transactionId,
  telegramPaymentChargeId,
  isRecurring,
  isFirstRecurring,
  subscriptionExpirationDate,
}: {
  userId: string;
  plan: 'monthly' | 'yearly';
  durationDays: number;
  transactionId: string;
  telegramPaymentChargeId: string;
  isRecurring: boolean;
  isFirstRecurring: boolean;
  subscriptionExpirationDate?: number | null;
}) {
  if (!isRecurring || plan !== 'monthly') {
    return activatePremiumFromPayment({
      userId,
      plan,
      durationDays,
      transactionId,
      provider: 'telegram_stars',
    });
  }

  const admin = createSupabaseAdmin();
  const now = new Date();
  const nowIso = now.toISOString();

  const expirationMs =
    Number.isSafeInteger(subscriptionExpirationDate) &&
    Number(subscriptionExpirationDate) > 0
      ? Number(subscriptionExpirationDate) * 1000
      : now.getTime() + durationDays * 86_400_000;

  const endsAt = new Date(Math.max(expirationMs, now.getTime() + 60_000)).toISOString();

  const { data: current, error: lookupError } = await admin
    .from('premium_subscriptions')
    .select(`${SUBSCRIPTION_SELECT},metadata`)
    .eq('user_id', userId)
    .eq('plan', 'monthly')
    .eq('source', 'telegram_stars')
    .not('telegram_subscription_charge_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lookupError) throw lookupError;

  if (current) {
    const metadata =
      current.metadata && typeof current.metadata === 'object'
        ? (current.metadata as Record<string, unknown>)
        : {};

    const { data: updated, error: updateError } = await admin
      .from('premium_subscriptions')
      .update({
        status: 'active',
        auto_renew: true,
        auto_renew_cancelled_at: null,
        ends_at: endsAt,
        updated_at: nowIso,
        metadata: {
          ...metadata,
          last_renewal_transaction_id: transactionId,
          last_renewal_charge_id: telegramPaymentChargeId,
          is_first_recurring: isFirstRecurring,
        },
      })
      .eq('id', current.id)
      .select(SUBSCRIPTION_SELECT)
      .single();

    if (updateError) throw updateError;

    await upsertEntitlements({
      userId,
      subscriptionId: String(current.id),
      startsAt: String(current.starts_at),
      endsAt,
      plan,
      provider: 'telegram_stars',
      transactionId,
    });

    return mapSubscription(updated as unknown as Record<string, unknown>);
  }

  const { data: subscription, error } = await admin
    .from('premium_subscriptions')
    .insert({
      user_id: userId,
      plan: 'monthly',
      status: 'active',
      source: 'telegram_stars',
      transaction_id: transactionId,
      starts_at: nowIso,
      ends_at: endsAt,
      auto_renew: true,
      telegram_subscription_charge_id: telegramPaymentChargeId,
      metadata: {
        duration_days: durationDays,
        first_transaction_id: transactionId,
        first_charge_id: telegramPaymentChargeId,
        is_first_recurring: isFirstRecurring,
      },
    })
    .select(SUBSCRIPTION_SELECT)
    .single();

  if (error) throw error;

  await upsertEntitlements({
    userId,
    subscriptionId: String(subscription.id),
    startsAt: nowIso,
    endsAt,
    plan: 'monthly',
    provider: 'telegram_stars',
    transactionId,
  });

  return mapSubscription(subscription as unknown as Record<string, unknown>);
}

export async function syncPremiumTelegramSubscriptionState({
  userId,
  state,
}: {
  userId: string;
  state: 'active' | 'canceled' | 'failed';
}) {
  const admin = createSupabaseAdmin();
  const now = new Date().toISOString();

  const { data: current, error } = await admin
    .from('premium_subscriptions')
    .select(SUBSCRIPTION_SELECT)
    .eq('user_id', userId)
    .eq('plan', 'monthly')
    .eq('source', 'telegram_stars')
    .not('telegram_subscription_charge_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!current) return null;

  const patch =
    state === 'active'
      ? {
          status: 'active',
          auto_renew: true,
          auto_renew_cancelled_at: null,
          updated_at: now,
        }
      : state === 'canceled'
        ? {
            auto_renew: false,
            auto_renew_cancelled_at: now,
            updated_at: now,
          }
        : {
            status: 'grace_period',
            auto_renew: true,
            updated_at: now,
          };

  const { data: updated, error: updateError } = await admin
    .from('premium_subscriptions')
    .update(patch)
    .eq('id', current.id)
    .select(SUBSCRIPTION_SELECT)
    .single();

  if (updateError) throw updateError;
  return mapSubscription(updated as unknown as Record<string, unknown>);
}
