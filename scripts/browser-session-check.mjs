import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const failures = [];

function read(path) {
  const full = join(root, path);
  if (!existsSync(full)) {
    failures.push(`${path}: required file is missing.`);
    return '';
  }
  return readFileSync(full, 'utf8');
}

const navigation = read('lib/browser-navigation.ts');
const community = read('lib/community-server.ts');
const proxy = read('proxy.ts');
const nextConfig = read('next.config.ts');
const authTelegram = read('app/api/auth/telegram/route.ts');
const authTelegramNonce = read('app/api/auth/telegram/nonce/route.ts');

for (const [label, needle] of [
  ['URL parser', 'new URL(candidate, base)'],
  ['same-origin redirect check', 'parsed.origin !== base.origin'],
  ['redirect length cap', 'candidate.length > 1024'],
]) {
  if (!navigation.includes(needle)) {
    failures.push(`browser navigation: missing ${label}.`);
  }
}

for (const [label, needle] of [
  ['Origin validation', "request.headers.get('origin')"],
  ['Sec-Fetch-Site validation', "request.headers.get('sec-fetch-site')"],
  ['navigation-form rejection', "request.headers.get('sec-fetch-mode')"],
  ['JSON content-type gate', "contentType !== 'application/json'"],
  ['byte length enforcement', 'new TextEncoder().encode(raw).byteLength'],
]) {
  if (!community.includes(needle)) {
    failures.push(`browser mutation helper: missing ${label}.`);
  }
}

if (!proxy.includes("request.headers.get('sec-fetch-site') === 'cross-site'")) {
  failures.push('proxy.ts: Edge cross-site mutation guard is missing.');
}

const strictJsonRoutes = [
  'app/api/auth/telegram/route.ts',
  'app/api/telegram/register/route.ts',
  'app/api/telegram/session/route.ts',
  'app/api/telegram/validate/route.ts',
  'app/api/telegram/subscription-check/route.ts',
  'app/api/telegram/link/route.ts',
  'app/api/monetization/stars/invoice/route.ts',
  'app/api/premium/stars/invoice/route.ts',
  'app/api/premium/subscription/route.ts',
  'app/api/notifications/settings/route.ts',
  'app/api/notifications/subscription/route.ts',
  'app/api/analytics/monetization/route.ts',
  'app/api/analytics/product/route.ts',
];

for (const path of strictJsonRoutes) {
  const source = read(path);
  if (!source.includes('readJsonBody(')) {
    failures.push(`${path}: sensitive browser JSON route must use readJsonBody().`);
  }
  if (/request\.json\s*\(/.test(source)) {
    failures.push(`${path}: raw request.json() reintroduced.`);
  }
}

const guardedNoBodyRoutes = [
  'app/api/auth/telegram/nonce/route.ts',
  'app/api/telegram/nonce/route.ts',
  'app/api/notifications/test/route.ts',
  'app/api/premium/boosty/route.ts',
  'app/api/premium/studio/route.ts',
  'app/api/watch-party/rooms/[roomId]/end/route.ts',
];

for (const path of guardedNoBodyRoutes) {
  const source = read(path);
  if (!source.includes('assertBrowserMutationRequest(')) {
    failures.push(`${path}: browser mutation guard is missing.`);
  }
}

const redirectSurfaces = [
  'app/auth/callback/route.ts',
  'app/login/page.tsx',
  'app/register/page.tsx',
  'app/onboarding/page.tsx',
  'components/GoogleAuthButton.tsx',
  'components/TelegramAuthButton.tsx',
];

for (const path of redirectSurfaces) {
  if (!read(path).includes('safeInternalPath')) {
    failures.push(`${path}: shared internal redirect sanitizer is missing.`);
  }
}

for (const [label, needle] of [
  ['HttpOnly nonce', 'httpOnly: true'],
  ['Strict SameSite nonce', "sameSite: 'strict'"],
  ['narrow nonce path', "path: '/api/auth/telegram'"],
]) {
  if (!authTelegramNonce.includes(needle)) {
    failures.push(`Telegram nonce cookie: missing ${label}.`);
  }
}

if (
  !authTelegram.includes("path: '/api/auth/telegram'") ||
  !authTelegram.includes('maxAge: 0')
) {
  failures.push('Telegram auth: nonce is not expired on its exact cookie path.');
}

for (const [label, needle] of [
  ['OAuth-compatible COOP', "value: 'same-origin-allow-popups'"],
  ['auth no-store route', "'/auth/:path*'"],
]) {
  if (!nextConfig.includes(needle)) {
    failures.push(`next.config.ts: missing ${label}.`);
  }
}

if (failures.length) {
  console.error('\n[AnimeBox Browser & Session] Check failed:\n');
  for (const failure of failures) console.error(` - ${failure}`);
  console.error('');
  process.exit(1);
}

console.log('[AnimeBox Browser & Session] Browser/session invariants passed.');
