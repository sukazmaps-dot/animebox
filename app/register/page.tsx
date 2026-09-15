'use client';

import {
  FormEvent,
  useState,
} from 'react';
import GoogleAuthButton from '@/components/GoogleAuthButton';

import Link from 'next/link';

import { createClient } from '@/lib/supabase/client';

export default function RegisterPage() {
  const [username, setUsername] =
    useState('');

  const [email, setEmail] =
    useState('');

  const [password, setPassword] =
    useState('');

  const [confirmPassword, setConfirmPassword] =
    useState('');

  const [showPassword, setShowPassword] =
    useState(false);

  const [message, setMessage] =
    useState('');

  const [error, setError] =
    useState('');

  const [loading, setLoading] =
    useState(false);

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    setMessage('');
    setError('');

    const cleanUsername =
      username.trim();

    if (
      cleanUsername.length < 3 ||
      cleanUsername.length > 24
    ) {
      setError(
        'Ник должен содержать от 3 до 24 символов.',
      );

      return;
    }

    if (password.length < 6) {
      setError(
        'Пароль должен содержать минимум 6 символов.',
      );

      return;
    }

    if (password !== confirmPassword) {
      setError(
        'Пароли не совпадают.',
      );

      return;
    }

    setLoading(true);

    const supabase = createClient();

    const { error: signupError } =
      await supabase.auth.signUp({
        email,
        password,

        options: {
          data: {
            username:
              cleanUsername,
          },
        },
      });

    if (signupError) {
      if (
        signupError.message
          .toLowerCase()
          .includes('already')
      ) {
        setError(
          'Аккаунт с таким email уже существует.',
        );
      } else {
        setError(
          signupError.message,
        );
      }

      setLoading(false);
      return;
    }

    setMessage(
      'Мы отправили письмо с подтверждением. Проверь свою почту.',
    );

    setLoading(false);
  }

  return (
    <main className="auth-page">
      <div className="auth-card">
        <div className="auth-card__badge">
          JOIN ANIMEBOX
        </div>

        <h1>
          Создай аккаунт
        </h1>

        <p className="auth-card__subtitle">
          Сохраняй тайтлы, продолжай просмотр
          с любого устройства и собирай достижения.
        </p>
            
<div className="auth-social">
  <GoogleAuthButton />

  <div className="auth-divider">
    <span />
    <small>или зарегистрируйся через email</small>
    <span />
  </div>
</div>
        <form
          onSubmit={handleSubmit}
          className="auth-form"
        >
          <label>
            <span>
              Имя пользователя
            </span>

            <input
              value={username}
              onChange={(event) =>
                setUsername(
                  event.target.value,
                )
              }
              maxLength={24}
              placeholder="Например: ghoul cat"
              autoComplete="username"
              required
            />
          </label>

          <label>
            <span>Email</span>

            <input
              type="email"
              value={email}
              onChange={(event) =>
                setEmail(
                  event.target.value,
                )
              }
              placeholder="name@example.com"
              autoComplete="email"
              required
            />
          </label>

          <label>
            <div className="auth-form__label-row">
              <span>Пароль</span>

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

            <input
              type={
                showPassword
                  ? 'text'
                  : 'password'
              }
              value={password}
              onChange={(event) =>
                setPassword(
                  event.target.value,
                )
              }
              placeholder="Минимум 6 символов"
              autoComplete="new-password"
              minLength={6}
              required
            />
          </label>

          <label>
            <span>
              Повторите пароль
            </span>

            <input
              type={
                showPassword
                  ? 'text'
                  : 'password'
              }
              value={confirmPassword}
              onChange={(event) =>
                setConfirmPassword(
                  event.target.value,
                )
              }
              placeholder="Введите пароль ещё раз"
              autoComplete="new-password"
              required
            />
          </label>

          {error && (
            <div className="auth-form__error">
              {error}
            </div>
          )}

          {message && (
            <div className="auth-form__success">
              {message}
            </div>
          )}

          <button
            type="submit"
            className="auth-form__submit"
            disabled={loading}
          >
            {loading
              ? 'Создаём аккаунт...'
              : 'Создать аккаунт'}
          </button>
        </form>

        <div className="auth-card__switch">
          Уже есть аккаунт?

          <Link href="/login">
            Войти
          </Link>
        </div>
      </div>
    </main>
  );
}