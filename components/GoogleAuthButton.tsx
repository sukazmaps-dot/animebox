'use client';

import { useState } from 'react';

import { createClient } from '@/lib/supabase/client';

type GoogleAuthButtonProps = {
  label?: string;
  next?: string;
};

export default function GoogleAuthButton({
  label = 'Продолжить через Google',
  next = '/profile',
}: GoogleAuthButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleGoogleLogin() {
    setLoading(true);
    setError('');

    const safeNext =
      next.startsWith('/') && !next.startsWith('//') ? next : '/profile';

    const callbackUrl = new URL('/auth/callback', window.location.origin);
    callbackUrl.searchParams.set('next', safeNext);

    const supabase = createClient();
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: callbackUrl.toString(),
      },
    });

    if (oauthError) {
      console.error(oauthError);
      setError('Не удалось открыть вход через Google.');
      setLoading(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        className="google-auth-button"
        onClick={handleGoogleLogin}
        disabled={loading}
      >
        <span className="google-auth-button__icon">G</span>
        <span>{loading ? 'Открываем Google...' : label}</span>
      </button>

      {error && <p className="google-auth-button__error">{error}</p>}
    </div>
  );
}
