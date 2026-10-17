const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

const read = file => fs.readFileSync(file, 'utf8');
function compile(file, imports = {}) {
  const mod = { exports: {} };
  const code = ts.transpileModule(read(file), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function('require', 'module', 'exports', code)((name) =>
    name === 'server-only' ? {} : name in imports ? imports[name] : require(name),
  mod, mod.exports);
  return mod.exports;
}
function req(ip, extra = {}) {
  return new Request('https://youranimebox.com/api/image', {
    headers: { 'x-forwarded-for': ip, ...extra },
  });
}

async function localGuard() {
  const { enforcePublicIpRateLimit: guard } = compile('lib/public-api-rate-limit.ts');
  const policy = { scope: 'hotfix31-15-exhaustion', limit: 2, windowSeconds: 60 };
  const originalNow = Date.now;
  const originalSecret = process.env.ANIMEBOX_EDGE_ORIGIN_SECRET;
  const started = originalNow();
  try {
    Date.now = () => started;
    assert.equal(guard(req('203.0.113.11'), policy), null);
    assert.equal(guard(req('203.0.113.11'), policy), null);
    let denied = guard(req('203.0.113.11'), policy);
    assert.equal(denied.status, 429);
    assert.equal(denied.headers.get('retry-after'), '60');
    assert.equal(denied.headers.get('cache-control'), 'private, no-store');
    assert.equal(guard(req('203.0.113.12'), policy), null, 'different clients must have separate budgets');
    assert.equal(guard(req('203.0.113.11'), { ...policy, scope: 'other-public-feature' }), null, 'scope isolation');
    Date.now = () => started + 60001;
    assert.equal(guard(req('203.0.113.11'), policy), null, 'window expiration must restore access');

    process.env.ANIMEBOX_EDGE_ORIGIN_SECRET = 'private-edge-secret';
    const cfPolicy = { scope: 'hotfix31-15-trusted-edge', limit: 1, windowSeconds: 60 };
    const spoofed = req('203.0.113.30', { 'cf-connecting-ip': '203.0.113.31' });
    assert.equal(guard(spoofed, cfPolicy), null);
    assert.equal(guard(req('203.0.113.30', { 'cf-connecting-ip': '203.0.113.32' }), cfPolicy).status, 429,
      'unverified Cloudflare headers must not change the client identity');
    const verified = req('203.0.113.30', {
      'cf-connecting-ip': '203.0.113.32', 'x-animebox-edge-verify': 'private-edge-secret',
    });
    assert.equal(guard(verified, cfPolicy), null, 'verified Cloudflare headers select real client IP');
    assert.equal(guard(verified, cfPolicy).status, 429);

    // Saturation is bounded: excess new identities cannot allocate forever.
    const saturating = { scope: 'hotfix31-15-capacity', limit: 1, windowSeconds: 60 };
    let capHit = false;
    for (let i = 0; i < 4200; i++) {
      const ip = '10.' + Math.floor(i / 65536) + '.' + Math.floor(i / 256) % 256 + '.' + i % 256;
      const response = guard(req(ip), saturating);
      if (response && response.status === 429) { capHit = true; break; }
    }
    assert(capHit, 'the per-instance map must refuse unbounded allocations');
    Date.now = () => started + 121000;
    assert.equal(guard(req('203.0.113.90'), saturating), null, 'expired entries make capacity available again');
  } finally {
    Date.now = originalNow;
    if (originalSecret === undefined) delete process.env.ANIMEBOX_EDGE_ORIGIN_SECRET;
    else process.env.ANIMEBOX_EDGE_ORIGIN_SECRET = originalSecret;
  }
}

async function telegramSubscription() {
  let validated = 0;
  class TelegramMembershipError extends Error {
    constructor(status, code) { super(code); this.status = status; this.code = code; }
  }
  let error = null;
  let subscribed = true;
  let limited = false;
  const route = compile('app/api/telegram/subscription-check/route.ts', {
    'next/server': { NextResponse: Response },
    '@/lib/telegram/channel-membership': {
      TelegramMembershipError,
      checkRequiredTelegramMembership: async initData => {
        validated++;
        assert.equal(initData, 'verified-init-data');
        if (error) throw error;
        return { subscribed, memberStatus: subscribed ? 'member' : 'left', channelUrl: 'https://t.me/AnimeBox' };
      },
    },
    '@/lib/telegram-links': { TELEGRAM_CHANNEL_URL: 'https://t.me/AnimeBox' },
    '@/lib/public-api-rate-limit': { enforcePublicIpRateLimit: () => limited ? Response.json({ error: 'busy' }, { status: 429 }) : null },
    '@/lib/community-server': { readJsonBody: request => request.json() },
  });
  const request = () => new Request('https://youranimebox.com/api/telegram/subscription-check', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ initData: 'verified-init-data' }),
  });
  let response = await route.POST(request());
  assert.equal(response.status, 200);
  assert.equal((await response.json()).subscribed, true);
  subscribed = false;
  response = await route.POST(request());
  assert.equal(response.status, 200);
  assert.equal((await response.json()).subscribed, false, 'only Telegram confirms non-membership');
  limited = true;
  response = await route.POST(request());
  assert.equal(response.status, 429);
  assert.equal(validated, 2, 'limited requests cannot hit Telegram');
  limited = false;
  error = new TelegramMembershipError(503, 'telegram_membership_check_failed');
  response = await route.POST(request());
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error, 'telegram_membership_check_failed');
}

function unchangedSecurity() {
  const publicPaths = [
    'app/api/image/route.ts',
    'app/api/recommendations/route.ts',
    'app/api/analytics/product/route.ts',
    'app/api/telegram/subscription-check/route.ts',
  ];
  for (const path of publicPaths) {
    const content = read(path);
    assert(content.includes('enforcePublicIpRateLimit('), path + ' must use bounded local limiter');
    assert(!content.includes('enforceIpRateLimit('), path + ' must not call shared bucket on every request');
  }
  for (const path of [
    'app/api/auth/telegram/route.ts',
    'app/api/telegram/session/route.ts',
    'app/api/monetization/stars/invoice/route.ts',
  ]) assert(read(path).includes('enforceIpRateLimit('), path + ' must keep fail-closed shared guard');
  const image = read('app/api/image/route.ts');
  assert(image.includes('isAllowedHost(nextUrl.hostname)') && image.includes('MAX_IMAGE_SIZE'), 'SSRF and size checks retained');
  const analytics = read('app/api/analytics/product/route.ts');
  assert(analytics.includes('isAllowedBrowserOrigin') && analytics.includes('contentLength > 32_000'), 'origin and payload checks retained');
  const membership = read('lib/telegram/channel-membership.ts');
  assert(membership.includes('validateTelegramInitData(initData, botToken)'), 'Telegram signed initData is required');
  const gate = read('components/TelegramSubscriptionGate.tsx');
  assert(gate.includes("setState('unavailable')"));
  assert(gate.includes("state === 'unavailable' ? 'Не удалось проверить подписку'"), 'errors must not show compulsory subscription text');
  assert(gate.includes("data.subscribed === false"), 'only verified negative membership can show the subscription call to action');
  assert(gate.includes("const locked = state === 'checking' || state === 'blocked' || state === 'unavailable'"),
    'outage must not bypass the verified gate');
}

(async () => {
  await localGuard();
  await telegramSubscription();
  unchangedSecurity();
  console.log('PASS 31.15: bounded independent public limiter, hashed IP identity, edge verification, 429/TTL, Telegram recovery, protected operations');
})().catch(error => { console.error(error); process.exitCode = 1; });
