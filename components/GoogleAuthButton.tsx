'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function GoogleAuthButton() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleGoogleLogin() {
    setLoading(true);
    setError('');

    const supabase = createClient();

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',

      options: {
        redirectTo:
          `${window.location.origin}/auth/callback?next=/profile`,
      },
    });

    if (error) {
      console.error(error);
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
        <span className="google-auth-button__icon">
          G
        </span>

        <span>
          {loading
            ? 'Открываем Google...'
            : 'Продолжить через Google'}
        </span>
      </button>

      {error && (
        <p className="google-auth-button__error">
          {error}
        </p>
      )}
    </div>
  );
}