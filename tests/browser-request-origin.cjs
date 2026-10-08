const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

function compile(path, imports = {}) {
  const mod = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function('require', 'exports', 'module', code)(name => imports[name] ?? {}, mod.exports, mod);
  return mod.exports;
}

const policy = compile('lib/browser-request-origin.ts');
const community = compile('lib/community-server.ts', { '@/lib/browser-request-origin': policy });
const { proxy } = compile('proxy.ts', {
  '@/lib/deployment-readiness': compile('lib/deployment-readiness.ts'),
  '@/lib/browser-request-origin': policy,
  '@/lib/edge-cache-policy': { isPublicCacheableApiRequest: () => false },
  'next/server': { NextResponse: {
    next: () => new Response(null, { status: 200 }),
    json: (data, options) => Response.json(data, options),
    redirect: (url, status) => Response.redirect(url, status),
  } },
});

const keys = ['NODE_ENV', 'VERCEL_ENV', 'ANIMEBOX_EDGE_ORIGIN_SECRET'];
const saved = Object.fromEntries(keys.map(key => [key, process.env[key]]));
function request(origin, extra = {}) {
  const r = new Request('http://localhost:8080/api/auth/telegram/nonce', {
    method: 'POST', headers: { host: 'youranimebox.com',
      ...(origin ? { origin } : {}), ...extra },
  });
  r.nextUrl = new URL(r.url);
  return r;
}

try {
  process.env.NODE_ENV = 'production';
  delete process.env.VERCEL_ENV;
  delete process.env.ANIMEBOX_EDGE_ORIGIN_SECRET;
  assert.equal(policy.isProductionDeployment(), true, 'Railway production must be detected');
  for (const origin of ['https://youranimebox.com', 'https://www.youranimebox.com']) {
    assert.equal(proxy(request(origin)).status, 200, 'public HTTPS origin must survive internal HTTP URL');
    assert.doesNotThrow(() => community.assertBrowserMutationRequest(request(origin)));
  }
  for (const origin of ['https://evil.example', 'http://youranimebox.com',
    'https://youranimebox.com.evil.example', 'https://youranimebox.com:8443',
    'https://user@youranimebox.com', 'https://youranimebox.com/path', 'null']) {
    assert.equal(proxy(request(origin)).status, 403, origin);
    assert.throws(() => community.assertBrowserMutationRequest(request(origin)), { status: 403 });
  }
  assert.equal(proxy(request('https://evil.example', {
    'x-forwarded-host': 'evil.example', 'x-forwarded-proto': 'https',
  })).status, 403, 'forwarded headers cannot grant origin trust');
  assert.equal(proxy(request('https://youranimebox.com', { 'sec-fetch-site': 'cross-site' })).status, 403);
  assert.throws(() => community.assertBrowserMutationRequest(request('https://youranimebox.com',
    { 'sec-fetch-site': 'cross-site' })), { status: 403 });
  assert.throws(() => community.assertBrowserMutationRequest(request('https://youranimebox.com',
    { 'sec-fetch-mode': 'navigate' })), { status: 403 });
  assert.equal(proxy(request(null)).status, 200, 'signed server webhooks without Origin retain their route checks');
  process.env.ANIMEBOX_EDGE_ORIGIN_SECRET = 'test-edge-secret';
  assert.equal(proxy(request('https://youranimebox.com')).status, 403);
  assert.equal(proxy(request('https://youranimebox.com', {
    'x-animebox-edge-verify': 'test-edge-secret',
  })).status, 200, 'configured edge secret must still be enforced');
  delete process.env.ANIMEBOX_EDGE_ORIGIN_SECRET;
  process.env.VERCEL_ENV = 'preview';
  assert.equal(policy.isProductionDeployment(), false, 'Vercel preview stays isolated');
  assert.equal(proxy(request('https://youranimebox.com')).status, 403);
  assert.equal(proxy(request('http://localhost:8080')).status, 200);
  delete process.env.VERCEL_ENV;
  process.env.NODE_ENV = 'development';
  assert.equal(proxy(request('http://localhost:8080')).status, 200);
  assert.equal(proxy(request('https://youranimebox.com')).status, 403);
  process.env.VERCEL_ENV = 'production';
  assert.equal(policy.isProductionDeployment(), true, 'Vercel production retains the canonical policy');
  console.log('Browser origin guards: Railway internal URL, canonical origins, CSRF, edge secret, preview and development passed.');
} finally {
  for (const key of keys) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
}
