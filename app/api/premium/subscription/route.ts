import { NextResponse } from 'next/server';
import { optionalServerSecret } from '@/lib/env/server';

import { adminClient, readJsonBody, userClient } from '@/lib/community-server';
import { getPremiumRecurringSubscription } from '@/lib/premium-server';
import { editUserStarSubscription } from '@/lib/telegram-stars';

import { enforceIpAndUserRateLimit } from '@/lib/api-rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const { user } = await userClient();
    const limited = await enforceIpAndUserRateLimit(request, user.id, {
      ip: { scope: 'premium_subscription_ip', limit: 24, windowSeconds: 60 },
      user: { scope: 'premium_subscription_user', limit: 12, windowSeconds: 60 },
    });
    if (limited) return limited;
    const body = await readJsonBody(request);
    const action = typeof body?.action === 'string' ? body.action.trim() : '';

    if (action !== 'cancel' && action !== 'resume') {
      return NextResponse.json(
        { ok: false, error: 'invalid_action' },
        { status: 400 },
      );
    }

    const subscription = await getPremiumRecurringSubscription(user.id);

    if (!subscription?.telegramSubscriptionChargeId) {
      return NextResponse.json(
        { ok: false, error: 'recurring_subscription_not_found' },
        { status: 404 },
      );
    }

    const admin = adminClient();
    let telegramId: number | null = null;

    if (subscription.transactionId) {
      const { data: transaction, error } = await admin
        .from('payment_transactions')
        .select('external_user_id')
        .eq('id', subscription.transactionId)
        .maybeSingle();

      if (error) throw error;

      const parsed = Number(transaction?.external_user_id ?? 0);
      if (Number.isSafeInteger(parsed) && parsed > 0) {
        telegramId = parsed;
      }
    }

    if (!telegramId) {
      const { data: transaction, error } = await admin
        .from('payment_transactions')
        .select('external_user_id')
        .eq('provider', 'telegram_stars')
        .eq('external_id', subscription.telegramSubscriptionChargeId)
        .maybeSingle();

      if (error) throw error;

      const parsed = Number(transaction?.external_user_id ?? 0);
      if (Number.isSafeInteger(parsed) && parsed > 0) {
        telegramId = parsed;
      }
    }

    if (!telegramId) {
      return NextResponse.json(
        { ok: false, error: 'telegram_payer_not_found' },
        { status: 409 },
      );
    }

    const botToken = optionalServerSecret('TELEGRAM_BOT_TOKEN');

    if (!botToken) {
      return NextResponse.json(
        { ok: false, error: 'telegram_not_configured' },
        { status: 503 },
      );
    }

    const isCanceled = action === 'cancel';

    await editUserStarSubscription({
      botToken,
      userId: telegramId,
      telegramPaymentChargeId: subscription.telegramSubscriptionChargeId,
      isCanceled,
    });

    const now = new Date().toISOString();

    const { data: updated, error: updateError } = await admin
      .from('premium_subscriptions')
      .update({
        auto_renew: !isCanceled,
        auto_renew_cancelled_at: isCanceled ? now : null,
        updated_at: now,
      })
      .eq('id', subscription.id)
      .select(
        'id,user_id,plan,status,source,transaction_id,starts_at,ends_at,cancelled_at,auto_renew,auto_renew_cancelled_at,telegram_subscription_charge_id',
      )
      .single();

    if (updateError) throw updateError;

    return NextResponse.json({
      ok: true,
      subscription: {
        id: updated.id,
        userId: updated.user_id,
        plan: updated.plan,
        status: updated.status,
        source: updated.source,
        transactionId: updated.transaction_id,
        startsAt: updated.starts_at,
        endsAt: updated.ends_at,
        cancelledAt: updated.cancelled_at,
        autoRenew: updated.auto_renew,
        autoRenewCancelledAt: updated.auto_renew_cancelled_at,
        telegramSubscriptionChargeId: updated.telegram_subscription_charge_id,
      },
    });
  } catch (error) {
    console.error('[AnimeBox Premium] subscription management error:', error);

    return NextResponse.json(
      { ok: false, error: 'subscription_management_failed' },
      { status: 500 },
    );
  }
}
