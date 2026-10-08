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
const originalFetch = global.fetch;
const readiness = compile('lib/deployment-readiness.ts');
const network = compile('lib/reliability-network.ts');
let pending = 0;
const telegram = { getTelegramWebhookStatus: async () => ({ tokenConfigured: true, secretValid: true, urlMatches: true,
  requiredUpdatesEnabled: true, pendingUpdates: pending, lastErrorAt: '2020-01-01T00:00:00Z' }) };
const server = compile('lib/reliability-server.ts', { '@/lib/deployment-readiness': readiness, '@/lib/reliability-network': network, '@/lib/telegram-webhook-server': telegram });
async function main() {
  const env = { NEXT_PUBLIC_SUPABASE_URL: 'https://project.supabase.co', NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test', SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_NEVER_PRINT', KODIK_TOKEN: 'KODIK_NEVER_PRINT' };
  global.fetch = async url => {
    if (String(url).includes('/auth/')) throw new Error('https://private.test?token=NEVER_PRINT');
    if (String(url).includes('/rest/')) return Response.json([]);
    return Response.json({ results: [{ link: '//kodik.info/video/test' }] });
  };
  const result = await server.collectReliabilitySnapshot(env);
  assert.equal(result.probes.find(p => p.service === 'Supabase Auth').state, 'unavailable');
  for (const service of ['Supabase Database', 'Kodik', 'Telegram']) assert.equal(result.probes.find(p => p.service === service).state, 'healthy');
  assert.ok(!JSON.stringify(result).includes('NEVER_PRINT'));
  global.fetch = async () => { throw new DOMException('private URL NEVER_PRINT', 'TimeoutError'); };
  const timeout = await server.collectReliabilitySnapshot(env);
  assert.equal(timeout.probes.find(p => p.service === 'Supabase Auth').code, 'dependency_timeout');
  assert.equal(timeout.probes.find(p => p.service === 'Telegram').state, 'healthy');
  assert.ok(!JSON.stringify(timeout).includes('NEVER_PRINT'));
  pending = 4;
  assert.equal((await server.collectReliabilitySnapshot(env)).probes.find(p => p.service === 'Telegram').state, 'attention');
  global.fetch = async () => new Response('x'.repeat(128 * 1024 + 1));
  await assert.rejects(network.boundedJson('https://test.example'), /response_too_large/);
  global.fetch = async () => new Response('not JSON');
  await assert.rejects(network.boundedJson('https://test.example'));
  global.fetch = async () => Response.json({ error: 'private' }, { status: 401 });
  await assert.rejects(network.boundedJson('https://test.example'), /http_401/);
  let authorized = false;
  class ApiError extends Error { constructor(status, message) { super(message); this.status = status; } }
  const route = compile('app/api/admin/reliability/route.ts', {
    '@/lib/admin-server': { requireAdmin: async roles => { assert.deepEqual(roles, ['owner', 'admin']); if (!authorized) throw new ApiError(403, 'denied'); } },
    '@/lib/community-server': { ApiError, response: (data, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } }) },
    '@/lib/reliability-server': server,
  });
  assert.equal((await route.GET()).status, 403);
  authorized = true;
  const response = await route.GET();
  assert.equal(response.status, 200, 'partial outages still return diagnosis');
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  console.log('PASS: independent dependency failures, redaction, queue warning, bounded responses and admin authorization');
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => { global.fetch = originalFetch; });
