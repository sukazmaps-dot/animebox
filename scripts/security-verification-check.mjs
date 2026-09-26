import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = process.cwd();
const apiRoot = join(root, 'app', 'api');
const failures = [];

function walkRoutes(dir) {
  if (!existsSync(dir)) return [];
  const files = [];

  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const stats = statSync(full);

    if (stats.isDirectory()) files.push(...walkRoutes(full));
    else if (name === 'route.ts') files.push(full);
  }

  return files;
}

function read(path) {
  const full = join(root, path);
  if (!existsSync(full)) {
    failures.push(`${path}: required file is missing.`);
    return '';
  }
  return readFileSync(full, 'utf8');
}

const routes = walkRoutes(apiRoot);
let mutationRoutes = 0;

const nextConfig = read('next.config.ts');
for (const [label, needle] of [
  ['CSP anti-framing header', "key: 'Content-Security-Policy'"],
  ['strict frame ancestor policy', 'value: "frame-ancestors \'none\';"'],
  ['legacy anti-framing header', "key: 'X-Frame-Options'"],
  ['legacy deny policy', "value: 'DENY'"],
  ['global security header scope', "{ source: '/:path*', headers: securityHeaders }"],
]) {
  if (!nextConfig.includes(needle)) {
    failures.push(`next.config.ts: missing ${label}.`);
  }
}

const edgeProxy = read('proxy.ts');
for (const [label, needle] of [
  ['unsafe browser mutation set', 'const UNSAFE_METHODS = new Set(['],
  ['cross-site fetch guard', "request.headers.get('sec-fetch-site') === 'cross-site'"],
  ['origin validation', 'allowedBrowserOrigin(request, origin)'],
  ['TRACE method block', "'TRACE'"],
  ['TRACK method block', "'TRACK'"],
  ['CONNECT method block', "'CONNECT'"],
]) {
  if (!edgeProxy.includes(needle)) {
    failures.push(`proxy.ts: missing ${label}.`);
  }
}


const cronRoutes = routes.filter((file) =>
  relative(root, file).replaceAll('\\', '/').startsWith('app/api/cron/'),
);

for (const file of cronRoutes) {
  const source = readFileSync(file, 'utf8');
  const name = relative(root, file).replaceAll('\\', '/');

  if (!source.includes('isCronAuthorized(')) {
    failures.push(`${name}: cron route is missing centralized cron authorization.`);
  }
}

for (const file of routes) {
  const source = readFileSync(file, 'utf8');
  const name = relative(root, file).replaceAll('\\', '/');
  const hasMutation =
    /export\s+async\s+function\s+(?:POST|PATCH|PUT|DELETE)\b/.test(source);

  if (!hasMutation) continue;
  mutationRoutes += 1;

  if (/request\.json\s*\(/.test(source)) {
    failures.push(`${name}: raw request.json() is not allowed on a mutation route.`);
  }

  if (name.startsWith('app/api/admin/')) {
    if (!source.includes('requireAdminMutation(')) {
      failures.push(`${name}: admin mutation is missing requireAdminMutation().`);
    }
    continue;
  }

  if (name.startsWith('app/api/cron/')) {
    continue;
  }

  if (name === 'app/api/telegram/webhook/route.ts') {
    if (!source.includes('secureServerSecretEqual(')) {
      failures.push(`${name}: webhook secret is not compared with the shared timing-safe helper.`);
    }
    if (!source.includes('readJsonBody(request, { maxBytes: 256_000 })')) {
      failures.push(`${name}: webhook body is not bounded.`);
    }
    continue;
  }

  const browserBoundary =
    source.includes('readBody(') ||
    source.includes('readJsonBody(') ||
    source.includes('assertBrowserMutationRequest(');

  const explicitNoOp =
    source.includes('new ApiError(') &&
    source.includes('410');

  if (!browserBoundary && !explicitNoOp) {
    failures.push(`${name}: mutation has no browser request boundary.`);
  }
}

const serverRequestAuth = read('lib/server-request-auth.ts');
for (const [label, needle] of [
  ['timing-safe comparison', 'timingSafeEqual'],
  ['guarded CRON_SECRET access', "optionalServerSecret('CRON_SECRET')"],
  ['central cron authorization', 'isCronAuthorized'],
]) {
  if (!serverRequestAuth.includes(needle)) {
    failures.push(`lib/server-request-auth.ts: missing ${label}.`);
  }
}

const profileMigration = read(
  'supabase/migrations/20260923104806_profile_server_managed_fields.sql',
);
for (const [label, needle] of [
  ['server-managed profile trigger', 'profiles_protect_server_managed_fields'],
  ['Telegram ID protection', 'new.telegram_id'],
  ['avatar path ownership constraint', 'profiles_avatar_path_owned'],
  ['banner path ownership constraint', 'profiles_banner_path_owned'],
]) {
  if (!profileMigration.includes(needle)) {
    failures.push(`profile integrity migration: missing ${label}.`);
  }
}

const metadataMigration = read(
  'supabase/migrations/20260923105539_profile_metadata_integrity.sql',
);
if (!metadataMigration.includes('new.created_at is distinct from old.created_at')) {
  failures.push('profile metadata migration: created_at integrity guard is missing.');
}

const commentRpcMigration = read(
  'supabase/migrations/20260923105741_episode_comment_rpc_hardening.sql',
);
for (const [label, needle] of [
  ['moderation restriction guard', 'COMMENT_RESTRICTED'],
  ['per-user serialization', 'pg_advisory_xact_lock'],
  ['anonymous RPC revoke', 'revoke all on function public.create_episode_comment'],
  ['authenticated-only execute grant', 'to authenticated'],
]) {
  if (!commentRpcMigration.includes(needle)) {
    failures.push(`episode comment RPC migration: missing ${label}.`);
  }
}

const legacyCommentRpcMigration = read(
  'supabase/migrations/20260923110330_legacy_comment_rpc_hardening.sql',
);

for (const [label, needle] of [
  ['moderation restriction guard', 'COMMENT_RESTRICTED'],
  ['per-user serialization', 'pg_advisory_xact_lock'],
  ['anonymous RPC revoke', 'revoke all on function public.create_comment'],
  ['authenticated-only execute grant', 'to authenticated'],
]) {
  if (!legacyCommentRpcMigration.includes(needle)) {
    failures.push(`legacy comment RPC migration: missing ${label}.`);
  }
}

for (const path of [
  'lib/public-profile-server.ts',
  'lib/public-avatar-server.ts',
]) {
  const source = read(path);
  if (!source.includes("/^https?:\\/\\//i.test(path)") || !source.includes('return null')) {
    failures.push(`${path}: external profile media URL rejection is missing.`);
  }
}

const watchRoute = read('app/api/watch/route.ts');
const watchServer = read('lib/watch-server.ts');
if (
  !watchRoute.includes("scope: 'watch_session_user'") ||
  !watchRoute.includes("action === 'start' || action === 'end'")
) {
  failures.push(
    'app/api/watch/route.ts: durable watch session lifecycle limiter is missing.',
  );
}
if (
  !watchServer.includes('MIN_HEARTBEAT_PERSIST_INTERVAL_MS = 2_000') ||
  !watchServer.includes('wallDelta < MIN_HEARTBEAT_PERSIST_INTERVAL_MS')
) {
  failures.push(
    'lib/watch-server.ts: server-owned heartbeat cadence guard is missing.',
  );
}

const premiumInvoice = read('app/api/premium/stars/invoice/route.ts');
if (!premiumInvoice.includes("scope: 'premium_invoice_user'")) {
  failures.push('Premium invoice route: authenticated invoice limiter is missing.');
}

const notificationTest = read('app/api/notifications/test/route.ts');
if (!notificationTest.includes("scope: 'notification_test_user'")) {
  failures.push('Notification test route: anti-spam limiter is missing.');
}

if (!routes.length) {
  failures.push('No API routes were found.');
}

if (failures.length) {
  console.error('\n[AnimeBox Security Verification] Check failed:\n');
  for (const failure of failures) console.error(` - ${failure}`);
  console.error('');
  process.exit(1);
}

console.log(
  `[AnimeBox Security Verification] ${routes.length} API routes / ${mutationRoutes} mutation routes / ${cronRoutes.length} cron routes passed static verification.`,
);
