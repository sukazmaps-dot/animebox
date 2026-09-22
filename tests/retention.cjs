const ts = require('typescript');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
function load(file) {
 const target = { exports: {} };
 const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../lib', file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
 new Function('exports', 'module', code)(target.exports, target);
 return target.exports;
}
const { orderedFunnelCounts } = load('ordered-funnel.ts');
const row = (session_id, event_name, sec) => ({ session_id, event_name, created_at: new Date(sec * 1000).toISOString() });
const steps = ['page_view', 'anime_open', 'player_started'];
assert.deepEqual(orderedFunnelCounts([
 row('a','page_view',1), row('a','anime_open',2), row('a','player_started',3), row('a','player_started',4),
 row('b','player_started',1), row('b','page_view',2), row('b','anime_open',3),
 row('c','page_view',1), row('d','player_started',4), row(null,'page_view',1),
], steps), [3,2,1], 'Different sessions, reversed order and duplicates must not inflate conversion');
assert.deepEqual(orderedFunnelCounts([row('a','player_started',1),row('a','anime_open',1),row('a','page_view',1)], steps), [1,1,1], 'Batch timestamps must not depend on database tie ordering');
assert.deepEqual(orderedFunnelCounts([], steps), [0,0,0]);
assert.deepEqual(orderedFunnelCounts([row('a','auth_completed',1),row('b','auth_modal_opened',1),row('b','auth_completed',2)], ['auth_modal_opened','auth_completed']), [1,1], 'Automatic sign-in does not inflate modal conversion');
const memory = new Map();
global.window = {};
global.localStorage = { getItem: key => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value) };
const progress = load('watch-progress.ts');
progress.saveWatchProgress(1, 3, 120, 1400);
progress.saveWatchProgress(1, 2, 150, 1400);
assert.equal(progress.getLatestWatchProgress(1).episode, 2, 'Rewatching an earlier episode must use the latest save, not highest episode');
assert.equal(progress.hasResumePosition(progress.getLatestWatchProgress(1)), true);
progress.saveWatchProgress(1, 2, 1390, 1400);
assert.equal(progress.hasResumePosition(progress.getLatestWatchProgress(1)), false, 'Do not offer a resume point in the end guard');
progress.removeWatchProgress(1, 2);
assert.equal(progress.getLatestWatchProgress(1).episode, 3);
assert.equal(progress.hasResumePosition(null), false);
memory.set('anime-tracker-watch-progress', 'broken');
assert.equal(progress.getLatestWatchProgress(1), null);
console.log('PASS: ordered funnels, independent auth, latest episode, end guard and corrupt storage');
