'use client';

import Script from 'next/script';
import { useCallback, useRef, useState } from 'react';

import { createClient } from '@/lib/supabase/client';
import { markTelegramWelcomePending } from '@/lib/telegram-growth-client';

type GoogleAuthSuccess = {
  userId: string;
  needsOnboarding: boolean;
  created: boolean;
};

type GoogleAuthButtonProps = {
  label?: string;
  next?: string;
  navigateOnSuccess?: boolean;
  onSuccess?: (result: GoogleAuthSuccess) => void | Promise<void>;
};

type GoogleCredentialResponse = {
  credential?: string;
  select_by?: string;
};

type GoogleButtonText =
  | 'signin_with'
  | 'signup_with'
  | 'continue_with'
  | 'signin';

type GoogleAccountsId = {
  initialize: (config: {
    client_id: string;
    callback: (response: GoogleCredentialResponse) => void;
    nonce?: string;
    ux_mode?: 'popup' | 'redirect';
    use_fedcm_for_button?: boolean;
  }) => void;
  renderButton: (
    parent: HTMLElement,
    options: {
      type?: 'standard' | 'icon';
      theme?: 'outline' | 'filled_blue' | 'filled_black';
      size?: 'large' | 'medium' | 'small';
      text?: GoogleButtonText;
      shape?: 'rectangular' | 'pill' | 'circle' | 'square';
      logo_alignment?: 'left' | 'center';
      width?: number;
      locale?: string;
    },
  ) => void;
};

declare global {
  interface Window {
    google?: {
      accounts: {
        id: GoogleAccountsId;
      };
    };
  }
}

function createNonce() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const raw = String.fromCharCode(...bytes);
  return btoa(raw);
}

async function sha256Hex(value: string) {
  const data = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest('SHA-256', data);

  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export default function GoogleAuthButton({
  label = 'Продолжить через Google',
  next = '/profile',
  navigateOnSuccess = true,
  onSuccess,
}: GoogleAuthButtonProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const initializedRef = useRef(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const safeNext =
    next.startsWith('/') && !next.startsWith('//') ? next : '/profile';

  const finishGoogleLogin = useCallback(
    async (credential: string, nonce: string) => {
      setLoading(true);
      setError('');

      try {
        const supabase = createClient();
        const { error: signInError } = await supabase.auth.signInWithIdToken({
          provider: 'google',
          token: credential,
          nonce,
        });

        if (signInError) throw signInError;

        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError || !user) {
          throw userError ?? new Error('Google session was not created.');
        }

        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('username')
          .eq('id', user.id)
          .maybeSingle();

        if (profileError) throw profileError;

        const needsOnboarding = !profile?.username?.trim();
        const createdAt = Date.parse(user.created_at || '');
        const created =
          Number.isFinite(createdAt) &&
          Date.now() - createdAt >= 0 &&
          Date.now() - createdAt <= 2 * 60 * 1000;

        if (created) {
          markTelegramWelcomePending(user.id, 'google');
        }

        await onSuccess?.({
          userId: user.id,
          needsOnboarding,
          created,
        });

        if (!navigateOnSuccess) {
          setLoading(false);
          return;
        }

        window.location.replace(
          needsOnboarding
            ? `/onboarding?next=${encodeURIComponent(safeNext)}`
            : safeNext,
        );
      } catch (loginError) {
        console.error('Google ID token login failed:', loginError);
        setError('Не удалось войти через Google. Попробуй ещё раз.');
        setLoading(false);
      }
    },
    [navigateOnSuccess, onSuccess, safeNext],
  );

  const initializeGoogle = useCallback(async () => {
    if (initializedRef.current) return;

    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID?.trim();
    const google = window.google;
    const mount = mountRef.current;

    if (!clientId) {
      setError('Google-вход ещё не настроен.');
      return;
    }

    if (!google || !mount) {
      setError('Не удалось загрузить Google Sign-In. Обнови страницу.');
      return;
    }

    initializedRef.current = true;
    setError('');

    const nonce = createNonce();
    const hashedNonce = await sha256Hex(nonce);

    google.accounts.id.initialize({
      client_id: clientId,
      callback: (response) => {
        if (!response.credential) {
          setError('Google не вернул данные для входа. Попробуй ещё раз.');
          return;
        }

        void finishGoogleLogin(response.credential, nonce);
      },
      nonce: hashedNonce,
      ux_mode: 'popup',
      use_fedcm_for_button: true,
    });

    mount.replaceChildren();

    const width = Math.max(
      220,
      Math.min(520, Math.floor(mount.getBoundingClientRect().width || 520)),
    );

    const buttonText: GoogleButtonText = label
      .toLocaleLowerCase('ru-RU')
      .includes('войти')
      ? 'signin_with'
      : 'continue_with';

    // Keep Google's native button (so the identity flow stays direct and
    // branded as AnimeBox), but use the dark variant so it fits our UI.
    google.accounts.id.renderButton(mount, {
      type: 'standard',
      theme: 'filled_black',
      size: 'large',
      text: buttonText,
      shape: 'rectangular',
      logo_alignment: 'left',
      width,
      locale: 'ru',
    });
  }, [finishGoogleLogin, label]);

  return (
    <div>
      <Script
        src="https://accounts.google.com/gsi/client"
        strategy="afterInteractive"
        onReady={() => {
          void initializeGoogle();
        }}
        onError={() => {
          setError('Не удалось загрузить Google Sign-In. Обнови страницу.');
        }}
      />

      <div
        aria-busy={loading}
        style={{
          position: 'relative',
          width: '100%',
          borderRadius: 16,
          padding: 1,
          overflow: 'hidden',
          background:
            'linear-gradient(115deg, rgba(124, 92, 255, .65), rgba(255,255,255,.10), rgba(80, 132, 255, .35))',
          boxShadow:
            '0 12px 34px rgba(80, 60, 180, .20), inset 0 0 0 1px rgba(255,255,255,.03)',
          opacity: loading ? 0.68 : 1,
          pointerEvents: loading ? 'none' : 'auto',
          transition: 'opacity 160ms ease, transform 160ms ease',
        }}
      >
        <div
          ref={mountRef}
          style={{
            width: '100%',
            minHeight: 44,
            display: 'grid',
            placeItems: 'center',
            borderRadius: 15,
            overflow: 'hidden',
            background: '#0d1422',
          }}
        />
      </div>

      {loading && (
        <p className="google-auth-button__error" role="status">
          Входим через Google…
        </p>
      )}

      {error && (
        <p className="google-auth-button__error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
