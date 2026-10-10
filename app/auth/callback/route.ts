import { NextResponse } from 'next/server';

import { safeInternalPath } from '@/lib/browser-navigation';
import { authCallbackOrigin } from '@/lib/auth-callback-origin';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

function redirect(target: URL) {
  const response = NextResponse.redirect(target);
  response.headers.set('Cache-Control', 'private, no-store');
  response.headers.set('CDN-Cache-Control', 'no-store');
  return response;
}

function recoveryFailureUrl(origin: string) {
  const url = new URL('/auth/update-password', origin);
  url.searchParams.set('error', 'invalid_recovery');
  return url;
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const origin = authCallbackOrigin(request);
  const code = requestUrl.searchParams.get('code');
  const tokenHash = requestUrl.searchParams.get('token_hash');
  const type = requestUrl.searchParams.get('type');
  const intent = requestUrl.searchParams.get('intent');
  const recovery = intent === 'recovery' || type === 'recovery';

  const requestedNext = requestUrl.searchParams.get('next');
  const safeNext = recovery
    ? '/auth/update-password'
    : safeInternalPath(requestedNext, '/profile');

  const supabase = await createClient();

  if (code) {
    const { data, error } =
      await supabase.auth.exchangeCodeForSession(code);

    if (error || !data.session) {
      console.error(
        recovery
          ? 'Password recovery callback error:'
          : 'OAuth callback error:',
        error,
      );

      return redirect(
        recovery
          ? recoveryFailureUrl(origin)
          : new URL('/login?error=google-auth', origin),
      );
    }
  } else if (recovery && tokenHash) {
    const { data, error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: 'recovery',
    });

    if (error || !data.session) {
      console.error('Password recovery OTP error:', error);
      return redirect(
        recoveryFailureUrl(origin),
      );
    }
  } else {
    return redirect(
      recovery
        ? recoveryFailureUrl(origin)
        : new URL('/login?error=google-auth', origin),
    );
  }

  // Recovery links are account-access operations, not onboarding.
  // Once Supabase has written the authenticated recovery session cookie,
  // go straight to the password form.
  if (recovery) {
    return redirect(
      new URL(safeNext, origin),
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return redirect(
      new URL('/login?error=google-auth', origin),
    );
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('username')
    .eq('id', user.id)
    .maybeSingle();

  // Новый Google-пользователь должен сначала выбрать AnimeBox username.
  if (!profile?.username?.trim()) {
    const onboardingUrl = new URL('/onboarding', origin);
    onboardingUrl.searchParams.set('next', safeNext);
    return redirect(onboardingUrl);
  }

  return redirect(
    new URL(safeNext, origin),
  );
}
