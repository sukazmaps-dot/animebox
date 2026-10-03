const ts = require('typescript');
const fs = require('node:fs');
const assert = require('node:assert/strict');
function load(file) {
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const target = { exports: {} };
  new Function('exports', 'module', code)(target.exports, target);
  return target.exports;
}
const { canonicalWatchPartyInvite: parse, normalizeWatchPartyCode: code, isWatchPartyJoinSnapshot: snapshot } = load('lib/watch-party-entry.ts');
const origin = 'https://youranimebox.com';
const roomId = 'a'.repeat(24), secret = 'b'.repeat(32);
const path = `/watch-together/title/episode/3?party=${roomId}`;
const link = `${origin}${path}#partyKey=${secret}`;
assert.equal(parse(link, origin), link);
assert.equal(parse(`${path}#partyKey=${secret}`, origin), link);
assert.equal(parse(link.replace(origin, 'https://evil.test'), origin), null);
assert.equal(parse(link.replace(origin, 'https://youranimebox.com.evil.test'), origin), null);
assert.equal(parse(link.replace(origin, 'https://user:pass@youranimebox.com'), origin), null);
assert.equal(parse(link.replace(origin, 'https://youranimebox.com:8443'), origin), null);
assert.equal(parse(link.replace('/title/', '/a%2Fb/'), origin), null);
assert.equal(parse(link.replace('/3?', '/0?'), origin), null);
assert.equal(parse(link.replace('#partyKey=', '&party=x#partyKey='), origin), null);
assert.equal(parse(link + '&partyKey=' + secret, origin), null);
assert.equal(parse(link.replace(secret, 'invalid'), origin), null);
const cleaned = parse(link.replace('#', '&utm_source=secret#') + '&extra=tracking', origin);
assert.equal(cleaned, link, 'unrelated query and fragment data are not persisted');
assert.equal(code(' abc-234 '), 'ABC234');
assert.equal(code('ABC 234'), 'ABC234');
assert.equal(code('abc234'), 'ABC234');
assert.equal(code('ABC0O1'), null);
assert.equal(code('http://ABC234'), null);
assert.equal(code('ABC.234'), null);
const room = { roomId, joinSecret: secret, animeSlug: 'title', episode: 3,
  participantCount: 2, maxParticipants: 50, status: 'watching' };
assert.equal(snapshot(room), true);
assert.equal(snapshot({ ...room, maxParticipants: 10000 }), false);
assert.equal(snapshot({ ...room, participantCount: -1 }), false);
assert.equal(snapshot({ ...room, status: 'ended' }), false);
assert.equal(snapshot({ ...room, animeSlug: '../other' }), false);
console.log('Watch party entry: origins, credentials, identities, codes, canonicalization, snapshots passed.');
const { requestWatchPartyJson } = load('lib/watch-party-request.ts');
(async () => {
  let calls = 0;
  global.fetch = async () => { calls++; return new Response(JSON.stringify({ ok: true })); };
  const result = await requestWatchPartyJson('/test', {}, 100);
  assert.equal(result.payload.ok, true);
  global.fetch = (_, { signal }) => new Promise((resolve, reject) => {
    calls++;
    signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true });
  });
  await assert.rejects(requestWatchPartyJson('/slow', { method: 'POST' }, 5), /не ответил вовремя/);
  assert.equal(calls, 2, 'timeout cannot replay mutations');
  const controller = new AbortController();
  const request = requestWatchPartyJson('/unmount', { signal: controller.signal }, 100);
  controller.abort();
  await assert.rejects(request, { name: 'AbortError' });
  console.log('Watch party requests: success, timeout, single POST, caller cancellation passed.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
