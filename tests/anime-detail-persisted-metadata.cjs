const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
function load(file,imports){const mod={exports:{}};const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;new Function('require','module','exports',code)(name=>{if(name==='server-only')return{};if(!(name in imports))throw Error(name);return imports[name]},mod,mod.exports);return mod.exports;}
let description=null,providerCalls=0;
const row={mal_id:5114,title_ru:'Стальной алхимик',title_romaji:'Fullmetal Alchemist',description:'Сохранённое подробное описание',format:'TV',status:'released',start_year:2009,start_month:4,episodes:64,episodes_aired:64,score:9.1,genres:['Приключения'],studios:['Bones'],poster_url:null};
const shiki=load('lib/shikimori-metadata-server.ts',{'@/lib/supabase/admin':{}});
const admin={from(table){const query={select(){return query},eq(){return query},async maybeSingle(){return {error:null,data:table==='anime_search_documents'?{title:'Стальной алхимик',aliases:[],description}:table==='anime_availability'?{mal_id:5114}:null}}};return query}};
const localize=load('lib/anime-localization-server.ts',{
 '@/lib/shikimori-metadata-server':{...shiki,readShikimoriMetadata:async()=>new Map([[5114,row]])},
 '@/lib/community-server':{adminClient:()=>admin},
 '@/lib/fetch-retry':{fetchWithRetry:async()=>{providerCalls++;throw Error('External provider offline')}},
 '@/lib/shikimori-text':{cleanShikimoriDescription:s=>s},
}).localizeAnimeDetail;
(async()=>{
 const result=await localize({id:5114,title:{romaji:'Fullmetal Alchemist'},description:null,genres:[]});
 assert.equal(result.description,row.description);assert.equal(result.format,'TV');assert.equal(result.startDate.year,2009);assert.equal(result.episodes,64);assert.deepEqual(result.studios,[{name:'Bones'}]);assert.equal(providerCalls,0);
 description='Свежий текст из каталога';const newer=await localize({id:5114,title:{},description:'English provider text',genres:[]});assert.equal(newer.description,description);assert.equal(providerCalls,0);
 description=null;const existing=await localize({id:5114,title:{},description:'Уже полное русское описание',genres:[]});assert.equal(existing.description,'Уже полное русское описание');assert.equal(providerCalls,0);
 console.log('Persisted detail metadata: offline recovery, fields, catalog priority and existing description passed.');
})().catch(error=>{console.error(error);process.exitCode=1});
