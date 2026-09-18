import { adminClient, failure, response, userClient } from '@/lib/community-server';
import { getEffectiveUserEntitlements } from '@/lib/entitlements-server';
import { getPremiumRecurringSubscription, getPremiumStatus } from '@/lib/premium-server';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { user } = await userClient();
    const admin = adminClient();
    const [subscription, recurringSubscription, entitlements, paymentsResult] = await Promise.all([
      getPremiumStatus(user.id),
      getPremiumRecurringSubscription(user.id),
      getEffectiveUserEntitlements(user.id),
      admin
        .from('payment_transactions')
        .select('id,provider,product_code,status,amount,currency,paid_at,refunded_at,created_at')
        .eq('user_id', user.id)
        .in('product_code', ['premium_monthly', 'premium_yearly'])
        .order('created_at', { ascending: false })
        .limit(12),
    ]);

    if (paymentsResult.error) throw paymentsResult.error;

    return response({
      premium: Boolean(subscription),
      subscription,
      recurringSubscription,
      entitlements,
      payments: paymentsResult.data ?? [],
    });
  } catch (error) {
    return failure(error);
  }
}
