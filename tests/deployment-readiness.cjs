const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
function compile(file, imports = {}) {
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText)(name => imports[name] || {}, mod, mod.exports);
  return mod.exports;
}
const policy = compile('lib/deployment-readiness.ts');
const jwt = role => `e30.${Buffer.from(JSON.stringify({ role })).toString('base64url')}.signature`;
const valid = { NEXT_PUBLIC_SUPABASE_URL: 'https://project.supabase.co', NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
  SUPABASE_SERVICE_ROLE_KEY: jwt('service_role'), GOOGLE_CLIENT_ID: 'test.apps.googleusercontent.com', TELEGRAM_CLIENT_ID: '12345',
  TELEGRAM_BOT_TOKEN: '12345:test_token', TELEGRAM_WEBHOOK_SECRET: 'safe_secret', TELEGRAM_CLIENT_SECRET: 'private_oauth',
  KODIK_TOKEN: 'private_kodik', CRON_SECRET: 'private_cron', ADMIN_OWNER_IDS: 'owner' };
assert.equal(policy.deploymentReady(valid), true);
assert.deepEqual(policy.configurationIssues(valid), []);
for (const url of ['', 'http://project.supabase.co', 'https://user:pass@project.supabase.co', 'https://project.supabase.co?token=secret']) {
  assert.equal(policy.deploymentReady({ ...valid, NEXT_PUBLIC_SUPABASE_URL: url }), false);
}
for (const key of ['', jwt('anon'), 'sb_publishable_test']) assert.equal(policy.deploymentReady({ ...valid, SUPABASE_SERVICE_ROLE_KEY: key }), false);
for (const key of [jwt('service_role'), 'sb_secret_PRIVATE', 'invalid']) assert.equal(policy.deploymentReady({ ...valid, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: key }), false);
assert.equal(policy.deploymentReady({ ...valid, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: '', NEXT_PUBLIC_SUPABASE_ANON_KEY: jwt('anon') }), true);
assert.equal(policy.deploymentReady({ ...valid, GOOGLE_CLIENT_ID: '', TELEGRAM_CLIENT_ID: '' }), true, 'optional providers do not take down the site');
const exposed = { ...valid, ['NEXT_PUBLIC_' + 'TELEGRAM_CLIENT_SECRET']: 'NEVER_PRINT_ME' };
assert.equal(policy.deploymentReady(exposed), false);
assert.ok(!JSON.stringify(policy.configurationIssues(exposed)).includes('NEVER_PRINT_ME'));
assert.ok(policy.configurationIssues({ ...valid, TELEGRAM_CLIENT_ID: '999' }).some(x => x.code === 'telegram_bot_id_mismatch'));
assert.equal(policy.deploymentRelease({ RAILWAY_GIT_COMMIT_SHA: 'secret-value' }).sha, null);
const sha = 'a'.repeat(40);
assert.equal(policy.deploymentRelease({ RAILWAY_GIT_COMMIT_SHA: sha }).sha, sha);

const saved = { ...process.env };
try {
  for (const key of Object.keys(process.env)) if (/^(NEXT_PUBLIC_|SUPABASE_|TELEGRAM_|GOOGLE_|KODIK_|CRON_|ADMIN_)/.test(key)) delete process.env[key];
  Object.assign(process.env, valid, { NODE_ENV: 'production', ANIMEBOX_EDGE_ORIGIN_SECRET: 'edge' });
  delete process.env.VERCEL_ENV;
  const { GET } = compile('app/api/health/ready/route.ts', { '@/lib/deployment-readiness': policy });
  assert.equal(GET().status, 200);
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  assert.equal(GET().status, 503);
  GET().json().then(data => assert.deepEqual(Object.keys(data).sort(), ['ok', 'release', 'status']));
  const { proxy } = compile('proxy.ts', {
    '@/lib/deployment-readiness': policy,
    '@/lib/browser-request-origin': compile('lib/browser-request-origin.ts'),
    '@/lib/edge-cache-policy': { isPublicCacheableApiRequest: () => false },
    'next/server': { NextResponse: { next: () => new Response(null), json: (body, opts) => Response.json(body, opts) } },
  });
  const request = (path, method) => {
    const r = new Request(`http://localhost:8080${path}`, { method, headers: { host: 'healthcheck.railway.app' } });
    r.nextUrl = new URL(r.url); return r;
  };
  for (const path of ['/api/health', '/api/health/ready']) {
    for (const method of ['GET', 'HEAD']) assert.equal(proxy(request(path, method)).status, 200);
    assert.equal(proxy(request(path, 'POST')).status, 403);
  }
  for (const path of ['/api/health/ready/extra', '/api/admin/reliability', '/api/telegram/webhook']) assert.equal(proxy(request(path, 'GET')).status, 403);
} finally {
  for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
  Object.assign(process.env, saved);
}
console.log('PASS: configuration failures, secret boundaries, readiness status and narrowly scoped Railway health exemption');
