const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
let now = 10_000, nextId = 0;
const timers = new Map();
const code = ts.transpileModule(fs.readFileSync('lib/media-edge-health-client.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const context = { exports: {}, window: { location: { origin: 'https://animebox.test' } }, URL,
  Date: { now: () => now },
  setTimeout: (fn, delay) => { const id = ++nextId; timers.set(id, { fn, at: now + delay }); return id; },
  clearTimeout: id => timers.delete(id),
  require: () => ({ getPrimaryMediaOrigin: () => 'https://media.test', getRuMediaOrigin: () => 'https://ru.test' }),
};
vm.runInNewContext(code, context);
const h = context.exports;
const source = (id, origin = 'https://media.test') => `${origin}/image?url=https://upstream.test/${id}.jpg`;
let updates = 0;
let unsubscribe = h.subscribeMediaEdgeHealth(() => updates++);
for (let i = 0; i < 3; i++) assert.equal(h.reportMediaEdgeFailure(source(i)), false);
assert.equal(timers.size, 0);
assert.equal(h.reportMediaEdgeFailure(source(3)), true);
assert.equal(updates, 1);
assert.equal(timers.size, 1, 'one expiry timer per origin');
assert.equal(h.getMediaEdgeRetryAfterMs([source(0)]), 60_000);
assert.equal(h.getMediaEdgeRetryAfterMs([source(0), source(0, 'https://ru.test')]), 0);
for (let i = 4; i < 10; i++) h.reportMediaEdgeFailure(source(i));
assert.equal(timers.size, 1);
unsubscribe();
assert.equal(timers.size, 0, 'last subscriber removes timers');
now += 20_000;
unsubscribe = h.subscribeMediaEdgeHealth(() => updates++);
assert.equal(timers.size, 1, 'resubscribe services existing deadline');
assert.equal(h.getMediaEdgeRetryAfterMs([source(0)]), 40_000);
now += 40_000;
for (const [id, timer] of [...timers]) if (timer.at <= now) { timers.delete(id); timer.fn(); }
assert.equal(updates, 2, 'expiry emits store revision');
assert.equal(h.isMediaEdgeBlocked(source(0)), false);
assert.equal(h.getMediaEdgeRetryAfterMs([source(0)]), 0);
assert.equal(timers.size, 0);
assert.equal(h.reportMediaEdgeFailure(source(0)), false, 'expired failure window is cleared');
h.reportMediaEdgeSuccess(source(0));
for (let i = 0; i < 3; i++) assert.equal(h.reportMediaEdgeFailure(source(i)), false);
unsubscribe();
console.log('Media edge cooldown: threshold, shared timer, notification, alternate edge and cleanup passed.');
