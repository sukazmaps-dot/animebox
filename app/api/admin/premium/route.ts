import { ApiError, adminClient, failure, readBody, response } from '@/lib/community-server';
import { requireAdmin, requireAdminMutation, writeAdminAudit } from '@/lib/admin-server';
import {
  getEffectivePremiumState,
  grantPremium,
  reconcileAllPremiumLifecycle,
  reconcilePremiumForUser,
  revokePremium,
} from '@/lib/premium-server';
import { getPremiumCatalog, updatePremiumPlanConfig } from '@/lib/premium-catalog-server';
import { isPremiumPlanId } from '@/lib/premium';
import {
  editUserStarSubscription,
  refundStarPayment,
} from '@/lib/telegram-stars';
import { markTelegramStarsPaymentRefunded } from '@/lib/payments/providers/telegram-stars';
import {
  deactivatePremiumForTransaction,
  resolvePremiumSubscriptionForTransaction,
} from '@/lib/premium-refund-server';
import { verifyBoostyPremiumForUser } from '@/lib/boosty-premium';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: Request) {
  try {
    const { role } = await requireAdmin(['owner', 'admin']);
    const admin = adminClient();
    await reconcileAllPremiumLifecycle(500);
    const now = new Date().toISOString();
    const q = new URL(request.url).searchParams.get('q')?.trim().slice(0, 120) ?? '';

    let matches: { id: string; username: string | null }[] = [];
    if (q) {
      if (UUID_RE.test(q)) {
        const result = await admin
          .from('profiles')
          .select('id,username')
          .eq('id', q)
          .limit(10);
        if (result.error) throw result.error;
        matches = result.data ?? [];
      } else {
        const result = await admin
          .from('profiles')
          .select('id,username')
          .ilike('username', `%${q}%`)
          .limit(10);
        if (result.error) throw result.error;
        matches = result.data ?? [];
      }
    }

    const { data: subscriptions, error } = await admin
      .from('premium_subscriptions')
      .select('id,user_id,plan,status,source,transaction_id,starts_at,ends_at,cancelled_at,auto_renew,auto_renew_cancelled_at,telegram_subscription_charge_id,created_at')
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
      matches,
      plans: await getPremiumCatalog(),
      canRefund: role === 'owner',
    });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request) {
  try {
    const { user, role } = await requireAdminMutation(request, ['owner', 'admin']);
    const body = await readBody(request);
    const action = typeof body.action === 'string' ? body.action.trim() : '';

    if (action === 'configure_plan') {
      const planId = typeof body.planId === 'string' ? body.planId.trim() : '';
      const amountRaw = body.telegramStarsAmount;
      const active = body.active === true;

      if (!isPremiumPlanId(planId)) {
        throw new ApiError(400, 'Некорректный Premium-тариф.');
      }

      const amount =
        amountRaw === null || amountRaw === '' || amountRaw === undefined
          ? null
          : Number(amountRaw);

      if (
        amount !== null &&
        (!Number.isInteger(amount) ||
          amount < 1 ||
          amount > (planId === 'monthly' ? 10000 : 100000))
      ) {
        throw new ApiError(
          400,
          planId === 'monthly'
            ? 'Цена месячной подписки должна быть от 1 до 10000 Stars.'
            : 'Цена годового Premium должна быть от 1 до 100000 Stars.',
        );
      }

      if (active && !amount) {
        throw new ApiError(400, 'Нельзя включить тариф без цены в Telegram Stars.');
      }

      const plan = await updatePremiumPlanConfig({
        planId,
        telegramStarsAmount: amount,
        active,
      });

      await writeAdminAudit({
        actorId: user.id,
        actorRole: role,
        action: 'premium.configure_plan',
        targetType: 'payment_product',
        targetId: plan.productCode,
        details: {
          plan_id: plan.id,
          active: plan.active,
          telegram_stars_amount: plan.telegramStarsAmount,
          duration_days: plan.durationDays,
        },
      });

      return response({ ok: true, plan });
    }

    if (action === 'refund') {
      const owner = await requireAdmin(['owner']);
      const transactionId =
        typeof body.transactionId === 'string' ? body.transactionId.trim() : '';
      const reason =
        typeof body.reason === 'string'
          ? body.reason.trim().slice(0, 500)
          : 'Возврат AnimeBox Premium';

      if (!UUID_RE.test(transactionId)) {
        throw new ApiError(400, 'Некорректный Premium-платёж.');
      }

      const admin = adminClient();
      const { data: transaction, error: transactionError } = await admin
        .from('payment_transactions')
        .select('id,provider,product_code,external_id,external_user_id,status,amount,currency')
        .eq('id', transactionId)
        .single();

      if (transactionError) throw transactionError;

      if (
        transaction.provider !== 'telegram_stars' ||
        !['premium_monthly', 'premium_yearly'].includes(transaction.product_code)
      ) {
        throw new ApiError(409, 'Для этого Premium-платежа автоматический возврат недоступен.');
      }

      if (transaction.status === 'refunded') {
        throw new ApiError(409, 'Платёж уже возвращён.');
      }

      if (transaction.status !== 'paid') {
        throw new ApiError(409, 'Возврат доступен только для оплаченного Premium.');
      }

      const telegramId = Number(transaction.external_user_id);
      if (!Number.isSafeInteger(telegramId) || telegramId <= 0) {
        throw new ApiError(409, 'Не найден Telegram-плательщик для возврата.');
      }

      const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim();
      if (!botToken) throw new ApiError(500, 'TELEGRAM_BOT_TOKEN не настроен.');

      const resolvedAccess = await resolvePremiumSubscriptionForTransaction(
        transaction.id,
      );

      if (resolvedAccess?.telegramSubscriptionChargeId) {
        await editUserStarSubscription({
          botToken,
          userId: telegramId,
          telegramPaymentChargeId:
            resolvedAccess.telegramSubscriptionChargeId,
          isCanceled: true,
        });
      }

      await refundStarPayment({
        botToken,
        userId: telegramId,
        telegramPaymentChargeId: transaction.external_id,
      });

      const now = new Date().toISOString();

      await markTelegramStarsPaymentRefunded({
        telegramPaymentChargeId: transaction.external_id,
        refundedAt: now,
        source: 'admin',
      });

      const access = await deactivatePremiumForTransaction({
        transactionId: transaction.id,
        note: reason,
      });

      await writeAdminAudit({
        actorId: owner.user.id,
        actorRole: owner.role,
        action: 'premium.refund',
        targetType: 'payment_transaction',
        targetId: transaction.id,
        reason,
        details: {
          amount: transaction.amount,
          currency: transaction.currency,
          telegram_id: telegramId,
          access,
        },
      });

      return response({ ok: true, access });
    }

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

    if (action === 'extend') {
      const subscriptionId = typeof body.subscriptionId === 'string' ? body.subscriptionId.trim() : '';
      const days = Number(body.days);
      const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 500) : '';

      if (!UUID_RE.test(subscriptionId)) throw new ApiError(400, 'Некорректная подписка.');
      if (!Number.isInteger(days) || days < 1 || days > 3660) {
        throw new ApiError(400, 'Продление должно быть от 1 до 3660 дней.');
      }

      const admin = adminClient();
      const { data: target, error: targetError } = await admin
        .from('premium_subscriptions')
        .select('user_id')
        .eq('id', subscriptionId)
        .maybeSingle();
      if (targetError) throw targetError;
      if (!target?.user_id) throw new ApiError(404, 'Подписка не найдена.');

      // Extension is an admin/manual overlay. We never mutate the paid
      // provider lease itself, so Boosty/Stars remain auditable and independent.
      const subscription = await grantPremium({
        userId: String(target.user_id),
        days,
        actorUserId: user.id,
        reason: reason || `Admin extension +${days} days`,
      });

      const lifecycle = await getEffectivePremiumState(String(target.user_id));

      await writeAdminAudit({
        actorId: user.id,
        actorRole: role,
        action: 'premium.extend',
        targetType: 'premium_subscription',
        targetId: subscriptionId,
        reason,
        details: {
          manual_subscription_id: subscription.id,
          days,
          effective_ends_at: lifecycle.endsAt,
        },
      });

      return response({ ok: true, subscription, lifecycle });
    }

    if (action === 'recheck') {
      const subscriptionId = typeof body.subscriptionId === 'string' ? body.subscriptionId.trim() : '';
      if (!UUID_RE.test(subscriptionId)) throw new ApiError(400, 'Некорректная подписка.');

      const admin = adminClient();
      const { data: target, error: targetError } = await admin
        .from('premium_subscriptions')
        .select('user_id,source')
        .eq('id', subscriptionId)
        .maybeSingle();
      if (targetError) throw targetError;
      if (!target?.user_id) throw new ApiError(404, 'Подписка не найдена.');

      const targetUserId = String(target.user_id);
      if (target.source === 'boosty_telegram') {
        await verifyBoostyPremiumForUser(targetUserId, { force: true });
      } else {
        await reconcilePremiumForUser(targetUserId);
      }

      const lifecycle = await getEffectivePremiumState(targetUserId);

      await writeAdminAudit({
        actorId: user.id,
        actorRole: role,
        action: 'premium.recheck',
        targetType: 'premium_subscription',
        targetId: subscriptionId,
        details: { source: target.source, lifecycle },
      });

      return response({ ok: true, lifecycle });
    }

    if (action === 'revoke') {
      const subscriptionId = typeof body.subscriptionId === 'string' ? body.subscriptionId.trim() : '';
      const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 500) : '';
      if (!UUID_RE.test(subscriptionId)) throw new ApiError(400, 'Некорректная подписка.');

      const admin = adminClient();
      const { data: subscriptionToRevoke, error: subscriptionLookupError } = await admin
        .from('premium_subscriptions')
        .select('source,transaction_id,telegram_subscription_charge_id')
        .eq('id', subscriptionId)
        .maybeSingle();

      if (subscriptionLookupError) throw subscriptionLookupError;

      if (
        subscriptionToRevoke?.source === 'telegram_stars' &&
        subscriptionToRevoke.telegram_subscription_charge_id
      ) {
        const { data: transaction, error: transactionError } = await admin
          .from('payment_transactions')
          .select('external_user_id')
          .eq('id', subscriptionToRevoke.transaction_id)
          .maybeSingle();

        if (transactionError) throw transactionError;

        const telegramId = Number(transaction?.external_user_id ?? 0);
        const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim();

        if (
          botToken &&
          Number.isSafeInteger(telegramId) &&
          telegramId > 0
        ) {
          await editUserStarSubscription({
            botToken,
            userId: telegramId,
            telegramPaymentChargeId:
              subscriptionToRevoke.telegram_subscription_charge_id,
            isCanceled: true,
          });
        }
      }

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
