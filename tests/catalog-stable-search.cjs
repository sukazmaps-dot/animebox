/* Mount the real catalog: controlled network order, real state/effects and
 * reconciliation. Presentational components and unrelated services are stubs. */
// Production builds run prebuild too; React act belongs to the test runtime.
process.env.NODE_ENV = 'test';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const React = require('react');
const {create, act} = require('react-test-renderer');
global.IS_REACT_ACT_ENVIRONMENT = true;
const calls = [], previews = [], timers = new Map();
let timerId = 0;
const events = new EventTarget();
const location = new URL('https://fixture.test/search?search=eva');
global.window = {
  location, history: {state: null, replaceState() {}, pushState() {}},
  addEventListener: events.addEventListener.bind(events),
  removeEventListener: events.removeEventListener.bind(events),
  dispatchEvent: events.dispatchEvent.bind(events),
  setTimeout(fn) {timers.set(++timerId, fn);return timerId;},
  clearTimeout(id) {timers.delete(id);},
  requestAnimationFrame() {return 1;}, cancelAnimationFrame() {},
};
function deferred() {
  let resolve, reject;
  const promise = new Promise((a,b) => {resolve=a;reject=b;});
  return {promise, resolve, reject};
}
const blank = () => null;
const defaults = {demographics:[],discovery:[],studios:[],season:null,format:null,status:null,sort:'rating'};
const mocks = {
  '@/components/AnimeCard': {default: ({anime}) => React.createElement('card', {anime})},
  '@/components/catalog/ActiveCatalogFilters': {default:blank,catalogActiveFilterLabels:()=>[]},
  '@/lib/anime-client': {
    getAnimesWithMeta(options, fetchOptions) {const d=deferred();calls.push({...d,options,fetchOptions});return d.promise;},
    isAbortError:e=>e?.name==='AbortError',
  },
  '@/lib/instant-search-client': {getInstantAnimeSearch(query) {const d=deferred();previews.push({...d,query});return d.promise;}},
  '@/lib/search-query': {classifySearchQuery:()=>({mode:'title'})},
  '@/lib/search-intent': {parseAnimeSearchIntent:()=>null},
  '@/lib/smart-discovery': {parseSmartDiscoveryQuery:()=>null},
  '@/lib/taste-graph': {readCachedTasteGraph:()=>null,fetchTasteGraph:async()=>null},
  '@/lib/product-events-client': {trackProductClientEvent() {}},
  '@/lib/anime-storage': {readAnimeFavorites:()=>[],ANIME_FAVORITES_STORAGE_KEY:'favorites'},
  '@/lib/anime-display': {getAnimeTitle:a=>a.title.russian,isAnimeOngoing:()=>false},
  '@/lib/catalog-filter-state': {
    DEFAULT_CATALOG_FILTERS:defaults,CATALOG_DEMOGRAPHICS:[],CATALOG_DISCOVERY_FILTERS:[],CATALOG_STUDIOS:[],
    catalogFiltersAreDefault:f=>!f.format,catalogFiltersEqual:(a,b)=>JSON.stringify(a)===JSON.stringify(b),
    catalogFiltersToProviderOptions:()=>({genres:[],tags:[],studioNames:[]}),
    catalogFilterCount:f=>f.format?1:0,writeCatalogFiltersToUrl:url=>url,
    parseCatalogFiltersFromSearchParams:()=>defaults,
  },
};
const real = new Set(['@/lib/catalog-request-state','@/lib/anime-metadata-merge','@/lib/catalog-pagination']);
const originalLoad = Module._load;
const extensions = ['.ts','.tsx'].map(ext=>[ext,require.extensions[ext]]);
Module._load = function(name, parent, main) {
  if (mocks[name]) return {__esModule:true,...mocks[name]};
  if (name.endsWith('.module.css')) return {__esModule:true,default:{}};
  if (real.has(name)) return originalLoad.call(this,path.resolve(name.slice(2)+'.ts'),parent,main);
  if (name.startsWith('@/')) return {__esModule:true,default:blank};
  return originalLoad.call(this,name,parent,main);
};
for (const [ext] of extensions) require.extensions[ext] = (mod,file) => mod._compile(ts.transpileModule(
  fs.readFileSync(file,'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,
    jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}},
).outputText,file);
const Catalog = require('../components/SearchCatalogClient.tsx').default;
const {reconcileCatalogFirstPage} = require('../lib/anime-metadata-merge.ts');
const anime = id=>({id,title:{russian:'Anime '+id},genres:[],coverImage:{large:'poster-'+id}});
const payload = (ids, source, more=false)=>({anime:ids.map(anime),
  ...(source?{catalogMeta:{source,completeness:'partial',message:'Резервный каталог'}}:{}),
  pagination:{hasNextPage:more}});
let tree;
async function mount(props={}) {
  calls.length=0;previews.length=0;timers.clear();
  await act(async()=>{tree=create(React.createElement(Catalog,{initialResults:[],initialQuery:'eva',...props}));});
}
const ids = ()=>tree.root.findAllByType('card').map(x=>x.props.anime.id);
const button = text=>tree.root.findAllByType('button').find(x=>x.children.includes(text));
const flushTimers = async()=>act(async()=>{const pending=[...timers.values()];timers.clear();pending.forEach(fn=>fn());});
const unmount = async()=>act(async()=>{tree.unmount();});
(async()=>{
  await mount();
  assert.equal(calls[0].options.catalogSource,'saved','normal searches must use the canonical playable snapshot');
  await act(async()=>previews[0].resolve({items:Array.from({length:10},(_,i)=>anime(i+1))}));
  await act(async()=>calls[0].resolve(payload([1,2,3],'saved')));
  assert.deepEqual(ids(),[1,2,3,4,5,6,7,8,9,10],'10 instant results must survive a 3-item fallback');
  await unmount();

  await mount();
  await act(async()=>previews[0].resolve({items:[anime(1)]}));
  const activeFilters=tree.root.findAll(node=>typeof node.props.onRemoved==='function')[0];
  await act(async()=>activeFilters.props.onChange({...defaults,format:'TV'}));
  await act(async()=>calls.at(-1).resolve(payload([8],'saved')));
  assert.deepEqual(ids(),[8],'changing filters replaces membership even with a partial response');
  await unmount();

  await mount();
  await act(async()=>calls[0].resolve(payload([1,2,3],'saved',true)));
  assert.deepEqual(ids(),[1,2,3],'saved-first response becomes usable immediately');
  await act(async()=>previews[0].resolve({items:[anime(1),anime(4)]}));
  assert.deepEqual(ids(),[1,2,3,4],'late preview supplements a partial response');
  assert(button('Показать ещё'),'late preview cannot erase pagination');
  await unmount();

  await mount();
  await act(async()=>previews[0].resolve({items:[anime(1),anime(2)]}));
  await act(async()=>calls[0].resolve(payload([])));
  assert.deepEqual(ids(),[],'a complete empty response owns membership');
  await unmount();

  // Canonical saved results are complete for the requested scope. Unlike
  // degraded fallback, they must replace a preliminary instant preview.
  await mount();
  await act(async()=>previews[0].resolve({items:[anime(1),anime(2)]}));
  await act(async()=>calls[0].resolve({
    ...payload([9],'saved',true),
    catalogMeta:{source:'saved',completeness:'full',message:''},
  }));
  assert.deepEqual(ids(),[9],'complete saved page replaces preview membership');
  assert(button('Показать ещё'),'complete canonical page must retain pagination');
  await unmount();

  await mount();
  await act(async()=>calls[0].resolve(payload([3])));
  await act(async()=>previews[0].resolve({items:[anime(1)]}));
  assert.deepEqual(ids(),[3],'late preview cannot undo a complete response');
  await unmount();

  await mount();
  await act(async()=>previews[0].resolve({items:[anime(1),anime(2)]}));
  await act(async()=>calls[0].resolve({...payload([1],'saved'),availabilityExcludedIds:[2]}));
  assert.deepEqual(ids(),[1],'explicit availability exclusion beats partial retention');
  await unmount();

  await mount();
  await act(async()=>previews[0].resolve({items:[anime(1),anime(2)]}));
  await act(async()=>calls[0].resolve(payload([1],'degraded')));
  assert.deepEqual(ids(),[1],'registry degradation must not revive unconfirmed previews');
  const old = calls[0];
  await act(async()=>window.dispatchEvent(new CustomEvent('animebox-search-input',{detail:{query:'bleach'}})));
  await flushTimers();
  assert(old.fetchOptions.signal.aborted,'query changes cancel old work');
  await act(async()=>calls.at(-1).resolve(payload([9],'saved')));
  assert.deepEqual(ids(),[9],'partial response for a new query cannot retain old titles');
  await unmount();

  await mount();
  const stalePreview=previews[0], staleRequest=calls[0];
  await act(async()=>window.dispatchEvent(new CustomEvent('animebox-search-input',{detail:{query:'bleach'}})));
  await flushTimers();
  await act(async()=>calls.at(-1).resolve(payload([9],'saved')));
  await act(async()=>{staleRequest.resolve(payload([1]));stalePreview.resolve({items:[anime(2)]});});
  assert.deepEqual(ids(),[9],'stale success and stale preview cannot overwrite the new query');
  await unmount();

  await mount();
  await act(async()=>previews[0].resolve({items:[]}));
  await act(async()=>calls[0].resolve(payload([1],undefined,true)));
  await act(async()=>{button('Показать ещё').props.onClick();button('Показать ещё').props.onClick();});
  assert.equal(calls.length,2,'two load-more clicks in one render issue one request');
  assert.equal(calls[1].options.page,2);
  await act(async()=>calls[1].reject(new Error('offline')));
  assert.deepEqual(ids(),[1],'page failure retains loaded cards');
  await act(async()=>button('Повторить').props.onClick());
  assert.equal(calls[2].options.page,2,'retry must repeat page 2, not skip to 3');
  assert.equal(calls[2].fetchOptions.refresh,true,'explicit retry bypasses cached fallback');
  await act(async()=>calls[2].resolve(payload([1,2],undefined,true)));
  assert.deepEqual(ids(),[1,2],'pagination deduplicates overlaps');
  await act(async()=>button('Показать ещё').props.onClick());
  assert.equal(calls[3].options.page,3);
  await act(async()=>calls[3].resolve(payload([50],'saved')));
  assert.deepEqual(ids(),[1,2],'do not append a different source at incompatible offsets');
  assert.equal(calls[4].options.page,1,'source mismatch automatically restarts at page 1');
  await act(async()=>calls[4].resolve(payload([1,2,3])));
  await unmount();

  await mount({initialQuery:'',initialResults:Array.from({length:20},(_,i)=>anime(i+1))});
  await act(async()=>button('Показать ещё').props.onClick());
  await act(async()=>calls[0].resolve(payload([21])));
  assert.equal(ids().length,21,'SSR first page can load page 2 without a false source change');
  await unmount();

  await mount({initialQuery:'',initialResults:[anime(1),anime(2)],initialSource:'saved',initialHasNextPage:true});
  await act(async()=>button('Показать ещё').props.onClick());
  await act(async()=>calls[0].resolve(payload([3],'saved')));
  assert.deepEqual(ids(),[1,2,3],'SSR carries saved source and explicit pagination even for a short page');
  await unmount();

  const partial={sameScope:true,partial:true,registryDegraded:false};
  const rich={...anime(1),episodes:26,score:8.3};
  const merged=reconcileCatalogFirstPage([{...anime(1),score:8.5}], [rich,anime(2)],partial);
  assert.equal(merged[0].episodes,26);assert.equal(merged[0].score,8.5);
  assert.equal(reconcileCatalogFirstPage([{...anime(1),score:1}],[rich],{...partial,preview:true})[0].score,8.3,
    'late index shell cannot overwrite known saved metadata');
  assert.deepEqual(reconcileCatalogFirstPage([anime(3)],[anime(1)],{...partial,sameScope:false}).map(x=>x.id),[3],
    'filter/mood scope changes cannot merge old membership');
  console.log('PASS: mounted catalog response races, partial retention, exclusions, pagination failure/retry and SSR continuation.');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>{
  Module._load=originalLoad;
  for(const [ext,original] of extensions) {if(original)require.extensions[ext]=original;else delete require.extensions[ext];}
});
