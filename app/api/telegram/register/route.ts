import {
  randomBytes,
} from 'node:crypto';

import { NextResponse } from 'next/server';

import {
  validateTelegramInitData,
} from '@/lib/telegram/validate-init-data';

import {
  createSupabaseAdmin,
} from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type TelegramUser = {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
};

function json(
  body: object,
  status = 200,
) {
  return NextResponse.json(
    body,
    {
      status,

      headers: {
        'Cache-Control': 'no-store',
        Pragma: 'no-cache',
      },
    },
  );
}

function makeUsername(
  user: TelegramUser,
) {
  /*
   * profiles.username у тебя должен
   * быть длиной 3–24 символа.
   */
  let value =
    user.username?.trim() ||
    user.first_name?.trim() ||
    `user${String(user.id).slice(-8)}`;

  value = value
    .replace(/^@/, '')
    .replace(
      /[^\p{L}\p{N}_. -]/gu,
      '',
    )
    .replace(/\s+/g, ' ')
    .trim();

  if (value.length < 3) {
    value =
      `user${String(user.id).slice(-8)}`;
  }

  return value.slice(
    0,
    24,
  );
}

export async function POST(
  request: Request,
) {
  try {
    const body =
      await request.json();

    const initData =
      typeof body?.initData === 'string'
        ? body.initData
        : '';

    if (!initData) {
      return json(
        {
          ok: false,
          error: 'initData_required',
        },
        400,
      );
    }

    const botToken =
      process.env
        .TELEGRAM_BOT_TOKEN
        ?.trim();

    if (!botToken) {
      return json(
        {
          ok: false,
          error:
            'telegram_not_configured',
        },
        500,
      );
    }

    /*
     * Для регистрации используем
     * свежий Telegram initData.
     */
    const telegramResult =
      validateTelegramInitData(
        initData,
        botToken,
        5 * 60,
      );

    if (!telegramResult.ok) {
      return json(
        {
          ok: false,
          error:
            'invalid_telegram_data',

          reason:
            telegramResult.reason,
        },
        401,
      );
    }

    const telegramUser =
      telegramResult.user;

    const telegramId =
      String(
        telegramUser.id,
      );

    const supabase =
      createSupabaseAdmin();

    /*
     * --------------------------------------------------
     * 1. Проверяем, вдруг аккаунт уже существует.
     *
     * Endpoint специально делаем idempotent:
     * второй запрос не создаст второго пользователя.
     * --------------------------------------------------
     */
    const {
      data: existingProfile,
      error: existingProfileError,
    } =
      await supabase
        .from('profiles')
        .select(
          'id, telegram_id',
        )
        .eq(
          'telegram_id',
          telegramId,
        )
        .maybeSingle();

    if (existingProfileError) {
      console.error(
        '[Telegram Register] profile lookup:',
        existingProfileError,
      );

      return json(
        {
          ok: false,
          error:
            'profile_lookup_failed',
        },
        500,
      );
    }

    /*
     * Общая функция:
     * создаём одноразовый token hash,
     * который frontend обменяет
     * на обычную Supabase session.
     */
    async function issueLoginToken(
      userId: string,
    ) {
      const {
        data: authData,
        error: authError,
      } =
        await supabase
          .auth
          .admin
          .getUserById(
            userId,
          );

      const authUser =
        authData.user;

      if (
        authError ||
        !authUser
      ) {
        console.error(
          '[Telegram Register] auth user:',
          authError,
        );

        return {
          ok: false as const,
          error:
            'auth_user_not_found',
        };
      }

      if (!authUser.email) {
        return {
          ok: false as const,
          error:
            'auth_email_missing',
        };
      }

      const {
        data: linkData,
        error: linkError,
      } =
        await supabase
          .auth
          .admin
          .generateLink({
            type: 'magiclink',

            email:
              authUser.email,
          });

      if (linkError) {
        console.error(
          '[Telegram Register] generateLink:',
          linkError,
        );

        return {
          ok: false as const,
          error:
            'session_token_failed',
        };
      }

      const tokenHash =
        linkData.properties
          ?.hashed_token;

      if (!tokenHash) {
        return {
          ok: false as const,
          error:
            'session_token_missing',
        };
      }

      return {
        ok: true as const,
        tokenHash,
      };
    }

    /*
     * Уже зарегистрирован через Telegram.
     * Просто выдаём login token.
     */
    if (existingProfile) {
      const login =
        await issueLoginToken(
          existingProfile.id,
        );

      if (!login.ok) {
        return json(
          {
            ok: false,
            error:
              login.error,
          },
          500,
        );
      }

      return json({
        ok: true,

        created: false,

        tokenHash:
          login.tokenHash,

        userId:
          existingProfile.id,
      });
    }

    /*
     * --------------------------------------------------
     * 2. Новый Telegram пользователь.
     *
     * Supabase Auth нужен email/phone identity.
     *
     * Для Telegram-only аккаунта используем
     * внутренний технический email.
     *
     * Он НЕ показывается пользователю
     * и НЕ используется для восстановления пароля.
     * --------------------------------------------------
     */
    const internalEmail =
      `tg-${telegramId}@telegram.animebox.invalid`;

    const randomPassword =
      randomBytes(48)
        .toString('base64url');

    const username =
      makeUsername(
        telegramUser,
      );

    const {
      data: createdData,
      error: createError,
    } =
      await supabase
        .auth
        .admin
        .createUser({
          email:
            internalEmail,

          password:
            randomPassword,

          email_confirm:
            true,

          user_metadata: {
            auth_source:
              'telegram',

            telegram_id:
              telegramId,

            telegram_username:
              telegramUser.username ??
              null,

            telegram_first_name:
              telegramUser.first_name,

            telegram_last_name:
              telegramUser.last_name ??
              null,
          },
        });

    const createdUser =
      createdData.user;

    if (
      createError ||
      !createdUser
    ) {
      console.error(
        '[Telegram Register] createUser:',
        createError,
      );

      /*
       * Возможно параллельный запрос
       * уже успел создать пользователя.
       * Ещё раз смотрим profile.
       */
      const {
        data: raceProfile,
      } =
        await supabase
          .from('profiles')
          .select('id')
          .eq(
            'telegram_id',
            telegramId,
          )
          .maybeSingle();

      if (raceProfile) {
        const login =
          await issueLoginToken(
            raceProfile.id,
          );

        if (login.ok) {
          return json({
            ok: true,
            created: false,
            tokenHash:
              login.tokenHash,
            userId:
              raceProfile.id,
          });
        }
      }

      return json(
        {
          ok: false,
          error:
            'telegram_registration_failed',
        },
        500,
      );
    }

    /*
     * --------------------------------------------------
     * 3. Создаём / обновляем profile.
     *
     * upsert используется специально:
     * если у тебя есть DB trigger,
     * который создаёт profile после auth.users,
     * мы его не сломаем.
     * --------------------------------------------------
     */
    const {
      error: profileError,
    } =
      await supabase
        .from('profiles')
        .upsert(
          {
            id:
              createdUser.id,

            username,

            telegram_id:
              telegramId,
          },
          {
            onConflict: 'id',
          },
        );

    if (profileError) {
      console.error(
        '[Telegram Register] profile create:',
        profileError,
      );

      /*
       * Не оставляем сиротский auth.users.
       */
      const {
        error: rollbackError,
      } =
        await supabase
          .auth
          .admin
          .deleteUser(
            createdUser.id,
          );

      if (rollbackError) {
        console.error(
          '[Telegram Register] rollback failed:',
          rollbackError,
        );
      }

      return json(
        {
          ok: false,
          error:
            'profile_creation_failed',
        },
        500,
      );
    }

    /*
     * --------------------------------------------------
     * 4. Сразу логиним нового пользователя.
     * --------------------------------------------------
     */
    const login =
      await issueLoginToken(
        createdUser.id,
      );

    if (!login.ok) {
      return json(
        {
          ok: false,
          error:
            login.error,
        },
        500,
      );
    }

    console.log(
      '[Telegram Register] created:',
      {
        userId:
          createdUser.id,

        telegramId,
      },
    );

    return json(
      {
        ok: true,

        created: true,

        tokenHash:
          login.tokenHash,

        userId:
          createdUser.id,

        profile: {
          username,
        },
      },
      201,
    );
  } catch (error) {
    console.error(
      '[Telegram Register] unexpected:',
      error,
    );

    return json(
      {
        ok: false,
        error:
          'internal_error',
      },
      500,
    );
  }
}