'use client';

import {
  FormEvent,
  useState,
} from 'react';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { createClient } from '@/lib/supabase/client';

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] =
    useState('');

  const [password, setPassword] =
    useState('');

  const [showPassword, setShowPassword] =
    useState(false);

  const [error, setError] =
    useState('');

  const [loading, setLoading] =
    useState(false);

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    setLoading(true);
    setError('');

    const supabase = createClient();

    const { error } =
      await supabase.auth.signInWithPassword({
        email,
        password,
      });

    if (error) {
      setError(
        'Неверный email или пароль.',
      );

      setLoading(false);
      return;
    }

    router.push('/profile');
    router.refresh();
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
          Войди, чтобы продолжить смотреть,
          сохранять аниме и отслеживать прогресс.
        </p>

        <form
          onSubmit={handleSubmit}
          className="auth-form"
        >
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
              placeholder="Введите пароль"
              autoComplete="current-password"
              required
            />
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
          Нет аккаунта?

          <Link href="/register">
            Создать аккаунт
          </Link>
        </div>
      </div>
    </main>
  );
}