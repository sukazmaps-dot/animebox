const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function load(path) {
  const source = fs.readFileSync(path, 'utf8');
  const compiled = ts.transpileModule(source, {
    fileName: path,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    reportDiagnostics: true,
  });
  assert.equal((compiled.diagnostics ?? []).length, 0, path + ': transpile failed');
  const moduleRef = { exports: {} };
  vm.runInNewContext(compiled.outputText, {
    module: moduleRef, exports: moduleRef.exports,
    require(name) { throw new Error('Unexpected runtime dependency ' + name); },
  }, { filename: path });
  return moduleRef.exports;
}
const { normalizedAnimeScore, formatAnimeScore } = load('lib/anime-score.ts');
const { animeEpisodesDisplay, animeContentFacts } = load('lib/anime-content-intelligence.ts');

for (const [anime, expected] of [
  [{ score: 9.25, averageScore: 91 }, '9.3'],
  [{ score: 9, averageScore: 85 }, '9.0'],
  [{ score: null, averageScore: 87 }, '8.7'],
  [{ score: undefined, averageScore: 100 }, '10.0'],
  [{ score: null, averageScore: null }, null],
  [{ score: 0, averageScore: null }, null],
  [{ score: -12, averageScore: 1000 }, null],
]) {
  assert.equal(formatAnimeScore(anime), expected, JSON.stringify(anime));
}
assert.equal(normalizedAnimeScore({ score: 9.25, averageScore: 91 }), 9.3);

for (const [anime, expected] of [
  [{ episodes: 12, episodesAired: 5, status: 'RELEASING' }, '5 из 12 эп. вышло'],
  [{ episodes: 12, episodesAired: 5, status: 'Онгоинг' }, '5 из 12 эп. вышло'],
  [{ episodes: 12, episodesAired: null, status: 'ongoing' }, '12 эп. запланировано'],
  [{ episodes: 12, episodesAired: 20, status: 'RELEASING' }, '20 эп. вышло'],
  [{ episodes: 12, episodesAired: 0, status: 'NOT_YET_RELEASED' }, '12 эп. запланировано'],
  [{ episodes: 24, episodesAired: 24, status: 'FINISHED' }, '24 эп.'],
  [{ episodes: null, episodesAired: 5, status: 'RELEASING' }, '5 эп. вышло'],
  [{ episodes: null, episodesAired: null, status: 'RELEASING' }, null],
  [{ episodes: 0, episodesAired: 0, status: 'FINISHED' }, null],
]) {
  assert.equal(animeEpisodesDisplay(anime), expected, JSON.stringify(anime));
}
assert.equal(animeContentFacts({ format:'TV', status:'RELEASING', genres:[],
  episodes:12, episodesAired:5, id:10, title:{} }).episodes,'5 из 12 эп. вышло');

const files = {
  card:fs.readFileSync('components/AnimeCard.tsx','utf8'),
  top:fs.readFileSync('components/TopAnimeItem.tsx','utf8'),
  hero:fs.readFileSync('components/HomeHero.tsx','utf8'),
  detail:fs.readFileSync('app/anime/[slug]/page.tsx','utf8'),
  party:fs.readFileSync('components/watch-party/WatchTogetherHub.tsx','utf8'),
};
for (const [name,source] of Object.entries(files)) {
  assert(source.includes('formatAnimeScore'), name + ': missing shared rating normalization');
  assert(!source.includes("anime.score ?? anime.averageScore ?? '—'"), name + ': raw rating leaks to UI');
}
// Patch 32.0.1: the deliberately compact Home TitleCard shows one stable
// "year · type · score" line; episode counts remain authoritative in TopAnime,
// the detail facts and the shared animeEpisodesDisplay() tests above.
assert(files.card.includes("filter(Boolean).join(' · ')"), 'compact card must avoid dangling separators');
assert(files.card.includes('formatLabel(anime.format)') && files.card.includes('formatAnimeScore(anime)'), 'compact card metadata must include type and normalized rating');
assert(files.top.includes('animeEpisodesDisplay(anime)'), 'top must distinguish total vs aired');
assert(files.detail.includes('animeContentFacts(resolved)'), 'detail facts must use raw metadata');
assert(!files.detail.includes('resolved.score * 10'), 'detail must not fabricate averageScore');
console.log('PASS: anime rating display uses one decimal across surfaces; episodes distinguish released/planned/unknown.');
