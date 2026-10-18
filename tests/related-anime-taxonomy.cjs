const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { stripTypeScriptTypes } = require('node:module');

const taxonomy = fs.readFileSync('lib/anime-taxonomy.ts', 'utf8');
const related = fs.readFileSync('components/RelatedAnime.tsx', 'utf8')
  .split('export function RelatedAnimeLoading')[0]
  .replace(/^import[\s\S]*?;\n/gm, '');
const source = stripTypeScriptTypes(
  taxonomy.replace(/^export /gm, '') + '\n' + related,
);

const anime = (id, genres, tags = [], score = 8) => ({ id, genres, tags, score, title: { romaji: String(id) } });

async function run(genres, candidates, options = {}) {
  const calls = [];
  let filtered = [];
  const context = vm.createContext({
    console,
    getAnimeRecommendationsById: async (id, limit) => {
      assert.equal(id, 1);
      assert.equal(limit, 30);
      return options.graph ?? [];
    },
    getAnimesWithShikimori: async (query) => {
      calls.push(JSON.parse(JSON.stringify(query)));
      return candidates;
    },
    enrichAnimePosterSources: async (items) => items,
    filterAnimeByAvailability: async (items, policy) => {
      assert.equal(policy, 'catalog');
      filtered = items;
      return { items: items.filter((item) => item.id !== 99), refreshTargets: [] };
    },
    after: () => assert.fail('no refresh targets'),
  });
  vm.runInContext(source + '\nglobalThis.load = loadRelatedAnime;', context);
  const items = await context.load(1, genres, options.tags ?? []);
  return { ids: Array.from(items, (item) => item.id), calls, filtered };
}

(async () => {
  const pool = [
    anime(1, ['Экшен']), anime(2, ['Экшен', 'Action', 'экшен']),
    anime(2, ['Action']), anime(3, ['Романтика', 'Комедия']),
    anime(4, ['Психологическое', 'Триллер']), anime(99, ['Экшен']),
    anime(0, ['Action']), anime(-2, ['Action']),
  ];
  assert.deepEqual((await run(['ЭКШЕН'], pool)).ids, [2]);
  assert.deepEqual((await run(['Romance', 'Comedy'], pool)).ids, [3]);
  assert.deepEqual((await run(['Psychological', 'Thriller'], pool)).ids, [4]);
  const deduped = await run(['Экшен', 'Action', 'Сёнен'], pool);
  assert.deepEqual(deduped.calls[0].genres, ['Action']);
  assert.equal(deduped.calls.length, 1, 'candidate retrieval stays bounded');
  assert.deepEqual((await run(['Action'], [anime(2, ['Экшен', 'Action']), anime(5, ['Action', 'Comedy'])])).ids, [2, 5], 'translated duplicates must not boost overlap');
  for (const [label, tag] of [['Сёнен', 'Shounen'], ['Сэйнен', 'Seinen'], ['Дзёсэй', 'Josei'], ['Сёдзё', 'Shoujo']]) {
    const result = await run([label], [anime(2, [], [tag]), anime(3, ['Romance'])]);
    assert.deepEqual(result.ids, [2], label);
    assert.deepEqual(result.calls[0].tags, [tag]);
    assert.equal(result.calls[0].genres, undefined, 'demographics are tags');
  }
  assert.deepEqual((await run(['Романтика'], [], { graph: [anime(3, ['Романтика'])] })).ids, [3]);
  assert.deepEqual((await run(['Action'], [anime(3, ['Romance'])])).ids, []);
  assert.deepEqual((await run([], [], { graph: [anime(2, [])] })).ids, [2], 'title graph works without taxonomy');
  console.log('PASS: related taxonomy, distinct genres, demographic tags, duplicates, current ID and availability');
})().catch((error) => { console.error(error); process.exitCode = 1; });
