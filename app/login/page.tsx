'use client';

import {
  FormEvent,
  useState,
} from 'react';

import Link from 'next/link';

import GoogleAuthButton from '@/components/GoogleAuthButton';
import TelegramAuthButton from '@/components/TelegramAuthButton';
import { safeInternalPath } from '@/lib/browser-navigation';

import {
  createClient,
} from '@/lib/supabase/client';


export default function LoginPage() {
  const [nextPath] = useState(() =>
    safeInternalPath(
      typeof window === 'undefined'
        ? null
        : new URLSearchParams(window.location.search).get('next'),
      '/profile',
    ),
  );

  const [email, setEmail] =
    useState('');

  const [password, setPassword] =
    useState('');

  const [showPassword, setShowPassword] =
    useState(false);

  const [error, setError] =
    useState('');

  const [emailError, setEmailError] =
    useState('');

  const [passwordError, setPasswordError] =
    useState('');

  const [loading, setLoading] =
    useState(false);

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    setError('');
    setEmailError('');
    setPasswordError('');

    const cleanEmail =
      email.trim().toLowerCase();

    let hasError = false;

    if (!cleanEmail) {
      setEmailError(
        'Введите email.',
      );

      hasError = true;
    } else if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
        cleanEmail,
      )
    ) {
      setEmailError(
        'Введите корректный email, например name@example.com.',
      );

      hasError = true;
    }

    if (!password) {
      setPasswordError(
        'Введите пароль.',
      );

      hasError = true;
    }

    if (hasError) {
      return;
    }

    setLoading(true);

    const supabase =
      createClient();

    const {
      data,
      error: signInError,
    } =
      await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password,
      });

    if (signInError) {
      setError(
        'Неверный email или пароль.',
      );

      setLoading(false);

      return;
    }

    if (!data.session) {
      setError(
        'Не удалось создать сессию. Попробуй войти ещё раз.',
      );

      setLoading(false);

      return;
    }

    const {
      data: {
        session,
      },
    } =
      await supabase.auth.getSession();

    if (!session) {
      setError(
        'Сессия не сохранилась. Попробуй войти ещё раз.',
      );

      setLoading(false);

      return;
    }

    window.location.replace(nextPath);
  }

  return (
    <main className="auth-page">
      <div className="auth-card">
        <div className="auth-card__badge">
          ANIMEBOX ACCOUNT
        </div>

        <h1>
          С возвращением
        </h1>

        <p className="auth-card__subtitle">
          Войди, чтобы продолжить
          смотреть, сохранять аниме
          и отслеживать прогресс.
        </p>

        <div className="auth-social">
          <GoogleAuthButton
            label="Войти через Google"
            next={nextPath}
          />

          <TelegramAuthButton
            label="Войти через Telegram"
            next={nextPath}
            onError={(value) => {
              setError(value);
            }}
          />

          <div className="auth-divider">
            <span />

            <small>
              или войди через email
            </small>

            <span />
          </div>
        </div>

        <form
          onSubmit={handleSubmit}
          className="auth-form"
          noValidate
        >
          <label>
            <span>
              Email
            </span>

            <input
              type="email"
              value={email}
              onChange={(event) => {
                setEmail(
                  event.target.value,
                );

                if (emailError) {
                  setEmailError('');
                }
              }}
              className={
                emailError
                  ? 'auth-input--error'
                  : undefined
              }
              placeholder="name@example.com"
              autoComplete="email"
              aria-invalid={Boolean(emailError)}
              required
            />

            {emailError && (
              <span className="auth-field-error">
                <span
                  className="auth-field-error__icon"
                  aria-hidden="true"
                >
                  !
                </span>

                {emailError}
              </span>
            )}
          </label>

          <label>
            <div className="auth-form__label-row">
              <span>
                Пароль
              </span>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                }}
              >
                <Link
                  href="/auth/forgot-password"
                  className="auth-form__forgot"
                >
                  Забыли пароль?
                </Link>

                <button
                  type="button"
                  onClick={() =>
                    setShowPassword(
                      (current) =>
                        !current,
                    )
                  }
                >
                  {showPassword
                    ? 'Скрыть'
                    : 'Показать'}
                </button>
              </div>
            </div>

            <input
              type={
                showPassword
                  ? 'text'
                  : 'password'
              }
              value={password}
              onChange={(event) => {
                setPassword(
                  event.target.value,
                );

                if (passwordError) {
                  setPasswordError('');
                }
              }}
              className={
                passwordError
                  ? 'auth-input--error'
                  : undefined
              }
              placeholder="Введите пароль"
              autoComplete="current-password"
              aria-invalid={Boolean(passwordError)}
              required
            />

            {passwordError && (
              <span className="auth-field-error">
                <span
                  className="auth-field-error__icon"
                  aria-hidden="true"
                >
                  !
                </span>

                {passwordError}
              </span>
            )}
          </label>

          {error && (
            <div className="auth-form__error">
              {error}
            </div>
          )}

          <button
            type="submit"
            className="auth-form__submit"
            disabled={loading}
          >
            {loading
              ? 'Входим...'
              : 'Войти в AnimeBox'}
          </button>
        </form>

        <div className="auth-card__switch">
          Нет аккаунта?{' '}

          <Link href={nextPath === '/profile' ? '/register' : `/register?next=${encodeURIComponent(nextPath)}`}>
            Создать аккаунт
          </Link>
        </div>
      </div>
    </main>
  );
}