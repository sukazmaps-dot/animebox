const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'animebox-test-'));
process.env.ANIMEBOX_DB_PATH = path.join(temp, 'routes.sqlite');
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function(name, ...args) {
  return originalResolve.call(this, name.startsWith('@/') ? path.join(root, name.slice(2)) : name, ...args);
};
require.extensions['.ts'] = (mod, filename) => {
  mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText, filename);
};
const { slugify } = require('../lib/anime-url.ts');
const { registerAnime, findAnimeRoute } = require('../lib/anime-registry.ts');
const { collectEpisodePages, exactReleaseTitle } = require('../lib/provider-episodes.ts');
const { getEpisodeGroups } = require('../lib/episode-groups.ts');
async function main() {
  assert.equal(slugify('Gintama: Enchousen'), 'gintama-enchousen');
  assert.equal(slugify('Ван-Пис'), 'van-pis');
  const a = registerAnime({ id: 1, title: { romaji: 'Gintama' } });
  const b = registerAnime({ id: 2, title: { romaji: "Gintama'" } });
  assert.equal(a.slug, 'gintama'); assert.equal(b.slug, 'gintama-2');
  assert.equal(registerAnime({ id: 1, title: { romaji: 'New title' } }).slug, a.slug);
  assert.equal(findAnimeRoute(b.slug).id, 2);
  assert.equal(registerAnime({ id: 86, title: { romaji: '86' } }).slug, 'anime-86');
  assert.equal(exactReleaseTitle({ name: { english: "Gintama'" } }, ['Gintama']), false);
  assert.equal(exactReleaseTitle({ name: { english: 'Gintama: Enchousen' } }, ['Gintama']), false);
  const endpoint = 'https://example.test/api/v1/anime/releases/one-piece';
  const pages = Array.from({ length: 13 }, (_, i) => ({
    data: Array.from({ length: 100 }, (_, n) => ({ ordinal: i * 100 + n + 1 })),
    links: { next: i < 12 ? `?page=${i + 2}` : null },
  }));
  const result = await collectEpisodePages(pages[0], endpoint, async url => pages[Number(new URL(url).searchParams.get('page')) - 1]);
  assert.equal(result.length, 1300); assert.equal(result.at(-1).ordinal, 1300);
  assert.equal(getEpisodeGroups(21, 1300).at(-1).to, 1300);
  await assert.rejects(collectEpisodePages({ data: [], links: { next: '?page=2' } }, endpoint,
    async () => ({ data: [], links: { next: '?page=2' } })), /Repeated/);
  await assert.rejects(collectEpisodePages({ data: [], links: { next: 'https://evil.test/api/v1/episodes' } }, endpoint, async () => []), /origin/);
  await assert.rejects(collectEpisodePages({ data: [], meta: { current_page: 1, last_page: 13 } }, endpoint, async () => []), /partial/);
  const dedup = await collectEpisodePages([{ ordinal: 2 }, { ordinal: 1 }, { ordinal: 2 }], endpoint, async () => []);
  assert.deepEqual(dedup.map(x => x.ordinal), [1, 2]);
  // Exercise the real Next route with fake provider responses, not the network.
  const { GET } = require('../app/api/anilibria/route.ts');
  const { NextRequest } = require('next/server');
  const one = registerAnime({ id: 21, title: { romaji: 'One Piece' } });
  let detailCalls = 0;
  global.fetch = async url => {
    if (String(url).includes('/app/search/releases')) return Response.json([
      { alias: 'one-piece-movie', name: { english: 'One Piece Movie' } },
      { alias: 'one-piece', name: { english: 'One Piece' } },
    ]);
    detailCalls++;
    assert.ok(String(url).endsWith('/one-piece'));
    return Response.json({ name: { english: 'One Piece' }, episodes: Array.from({ length: 1300 }, (_, n) => ({
      ordinal: n + 1, hls_720: `https://cdn.test/${n + 1}.m3u8`,
    })) });
  };
  const response = await GET(new NextRequest(`http://localhost/api/anilibria?slug=${one.slug}&season=1&episode=1300`));
  const data = await response.json();
  assert.equal(response.status, 200); assert.equal(data.episodes.length, 1300);
  assert.equal(data.hls[0].url, 'https://cdn.test/1300.m3u8'); assert.equal(detailCalls, 1);
  const stale = await GET(new NextRequest(`http://localhost/api/anilibria?slug=${one.slug}&season=3&episode=1`));
  assert.equal(stale.status, 409);
  global.fetch = async () => { throw new Error('timeout'); };
  const outage = await GET(new NextRequest(`http://localhost/api/anilibria?slug=${one.slug}&episode=1`));
  assert.equal(outage.status, 503);
  const aniList = require('../lib/anilist.ts');
  const media = id => ({ id, type: 'ANIME', title: { romaji: `Part ${id}` }, format: 'TV', startDate: { year: 2000 + id }, coverImage: {} });
  aniList.getAnimeRelationsById = async id => ({ ...media(id), relations: [
    ...(id > 1 ? [{ node: media(id - 1), relationType: 'PREQUEL' }] : []),
    ...(id < 3 ? [{ node: media(id + 1), relationType: 'SEQUEL' }] : []),
  ] });
  const { getAnimeFranchise, getPrimarySeasonItems } = require('../lib/anime-franchise.ts');
  for (const id of [3, 1, 2]) {
    const graph = await getAnimeFranchise(id);
    assert.equal(graph.partial, false);
    assert.deepEqual(getPrimarySeasonItems(graph).map(x => x.id), [1, 2, 3]);
    assert.equal(graph.items.find(x => x.isCurrent).id, id);
  }
  console.log('PASS: stable unique slugs; exact release matching; 1300 episodes; pagination safety; route season validation; upstream failures.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
