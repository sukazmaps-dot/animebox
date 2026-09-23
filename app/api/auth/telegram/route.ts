import {
  randomBytes,
} from 'node:crypto';

import {
  NextResponse,
} from 'next/server';

import {
  cookies,
} from 'next/headers';

import {
  createRemoteJWKSet,
  jwtVerify,
} from 'jose';

import {
  createSupabaseAdmin,
} from '@/lib/supabase/admin';
import { enforceIpRateLimit } from '@/lib/api-rate-limit';
import { readBody } from '@/lib/community-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TELEGRAM_ISSUER =
  'https://oauth.telegram.org';

const TELEGRAM_JWKS =
  createRemoteJWKSet(
    new URL(
      'https://oauth.telegram.org/.well-known/jwks.json',
    ),
  );

type TelegramClaims = {
  id?: number | string;
  name?: string;
  given_name?: string;
  family_name?: string;
  preferred_username?: string;
  picture?: string;
  nonce?: string;
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
        'Cache-Control':
          'no-store',

        Pragma:
          'no-cache',
      },
    },
  );
}

function makeUsername(
  claims: TelegramClaims,
  telegramId: string,
) {
  let value =
    claims.preferred_username?.trim() ||
    claims.given_name?.trim() ||
    claims.name?.trim() ||
    `user${telegramId.slice(-8)}`;

  value = value
    .replace(/^@/, '')
    .replace(
      /[^\p{L}\p{N}_. -]/gu,
      '',
    )
    .replace(/\s+/g, ' ')
    .trim();

  if (
    value.length < 3
  ) {
    value =
      `user${telegramId.slice(-8)}`;
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
    const limited = await enforceIpRateLimit(request, {
      scope: 'auth_tg_login_ip',
      limit: 20,
      windowSeconds: 60,
    });
    if (limited) return limited;

    const body = await readBody(request);

    const idToken =
      typeof body?.idToken ===
      'string'
        ? body.idToken
        : '';

    if (!idToken) {
      return json(
        {
          ok: false,
          error:
            'telegram_token_required',
        },
        400,
      );
    }

    const clientId =
      process.env
        .NEXT_PUBLIC_TELEGRAM_CLIENT_ID
        ?.trim();

    if (!clientId) {
      console.error(
        '[Telegram Web Auth] client id missing',
      );

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
     * Проверяем nonce, который
     * создали перед открытием Telegram.
     */
    const cookieStore =
      await cookies();

    const expectedNonce =
      cookieStore.get(
        'animebox_tg_nonce',
      )?.value;

    if (!expectedNonce) {
      return json(
        {
          ok: false,
          error:
            'telegram_nonce_missing',
        },
        401,
      );
    }

    /*
     * Криптографически проверяем
     * Telegram ID token.
     *
     * RS256 — стандартный алгоритм
     * Telegram Login по умолчанию.
     */
    let claims:
      TelegramClaims;

    try {
      const {
        payload,
      } =
        await jwtVerify(
          idToken,
          TELEGRAM_JWKS,
          {
            issuer:
              TELEGRAM_ISSUER,

            audience:
              clientId,

            algorithms: [
              'RS256',
            ],
          },
        );

      claims =
        payload as TelegramClaims;
    } catch (error) {
      console.error(
        '[Telegram Web Auth] JWT verification:',
        error,
      );

      return json(
        {
          ok: false,
          error:
            'invalid_telegram_token',
        },
        401,
      );
    }

    if (
      claims.nonce !==
      expectedNonce
    ) {
      return json(
        {
          ok: false,
          error:
            'invalid_telegram_nonce',
        },
        401,
      );
    }

    /*
     * Одноразовый nonce больше
     * использовать нельзя.
     */
    cookieStore.delete(
      'animebox_tg_nonce',
    );

    const rawTelegramId =
      claims.id;

    const telegramId =
      typeof rawTelegramId ===
      'number'
        ? String(
            rawTelegramId,
          )
        : typeof rawTelegramId ===
              'string' &&
            /^\d+$/.test(
              rawTelegramId,
            )
          ? rawTelegramId
          : '';

    if (!telegramId) {
      return json(
        {
          ok: false,
          error:
            'telegram_id_missing',
        },
        401,
      );
    }

    const supabase =
      createSupabaseAdmin();

    /*
     * Генерируем одноразовый
     * Supabase login token.
     */
    async function issueLoginToken(
      userId: string,
    ) {
      const {
        data:
          authUserData,

        error:
          authUserError,
      } =
        await supabase
          .auth
          .admin
          .getUserById(
            userId,
          );

      const authUser =
        authUserData.user;

      if (
        authUserError ||
        !authUser?.email
      ) {
        console.error(
          '[Telegram Web Auth] auth user:',
          authUserError,
        );

        return {
          ok: false as const,
          error:
            'auth_user_not_found',
        };
      }

      const {
        data:
          linkData,

        error:
          linkError,
      } =
        await supabase
          .auth
          .admin
          .generateLink({
            type:
              'magiclink',

            email:
              authUser.email,
          });

      if (linkError) {
        console.error(
          '[Telegram Web Auth] generateLink:',
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
     * ---------------------------------------
     * 1. Telegram уже связан с AnimeBox.
     * ---------------------------------------
     */
    const {
      data:
        existingProfile,

      error:
        profileLookupError,
    } =
      await supabase
        .from('profiles')
        .select(
          'id, username, avatar_path',
        )
        .eq(
          'telegram_id',
          telegramId,
        )
        .maybeSingle();

    if (
      profileLookupError
    ) {
      console.error(
        '[Telegram Web Auth] profile lookup:',
        profileLookupError,
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

    if (
      existingProfile
    ) {
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

        created:
          false,

        tokenHash:
          login.tokenHash,

        profile: {
          id:
            existingProfile.id,

          username:
            existingProfile.username,

          avatar_path:
            existingProfile.avatar_path ?? null,
        },
      });
    }

    /*
     * ---------------------------------------
     * 2. Новый Telegram пользователь.
     * Создаём AnimeBox аккаунт.
     * ---------------------------------------
     */
    const username =
      makeUsername(
        claims,
        telegramId,
      );

    /*
     * Технический email.
     * Пользователь его не вводит
     * и видеть его не должен.
     */
    const internalEmail =
      `telegram-${telegramId}@users.youranimebox.com`;

    const randomPassword =
      randomBytes(48)
        .toString(
          'base64url',
        );

    const {
      data:
        createdUserData,

      error:
        createUserError,
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
            username,

            auth_source:
              'telegram',

            telegram_id:
              telegramId,

            telegram_username:
              claims.preferred_username ??
              null,

            telegram_name:
              claims.name ??
              null,

            telegram_picture:
              claims.picture ??
              null,
          },
        });

    const createdUser =
      createdUserData.user;

    if (
      createUserError ||
      !createdUser
    ) {
      console.error(
        '[Telegram Web Auth] create user:',
        createUserError,
      );

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
     * Если у тебя уже есть trigger,
     * который создаёт profiles после
     * auth.users, upsert его не ломает.
     */
    const {
      error:
        createProfileError,
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
            onConflict:
              'id',
          },
        );

    if (
      createProfileError
    ) {
      console.error(
        '[Telegram Web Auth] create profile:',
        createProfileError,
      );

      /*
       * Не оставляем auth.users
       * без профиля.
       */
      await supabase
        .auth
        .admin
        .deleteUser(
          createdUser.id,
        );

      return json(
        {
          ok: false,
          error:
            'profile_creation_failed',
        },
        500,
      );
    }

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

    return json(
      {
        ok: true,

        created:
          true,

        tokenHash:
          login.tokenHash,

        profile: {
          id:
            createdUser.id,

          username,
          avatar_path: null,
        },
      },
      201,
    );
  } catch (error) {
    console.error(
      '[Telegram Web Auth] unexpected:',
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