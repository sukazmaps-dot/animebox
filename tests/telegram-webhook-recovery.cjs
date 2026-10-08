const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const originalLoad = Module._load;
const originalResolve = Module._resolveFilename;
const originalFetch = global.fetch;
const env = { TELEGRAM_BOT_TOKEN: '12345:test-secret-token', TELEGRAM_WEBHOOK_SECRET: 'secret_test' };
class ApiError extends Error { constructor(status, message) { super(message); this.status = status; } }
let actor = 'owner', audits = 0, auditFailureAt = 0;
const stubs = {
  'server-only': {},
  '@/lib/env/server': { optionalServerSecret: name => env[name] ?? null },
  '@/lib/admin-server': {
    requireAdmin: async roles => { if (!roles.includes(actor)) throw new ApiError(403, 'denied'); },
    requireAdminMutation: async (_request, roles) => { if (!roles.includes(actor)) throw new ApiError(403, 'denied'); return { user: { id: 'owner' }, role: actor }; },
    writeAdminAudit: async () => { audits++; if (audits === auditFailureAt) throw new Error('audit failed'); },
  },
  '@/lib/community-server': { ApiError, readJsonBody: request => request.json(), response: (data, status = 200) => Response.json(data, { status }) },
};
Module._load = function (name, ...args) { return Object.hasOwn(stubs, name) ? stubs[name] : originalLoad.call(this, name, ...args); };
Module._resolveFilename = function (name, ...args) { return originalResolve.call(this, name.startsWith('@/') ? path.join(root, name.slice(2)) : name, ...args); };
require.extensions['.ts'] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, filename);

async function main() {
  const { getTelegramWebhookStatus, repairTelegramWebhook } = require('../lib/telegram-webhook-server.ts');
  let info = { url: 'https://old.test/api/telegram/webhook', allowed_updates: ['callback_query'], pending_update_count: 3,
    last_error_message: `bad ${env.TELEGRAM_BOT_TOKEN} ${env.TELEGRAM_WEBHOOK_SECRET}` };
  const calls = [];
  let probeStatus = 200, applied, wrongBot = false;
  global.fetch = async (url, options) => {
    const method = String(url).split('/').at(-1);
    calls.push(method);
    if (method === 'getMe') return Response.json({ ok: true, result: { id: 12345, username: wrongBot ? 'WrongBot' : 'YourAnimeBoxBot', is_bot: true } });
    if (method === 'getWebhookInfo') return Response.json({ ok: true, result: info });
    if (method === 'webhook') {
      assert.equal(options.redirect, 'error');
      assert.equal(options.headers['X-Telegram-Bot-Api-Secret-Token'], env.TELEGRAM_WEBHOOK_SECRET);
      assert.equal(options.body, '{}');
      return Response.json({ ok: probeStatus === 200 }, { status: probeStatus });
    }
    assert.equal(method, 'setWebhook', 'no sendMessage or payment API calls');
    applied = JSON.parse(options.body);
    info = { ...info, url: applied.url, allowed_updates: applied.allowed_updates };
    return Response.json({ ok: true, result: true });
  };
  const initial = await getTelegramWebhookStatus();
  assert.equal(initial.urlMatches, false);
  assert.equal(initial.requiredUpdatesEnabled, false);
  assert.ok(!JSON.stringify(initial).includes(env.TELEGRAM_BOT_TOKEN));
  assert.ok(!JSON.stringify(initial).includes(env.TELEGRAM_WEBHOOK_SECRET));
  info.url = `https://user:private_password@old.test/api/telegram/webhook?key=${env.TELEGRAM_WEBHOOK_SECRET}#private_fragment`;
  const sanitized = await getTelegramWebhookStatus();
  assert.equal(sanitized.currentUrl, 'https://old.test/api/telegram/webhook');
  assert.ok(!JSON.stringify(sanitized).includes('private_password'));
  probeStatus = 401;
  await assert.rejects(repairTelegramWebhook(), /HTTP 401/);
  assert.equal(applied, undefined);
  probeStatus = 200;
  const repaired = await repairTelegramWebhook();
  assert.equal(repaired.urlMatches, true);
  assert.equal(repaired.requiredUpdatesEnabled, true);
  assert.equal(applied.drop_pending_updates, false);
  assert.equal(applied.secret_token, env.TELEGRAM_WEBHOOK_SECRET);
  assert.deepEqual(applied.allowed_updates, ['callback_query', 'message', 'pre_checkout_query', 'subscription']);
  assert.equal(repaired.pendingUpdates, 3);
  info.allowed_updates = [];
  await repairTelegramWebhook();
  assert.deepEqual(applied.allowed_updates, [], 'preserve Telegram default delivery');

  const { GET, POST } = require('../app/api/admin/telegram-webhook/route.ts');
  const request = () => new Request('https://youranimebox.com/api/admin/telegram-webhook', { method: 'POST', body: JSON.stringify({ action: 'repair' }) });
  actor = 'moderator';
  const before = calls.length;
  assert.equal((await GET()).status, 403);
  assert.equal((await POST(request())).status, 403);
  actor = 'admin';
  assert.equal((await POST(request())).status, 403);
  assert.equal(calls.length, before, 'denied actors cannot call Telegram');
  actor = 'owner';
  assert.equal((await POST(request())).status, 200);
  assert.equal(audits, 2);
  const priorCalls = calls.length;
  auditFailureAt = audits + 1;
  assert.equal((await POST(request())).status, 503);
  assert.equal(calls.length, priorCalls, 'failed attempt audit prevents mutation');
  auditFailureAt = audits + 2;
  const auditWarning = await POST(request());
  assert.equal(auditWarning.status, 200);
  assert.ok((await auditWarning.json()).warning, 'successful repair remains truthful if final audit fails');
  auditFailureAt = 0;
  applied = undefined;
  wrongBot = true;
  await assert.rejects(repairTelegramWebhook(), /YourAnimeBoxBot/);
  assert.equal(applied, undefined, 'wrong bot must not be modified');
  wrongBot = false;
  const secret = env.TELEGRAM_WEBHOOK_SECRET;
  env.TELEGRAM_WEBHOOK_SECRET = 'invalid secret';
  await assert.rejects(repairTelegramWebhook(), /1–256/);
  env.TELEGRAM_WEBHOOK_SECRET = secret;
  global.fetch = async () => { throw new Error(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/getWebhookInfo`); };
  await assert.rejects(getTelegramWebhookStatus(), error => !error.message.includes(env.TELEGRAM_BOT_TOKEN));
  console.log('PASS: safe diagnostics, failed preflight, queue/update preservation, verified install, owner-only mutation and secret redaction');
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => {
  global.fetch = originalFetch; Module._load = originalLoad; Module._resolveFilename = originalResolve;
});
