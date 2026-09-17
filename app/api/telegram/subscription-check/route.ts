import { NextResponse } from 'next/server';

import {
  checkRequiredTelegramMembership,
  TelegramMembershipError,
} from '@/lib/telegram/channel-membership';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function json(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: {
      'Cache-Control': 'private, no-store, max-age=0',
      Pragma: 'no-cache',
    },
  });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      initData?: unknown;
    };

    const initData =
      typeof body.initData === 'string'
        ? body.initData.trim()
        : '';

    if (!initData) {
      return json(
        {
          ok: false,
          error: 'missing_init_data',
        },
        400,
      );
    }

    const result =
      await checkRequiredTelegramMembership(initData);

    return json({
      ok: true,
      subscribed: result.subscribed,
      memberStatus: result.memberStatus,
      channelUrl: result.channelUrl,
    });
  } catch (error) {
    if (error instanceof TelegramMembershipError) {
      return json(
        {
          ok: false,
          error: error.code,
        },
        error.status,
      );
    }

    console.error('[Telegram subscription gate]', error);

    return json(
      {
        ok: false,
        error: 'telegram_membership_server_error',
      },
      500,
    );
  }
}
