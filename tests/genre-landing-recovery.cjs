const assert=require('node:assert/strict'), fs=require('node:fs'), path=require('node:path'), Module=require('node:module'), ts=require('typescript');
const originalLoad=Module._load, originalResolve=Module._resolveFilename;
let source='offline', cachedRows=[{anime_id:1,title:'Обещанный Неверленд',genres:['Психологическое'],poster_url:'/poster.webp',slug:'neverland'},{anime_id:2,title:'Драма',genres:['Драма'],poster_url:'/drama.webp'}], dbError=false, queryGenres=[];
const cache=new Map();
const stubs={
 'server-only':{},
 'next/cache':{unstable_cache:fn=>async genre=>{if(cache.has(genre))return cache.get(genre);const value=await fn(genre);cache.set(genre,value);return value;}},
 '@/lib/combined-anime':{getAnimesWithShikimori:async(opts,budget)=>{assert.equal(opts.genres[0],'Psychological');assert(budget.signal);if(source==='offline')throw Error('provider timeout');if(source==='empty')return [];return [{id:3,genres:['Psychological']}];}},
 '@/lib/supabase/admin':{createSupabaseAdmin:()=>({from(table){assert.equal(table,'anime_search_documents');const q={select(){return q;},overlaps(_key,values){queryGenres=values;return q;},not(){return q;},order(){return q;},limit(){return Promise.resolve(dbError?{error:Error('database down')}:{data:cachedRows});}};return q;}})},
 '@/lib/search-index-server':{localAnimeSearchHitToAnime:hit=>({id:hit.animeId,title:{russian:hit.title},genres:hit.genres})},
};
Module._load=function(name,...args){return Object.hasOwn(stubs,name)?stubs[name]:originalLoad.call(this,name,...args);};
Module._resolveFilename=function(name,...args){return originalResolve.call(this,name.startsWith('@/')?path.resolve(name.slice(2)):name,...args);};
require.extensions['.ts']=(mod,file)=>mod._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,file);
(async()=>{
 const {getGenreLandingCollection}=require('../lib/genre-landing-server.ts');
 const fallback=await getGenreLandingCollection('Psychological','Психологическое');
 assert.equal(fallback.status,'fallback');assert.deepEqual(fallback.items.map(x=>x.id),[1]);assert(queryGenres.includes('Психологическое'));
 cachedRows=[];source='empty';assert.equal((await getGenreLandingCollection('Psychological','Психологическое')).status,'empty');
 source='offline';assert.equal((await getGenreLandingCollection('Psychological','Психологическое')).status,'unavailable');
 dbError=true;assert.equal((await getGenreLandingCollection('Psychological','Психологическое')).status,'unavailable');
 source='healthy';assert.equal((await getGenreLandingCollection('Psychological','Психологическое')).status,'ready','failed source is not cached for an hour');
 source='offline';assert.equal((await getGenreLandingCollection('Psychological','Психологическое')).status,'ready','successful data is reusable');
 const {parseCatalogFilters,catalogFiltersToProviderOptions}=require('../lib/catalog-filter-state.ts');
 for(const genre of ['psychological','drama','action']) {
 const provider=catalogFiltersToProviderOptions(parseCatalogFilters({tags:genre}));assert.equal(provider.genres.length,1,genre+' fallback keeps genre');
 }
 console.log('PASS: genre outage/fallback isolation, empty vs unavailable, source recovery, successful cache, catalog genre links');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>{Module._load=originalLoad;Module._resolveFilename=originalResolve;});
