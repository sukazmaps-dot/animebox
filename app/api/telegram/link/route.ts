import { optionalServerSecret } from '@/lib/env/server';
import { NextResponse } from 'next/server';

import {
  TELEGRAM_MINI_APP_AUTH_MAX_AGE_SECONDS,
  validateTelegramInitData,
} from '@/lib/telegram/validate-init-data';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { enforceIpRateLimit } from '@/lib/api-rate-limit';
import { readJsonBody } from '@/lib/community-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
) {
  try {
    const limited = await enforceIpRateLimit(request, {
      scope: 'tg_link_ip', limit: 20, windowSeconds: 60,
    });
    if (limited) return limited;

    const body = await readJsonBody(request);

    const initData =
      typeof body?.initData === 'string'
        ? body.initData
        : '';

    const accessToken =
      typeof body?.accessToken === 'string'
        ? body.accessToken
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

    if (!accessToken) {
      return NextResponse.json(
        {
          ok: false,
          error: 'animebox_login_required',
        },
        {
          status: 401,
        },
      );
    }

    /*
     * 1. Проверяем Telegram.
     */
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
        },
      );
    }

    /*
     * Telegram ID не берём из клиента.
     * Он получен только после проверки подписи.
     */
    const telegramId = String(
      telegramResult.user.id,
    );

    /*
     * 2. Проверяем Supabase access token.
     */
    const supabase =
      createSupabaseAdmin();

    const {
      data: userData,
      error: userError,
    } = await supabase.auth.getUser(
      accessToken,
    );

    const user = userData.user;

    if (
      userError ||
      !user
    ) {
      console.warn(
        '[Telegram Link] invalid Supabase session:',
        userError?.message,
      );

      return NextResponse.json(
        {
          ok: false,
          error: 'invalid_animebox_session',
        },
        {
          status: 401,
        },
      );
    }

    /*
     * 3. Получаем профиль текущего
     *    AnimeBox пользователя.
     */
    const {
      data: currentProfile,
      error: currentProfileError,
    } = await supabase
      .from('profiles')
      .select(
        'id, telegram_id, username, avatar_path',
      )
      .eq(
        'id',
        user.id,
      )
      .maybeSingle();

    if (currentProfileError) {
      console.error(
        '[Telegram Link] profile lookup error:',
        currentProfileError,
      );

      return NextResponse.json(
        {
          ok: false,
          error: 'profile_lookup_failed',
        },
        {
          status: 500,
        },
      );
    }

    if (!currentProfile) {
      return NextResponse.json(
        {
          ok: false,
          error: 'profile_not_found',
        },
        {
          status: 404,
        },
      );
    }

    /*
     * 4. Если этот AnimeBox аккаунт уже
     *    привязан к другому Telegram —
     *    ничего автоматически не заменяем.
     */
    if (
      currentProfile.telegram_id != null &&
      String(
        currentProfile.telegram_id,
      ) !== telegramId
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            'account_has_other_telegram',
        },
        {
          status: 409,
        },
      );
    }

    /*
     * 5. Проверяем, не используется ли
     *    Telegram ID другим AnimeBox аккаунтом.
     */
    const {
      data: telegramOwner,
      error: telegramOwnerError,
    } = await supabase
      .from('profiles')
      .select('id')
      .eq(
        'telegram_id',
        telegramId,
      )
      .maybeSingle();

    if (telegramOwnerError) {
      console.error(
        '[Telegram Link] Telegram owner lookup:',
        telegramOwnerError,
      );

      return NextResponse.json(
        {
          ok: false,
          error:
            'telegram_lookup_failed',
        },
        {
          status: 500,
        },
      );
    }

    if (
      telegramOwner &&
      telegramOwner.id !== user.id
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            'telegram_already_linked',
        },
        {
          status: 409,
        },
      );
    }

    /*
     * Уже привязан правильно.
     */
    if (
      currentProfile.telegram_id != null &&
      String(
        currentProfile.telegram_id,
      ) === telegramId
    ) {
      return NextResponse.json({
        ok: true,
        linked: true,
        alreadyLinked: true,
        profile: {
          id: currentProfile.id,
          username: currentProfile.username ?? null,
          avatar_path: currentProfile.avatar_path ?? null,
        },

        telegram: {
          id:
            telegramResult.user.id,

          username:
            telegramResult.user
              .username ?? null,

          first_name:
            telegramResult.user
              .first_name,
        },
      });
    }

    /*
     * 6. Выполняем привязку.
     */
    const {
      error: updateError,
    } = await supabase
      .from('profiles')
      .update({
        telegram_id:
          telegramId,
      })
      .eq(
        'id',
        user.id,
      );

    if (updateError) {
      console.error(
        '[Telegram Link] update failed:',
        updateError,
      );

      /*
       * На случай гонки двух запросов
       * UNIQUE constraint всё равно
       * защитит базу.
       */
      if (
        updateError.code === '23505'
      ) {
        return NextResponse.json(
          {
            ok: false,
            error:
              'telegram_already_linked',
          },
          {
            status: 409,
          },
        );
      }

      return NextResponse.json(
        {
          ok: false,
          error:
            'telegram_link_failed',
        },
        {
          status: 500,
        },
      );
    }

    console.log(
      '[Telegram Link] linked:',
      {
        userId: user.id,
        telegramId,
      },
    );

    return NextResponse.json({
      ok: true,
      linked: true,
      alreadyLinked: false,
      profile: {
        id: currentProfile.id,
        username: currentProfile.username ?? null,
        avatar_path: currentProfile.avatar_path ?? null,
      },

      telegram: {
        id:
          telegramResult.user.id,

        username:
          telegramResult.user
            .username ?? null,

        first_name:
          telegramResult.user
            .first_name,
      },
    });
  } catch (error) {
    console.error(
      '[Telegram Link] unexpected error:',
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