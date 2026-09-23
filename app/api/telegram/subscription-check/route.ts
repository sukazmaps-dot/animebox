import { NextResponse } from 'next/server';

import {
  checkRequiredTelegramMembership,
  TelegramMembershipError,
} from '@/lib/telegram/channel-membership';
import { TELEGRAM_CHANNEL_URL } from '@/lib/telegram-links';
import { enforceIpRateLimit } from '@/lib/api-rate-limit';
import { readBody } from '@/lib/community-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getChannelUrl() {
  return (
    process.env.TELEGRAM_CHANNEL_URL?.trim() ||
    TELEGRAM_CHANNEL_URL
  );
}

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
    const limited = await enforceIpRateLimit(request, {
      scope: 'tg_subscription_ip', limit: 60, windowSeconds: 60,
    });
    if (limited) return limited;

    const body = await readBody(request);

    const initData =
      typeof body.initData === 'string'
        ? body.initData.trim()
        : '';

    if (!initData) {
      return json(
        {
          ok: false,
          error: 'missing_init_data',
          channelUrl: getChannelUrl(),
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
          channelUrl: getChannelUrl(),
        },
        error.status,
      );
    }

    console.error('[Telegram subscription gate]', error);

    return json(
      {
        ok: false,
        error: 'telegram_membership_server_error',
        channelUrl: getChannelUrl(),
      },
      500,
    );
  }
}
