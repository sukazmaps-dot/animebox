import {
  consumeRateLimit,
  enforceIpRateLimit,
  rateLimitResponse,
  rateLimitUnavailableResponse,
} from '@/lib/api-rate-limit';
import { ApiError, readJsonBody } from '@/lib/community-server';
import { usernamePolicyError } from '@/lib/auth-identity-policy';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: {
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

function normalizeEmail(value: unknown) {
  if (typeof value !== 'string') return '';
  return value.trim().toLowerCase();
}

function duplicateEmail(code?: string, message?: string) {
  return (
    code === 'user_already_exists' ||
    code === 'email_exists' ||
    /already registered|already exists|already been registered/i.test(message ?? '')
  );
}

export async function POST(request: Request) {
  try {
    const body = await readJsonBody(request, { maxBytes: 5_000 });
    const mode = body.mode === 'login' || body.mode === 'register' ? body.mode : null;
    const email = normalizeEmail(body.email);
    const password = typeof body.password === 'string' ? body.password : '';
    const username = typeof body.username === 'string' ? body.username.trim() : '';

    if (!mode) throw new ApiError(400, 'Некорректный режим авторизации.');
    if (
      !email ||
      email.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ) {
      throw new ApiError(400, 'Введите корректный email.');
    }
    if (!password || password.length > 128) {
      throw new ApiError(400, 'Введите корректный пароль.');
    }

    if (mode === 'register') {
      if (password.length < 8) {
        throw new ApiError(400, 'Пароль должен содержать минимум 8 символов.');
      }
      const usernameError = usernamePolicyError(username);
      if (usernameError) throw new ApiError(400, usernameError);
    }

    const ipLimited = await enforceIpRateLimit(
      request,
      mode === 'login'
        ? { scope: 'auth_email_login_ip', limit: 30, windowSeconds: 900 }
        : { scope: 'auth_email_signup_ip', limit: 8, windowSeconds: 3600 },
    );
    if (ipLimited) return ipLimited;

    try {
      const emailAllowed = await consumeRateLimit(
        `auth-email:${mode}:${email}`,
        mode === 'login'
          ? { scope: 'auth_email_login_identity', limit: 8, windowSeconds: 900 }
          : { scope: 'auth_email_signup_identity', limit: 3, windowSeconds: 3600 },
      );

      if (!emailAllowed) {
        return rateLimitResponse(
          mode === 'login' ? 900 : 3600,
          mode === 'login'
            ? 'Слишком много попыток входа. Попробуй позже.'
            : 'Слишком много попыток регистрации. Попробуй позже.',
        );
      }
    } catch (error) {
      console.error('[Auth security] identity rate limiter unavailable', error);
      return rateLimitUnavailableResponse();
    }

    const supabase = await createClient();

    if (mode === 'login') {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error || !data.user || !data.session) {
        return json({ error: 'Неверный email или пароль.' }, 401);
      }

      return json({
        ok: true,
        userId: data.user.id,
        needsEmailConfirmation: false,
      });
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { username },
      },
    });

    if (error) {
      if (duplicateEmail(error.code, error.message)) {
        return json({ error: 'Эта почта уже используется.' }, 409);
      }

      if (/USERNAME_RESERVED|Database error saving new user/i.test(error.message)) {
        return json(
          { error: 'Этот ник зарезервирован AnimeBox. Выбери другое имя.' },
          400,
        );
      }

      console.error('[Auth security] signup failed', {
        code: error.code,
        status: error.status,
      });
      return json({ error: 'Не удалось создать аккаунт. Попробуй позже.' }, 503);
    }

    return json({
      ok: true,
      userId: data.user?.id ?? null,
      needsEmailConfirmation: !data.session,
    });
  } catch (error) {
    if (error instanceof ApiError) {
      return json({ error: error.message }, error.status);
    }

    console.error('[Auth security] unexpected email auth error', error);
    return json({ error: 'Авторизация временно недоступна.' }, 503);
  }
}
