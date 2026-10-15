import assert from 'node:assert/strict';
import ts from 'typescript';
import * as crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

// Run production eligibility and candidate functions with isolated services.
const state = globalThis.seoMediaTest = {
  confirmed: null, restricted: false, provider: { status: 'unknown', episodes: [] },
  providerCalls: 0, seoRow: null, local: null, remote: null, query: [], writes: [],
};
const fixtures = new Map([
  ['server-only', ''],
  ['react', `export const cache = fn => { const map=new Map(); return (...args) => {
    const key=JSON.stringify(args); if(!map.has(key))map.set(key,fn(...args)); return map.get(key);
  }; };`],
  ['next/cache', 'export const unstable_cache = fn => fn;'],
  ['@/lib/anime-public-metadata-server', 'export function scheduleAniListMetadataPersist(){}'],
  ['@/lib/anilist', 'export async function getAnimeById(){return globalThis.seoMediaTest.remote;}'],
  ['@/lib/anime-localization-server', `export async function getLocalAnimeDetailFallback(){return globalThis.seoMediaTest.local;}
    export async function localizeAnimeDetail(anime){return anime;}`],
  ['./anime-registry', `export const findAnimeRoute=()=>null; export const findAnimeRouteById=()=>null;
    export const getAnimeIdFromStableSlug=slug=>Number(slug.split('-').at(-1));
    export const registerAnime=anime=>({...anime,slug:'fixture-'+anime.id});`],
  ['@/lib/episode-provider-availability', `export async function getEpisodeProviderAvailability(){
    globalThis.seoMediaTest.providerCalls++;return globalThis.seoMediaTest.provider;
  }`],
  ['@/lib/copyright-server', 'export async function getPlaybackRestriction(){return globalThis.seoMediaTest.restricted?{}:null;}'],
  ['@/lib/seo-episode-index', `export async function syncSeoEpisodeIndex(){}
    export async function getSeoEpisodeIndexEntry(){return globalThis.seoMediaTest.confirmed;}`],
  ['@/lib/supabase/admin', `export function createSupabaseAdmin(){return {from(table){
    globalThis.seoMediaTest.query.push(['from',table]);return {
      select(fields){globalThis.seoMediaTest.query.push(['select',fields]);return this;},
      eq(field,value){globalThis.seoMediaTest.query.push(['eq',field,value]);return this;},
      async in(){return {data:[],error:null};},
      async upsert(rows){globalThis.seoMediaTest.writes.push(...rows);return {error:null};},
      async maybeSingle(){return {data:globalThis.seoMediaTest.seoRow,error:null};}
    };
  }};}`],
]);
try {
  process.env.NODE_ENV = 'production';
  const modules = new Map();
  function load(name, parent = process.cwd()) {
    if (name === 'node:crypto') return crypto;
    const fixture = fixtures.get(name);
    const path = fixture !== undefined ? name : resolve(
      name.startsWith('@/') ? name.slice(2) : parent,
      name.startsWith('@/') ? '' : name,
    ) + '.ts';
    if (modules.has(path)) return modules.get(path).exports;
    const mod = {exports: {}};
    modules.set(path, mod);
    const code = ts.transpileModule(fixture ?? readFileSync(path, 'utf8'), {
      compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022},
    }).outputText;
    new Function('require', 'module', 'exports', code)(
      dependency => load(dependency, dirname(path)), mod, mod.exports,
    );
    return mod.exports;
  }
  const runtime = Object.assign({}, ...[
    '@/lib/anime-seo', '@/lib/episode-seo', '@/lib/image-service',
    '@/lib/anime-route', '@/lib/seo-anime-index-server',
  ].map(name => load(name)));
  const minimal = { id: 154587, title: {russian: 'Фрирен'} };
  assert.equal(runtime.animeSeoQualityScore(minimal), 0);
  assert.equal(runtime.shouldIndexAnime(minimal), true);
  const meta = runtime.buildAnimeMetadata(minimal, 'https://youranimebox.com/anime/frieren-154587');
  assert.equal(meta.robots.index, true);
  assert.equal(meta.robots.googleBot.index, true);
  assert.equal(runtime.shouldIndexAnime({...minimal, catalogEligible: false}), false);
  assert.equal(runtime.shouldIndexAnime({...minimal, id: -1}), false);
  assert.equal(runtime.shouldIndexAnime({id: 1, title: {russian: '  '}}), false);
  await runtime.syncSeoAnimeSourceEntries([{...minimal, slug:'frieren-154587', image:null}], 0);
  assert.equal(state.writes[0].quality_score, 0);
  assert.equal(state.writes[0].indexable, true, 'Sitemap eligibility matches metadata');

  state.remote = minimal;
  state.confirmed = {firstAvailableAt: '2026-09-01'};
  assert.equal(await runtime.isEpisodeIndexable(154587, 1), true);
  assert.equal(state.providerCalls, 0, 'Known episode avoids live provider work');
  state.restricted = true;
  assert.equal(await runtime.isEpisodeIndexable(154587, 2), false);
  state.restricted = false; state.confirmed = null;
  assert.equal(await runtime.isEpisodeIndexable(154587, 3), false, 'Unknown never-confirmed episode stays closed');
  state.provider = {status: 'available', episodes: [4]};
  assert.equal(await runtime.isEpisodeIndexable(154587, 4), true);
  const calls = state.providerCalls;
  assert.equal(await runtime.isEpisodeIndexable(154587, 4), true);
  assert.equal(state.providerCalls, calls, 'Metadata and body share request result');
  assert.equal(await runtime.isEpisodeIndexable(154587, 0), false);

  state.remote = null;
  state.seoRow = {anime_id: 123, title: 'Архивный тайтл', slug: 'archive-123', image_url: null, status: 'FINISHED'};
  const fallback = await runtime.getSeoAnimeDetailFallback(123);
  assert.equal(fallback.title.russian, 'Архивный тайтл');
  assert.equal(runtime.shouldIndexAnime(fallback), true);
  assert.ok(state.query.some(row => row[0] === 'eq' && row[1] === 'indexable' && row[2] === true));
  const recovered = await runtime.resolveAnimeRoute('archive-123');
  assert.equal(recovered.id, 123);
  assert.equal(recovered.slug, 'archive-123', 'Partial fallback preserves sitemap canonical');
  state.seoRow = null;
  assert.equal(await runtime.resolveAnimeRoute('missing-999'), null);

  const poster = {large:'https://s4.anilist.co/large.jpg', medium:'https://s4.anilist.co/medium.jpg', extraLarge:'https://s4.anilist.co/huge.jpg'};
  const tiny = runtime.getImageCandidates(poster, 'compact', {preset:'tiny'});
  assert.ok(tiny[0].startsWith('https://media.youranimebox.com/image?'));
  assert.equal(new URL(tiny[0]).searchParams.get('w'), '144');
  assert.ok(tiny[1].startsWith('/api/image?'), 'Tiny edge failure goes straight to same-origin recovery');
  assert.equal(new URL(tiny[1], 'https://youranimebox.com').searchParams.get('url'), poster.large);
  assert.ok(tiny.includes(poster.extraLarge), 'Tiny recovery retains the independent larger source');
  assert.ok(tiny.some(url => url.startsWith('/api/image?') && new URL(url, 'https://youranimebox.com').searchParams.get('url') === poster.extraLarge), 'Original has a server relay fallback');
  const qualityTiny = runtime.getImageCandidates(poster, 'quality', {preset:'tiny'});
  assert.equal(new URL(qualityTiny[0]).searchParams.get('url'), poster.extraLarge);
  const card = runtime.getImageCandidates(poster, 'compact', {preset:'card'});
  assert.equal(card[1], poster.extraLarge, 'Normal poster fidelity preserved');
  const srcSet = runtime.getImageMediaSrcSet(poster, 'compact', 'tiny');
  assert.ok(srcSet.includes('96w') && srcSet.includes('144w') && srcSet.includes('240w'));
  for (const path of ['app/login/layout.tsx', 'app/settings/page.tsx', 'app/admin/layout.tsx']) {
    assert.ok(readFileSync(path, 'utf8').includes('index: false'), `${path} remains private`);
  }
  console.log('PASS: public metadata, episode outage stability/deduplication, registry query/fallback, private pages and tiny image candidates.');
} finally {
  delete globalThis.seoMediaTest;
}
