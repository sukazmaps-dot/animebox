import { ApiError, adminClient, failure, readBody, response } from '@/lib/community-server';
import { requireAdmin, writeAdminAudit } from '@/lib/admin-server';
import { grantPremium, revokePremium } from '@/lib/premium-server';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET() {
  try {
    await requireAdmin(['owner', 'admin']);
    const admin = adminClient();
    const now = new Date().toISOString();

    const { data: subscriptions, error } = await admin
      .from('premium_subscriptions')
      .select('id,user_id,plan,status,source,transaction_id,starts_at,ends_at,cancelled_at,created_at')
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) throw error;

    const userIds = [...new Set((subscriptions ?? []).map((item) => item.user_id).filter(Boolean))];
    const profiles = userIds.length
      ? await admin.from('profiles').select('id,username').in('id', userIds)
      : { data: [], error: null };
    if (profiles.error) throw profiles.error;

    return response({
      now,
      subscriptions: subscriptions ?? [],
      profiles: profiles.data ?? [],
    });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request) {
  try {
    const { user, role } = await requireAdmin(['owner', 'admin']);
    const body = await readBody(request);
    const action = typeof body.action === 'string' ? body.action.trim() : '';

    if (action === 'grant') {
      const userId = typeof body.userId === 'string' ? body.userId.trim() : '';
      const days = Number(body.days);
      const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 500) : '';

      if (!UUID_RE.test(userId)) throw new ApiError(400, 'Некорректный пользователь.');
      if (!Number.isInteger(days) || days < 1 || days > 3660) {
        throw new ApiError(400, 'Срок Premium должен быть от 1 до 3660 дней.');
      }

      const subscription = await grantPremium({
        userId,
        days,
        actorUserId: user.id,
        reason,
      });

      await writeAdminAudit({
        actorId: user.id,
        actorRole: role,
        action: 'premium.grant',
        targetType: 'profile',
        targetId: userId,
        reason,
        details: { subscription_id: subscription.id, days, ends_at: subscription.endsAt },
      });

      return response({ ok: true, subscription });
    }

    if (action === 'revoke') {
      const subscriptionId = typeof body.subscriptionId === 'string' ? body.subscriptionId.trim() : '';
      const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 500) : '';
      if (!UUID_RE.test(subscriptionId)) throw new ApiError(400, 'Некорректная подписка.');

      const result = await revokePremium({
        subscriptionId,
        actorUserId: user.id,
        reason,
      });

      await writeAdminAudit({
        actorId: user.id,
        actorRole: role,
        action: 'premium.revoke',
        targetType: 'premium_subscription',
        targetId: subscriptionId,
        reason,
        details: result,
      });

      return response({ ok: true, result });
    }

    throw new ApiError(400, 'Неизвестное действие.');
  } catch (error) {
    return failure(error);
  }
}
