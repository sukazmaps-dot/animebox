import { optionalServerSecret } from '@/lib/env/server';
import { NextResponse } from 'next/server';

import {
  TELEGRAM_STARS_ENABLED,
  isSupportStarAmount,
} from '@/lib/monetization';
import { createSupportInvoiceLink } from '@/lib/telegram-stars';
import { validateTelegramInitData } from '@/lib/telegram/validate-init-data';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    if (!TELEGRAM_STARS_ENABLED) {
      return NextResponse.json(
        {
          ok: false,
          error: 'stars_disabled',
        },
        {
          status: 503,
        },
      );
    }

    const botToken =
      optionalServerSecret('TELEGRAM_BOT_TOKEN');

    if (!botToken) {
      return NextResponse.json(
        {
          ok: false,
          error: 'telegram_not_configured',
        },
        {
          status: 500,
        },
      );
    }

    const body = await request.json();
    const amount = Number(body?.amount);

    if (!isSupportStarAmount(amount)) {
      return NextResponse.json(
        {
          ok: false,
          error: 'invalid_amount',
        },
        {
          status: 400,
        },
      );
    }

    const initData =
      typeof body?.initData === 'string'
        ? body.initData.trim()
        : '';

    let telegramId: number | null = null;

    if (initData) {
      const validation = validateTelegramInitData(
        initData,
        botToken,
        6 * 60 * 60,
      );

      if (!validation.ok) {
        return NextResponse.json(
          {
            ok: false,
            error: 'invalid_telegram_data',
            reason: validation.reason,
          },
          {
            status: 401,
          },
        );
      }

      telegramId = validation.user.id;
    }

    const invoice = await createSupportInvoiceLink({
      botToken,
      amount,
      telegramId,
    });

    return NextResponse.json({
      ok: true,
      invoiceUrl: invoice.invoiceUrl,
    });
  } catch (error) {
    console.error('[AnimeBox Stars] invoice error:', error);

    return NextResponse.json(
      {
        ok: false,
        error: 'invoice_failed',
      },
      {
        status: 500,
      },
    );
  }
}
