import { NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';

function safePath(value: string | null, fallback: string) {
  return (
    value &&
    value.startsWith('/') &&
    !value.startsWith('//')
  )
    ? value
    : fallback;
}

function recoveryFailureUrl(origin: string) {
  const url = new URL('/auth/update-password', origin);
  url.searchParams.set('error', 'invalid_recovery');
  return url;
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const tokenHash = requestUrl.searchParams.get('token_hash');
  const type = requestUrl.searchParams.get('type');
  const intent = requestUrl.searchParams.get('intent');
  const recovery = intent === 'recovery' || type === 'recovery';

  const requestedNext = requestUrl.searchParams.get('next');
  const safeNext = recovery
    ? '/auth/update-password'
    : safePath(requestedNext, '/profile');

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

      return NextResponse.redirect(
        recovery
          ? recoveryFailureUrl(requestUrl.origin)
          : new URL('/login?error=google-auth', requestUrl.origin),
      );
    }
  } else if (recovery && tokenHash) {
    const { data, error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: 'recovery',
    });

    if (error || !data.session) {
      console.error('Password recovery OTP error:', error);
      return NextResponse.redirect(
        recoveryFailureUrl(requestUrl.origin),
      );
    }
  } else {
    return NextResponse.redirect(
      recovery
        ? recoveryFailureUrl(requestUrl.origin)
        : new URL('/login?error=google-auth', requestUrl.origin),
    );
  }

  // Recovery links are account-access operations, not onboarding.
  // Once Supabase has written the authenticated recovery session cookie,
  // go straight to the password form.
  if (recovery) {
    return NextResponse.redirect(
      new URL(safeNext, requestUrl.origin),
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(
      new URL('/login?error=google-auth', requestUrl.origin),
    );
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('username')
    .eq('id', user.id)
    .maybeSingle();

  // Новый Google-пользователь должен сначала выбрать AnimeBox username.
  if (!profile?.username?.trim()) {
    const onboardingUrl = new URL('/onboarding', requestUrl.origin);
    onboardingUrl.searchParams.set('next', safeNext);
    return NextResponse.redirect(onboardingUrl);
  }

  return NextResponse.redirect(
    new URL(safeNext, requestUrl.origin),
  );
}
