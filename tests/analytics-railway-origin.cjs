const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

function compile(path, imports = {}) {
  const mod = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function('require', 'exports', 'module', code)(name => {
    if (!(name in imports)) throw new Error(`Unexpected dependency: ${name}`);
    return imports[name];
  }, mod.exports, mod);
  return mod.exports;
}

const saved = { NODE_ENV: process.env.NODE_ENV, VERCEL_ENV: process.env.VERCEL_ENV };
const policy = compile('lib/browser-request-origin.ts');
let stored = [];
let limited = false;
let bodyReads = 0;
const dependencies = {
  '@/lib/browser-request-origin': policy,
  '@/lib/community-server': { readJsonBody: async request => { bodyReads++; return request.json(); } },
  '@/lib/supabase/server': { createClient: async () => ({ auth: { getUser: async () => ({ data: { user: null } }) } }) },
  '@/lib/api-rate-limit': { enforceIpRateLimit: async () => limited ? new Response(null, { status: 429 }) : null },
  '@/lib/product-events-server': {
    PRODUCT_CLIENT_EVENT_NAMES: ['telegram_promo_impression'],
    trackProductEvents: async events => { stored.push(...events); return true; },
  },
  '@/lib/monetization-events-server': {
    trackMonetizationEvents: async events => { stored.push(...events); return true; },
  },
};
function request(origin, body, headers = {}) {
  return new Request('http://localhost:8080/api/analytics/product', {
    method: 'POST', headers: { 'Content-Type': 'application/json',
      ...(origin ? { Origin: origin } : {}), ...headers }, body: JSON.stringify(body),
  });
}
async function main() {
  process.env.NODE_ENV = 'production';
  delete process.env.VERCEL_ENV;
  for (const name of ['product', 'monetization']) {
    const { POST } = compile(`app/api/analytics/${name}/route.ts`, dependencies);
    const body = { events: [{ eventName: name === 'product' ? 'telegram_promo_impression' : 'premium_page_view',
      eventId: 'event-valid-123', sessionId: 'session-valid-123', userId: 'forged-user' }] };
    for (const origin of ['https://youranimebox.com', 'https://www.youranimebox.com']) {
      stored = [];
      const response = await POST(request(origin, body));
      assert.equal(response.status, 200);
      assert.equal((await response.json()).accepted, 1);
      assert.equal(stored[0].userId, null, 'identity comes from auth, never client payload');
      assert.match(response.headers.get('cache-control'), /no-store/);
    }
    for (const origin of ['https://evil.example', 'http://youranimebox.com', 'null',
      'https://youranimebox.com.evil.example', 'https://youranimebox.com:8443']) {
      const before = bodyReads;
      assert.equal((await POST(request(origin, body, { 'x-forwarded-host': 'evil.example' }))).status, 403);
      assert.equal(bodyReads, before, 'untrusted requests cannot reach body parsing or storage');
    }
    assert.equal((await POST(request('https://youranimebox.com', body, { 'sec-fetch-site': 'cross-site' }))).status, 403);
    assert.equal((await POST(request('https://youranimebox.com', body, { 'content-length': '32001' }))).status, 413);
    assert.equal((await POST(request('https://youranimebox.com', { events: [{ eventName: 'unknown' }] }))).status, 200);
    if (name === 'product') {
      limited = true;
      assert.equal((await POST(request('https://youranimebox.com', body))).status, 429);
      limited = false;
    }
    process.env.VERCEL_ENV = 'preview';
    assert.equal((await POST(request('https://youranimebox.com', body))).status, 403);
    assert.equal((await POST(request('http://localhost:8080', body))).status, 200);
    delete process.env.VERCEL_ENV;
  }
  console.log('PASS: both analytics endpoints accept Railway canonical origins, reject forgery/cross-site, preserve limits and auth identity');
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => {
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
});
