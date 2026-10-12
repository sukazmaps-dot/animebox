const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
function loadSource(file, mocks) {
  const filename = path.resolve(file), mod = new Module(filename);
  mod.filename = filename; mod.paths = Module._nodeModulePaths(process.cwd());
  const req = mod.require.bind(mod); mod.require = (name) => mocks[name] ?? req(name);
  mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText, filename);
  return mod.exports;
}
(async () => {
  let selected, owner, loggedIn = true;
  const rows = [
    { anime_id: 1, status: 'watching', anime_catalog: { title: 'Первый', slug: 'first', poster_url: ' https://images.test/one.jpg ' } },
    { anime_id: 2, status: 'planned', anime_catalog: [{ title: 'Второй', slug: 'second', poster_url: null }] },
    { anime_id: 1, status: 'watching', anime_catalog: { title: 'Дубликат', poster_url: 'bad' } },
  ];
  const route = loadSource('app/api/community/tracker/route.ts', {
    '@/lib/community-server': {
      userClient: async () => { if (!loggedIn) throw new Error('unauthorized'); return { user: { id: 'current-user' } }; },
      adminClient: () => ({ from: (table) => {
        assert.equal(table, 'anime_library');
        return { select: (value) => { selected = value; return { eq: (field, value) => {
          assert.equal(field, 'user_id'); owner = value;
          return { order: async () => ({ data: rows, error: null }) };
        } }; } };
      } }),
      response: (body) => body, failure: (error) => ({ error: error.message }),
    },
    '@/lib/watch-server': { getTitleWatchOverviews: async (id, ids) => {
      assert.equal(id, 'current-user'); assert.deepEqual(ids, [1, 2]);
      return [{ animeId: 1, trackedEpisodes: 1 }];
    } },
  });
  const result = await route.GET();
  assert.ok(selected.includes('poster_url'));
  assert.equal(owner, 'current-user');
  assert.equal(result.library.length, 2);
  assert.equal(result.library[0].posterUrl, 'https://images.test/one.jpg');
  assert.equal(result.library[1].posterUrl, null);
  assert.equal(result.library[0].progress.trackedEpisodes, 1);
  assert.equal(result.stats.watching, 1);
  loggedIn = false; assert.deepEqual(await route.GET(), { error: 'unauthorized' });

  global.window = { sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} } };
  const client = loadSource('lib/tracker-client.ts', {});
  const full = { stats: result.stats, library: result.library };
  client.seedTrackerSnapshot('current-user', full);
  assert.equal(client.peekTrackerSnapshot('current-user').library[0].posterUrl, 'https://images.test/one.jpg');
  client.seedTrackerSnapshot('current-user', { stats: result.stats, library: [{ anime_id: 1, title: 'Первый', status: 'watching' }] });
  assert.equal(client.peekTrackerSnapshot('current-user'), null, 'incomplete profile seeds cannot hide missing poster metadata');
  console.log('PASS: actual tracker GET joins posters, preserves owner filtering/progress/deduplication and rejects incomplete profile cache seeds.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
