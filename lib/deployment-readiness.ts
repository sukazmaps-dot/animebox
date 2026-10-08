export const RELIABILITY_VERSION = 'reliability-foundation-v1';
export type DeploymentEnv = Record<string, string | undefined>;
export type ConfigurationIssue = {
  code: string;
  service: string;
  severity: 'error' | 'warning';
  action: string;
};

function jwtRole(key: string): string | null {
  try {
    const payload = JSON.parse(atob(key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return typeof payload.role === 'string' ? payload.role : null;
  } catch { return null; }
}

export function deploymentRelease(env: DeploymentEnv = process.env) {
  const sha = env.RAILWAY_GIT_COMMIT_SHA || env.VERCEL_GIT_COMMIT_SHA || '';
  return { version: RELIABILITY_VERSION, sha: /^[a-f0-9]{40}$/i.test(sha) ? sha.toLowerCase() : null };
}

export function configurationIssues(env: DeploymentEnv = process.env): ConfigurationIssue[] {
  const issues: ConfigurationIssue[] = [];
  const value = (key: string) => env[key]?.trim() || '';
  const add = (code: string, service: string, severity: ConfigurationIssue['severity'], action: string) => {
    issues.push({ code, service, severity, action });
  };
  let validUrl = false;
  try {
    const url = new URL(value('NEXT_PUBLIC_SUPABASE_URL'));
    validUrl = url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash && url.pathname === '/';
  } catch { /* Missing/invalid URL uses the same safe code. */ }
  if (!validUrl) add('supabase_url_invalid', 'Supabase', 'error', 'Задайте корректный HTTPS NEXT_PUBLIC_SUPABASE_URL.');
  const publicKey = value('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY') || value('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  if (!(publicKey.startsWith('sb_publishable_') || jwtRole(publicKey) === 'anon')) {
    add('supabase_public_key_invalid', 'Supabase', 'error', 'Задайте публичный publishable/anon ключ Supabase; секретный ключ здесь запрещён.');
  }
  const serverKey = value('SUPABASE_SERVICE_ROLE_KEY');
  if (!(serverKey.startsWith('sb_secret_') || jwtRole(serverKey) === 'service_role')) {
    add('supabase_server_key_invalid', 'Supabase', 'error', 'Задайте серверный SUPABASE_SERVICE_ROLE_KEY.');
  }
  for (const key of ['SUPABASE_SERVICE_ROLE_KEY', 'TELEGRAM_BOT_TOKEN', 'TELEGRAM_WEBHOOK_SECRET', 'TELEGRAM_CLIENT_SECRET', 'GOOGLE_CLIENT_SECRET', 'CRON_SECRET', 'KODIK_TOKEN', 'DONATEPAY_API_TOKEN', 'ANIMEBOX_EDGE_ORIGIN_SECRET']) {
    if (value(`NEXT_PUBLIC_${key}`)) add(`public_secret_${key.toLowerCase()}`, 'Security', 'error', `Удалите NEXT_PUBLIC_${key}; секрет должен оставаться на сервере.`);
  }
  const site = value('NEXT_PUBLIC_SITE_URL');
  if (site && !['https://youranimebox.com', 'https://youranimebox.com/', 'https://www.youranimebox.com', 'https://www.youranimebox.com/'].includes(site)) {
    add('site_url_noncanonical', 'Site', 'error', 'Используйте канонический HTTPS домен в NEXT_PUBLIC_SITE_URL.');
  }
  const google = value('NEXT_PUBLIC_GOOGLE_CLIENT_ID') || value('GOOGLE_CLIENT_ID');
  if (!/^[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/.test(google)) add('google_client_id_invalid', 'Google', 'warning', 'Задайте Google Client ID и проверьте разрешённые origins в консоли Google.');
  const telegram = value('NEXT_PUBLIC_TELEGRAM_CLIENT_ID') || value('TELEGRAM_CLIENT_ID');
  if (!/^\d+$/.test(telegram) || !Number.isSafeInteger(Number(telegram)) || Number(telegram) < 1) add('telegram_client_id_invalid', 'Telegram', 'warning', 'Задайте числовой Telegram Client ID, не Client Secret.');
  const token = value('TELEGRAM_BOT_TOKEN');
  if (!/^\d+:[A-Za-z0-9_-]+$/.test(token)) add('telegram_bot_token_invalid', 'Telegram', 'warning', 'Проверьте серверный TELEGRAM_BOT_TOKEN в BotFather.');
  else if (telegram && token.split(':')[0] !== telegram) add('telegram_bot_id_mismatch', 'Telegram', 'warning', 'Сверьте Client ID и числовую часть токена: они должны относиться к одному боту.');
  if (!/^[A-Za-z0-9_-]{1,256}$/.test(value('TELEGRAM_WEBHOOK_SECRET'))) add('telegram_webhook_secret_invalid', 'Telegram', 'warning', 'Задайте TELEGRAM_WEBHOOK_SECRET: 1–256 символов A–Z, a–z, 0–9, _ или -.');
  if (!value('TELEGRAM_CLIENT_SECRET')) add('telegram_client_secret_missing', 'Telegram', 'warning', 'Задайте серверный TELEGRAM_CLIENT_SECRET для проверки входа.');
  for (const [key, service] of [['KODIK_TOKEN', 'Kodik'], ['CRON_SECRET', 'Cron'], ['ADMIN_OWNER_IDS', 'Admin']]) {
    if (!value(key)) add(`${key.toLowerCase()}_missing`, service, 'warning', `Задайте ${key} для соответствующей функции.`);
  }
  return issues;
}

export function deploymentReady(env: DeploymentEnv = process.env) {
  return !configurationIssues(env).some(issue => issue.severity === 'error');
}

/** Only these exact, read-only paths may bypass the production origin lock. */
export function isDeploymentHealthRequest(path: string, method: string) {
  return (method === 'GET' || method === 'HEAD') && (path === '/api/health' || path === '/api/health/ready');
}
