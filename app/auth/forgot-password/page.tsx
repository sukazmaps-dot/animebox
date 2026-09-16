'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';

import { createClient } from '@/lib/supabase/client';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const supabase = createClient();

  async function submit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    const value = email.trim().toLowerCase();

    if (!value) {
      setError('Введите email.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const redirectTo =
        `${window.location.origin}/auth/update-password`;

      const { error } =
        await supabase.auth.resetPasswordForEmail(
          value,
          {
            redirectTo,
          },
        );

      if (error) {
        throw error;
      }

      /*
       * Не сообщаем, существует ли email.
       * Так безопаснее против перебора аккаунтов.
       */
      setSent(true);
    } catch (error) {
      console.error(
        '[Password Recovery]',
        error,
      );

      setError(
        'Не удалось отправить письмо. Попробуйте позже.',
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-[70vh] max-w-md items-center px-4">
      <section className="w-full rounded-2xl border border-white/10 bg-[#0b1220] p-6 shadow-2xl">
        <h1 className="text-2xl font-bold text-white">
          Восстановление пароля
        </h1>

        <p className="mt-2 text-sm text-white/55">
          Укажи email аккаунта AnimeBox.
          Мы отправим ссылку для смены пароля.
        </p>

        {sent ? (
          <div className="mt-6">
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm text-emerald-300">
              Если аккаунт с таким email существует,
              письмо для восстановления отправлено.
            </div>

            <Link
              href="/auth"
              className="mt-5 inline-block text-sm text-violet-400 hover:text-violet-300"
            >
              ← Вернуться ко входу
            </Link>
          </div>
        ) : (
          <form
            onSubmit={submit}
            className="mt-6 space-y-4"
          >
            <label className="block">
              <span className="mb-2 block text-sm text-white/70">
                Email
              </span>

              <input
                type="email"
                value={email}
                onChange={(event) =>
                  setEmail(event.target.value)
                }
                autoComplete="email"
                required
                placeholder="example@mail.com"
                className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none transition focus:border-violet-500"
              />
            </label>

            {error && (
              <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-300">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-violet-600 px-4 py-3 font-semibold text-white transition hover:bg-violet-500 disabled:opacity-50"
            >
              {loading
                ? 'Отправляем...'
                : 'Восстановить пароль'}
            </button>

            <Link
              href="/auth"
              className="block text-center text-sm text-white/45 hover:text-white"
            >
              Вернуться ко входу
            </Link>
          </form>
        )}
      </section>
    </main>
  );
}