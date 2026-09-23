import 'server-only';

export type ServerSecretName =
  | 'SUPABASE_SERVICE_ROLE_KEY'
  | 'TELEGRAM_BOT_TOKEN'
  | 'TELEGRAM_WEBHOOK_SECRET'
  | 'CRON_SECRET'
  | 'DONATEPAY_API_TOKEN';

function assertNotPublic(name: ServerSecretName) {
  const publicName = `NEXT_PUBLIC_${name}`;
  const exposed = process.env[publicName]?.trim();

  if (exposed) {
    throw new Error(
      `[AnimeBox Security] ${publicName} must never be configured. ` +
        `${name} is server-only.`,
    );
  }
}

export function optionalServerSecret(
  name: ServerSecretName,
): string | null {
  assertNotPublic(name);
  const value = process.env[name]?.trim();
  return value || null;
}

export function requireServerSecret(
  name: ServerSecretName,
): string {
  const value = optionalServerSecret(name);

  if (!value) {
    throw new Error(
      `[AnimeBox Security] ${name} is not configured.`,
    );
  }

  return value;
}
