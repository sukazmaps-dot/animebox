import {
  ApiError,
  assertBrowserMutationRequest,
  failure,
  response,
  userClient,
} from '@/lib/community-server';
import {
  createTelegramAccountLink,
  getTelegramAccountLinkStatus,
  unlinkTelegramAccount,
} from '@/lib/telegram-account-link';
import {
  enforceIpAndUserRateLimit,
  enforceUserRateLimit,
} from '@/lib/api-rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { user } = await userClient();

    const limited = await enforceUserRateLimit(user.id, {
      scope: 'telegram_account_link_status',
      limit: 60,
      windowSeconds: 60,
    });
    if (limited) return limited;

    const status = await getTelegramAccountLinkStatus(user.id);

    return response({ ok: true, ...status });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request) {
  try {
    assertBrowserMutationRequest(request);

    const { user } = await userClient();

    const limited = await enforceIpAndUserRateLimit(request, user.id, {
      ip: {
        scope: 'telegram_account_link_start_ip',
        limit: 20,
        windowSeconds: 60,
      },
      user: {
        scope: 'telegram_account_link_start_user',
        limit: 6,
        windowSeconds: 60,
      },
    });
    if (limited) return limited;

    const link = await createTelegramAccountLink(user.id);

    return response({ ok: true, ...link });
  } catch (error) {
    const code =
      typeof error === 'object' && error && 'message' in error
        ? String(error.message)
        : '';

    if (code === 'profile_not_found') {
      return response({ ok: false, error: 'profile_not_found' }, 404);
    }

    return failure(error);
  }
}

export async function DELETE(request: Request) {
  try {
    assertBrowserMutationRequest(request);

    const { user } = await userClient();

    const limited = await enforceIpAndUserRateLimit(request, user.id, {
      ip: {
        scope: 'telegram_account_unlink_ip',
        limit: 20,
        windowSeconds: 60,
      },
      user: {
        scope: 'telegram_account_unlink_user',
        limit: 4,
        windowSeconds: 60,
      },
    });
    if (limited) return limited;

    const result = await unlinkTelegramAccount(user.id);

    if (!result.ok && result.error === 'telegram_only_account') {
      throw new ApiError(
        409,
        'Telegram нельзя отвязать от аккаунта, созданного только через Telegram. Сначала добавь другой способ входа.',
      );
    }

    return response({ ok: true, linked: false });
  } catch (error) {
    return failure(error);
  }
}
