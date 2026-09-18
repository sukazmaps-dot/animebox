import 'server-only';

import { createSupabaseAdmin } from '@/lib/supabase/admin';

export async function deactivatePremiumForTransaction({
  transactionId,
  note,
}: {
  transactionId: string;
  note: string;
}) {
  const admin = createSupabaseAdmin();
  const now = new Date().toISOString();

  const { data: subscription, error: lookupError } = await admin
    .from('premium_subscriptions')
    .select('id,user_id,starts_at,status')
    .eq('transaction_id', transactionId)
    .maybeSingle();

  if (lookupError) throw lookupError;
  if (!subscription) return { found: false, changed: false };

  if (!['active', 'grace_period'].includes(subscription.status)) {
    return {
      found: true,
      changed: false,
      userId: subscription.user_id as string,
    };
  }

  const startsAtMs = Date.parse(subscription.starts_at);
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
      cancelled_at: now,
      ends_at: safeEndsAt,
      updated_at: now,
    })
    .eq('id', subscription.id);

  if (error) throw error;

  const { error: entitlementError } = await admin
    .from('user_entitlements')
    .update({ active: false, updated_at: now })
    .eq('user_id', subscription.user_id)
    .eq('source', 'premium')
    .eq('source_id', subscription.id);

  if (entitlementError) throw entitlementError;

  return {
    found: true,
    changed: true,
    userId: subscription.user_id as string,
    note,
  };
}
