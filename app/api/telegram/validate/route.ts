import { optionalServerSecret } from '@/lib/env/server';
import { NextResponse } from 'next/server';

import { validateTelegramInitData } from '@/lib/telegram/validate-init-data';
import { enforceIpRateLimit } from '@/lib/api-rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const limited = await enforceIpRateLimit(request, {
      scope: 'tg_validate_ip',
      limit: 60,
      windowSeconds: 60,
    });
    if (limited) return limited;

    const body = await request.json();

    const initData =
      typeof body?.initData === 'string'
        ? body.initData
        : '';

    if (!initData) {
      return NextResponse.json(
        {
          ok: false,
          error: 'initData_required',
        },
        {
          status: 400,
        },
      );
    }

    const botToken =
      optionalServerSecret('TELEGRAM_BOT_TOKEN');

    if (!botToken) {
      console.error(
        '[Telegram] TELEGRAM_BOT_TOKEN is missing',
      );

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

    const result =
      validateTelegramInitData(
        initData,
        botToken,
      );

    if (!result.ok) {
      console.error(
        '[Telegram] initData rejected:',
        result.reason,
      );

      return NextResponse.json(
        {
          ok: false,
          error: 'invalid_telegram_data',
          reason: result.reason,
        },
        {
          status: 401,
        },
      );
    }

    console.log(
      '[Telegram] verified user:',
      result.user.id,
    );

    return NextResponse.json({
      ok: true,

      user: {
        id: result.user.id,
        first_name:
          result.user.first_name,

        last_name:
          result.user.last_name ?? null,

        username:
          result.user.username ?? null,

        language_code:
          result.user.language_code ?? null,

        photo_url:
          result.user.photo_url ?? null,

        is_premium:
          result.user.is_premium ?? false,
      },

      authDate: result.authDate,
    });
  } catch (error) {
    console.error(
      '[Telegram] validation endpoint error:',
      error,
    );

    return NextResponse.json(
      {
        ok: false,
        error: 'internal_error',
      },
      {
        status: 500,
      },
    );
  }
}