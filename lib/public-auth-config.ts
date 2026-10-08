export type PublicAuthConfig = {
  googleClientId: string | null;
  telegramClientId: string | null;
};

/** Explicit allowlist: never serialize environment variables or bot secrets. */
export function resolvePublicAuthConfig(env: Record<string, string | undefined>): PublicAuthConfig {
  const google = (env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || env.GOOGLE_CLIENT_ID)?.trim();
  const telegram = (env.NEXT_PUBLIC_TELEGRAM_CLIENT_ID || env.TELEGRAM_CLIENT_ID)?.trim();
  return {
    googleClientId: google || null,
    telegramClientId: telegram && /^\d+$/.test(telegram) &&
      Number.isSafeInteger(Number(telegram)) && Number(telegram) > 0 ? telegram : null,
  };
}

export async function loadPublicAuthConfig(): Promise<PublicAuthConfig> {
  const response = await fetch('/api/auth/config', {
    cache: 'no-store',
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error('Настройки входа временно недоступны. Попробуй ещё раз.');
  const data = await response.json();
  return resolvePublicAuthConfig({
    GOOGLE_CLIENT_ID: typeof data.googleClientId === 'string' ? data.googleClientId : undefined,
    TELEGRAM_CLIENT_ID: typeof data.telegramClientId === 'string' ? data.telegramClientId : undefined,
  });
}
