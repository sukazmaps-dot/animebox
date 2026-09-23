'use client';

import {
  FormEvent,
  useEffect,
  useState,
} from 'react';

import { useRouter } from 'next/navigation';

import { safeInternalPath } from '@/lib/browser-navigation';
import { createClient } from '@/lib/supabase/client';
import { trackProductClientEvent } from '@/lib/product-events-client';


export default function OnboardingPage() {
  const router = useRouter();

  const [nextPath] = useState(() =>
    safeInternalPath(
      typeof window === 'undefined'
        ? null
        : new URLSearchParams(window.location.search).get('next'),
    ),
  );
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [error, setError] = useState('');

  useEffect(() => {
    trackProductClientEvent('onboarding_started', {
      source: 'web',
      path: '/onboarding',
    });

    const target = nextPath;
    const supabase = createClient();

    async function loadUser() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.replace('/login');
        return;
      }

      setEmail(user.email ?? '');

      const { data: profile } = await supabase
        .from('profiles')
        .select('username')
        .eq('id', user.id)
        .maybeSingle();

      /*
       * Если ник уже существует —
       * onboarding больше не нужен.
       */
      if (profile?.username?.trim()) {
        router.replace(target);
        return;
      }

      /*
       * Google может дать нам имя.
       * Используем только как предложение.
       */
      const suggestedName =
        user.user_metadata?.name ||
        user.user_metadata?.full_name ||
        user.email?.split('@')[0] ||
        '';

      setUsername(
        String(suggestedName)
          .trim()
          .slice(0, 24),
      );

      setLoading(false);
    }

    loadUser();
  }, [nextPath, router]);

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    const cleanUsername = username.trim();

    setError('');

    if (
      cleanUsername.length < 3 ||
      cleanUsername.length > 24
    ) {
      setError(
        'Ник должен содержать от 3 до 24 символов.',
      );

      return;
    }

    setSaving(true);

    try {
      const supabase = createClient();

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        throw new Error(
          'Не удалось определить пользователя.',
        );
      }

      /*
       * upsert работает и если profile уже
       * создал SQL trigger, и если его почему-то нет.
       */
      const { error: profileError } =
        await supabase
          .from('profiles')
          .upsert(
            {
              id: user.id,
              username: cleanUsername,
            },
            {
              onConflict: 'id',
            },
          );

      if (profileError) {
        if (profileError.code === '23505') {
          setError(
            'Этот ник уже занят. Попробуй другой.',
          );

          return;
        }

        throw profileError;
      }

      trackProductClientEvent('onboarding_completed', {
        source: 'web',
        path: '/onboarding',
        metadata: { usernameLength: cleanUsername.length },
        flush: true,
      });

      router.replace(nextPath);
      router.refresh();
    } catch (error) {
      console.error(error);

      setError(
        error instanceof Error
          ? error.message
          : 'Не удалось сохранить профиль.',
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <main className="auth-page">
        <div className="auth-card">
          <p className="auth-card__subtitle">
            Подготавливаем AnimeBox...
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="auth-page">
      <div className="auth-card onboarding-card">
        <div className="auth-card__badge">
          ДОБРО ПОЖАЛОВАТЬ В ANIMEBOX
        </div>

        <h1>
          Почти готово
        </h1>

        <p className="auth-card__subtitle">
          Выбери имя, под которым тебя будут видеть
          в AnimeBox.
        </p>

        <div className="onboarding-account">
          <div className="onboarding-account__avatar">
            {username
              ? username.charAt(0).toUpperCase()
              : '?'}
          </div>

          <div>
            <strong>
              Google подключён
            </strong>

            <span>
              {email}
            </span>
          </div>

          <div className="onboarding-account__check">
            ✓
          </div>
        </div>

        <form
          className="auth-form"
          onSubmit={handleSubmit}
        >
          <label>
            <div className="auth-form__label-row">
              <span>
                Имя пользователя
              </span>

              <small>
                {username.length}/24
              </small>
            </div>

            <input
              value={username}
              onChange={(event) =>
                setUsername(event.target.value)
              }
              minLength={3}
              maxLength={24}
              autoComplete="username"
              placeholder="Например: ghoul cat"
              autoFocus
              required
            />
          </label>

          <p className="onboarding-hint">
            Ник можно будет изменить позже в настройках
            профиля.
          </p>

          {error && (
            <div className="auth-form__error">
              {error}
            </div>
          )}

          <button
            type="submit"
            className="auth-form__submit"
            disabled={saving}
          >
            {saving
              ? 'Создаём профиль...'
              : 'Продолжить в AnimeBox'}
          </button>
        </form>
      </div>
    </main>
  );
}