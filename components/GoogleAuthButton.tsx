'use client';

import { useState } from 'react';

import { createClient } from '@/lib/supabase/client';

type GoogleAuthButtonProps = {
  label?: string;
  next?: string;
};

function GoogleMark() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      aria-hidden="true"
      focusable="false"
    >
      <path
        fill="#4285F4"
        d="M21.6 12.23c0-.71-.06-1.4-.2-2.07H12v3.92h5.37a4.59 4.59 0 0 1-1.99 3.01v2.54h3.22c1.88-1.73 3-4.29 3-7.4Z"
      />
      <path
        fill="#34A853"
        d="M12 22c2.7 0 4.96-.9 6.6-2.37l-3.22-2.54c-.9.6-2.04.96-3.38.96-2.6 0-4.8-1.75-5.59-4.11H3.08v2.62A9.98 9.98 0 0 0 12 22Z"
      />
      <path
        fill="#FBBC05"
        d="M6.41 13.94A6.02 6.02 0 0 1 6.1 12c0-.67.11-1.33.31-1.94V7.44H3.08A9.98 9.98 0 0 0 2 12c0 1.61.38 3.14 1.08 4.56l3.33-2.62Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.95c1.47 0 2.79.5 3.82 1.49l2.85-2.86A9.57 9.57 0 0 0 12 2a9.98 9.98 0 0 0-8.92 5.44l3.33 2.62C7.2 7.7 9.4 5.95 12 5.95Z"
      />
    </svg>
  );
}

export default function GoogleAuthButton({
  label = 'Продолжить через Google',
  next = '/profile',
}: GoogleAuthButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const safeNext =
    next.startsWith('/') && !next.startsWith('//') ? next : '/profile';

  async function startGoogleLogin() {
    if (loading) return;

    setLoading(true);
    setError('');

    try {
      const callbackUrl = new URL('/auth/callback', window.location.origin);
      callbackUrl.searchParams.set('next', safeNext);

      const supabase = createClient();
      const { data, error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: callbackUrl.toString(),
          skipBrowserRedirect: true,
        },
      });

      if (oauthError) throw oauthError;
      if (!data.url) throw new Error('google_oauth_url_missing');

      window.location.assign(data.url);
    } catch (loginError) {
      console.error('Google OAuth login failed:', loginError);
      setError('Не удалось открыть вход через Google. Попробуй ещё раз.');
      setLoading(false);
    }
  }

  return (
    <div className="google-auth-button-wrap">
      <button
        type="button"
        className="google-auth-button"
        onClick={() => void startGoogleLogin()}
        disabled={loading}
        aria-busy={loading}
      >
        <span className="google-auth-button__icon">
          <GoogleMark />
        </span>

        <span className="google-auth-button__label">
          {loading ? 'Открываем Google…' : label}
        </span>

        <span className="google-auth-button__arrow" aria-hidden="true">
          →
        </span>
      </button>

      {error && (
        <p className="google-auth-button__error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
