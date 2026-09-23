import { NextResponse } from 'next/server';
import { optionalServerSecret } from '@/lib/env/server';

import { readJsonBody, userClient } from '@/lib/community-server';
import { getPremiumPlan } from '@/lib/premium-catalog-server';
import { isPremiumPlanId } from '@/lib/premium';
import { getPremiumRecurringSubscription } from '@/lib/premium-server';
import { createPremiumInvoiceLink } from '@/lib/telegram-stars';
import { validateTelegramInitData } from '@/lib/telegram/validate-init-data';

import { enforceIpAndUserRateLimit } from '@/lib/api-rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const { user } = await userClient();
    const limited = await enforceIpAndUserRateLimit(request, user.id, {
      ip: { scope: 'premium_invoice_ip', limit: 30, windowSeconds: 60 },
      user: { scope: 'premium_invoice_user', limit: 15, windowSeconds: 60 },
    });
    if (limited) return limited;
    const botToken = optionalServerSecret('TELEGRAM_BOT_TOKEN');

    if (!botToken) {
      return NextResponse.json(
        { ok: false, error: 'telegram_not_configured' },
        { status: 503 },
      );
    }

    const body = await readJsonBody(request);
    const planId = typeof body?.plan === 'string' ? body.plan.trim() : '';

    if (!isPremiumPlanId(planId)) {
      return NextResponse.json(
        { ok: false, error: 'invalid_plan' },
        { status: 400 },
      );
    }

    const plan = await getPremiumPlan(planId);

    if (!plan?.active || !plan.telegramStarsAmount) {
      return NextResponse.json(
        { ok: false, error: 'plan_not_available' },
        { status: 409 },
      );
    }

    const existingRecurring = await getPremiumRecurringSubscription(user.id);

    if (plan.billingMode === 'recurring' && existingRecurring) {
      return NextResponse.json(
        { ok: false, error: 'recurring_already_exists' },
        { status: 409 },
      );
    }

    if (
      plan.id === 'yearly' &&
      existingRecurring?.autoRenew
    ) {
      return NextResponse.json(
        { ok: false, error: 'cancel_recurring_first' },
        { status: 409 },
      );
    }

    const initData = typeof body?.initData === 'string' ? body.initData.trim() : '';
    let telegramId: number | null = null;

    if (initData) {
      const validation = validateTelegramInitData(initData, botToken, 6 * 60 * 60);

      if (!validation.ok) {
        return NextResponse.json(
          { ok: false, error: 'invalid_telegram_data', reason: validation.reason },
          { status: 401 },
        );
      }

      telegramId = validation.user.id;
    }

    const invoice = await createPremiumInvoiceLink({
      botToken,
      plan: plan.id,
      productCode: plan.productCode,
      animeboxUserId: user.id,
      amount: plan.telegramStarsAmount,
      durationDays: plan.durationDays,
      telegramId,
    });

    return NextResponse.json({
      ok: true,
      invoiceUrl: invoice.invoiceUrl,
    });
  } catch (error) {
    console.error('[AnimeBox Premium] invoice error:', error);

    return NextResponse.json(
      { ok: false, error: 'invoice_failed' },
      { status: 500 },
    );
  }
}
