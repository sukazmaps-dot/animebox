const fs = require('node:fs');
const ts = require('typescript');
const assert = require('node:assert/strict');
const mod = { exports: {} };
new Function('exports', 'module', ts.transpileModule(fs.readFileSync('lib/public-auth-config.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText)(mod.exports, mod);
const { resolvePublicAuthConfig, loadPublicAuthConfig } = mod.exports;
(async () => {
  const env = { GOOGLE_CLIENT_ID: ' runtime.apps.googleusercontent.com ', TELEGRAM_CLIENT_ID: '1234',
    TELEGRAM_BOT_TOKEN: 'never-expose', SUPABASE_SERVICE_ROLE_KEY: 'never-expose' };
  assert.deepEqual(resolvePublicAuthConfig(env), { googleClientId: 'runtime.apps.googleusercontent.com', telegramClientId: '1234' });
  assert.deepEqual(Object.keys(resolvePublicAuthConfig(env)), ['googleClientId', 'telegramClientId']);
  assert.equal(resolvePublicAuthConfig({ ...env, NEXT_PUBLIC_GOOGLE_CLIENT_ID: 'public-id' }).googleClientId, 'public-id');
  for (const value of ['0', '-1', '1.2', '123:bot-secret', '9007199254740993']) {
    assert.equal(resolvePublicAuthConfig({ TELEGRAM_CLIENT_ID: value }).telegramClientId, null);
  }
  assert.deepEqual(resolvePublicAuthConfig({}), { googleClientId: null, telegramClientId: null });
  const originalFetch = global.fetch;
  try {
    global.fetch = async (url, options) => {
      assert.equal(url, '/api/auth/config');
      assert.equal(options.cache, 'no-store');
      return Response.json({ googleClientId: 'runtime-new', telegramClientId: '4567', secret: 'ignored' });
    };
    assert.deepEqual(await loadPublicAuthConfig(), { googleClientId: 'runtime-new', telegramClientId: '4567' });
    global.fetch = async () => new Response('', { status: 503 });
    await assert.rejects(loadPublicAuthConfig(), /временно недоступны/);
    global.fetch = async () => Response.json({ googleClientId: 'recovered', telegramClientId: '99' });
    assert.equal((await loadPublicAuthConfig()).googleClientId, 'recovered', 'failure must not poison later retries');
  } finally { global.fetch = originalFetch; }
  console.log('Public auth: runtime values, secret allowlist, validation, no-store and retry passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
