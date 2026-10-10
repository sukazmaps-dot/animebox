import assert from 'node:assert/strict';
import sharp from 'sharp';
import { checkTelegramWebhook } from '../scripts/telegram-webhook-ops.mjs';
import { inspectPoster, smokePoster } from '../scripts/media-poster-smoke.mjs';
const env = { TELEGRAM_BOT_TOKEN: '1234:test-secret', TELEGRAM_WEBHOOK_SECRET: 'origin_secret' };
const expected = 'https://youranimebox.com/api/telegram/webhook';
let calls = [];
const mock = async (url, options) => {
  const path = String(url); calls.push({ path, options });
  assert.equal(options.redirect, 'error');
  if (path === expected) return Response.json({ ok: true });
  if (path.endsWith('/setWebhook')) return Response.json({ ok: true, result: true });
  return Response.json({ ok: true, result: {
    url: calls.some(item => item.path.endsWith('/setWebhook')) ? expected : 'https://legacy.example/api/telegram/webhook',
    pending_update_count: 7, allowed_updates: ['message', 'pre_checkout_query', 'subscription'],
    last_error_message: env.TELEGRAM_BOT_TOKEN,
  } });
};
const read = await checkTelegramWebhook({ env, fetchImpl: mock });
assert.equal(read.canonicalUrlMatches, false); assert.equal(calls.length, 1);
assert.ok(!JSON.stringify(read).includes(env.TELEGRAM_BOT_TOKEN));
calls = []; const applied = await checkTelegramWebhook({ env, apply: true, fetchImpl: mock });
assert.equal(applied.canonicalUrlMatches, true); assert.equal(calls.length, 4);
const body = JSON.parse(calls[2].options.body);
assert.equal(body.url, expected); assert.equal(body.secret_token, env.TELEGRAM_WEBHOOK_SECRET);
assert.equal(body.drop_pending_updates, false); assert.deepEqual(body.allowed_updates, ['message', 'pre_checkout_query', 'subscription']);
assert.equal(calls[1].options.body, '{}');
calls = [];
await assert.rejects(checkTelegramWebhook({ env, apply: true, fetchImpl: async (url, options) => {
  if (String(url) === expected) return Response.json({ ok: false }, { status: 401 });
  return mock(url, options);
} }), /probe failed/);
assert.ok(!calls.some(item => item.path.endsWith('/setWebhook')));
await assert.rejects(checkTelegramWebhook({ env, fetchImpl: async () => { throw new Error(env.TELEGRAM_BOT_TOKEN); } }), error => !error.message.includes(env.TELEGRAM_BOT_TOKEN));
await assert.rejects(checkTelegramWebhook({ env: { ...env, TELEGRAM_WEBHOOK_SECRET: 'bad secret' }, apply: true, fetchImpl: mock }), /compatible/);
const bytes = await sharp({ create: { width: 40, height: 60, channels: 3, background: '#663399' } }).png().toBuffer();
const response = () => new Response(bytes, { headers: { 'Content-Type': 'image/png' } });
assert.equal((await inspectPoster(response())).width, 40);
for (const mime of ['text/html', 'image/svg+xml']) await assert.rejects(inspectPoster(new Response('<svg/>', { headers: { 'Content-Type': mime } })), /raster/);
await assert.rejects(inspectPoster(new Response('not an image', { headers: { 'Content-Type': 'image/jpeg' } })));
await assert.rejects(inspectPoster(new Response(bytes, { headers: { 'Content-Type': 'image/webp' } })), /MIME/);
await assert.rejects(inspectPoster(new Response('', { status: 502 })), /502/);
const result = await smokePoster('https://shikimori.io/system/animes/original/1.jpg', async url => {
  assert.equal(new URL(url).searchParams.get('url'), 'https://shikimori.io/system/animes/original/1.jpg'); return response();
});
assert.equal(result.results.length, 2); assert.ok(result.results.every(item => item.ok));
console.log('Access operations: no read-mode mutations, safe webhook update, secret redaction, reachability and raster poster checks passed.');
