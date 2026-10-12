// React tests need the test export even when prebuild inherits production mode.
process.env.NODE_ENV = 'test';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
function compile(file, imports = {}) {
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText)((name) => imports[name] ?? require(name), mod, mod.exports);
  return mod.exports;
}
const { moodMenuLayout } = compile('lib/mood-menu-layout.ts');
const base = { trigger: { top: 140, bottom: 180 }, viewportTop: 0, viewportBottom: 900, desiredHeight: 430, navigation: [] };
assert.deepEqual(moodMenuLayout({ ...base, navigation: [{ top: 0, bottom: 0, width: 0, height: 0 }] }), { opensUp: false, maxHeight: 430 });
assert.deepEqual(moodMenuLayout({ ...base, trigger: { top: 680, bottom: 720 } }), { opensUp: true, maxHeight: 430 });
const mobile = moodMenuLayout({ ...base, viewportBottom: 600, trigger: { top: 120, bottom: 164 }, navigation: [{ top: 520, bottom: 600, width: 390, height: 80 }] });
assert.equal(mobile.opensUp, false); assert.equal(mobile.maxHeight, 335);
const keyboard = moodMenuLayout({ ...base, viewportTop: 80, viewportBottom: 360, trigger: { top: 250, bottom: 294 } });
assert.equal(keyboard.opensUp, true); assert.equal(keyboard.maxHeight, 149);
assert.equal(moodMenuLayout({ ...base, viewportBottom: 190 }).maxHeight, 119);

const delivery = compile('lib/media-delivery.ts');
const service = compile('lib/image-service.ts', { '@/lib/media-delivery': delivery });
const { schedulePosterImage } = compile('lib/schedule-poster.ts', { '@/lib/image-service': service });
const primary = 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/medium/test.jpg';
const secondary = 'https://shikimori.io/system/animes/original/123.jpg';
assert.deepEqual(schedulePosterImage(primary, secondary), { large: primary, extraLarge: secondary });
assert.deepEqual(schedulePosterImage('https://shikimori.io/assets/globals/missing_original.jpg', primary), { large: primary, extraLarge: primary });
assert.equal(schedulePosterImage('/brand/brand-mark.png', 'javascript:alert(1)', null), null);
const chain = service.getImageCandidates(schedulePosterImage(primary, secondary), 'compact', { preset: 'tiny' });
const proxy = service.proxyImageUrl(primary);
assert.ok(chain.indexOf(proxy) >= 0);
assert.equal(chain.filter((src) => src.startsWith('/api/image?'))[0], proxy);
assert.ok(!chain.includes(secondary), 'Shikimori stays server-side');
assert.ok(!chain.includes(primary), 'tiny recovery does not spend attempts on blocked direct origins');
assert.equal(new Set(chain).size, chain.length);

async function testJikan() {
  const anime = { mal_id: 123, title: 'Fixture', airing: true, broadcast: { day: 'Mondays', time: '20:00', timezone: 'Asia/Tokyo' }, images: { jpg: { large_image_url: 'https://cdn.myanimelist.net/images/anime/test.jpg' } } };
  const tables = {
    anime_schedule_snapshots: { data: { updated_at: new Date().toISOString(), payload: { complete: true, anime: [anime] } }, error: null },
    anime_availability: { data: [{ anime_id: 1001, mal_id: 123 }], error: null },
    anime_search_documents: { data: [{ anime_id: 1001, title: 'Тайтл', slug: 'fixture-1001', poster_url: null, format: 'TV' }], error: null },
  };
  const runtime = compile('lib/jikan-schedule-server.ts', {
    'server-only': {}, '@/lib/schedule-poster': { schedulePosterImage },
    '@/lib/anime-url': { stableAnimeSlug: (id) => `fixture-${id}` },
    '@/lib/supabase/admin': { createSupabaseAdmin: () => ({ from: (table) => ({
      select() { return this; }, eq() { return this; }, abortSignal() { return this; },
      maybeSingle: async () => tables[table], in: async () => tables[table],
    }) }) },
  });
  const result = await runtime.getJikanSchedule(Date.parse('2026-10-12T00:00:00Z') / 1000, Date.parse('2026-10-13T00:00:00Z') / 1000);
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].media.id, 1001);
  assert.equal(result.items[0].media.coverImage.large, anime.images.jpg.large_image_url);
}
async function testComponent() {
  const React = require('react'), { create, act } = require('react-test-renderer');
  global.IS_REACT_ACT_ENVIRONMENT = true;
  let height, direction;
  const hidden = { getClientRects: () => [], getBoundingClientRect: () => ({ top: 0, bottom: 0, width: 0, height: 0 }) };
  global.document = { querySelectorAll: () => [hidden], addEventListener() {}, removeEventListener() {} };
  global.window = { innerHeight: 900, getComputedStyle: () => ({ display: 'none', visibility: 'visible' }), addEventListener() {}, removeEventListener() {} };
  const menu = { scrollHeight: 430, dataset: {}, style: { setProperty: (_, value) => { height = value; } }, querySelector: () => ({ focus() {} }) };
  const runtime = compile('components/catalog/MoodFilter.tsx', {
    'next/image': { __esModule: true, default: () => React.createElement('img') },
    '@/lib/catalog-moods': { CATALOG_MOODS: [{ id: 'any', label: 'Любое настроение', icon: '/test.svg' }] },
    '@/lib/mood-menu-layout': { moodMenuLayout }, './MoodFilter.module.css': { __esModule: true, default: { dropdown: 'dropdown', root: 'root', trigger: 'trigger' } },
  });
  let tree;
  await act(async () => { tree = create(React.createElement(runtime.default, { value: 'any', onChange() {} }), { createNodeMock: (el) => {
    if (el.props.role === 'listbox') return menu;
    if (el.type === 'button' && el.props['aria-haspopup']) return { getBoundingClientRect: () => base.trigger, focus() {} };
    return { contains: () => false };
  } }); });
  await act(async () => tree.root.findAllByType('button')[0].props.onClick());
  direction = menu.dataset.direction;
  assert.equal(height, '430px'); assert.equal(direction, 'down');
  await act(async () => tree.unmount());
}
(async () => { await testJikan(); await testComponent(); console.log('PASS: actual mood popup ignores hidden desktop nav; viewport/upward/mobile geometry, tiny proxy order and Jikan provider poster recovery.'); })().catch((error) => { console.error(error); process.exitCode = 1; });
