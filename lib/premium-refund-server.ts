import 'server-only';

import { createSupabaseAdmin } from '@/lib/supabase/admin';

type ResolvedPremiumSubscription = {
  id: string;
  userId: string;
  startsAt: string;
  status: string;
  autoRenew: boolean;
  telegramSubscriptionChargeId: string | null;
};

export async function resolvePremiumSubscriptionForTransaction(
  transactionId: string,
): Promise<ResolvedPremiumSubscription | null> {
  const admin = createSupabaseAdmin();

  const { data: direct, error: directError } = await admin
    .from('premium_subscriptions')
    .select('id,user_id,starts_at,status,auto_renew,telegram_subscription_charge_id')
    .eq('transaction_id', transactionId)
    .maybeSingle();

  if (directError) throw directError;

  if (direct) {
    return {
      id: String(direct.id),
      userId: String(direct.user_id),
      startsAt: String(direct.starts_at),
      status: String(direct.status),
      autoRenew: direct.auto_renew === true,
      telegramSubscriptionChargeId:
        typeof direct.telegram_subscription_charge_id === 'string'
          ? direct.telegram_subscription_charge_id
          : null,
    };
  }

  // Recurring monthly renewals create a new payment transaction each period,
  // while the Premium subscription row intentionally remains the same.
  const { data: payment, error: paymentError } = await admin
    .from('payment_transactions')
    .select('user_id,provider,product_code')
    .eq('id', transactionId)
    .maybeSingle();

  if (paymentError) throw paymentError;

  if (
    !payment?.user_id ||
    payment.provider !== 'telegram_stars' ||
    payment.product_code !== 'premium_monthly'
  ) {
    return null;
  }

  const { data: recurring, error: recurringError } = await admin
    .from('premium_subscriptions')
    .select('id,user_id,starts_at,status,auto_renew,telegram_subscription_charge_id')
    .eq('user_id', payment.user_id)
    .eq('plan', 'monthly')
    .eq('source', 'telegram_stars')
    .not('telegram_subscription_charge_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (recurringError) throw recurringError;
  if (!recurring) return null;

  return {
    id: String(recurring.id),
    userId: String(recurring.user_id),
    startsAt: String(recurring.starts_at),
    status: String(recurring.status),
    autoRenew: recurring.auto_renew === true,
    telegramSubscriptionChargeId:
      typeof recurring.telegram_subscription_charge_id === 'string'
        ? recurring.telegram_subscription_charge_id
        : null,
  };
}

export async function deactivatePremiumForTransaction({
  transactionId,
  note,
}: {
  transactionId: string;
  note: string;
}) {
  const admin = createSupabaseAdmin();
  const now = new Date().toISOString();

  const subscription = await resolvePremiumSubscriptionForTransaction(
    transactionId,
  );

  if (!subscription) return { found: false, changed: false };

  if (!['active', 'grace_period'].includes(subscription.status)) {
    return {
      found: true,
      changed: false,
      userId: subscription.userId,
      telegramSubscriptionChargeId: subscription.telegramSubscriptionChargeId,
    };
  }

  const startsAtMs = Date.parse(subscription.startsAt);
  const safeEndsAt = new Date(
    Math.max(
      Date.now(),
      Number.isFinite(startsAtMs) ? startsAtMs + 1000 : Date.now(),
    ),
  ).toISOString();

  const { error } = await admin
    .from('premium_subscriptions')
    .update({
      status: 'refunded',
      auto_renew: false,
      auto_renew_cancelled_at: now,
      cancelled_at: now,
      ends_at: safeEndsAt,
      updated_at: now,
    })
    .eq('id', subscription.id);

  if (error) throw error;

  const { error: entitlementError } = await admin
    .from('user_entitlements')
    .update({ active: false, updated_at: now })
    .eq('user_id', subscription.userId)
    .eq('source', 'premium')
    .eq('source_id', subscription.id);

  if (entitlementError) throw entitlementError;

  return {
    found: true,
    changed: true,
    userId: subscription.userId,
    telegramSubscriptionChargeId: subscription.telegramSubscriptionChargeId,
    note,
  };
}
