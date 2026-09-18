import { failure, response, userClient } from '@/lib/community-server';
import { getEffectiveUserEntitlements } from '@/lib/entitlements-server';
import { getPremiumStatus } from '@/lib/premium-server';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { user } = await userClient();
    const [subscription, entitlements] = await Promise.all([
      getPremiumStatus(user.id),
      getEffectiveUserEntitlements(user.id),
    ]);

    return response({
      premium: Boolean(subscription),
      subscription,
      entitlements,
    });
  } catch (error) {
    return failure(error);
  }
}
