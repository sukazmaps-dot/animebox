const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

function load(file, imports = {}) {
  const mod = { exports: {} };
  const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function('require', 'module', 'exports', js)((name) => {
    if (name === 'server-only') return {};
    if (Object.prototype.hasOwnProperty.call(imports, name)) return imports[name];
    if (name.startsWith('node:')) return require(name);
    throw new Error('Unexpected dependency on public-only test: ' + name);
  }, mod, mod.exports);
  return mod.exports;
}
const headers = (ip) => new Request('https://youranimebox.com/api/image', {
  headers: { 'x-forwarded-for': ip },
});
async function main() {
  const limiter = load('lib/public-api-rate-limit.ts');
  const nowFn = Date.now;
  try {
    let now = 1_000_000;
    Date.now = () => now;
    const p = { scope: 'public-test-31-15', limit: 2, windowSeconds: 30 };
    const userA = headers('203.0.113.101');
    const userB = headers('203.0.113.102');
    assert.equal(limiter.enforcePublicIpRateLimit(userA, p), null);
    assert.equal(limiter.enforcePublicIpRateLimit(userA, p), null);
    const denied = limiter.enforcePublicIpRateLimit(userA, p);
    assert.equal(denied.status, 429);
    assert.equal(denied.headers.get('retry-after'), '30');
    assert.equal(denied.headers.get('cache-control'), 'private, no-store');
    assert.equal(limiter.enforcePublicIpRateLimit(userB, p), null, 'different IP not blocked');
    assert.equal(limiter.enforcePublicIpRateLimit(userA, { ...p, scope: 'another-scope' }), null, 'independent scopes');
    now += 31_000;
    assert.equal(limiter.enforcePublicIpRateLimit(userA, p), null, 'window expires without external IO');

    // Fill the fixed-size map with unique identities, then prove it remains capped
    // and can recover after expiry. There is no database call and no stored raw IP.
    const big = { scope: 'capacity-test-31-15', limit: 1, windowSeconds: 60 };
    let capacityReached = false;
    for (let n = 0; n < 4_200; n++) {
      const ip = '10.' + ((n >> 16) & 255) + '.' + ((n >> 8) & 255) + '.' + (n & 255);
      const response = limiter.enforcePublicIpRateLimit(headers(ip), big);
      if (response) {
        assert.equal(response.status, 429);
        capacityReached = true;
        break;
      }
    }
    assert(capacityReached, 'memory pressure must not grow unbounded');
    now += 61_000;
    assert.equal(limiter.enforcePublicIpRateLimit(headers('192.0.2.122'), big), null, 'expired entries pruned');
  } finally { Date.now = nowFn; }

  const gateRoute = load('app/api/telegram/subscription-check/route.ts', {
    'next/server': { NextResponse: Response },
    '@/lib/telegram/channel-membership': {
      checkRequiredTelegramMembership: async () => ({ subscribed: true, memberStatus: 'member', channelUrl: 'https://t.me/example' }),
      TelegramMembershipError: class TelegramMembershipError extends Error {},
    },
    '@/lib/telegram-links': { TELEGRAM_CHANNEL_URL: 'https://t.me/example' },
    '@/lib/public-api-rate-limit': { enforcePublicIpRateLimit: () => null },
    '@/lib/community-server': { readJsonBody: async req => req.json() },
  });
  const checked = await gateRoute.POST(new Request('https://youranimebox.com/api/telegram/subscription-check', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ initData: 'signed-by-telegram' }),
  }));
  assert.equal(checked.status, 200);
  assert.equal((await checked.json()).subscribed, true, 'Telegram channel API remains accessible without DB');

  const gate = fs.readFileSync('components/TelegramSubscriptionGate.tsx', 'utf8');
  assert(gate.includes("'unavailable'"), 'network errors must have a distinct gate state');
  assert(gate.includes("data.subscribed === false"), 'only confirmed non-membership can claim user is not subscribed');
  assert(gate.includes('Повторить проверку'), 'outage must offer actionable retry');
  assert(gate.includes("document.documentElement.dataset.telegramSubscribed = 'unknown'"), 'outage must not overwrite confirmed membership');

  for (const name of [
    'app/api/image/route.ts',
    'app/api/recommendations/route.ts',
    'app/api/analytics/product/route.ts',
    'app/api/telegram/subscription-check/route.ts',
  ]) {
    const src = fs.readFileSync(name, 'utf8');
    assert(src.includes('enforcePublicIpRateLimit(request'), name + ': local guard absent');
    assert(!src.includes('consume_api_rate_bucket'), name + ': public route still coupled to RPC');
    assert(!src.includes("from '@/lib/api-rate-limit'"), name + ': public route should not import DB limiter');
  }
  for (const name of [
    'app/api/auth/telegram/route.ts',
    'app/api/monetization/stars/invoice/route.ts',
    'app/api/comments/route.ts',
  ]) {
    const src = fs.readFileSync(name, 'utf8');
    assert(src.includes("from '@/lib/api-rate-limit'"), name + ': sensitive guard must stay DB-backed');
  }
  console.log('PASS hotfix 31.15: DB-free bounded public guard, independent IP windows, finite memory, outage-safe Telegram gate, strict sensitive operations.');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
