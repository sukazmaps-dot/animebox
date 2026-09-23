import { optionalServerSecret } from '@/lib/env/server';
import { NextResponse } from 'next/server';

import {
  TELEGRAM_MINI_APP_AUTH_MAX_AGE_SECONDS,
  validateTelegramInitData,
} from '@/lib/telegram/validate-init-data';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { enforceIpRateLimit } from '@/lib/api-rate-limit';
import { readBody } from '@/lib/community-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
) {
  try {
    const limited = await enforceIpRateLimit(request, {
      scope: 'tg_session_ip', limit: 30, windowSeconds: 60,
    });
    if (limited) return limited;

    const body = await readBody(request);

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
          headers: {
            'Cache-Control': 'no-store',
          },
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
          headers: {
            'Cache-Control': 'no-store',
          },
        },
      );
    }

    /*
     * Для входа используем более строгий срок:
     * initData не старше 5 минут.
     */
    const telegramResult =
      validateTelegramInitData(
        initData,
        botToken,
        TELEGRAM_MINI_APP_AUTH_MAX_AGE_SECONDS,
      );

    if (!telegramResult.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: 'invalid_telegram_data',
          reason: telegramResult.reason,
        },
        {
          status: 401,
          headers: {
            'Cache-Control': 'no-store',
          },
        },
      );
    }

    const telegramId =
      String(
        telegramResult.user.id,
      );

    const supabase =
      createSupabaseAdmin();

    /*
     * 1. Ищем AnimeBox профиль,
     *    который уже связан с Telegram.
     */
    const {
      data: profile,
      error: profileError,
    } = await supabase
      .from('profiles')
      .select('id, username, avatar_path')
      .eq(
        'telegram_id',
        telegramId,
      )
      .maybeSingle();

    if (profileError) {
      console.error(
        '[Telegram Session] profile lookup:',
        profileError,
      );

      return NextResponse.json(
        {
          ok: false,
          error: 'profile_lookup_failed',
        },
        {
          status: 500,
          headers: {
            'Cache-Control': 'no-store',
          },
        },
      );
    }

    /*
     * Telegram настоящий,
     * но ещё не привязан к AnimeBox.
     */
    if (!profile) {
      return NextResponse.json(
        {
          ok: false,
          error: 'telegram_not_linked',
        },
        {
          status: 404,
          headers: {
            'Cache-Control': 'no-store',
          },
        },
      );
    }

    /*
     * 2. Получаем Auth user
     *    только на сервере.
     */
    const {
      data: authUserData,
      error: authUserError,
    } =
      await supabase.auth.admin.getUserById(
        profile.id,
      );

    const authUser =
      authUserData.user;

    if (
      authUserError ||
      !authUser
    ) {
      console.error(
        '[Telegram Session] auth user:',
        authUserError,
      );

      return NextResponse.json(
        {
          ok: false,
          error: 'auth_user_not_found',
        },
        {
          status: 404,
          headers: {
            'Cache-Control': 'no-store',
          },
        },
      );
    }

    if (!authUser.email) {
      return NextResponse.json(
        {
          ok: false,
          error: 'auth_email_missing',
        },
        {
          status: 409,
          headers: {
            'Cache-Control': 'no-store',
          },
        },
      );
    }

    /*
     * 3. Генерируем одноразовый magic-link token.
     *
     * Письмо пользователю не отправляется:
     * generateLink только создаёт данные ссылки.
     */
    const {
      data: linkData,
      error: linkError,
    } =
      await supabase.auth.admin.generateLink({
        type: 'magiclink',
        email: authUser.email,
      });

    if (linkError) {
      console.error(
        '[Telegram Session] generateLink:',
        linkError,
      );

      return NextResponse.json(
        {
          ok: false,
          error: 'session_token_failed',
        },
        {
          status: 500,
          headers: {
            'Cache-Control': 'no-store',
          },
        },
      );
    }

    const tokenHash =
      linkData.properties
        ?.hashed_token;

    if (!tokenHash) {
      console.error(
        '[Telegram Session] missing hashed_token',
      );

      return NextResponse.json(
        {
          ok: false,
          error: 'session_token_missing',
        },
        {
          status: 500,
          headers: {
            'Cache-Control': 'no-store',
          },
        },
      );
    }

    return NextResponse.json(
      {
        ok: true,

        tokenHash,

        userId:
          profile.id,

        profile: {
          id: profile.id,
          username: profile.username ?? null,
          avatar_path: profile.avatar_path ?? null,
        },

        telegram: {
          id:
            telegramResult.user.id,

          username:
            telegramResult.user.username ??
            null,

          first_name:
            telegramResult.user.first_name,
        },
      },
      {
        headers: {
          'Cache-Control': 'no-store',
          Pragma: 'no-cache',
        },
      },
    );
  } catch (error) {
    console.error(
      '[Telegram Session] unexpected:',
      error,
    );

    return NextResponse.json(
      {
        ok: false,
        error: 'internal_error',
      },
      {
        status: 500,
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );
  }
}