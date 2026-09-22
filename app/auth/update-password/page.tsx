'use client';

import {
  FormEvent,
  useEffect,
  useState,
} from 'react';

import { useRouter } from 'next/navigation';

import { createClient } from '@/lib/supabase/client';

export default function UpdatePasswordPage() {
  const router = useRouter();

  const [password, setPassword] =
    useState('');

  const [repeatPassword, setRepeatPassword] =
    useState('');

  const [loading, setLoading] =
    useState(false);

  const [checking, setChecking] =
    useState(true);

  const [validSession, setValidSession] =
    useState(false);

  const [error, setError] =
    useState('');

  const supabase = createClient();

  useEffect(() => {
    let active = true;

    async function check() {
      const currentUrl = new URL(window.location.href);
      const recoveryCode = currentUrl.searchParams.get('code');
      const recoveryTokenHash = currentUrl.searchParams.get('token_hash');
      const recoveryType = currentUrl.searchParams.get('type');

      try {
        if (recoveryCode) {
          const { error: exchangeError } =
            await supabase.auth.exchangeCodeForSession(
              recoveryCode,
            );

          if (exchangeError) {
            throw exchangeError;
          }

          currentUrl.searchParams.delete('code');
          window.history.replaceState(
            window.history.state,
            '',
            `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`,
          );
        } else if (
          recoveryTokenHash &&
          recoveryType === 'recovery'
        ) {
          const { error: verifyError } =
            await supabase.auth.verifyOtp({
              token_hash: recoveryTokenHash,
              type: 'recovery',
            });

          if (verifyError) {
            throw verifyError;
          }

          currentUrl.searchParams.delete('token_hash');
          currentUrl.searchParams.delete('type');
          window.history.replaceState(
            window.history.state,
            '',
            `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`,
          );
        }
      } catch (recoveryError) {
        console.error(
          '[Password Recovery Session]',
          recoveryError,
        );

        if (active) {
          setValidSession(false);
          setChecking(false);
        }
        return;
      }

      const {
        data: userData,
        error: userError,
      } = await supabase.auth.getUser();

      if (!active) return;

      if (!userError && userData.user) {
        setValidSession(true);
        setChecking(false);
        return;
      }

      const {
        data: sessionData,
      } = await supabase.auth.getSession();

      if (!active) return;

      setValidSession(Boolean(sessionData.session));
      setChecking(false);
    }

    void check();

    const {
      data: listener,
    } =
      supabase.auth.onAuthStateChange(
        (event, session) => {
          if (!active) return;

          if (
            event === 'PASSWORD_RECOVERY' ||
            session
          ) {
            setValidSession(true);
            setChecking(false);
          }
        },
      );

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, [supabase]);

  async function submit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    setError('');

    if (password.length < 8) {
      setError(
        'Пароль должен содержать минимум 8 символов.',
      );
      return;
    }

    if (password !== repeatPassword) {
      setError('Пароли не совпадают.');
      return;
    }

    setLoading(true);

    try {
      const {
        error,
      } =
        await supabase.auth.updateUser({
          password,
        });

      if (error) {
        throw error;
      }

      router.replace('/profile');
      router.refresh();
    } catch (error) {
      console.error(
        '[Update Password]',
        error,
      );

      setError(
        'Не удалось изменить пароль. Возможно, ссылка устарела.',
      );
    } finally {
      setLoading(false);
    }
  }

  if (checking) {
    return (
      <main className="flex min-h-[60vh] items-center justify-center text-sm text-white/50">
        Проверяем ссылку…
      </main>
    );
  }

  if (!validSession) {
    return (
      <main className="mx-auto flex min-h-[70vh] max-w-md items-center px-4">
        <section className="w-full rounded-2xl border border-white/10 bg-[#0b1220] p-6">
          <h1 className="text-xl font-bold text-white">
            Ссылка недействительна
          </h1>

          <p className="mt-2 text-sm text-white/50">
            Ссылка могла устареть, уже быть использована или открыться без recovery-сессии.
          </p>

          <button
            type="button"
            onClick={() =>
              router.push(
                '/auth/forgot-password',
              )
            }
            className="mt-5 rounded-xl bg-violet-600 px-4 py-3 text-sm font-semibold text-white"
          >
            Получить новую ссылку
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-[70vh] max-w-md items-center px-4">
      <section className="w-full rounded-2xl border border-white/10 bg-[#0b1220] p-6 shadow-2xl">
        <h1 className="text-2xl font-bold text-white">
          Новый пароль
        </h1>

        <p className="mt-2 text-sm text-white/55">
          Придумай новый пароль для AnimeBox.
        </p>

        <form
          onSubmit={submit}
          className="mt-6 space-y-4"
        >
          <input
            type="password"
            value={password}
            onChange={(event) =>
              setPassword(
                event.target.value,
              )
            }
            autoComplete="new-password"
            placeholder="Новый пароль"
            className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none focus:border-violet-500"
          />

          <input
            type="password"
            value={repeatPassword}
            onChange={(event) =>
              setRepeatPassword(
                event.target.value,
              )
            }
            autoComplete="new-password"
            placeholder="Повторите пароль"
            className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none focus:border-violet-500"
          />

          {error && (
            <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-300">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-violet-600 px-4 py-3 font-semibold text-white disabled:opacity-50"
          >
            {loading
              ? 'Сохраняем...'
              : 'Изменить пароль'}
          </button>
        </form>
      </section>
    </main>
  );
}