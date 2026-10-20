const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const ts = require('typescript');

const state = {
  reads: 0,
  rpcCalls: 0,
  rows: [
    {anime_id:11, title:'Пожалуйста, простите моих младших братьев', slug:'11-test',
      aliases:['Please Forgive My Younger Brothers'], poster_url:'https://example.test/11.jpg',
      genres:['Comedy'], search_text:'пожалуйста простите моих младших братьев'},
    {anime_id:12, title:'Добро пожаловать в NHK', slug:'12-nhk',
      aliases:['Welcome to the NHK'], poster_url:'https://example.test/12.jpg',
      genres:['Drama'], search_text:'добро пожаловать в nhk welcome to the nhk'},
    {anime_id:13, title:'Другое аниме', slug:'13-anime',
      aliases:['Добро пожаловать'], poster_url:'https://example.test/13.jpg',
      genres:[], search_text:'другое аниме добро пожаловать'},
  ],
};

function searchBuilder() {
  let pattern = '', limit = 100;
  const q = {
    select: () => q,
    like: (column, value) => {
      assert.equal(column, 'search_text');
      pattern = value.slice(1, -1);
      return q;
    },
    order: () => q,
    limit: (value) => {limit = value;return q;},
    abortSignal: (signal) => {assert(signal);return q;},
    then(resolve, reject) {
      state.reads++;
      return Promise.resolve({
        data: state.rows.filter(row => row.search_text.includes(pattern)).slice(0, limit),
        error: null,
      }).then(resolve, reject);
    },
  };
  return q;
}

const norm = v => String(v).normalize('NFKC').toLowerCase()
  .replace(/ё/g, 'е').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const stubs = {
  'server-only': {},
  '@/lib/supabase/admin': { createSupabaseAdmin: () => ({
    from: name => {assert.equal(name,'anime_search_documents');return searchBuilder();},
    rpc: async () => {
      state.rpcCalls++;
      return {data:[{anime_id:90,title:'Наруто',slug:'90-naruto',
        similarity_score:0.78,genres:[],matched_text:'Наруто',match_kind:'fuzzy'}],error:null};
    },
  }) },
  '@/lib/combined-anime': {getAnimesByIdsWithShikimori:async()=>[]},
  '@/lib/smart-search': {
    normalizeSearchText:norm,
    buildSearchQueryVariants:q=>[q],
  },
  '@/lib/public-result-cache': {createPublicResultCache:()=> (_key, run)=>run()},
};
const originalLoad=Module._load;
const originalTs=require.extensions['.ts'];
Module._load=function(name,...args) {
  return Object.hasOwn(stubs,name) ? stubs[name] : originalLoad.call(this,name,...args);
};
require.extensions['.ts']=(mod,file)=>mod._compile(ts.transpileModule(
  fs.readFileSync(file,'utf8'),
  {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}},
).outputText,file);

(async () => {
  const {searchInstantLocalIndex}=require('../lib/search-index-server.ts');
  const hits=await searchInstantLocalIndex('добро пожаловать',8);
  assert.deepEqual(hits.map(x=>x.animeId),[13,12],
    'exact alias must outrank contains title');
  assert.equal(hits[0].matchKind,'exact');
  assert.equal(state.rpcCalls,0,'common title may not run expensive fuzzy RPC');
  assert.equal(state.reads,1,'common title should execute one indexed SQL query');

  state.rows=[];
  const recovered=await searchInstantLocalIndex('наруту',8);
  assert.equal(recovered[0].animeId,90,
    'typos preserve existing lexical v4 recovery');
  assert.equal(state.rpcCalls,1,'only empty fast results need fuzzy RPC');

  const route=fs.readFileSync('app/api/search/instant/route.ts','utf8');
  assert(route.includes('searchInstantLocalIndex(query, limit)'));
  assert(route.includes('filterAnimeIdsByAvailability(ids)'),
    'fast index is never allowed to bypass verified playability');
  console.log('PASS: fast indexed title/alias ranking, fuzzy fallback and playable filtering boundary');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>{
  Module._load=originalLoad;
  if(originalTs)require.extensions['.ts']=originalTs;else delete require.extensions['.ts'];
});
