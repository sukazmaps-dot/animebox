import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {normalizeShikimoriMetadata,shikimoriPoster} from '../lib/shikimori-metadata.mjs';
const raw={id:64340,name:'Tempal',russian:'Во всеоружии',kind:'tv',score:'7.39',status:'ongoing',episodes:12,episodes_aired:2,aired_on:'2026-10-02',
  genres:[{russian:'Фэнтези'}],studios:[{name:'Studio'}],description:'<b>Текст</b> [character=1]Герой[/character]',image:{original:'/system/animes/original/64340.jpg'}};
const row=normalizeShikimoriMetadata(raw,'2026-10-05T13:00:00Z',true);
assert.equal(row.mal_id,64340);assert.equal(row.format,'TV');assert.equal(row.score,7.39);
assert.equal(normalizeShikimoriMetadata({...raw,kind:'tv_special'}).format,'SPECIAL');
assert.equal(row.start_year,2026);assert.equal(row.start_month,10);assert.equal(row.description,'Текст Герой');
assert.equal(normalizeShikimoriMetadata({...raw,score:'0',episodes:0}).episodes,null);
assert.equal(normalizeShikimoriMetadata({...raw,score:'garbage'}).score,null);
assert.equal(normalizeShikimoriMetadata({...raw,id:'64340'}),null);
assert.equal(shikimoriPoster('/assets/globals/missing_original.jpg'),null);
assert.equal(shikimoriPoster('https://shikimori.io.evil.example/img.jpg'),null);
assert.equal(shikimoriPoster('javascript:alert(1)'),null);
const root=process.cwd(),dir=mkdtempSync(join(tmpdir(),'shikimori-metadata-'));
try{
  const fixtures=new Map([['server-only',''],['@/lib/supabase/admin','export function createSupabaseAdmin(){throw new Error("Unexpected DB call");}']]);
  await build({entryPoints:[resolve(root,'lib/shikimori-metadata-server.ts'),resolve(root,'lib/schedule-url.ts')],outdir:dir,bundle:true,platform:'node',format:'esm',plugins:[{name:'fixtures',setup(b){
    b.onResolve({filter:/.*/},a=>fixtures.has(a.path)?{path:a.path,namespace:'fixture'}:a.path.startsWith('@/')?{path:resolve(root,a.path.slice(2)+'.ts')}:null);
    b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:fixtures.get(a.path),loader:'js'}));
  }}]});
  const {mergeShikimoriMetadata}=await import(pathToFileURL(join(dir,'shikimori-metadata-server.js')));
  const anime={id:212888,idMal:64340,title:{russian:'Tempal'},genres:[]};
  const result=mergeShikimoriMetadata(anime,row);
  assert.equal(result.id,212888);assert.equal(result.idMal,64340);assert.equal(result.title.russian,'Во всеоружии');
  assert.equal(result.episodes,12);assert.equal(result.status,'Онгоинг');assert.equal(result.studios[0].name,'Studio');
  assert.equal(mergeShikimoriMetadata({...anime,idMal:1},row).score,undefined);
  assert.equal(mergeShikimoriMetadata({...anime,description:'Сохранено',score:9},row).description,'Сохранено');
  const {scheduleAnimeHref}=await import(pathToFileURL(join(dir,'schedule-url.js')));
  assert.equal(scheduleAnimeHref({id:null,title:{russian:'Тайтл'}}),'/search?search='+encodeURIComponent('Тайтл'));
  assert.equal(scheduleAnimeHref({id:212888,slug:'overgeared-212888',title:{}}),'/anime/overgeared-212888');
  assert.ok(!scheduleAnimeHref({id:null,slug:'fake-64340',title:{romaji:'Tempal'}}).includes('/anime/'));
  console.log('PASS: provider normalization, score/date/metadata enrichment, preserved canonical IDs, existing fields and safe schedule search links.');
}finally{rmSync(dir,{recursive:true,force:true});}
