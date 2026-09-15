import { NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);

  const code =
    requestUrl.searchParams.get('code');

  const requestedNext =
    requestUrl.searchParams.get('next');

  const safeNext =
    requestedNext &&
    requestedNext.startsWith('/') &&
    !requestedNext.startsWith('//')
      ? requestedNext
      : '/profile';

  if (!code) {
    return NextResponse.redirect(
      new URL(
        '/login?error=google-auth',
        requestUrl.origin,
      ),
    );
  }

  const supabase = await createClient();

  const { error } =
    await supabase.auth.exchangeCodeForSession(
      code,
    );

  if (error) {
    console.error(
      'OAuth callback error:',
      error,
    );

    return NextResponse.redirect(
      new URL(
        '/login?error=google-auth',
        requestUrl.origin,
      ),
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(
      new URL(
        '/login?error=google-auth',
        requestUrl.origin,
      ),
    );
  }

  const { data: profile } =
    await supabase
      .from('profiles')
      .select('username')
      .eq('id', user.id)
      .maybeSingle();

  /*
   * Новый Google-пользователь:
   * заставляем выбрать AnimeBox username.
   */
  if (!profile?.username?.trim()) {
    return NextResponse.redirect(
      new URL(
        '/onboarding',
        requestUrl.origin,
      ),
    );
  }

  /*
   * Старый пользователь:
   * сразу продолжаем вход.
   */
  return NextResponse.redirect(
    new URL(
      safeNext,
      requestUrl.origin,
    ),
  );
}