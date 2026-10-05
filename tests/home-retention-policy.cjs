const ts = require('typescript');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const code = ts.transpileModule(fs.readFileSync('lib/home-retention-policy.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;
const target = { exports: {} };
new Function('exports', 'module', code)(target.exports, target);
const { isFreshHomeResume, preferLocalHomeResume, selectPersonalHomeSchedule } = target.exports;
const nowMs = 1_800_000_000_000;
assert.equal(isFreshHomeResume(NaN, nowMs), false);
assert.equal(isFreshHomeResume(nowMs + 120_000, nowMs), false);
assert.equal(isFreshHomeResume(nowMs - 8 * 86400_000, nowMs), false);
const input = { localUpdatedAt: nowMs, localEpisode: 3, serverUpdatedAt: nowMs - 5000,
  serverEpisode: 4, serverMode: 'next', nowMs };
assert.equal(preferLocalHomeResume(input), false, 'completed episode cannot return from local cache');
assert.equal(preferLocalHomeResume({ ...input, localEpisode: 4 }), true);
assert.equal(preferLocalHomeResume({ ...input, serverMode: 'resume', serverUpdatedAt: nowMs }), false);
const now = nowMs / 1000;
const item = (id, airingAt, episode = 1, animeId = id) => ({ id, airingAt, episode, media: { id: animeId } });
const items = [item(1, now + 50), item(2, now - 50), item(3, now - 100),
  item(4, now + 10), item(5, now + 1, 0), item(6, NaN), item(7, now, 1, 99),
  item(8, now + 50, 1, 1), item(9, now - 7 * 3600)];
const before = JSON.stringify(items);
assert.deepEqual(selectPersonalHomeSchedule(items, new Set([1,2,3,4,5,6,9]), now).map(x => x.id), [2,3,4,1]);
assert.equal(JSON.stringify(items), before, 'selection cannot mutate shared schedule');
assert.deepEqual(selectPersonalHomeSchedule(items, new Set(), now), []);
assert.deepEqual(selectPersonalHomeSchedule([item('weekly-1', now, null, 1)], new Set([1]), now), [], 'planned slots cannot create episode retention signals');
assert.deepEqual(selectPersonalHomeSchedule([{...item('planned-1', now, 9, 1),timingKind:'planned'}],new Set([1]),now),[],'planned dates must not create released episode signals');
console.log('Home retention policy: freshness, completion, schedule identity/order passed.');
