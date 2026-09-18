import { NextResponse } from 'next/server';

import { userClient } from '@/lib/community-server';
import { getPremiumPlan } from '@/lib/premium-catalog-server';
import { isPremiumPlanId } from '@/lib/premium';
import { getPremiumRecurringSubscription } from '@/lib/premium-server';
import { createPremiumInvoiceLink } from '@/lib/telegram-stars';
import { validateTelegramInitData } from '@/lib/telegram/validate-init-data';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const { user } = await userClient();
    const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim();

    if (!botToken) {
      return NextResponse.json(
        { ok: false, error: 'telegram_not_configured' },
        { status: 503 },
      );
    }

    const body = await request.json();
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

    if (plan.billingMode === 'recurring') {
      const existingRecurring = await getPremiumRecurringSubscription(user.id);

      if (existingRecurring) {
        return NextResponse.json(
          { ok: false, error: 'recurring_already_exists' },
          { status: 409 },
        );
      }
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
