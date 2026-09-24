export type EmailAuthMode = 'login' | 'register';

export type EmailAuthResult = {
  ok: true;
  userId: string | null;
  needsEmailConfirmation: boolean;
};

export async function emailAuthRequest(input: {
  mode: EmailAuthMode;
  email: string;
  password: string;
  username?: string;
}): Promise<EmailAuthResult> {
  const response = await fetch('/api/auth/email', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    cache: 'no-store',
    body: JSON.stringify(input),
  });

  const payload = (await response.json().catch(() => ({}))) as {
    ok?: boolean;
    userId?: string | null;
    needsEmailConfirmation?: boolean;
    error?: string;
  };

  if (!response.ok || !payload.ok) {
    throw new Error(
      payload.error ||
        (input.mode === 'login'
          ? 'Не удалось войти в AnimeBox.'
          : 'Не удалось создать аккаунт.'),
    );
  }

  return {
    ok: true,
    userId: typeof payload.userId === 'string' ? payload.userId : null,
    needsEmailConfirmation: Boolean(payload.needsEmailConfirmation),
  };
}
