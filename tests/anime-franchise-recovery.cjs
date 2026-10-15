const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { stripTypeScriptTypes } = require('node:module');

const source = stripTypeScriptTypes(fs.readFileSync('lib/anime-franchise.ts', 'utf8')
  .replace(/^import[\s\S]*?;\n/gm, '').replace(/^export /gm, ''));
let now = 0;
let failedId = null;
const warnings = [];
const media = (id) => ({ id, type: 'ANIME', format: 'TV', title: { romaji: `Part ${id}` } });
const context = vm.createContext({
  Date: class extends Date { static now() { return now; } },
  console: { warn: (...args) => warnings.push(args) },
  getAnimeRelationsById: async (id) => {
    if (id === failedId) throw new Error('temporary API outage');
    return {
      ...media(id),
      relations: id < 3 ? [{ node: media(id + 1), relationType: 'SEQUEL' }] : [],
    };
  },
});
vm.runInContext(source + '\nglobalThis.load = getAnimeFranchise;', context);

(async () => {
  failedId = 4;
  assert.equal(await context.load(4), null, 'cold root failure must not become an empty franchise');
  failedId = null;
  const fresh = await context.load(1);
  assert.equal(fresh.items.length, 3);
  assert.equal(fresh.partial, false);
  now = 3_600_001;
  failedId = 1;
  const stale = await context.load(1);
  assert.deepEqual(Array.from(stale.items, (item) => item.id), [1, 2, 3]);
  assert.equal(stale.currentId, 1);
  assert.equal(stale.partial, true);
  assert.deepEqual(Array.from(stale.failedIds), [1]);
  failedId = 2;
  const partial = await context.load(1);
  assert.equal(partial.items.length, 3, 'child failure retains known parts');
  assert.equal(partial.partial, true);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(context.load(1, { signal: controller.signal }), { name: 'AbortError' });
  now += 8 * 24 * 60 * 60 * 1000;
  failedId = 1;
  assert.equal(await context.load(1), null, 'repeated failures must not extend stale retention');
  failedId = null;
  const recovered = await context.load(1);
  assert.equal(recovered.items.length, 3);
  assert.equal(recovered.partial, false);
  assert(warnings.length > 0, 'upstream errors must be observable');
  console.log('PASS: franchise cold failure, stale recovery, partial refresh, expiry and abort');
})().catch((error) => { console.error(error); process.exitCode = 1; });
