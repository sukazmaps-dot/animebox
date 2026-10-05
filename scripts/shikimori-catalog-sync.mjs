// Run locally where Shikimori is reachable. No secrets are sent to Shikimori.
import {existsSync} from 'node:fs';
import {createClient} from '@supabase/supabase-js';
import {normalizeShikimoriMetadata} from '../lib/shikimori-metadata.mjs';
for(const path of ['.env.local','.env'])if(existsSync(path))process.loadEnvFile(path);
const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
if(!url||!key)throw new Error('Configure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local');
const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
const maxDetails=Math.min(1000,Math.max(0,Number(process.argv.find(v=>v.startsWith('--details='))?.split('=')[1]??1000)));
let lastRequest=0;
async function request(path){
  const wait=Math.max(0,1100-(Date.now()-lastRequest));if(wait)await new Promise(r=>setTimeout(r,wait));
  lastRequest=Date.now();
  const response=await fetch('https://shikimori.io/api/'+path,{headers:{'User-Agent':'AnimeBox/1.0',Accept:'application/json'},signal:AbortSignal.timeout(20_000)});
  if(!response.ok)throw new Error(`Shikimori HTTP ${response.status}; stop and rerun later`);
  return response.json();
}
async function allRows(table,fields){
  const rows=[];
  for(let offset=0;;offset+=1000){
    const primary=table==='anime_shikimori_metadata'?'mal_id':'anime_id';
    const {data,error}=await db.from(table).select(fields).order(primary).range(offset,offset+999).abortSignal(AbortSignal.timeout(30_000));
    if(error)throw new Error(`${table}: ${error.message}`);
    rows.push(...data);if(data.length<1000)return rows;
  }
}
function preserveMissing(row,previous){
  if(!previous)return row;
  const result={...row};
  for(const field of ['title_ru','title_romaji','poster_url','format','status','start_year','start_month','episodes','episodes_aired','score'])
    if(result[field]==null && previous[field]!=null)result[field]=previous[field];
  return result;
}
async function save(rows){
  if(!rows.length)return;
  const {error}=await db.from('anime_shikimori_metadata').upsert(rows,{onConflict:'mal_id'});
  if(error)throw new Error(`Metadata write: ${error.message}`);
}
try{
  const mapping=await allRows('anime_availability','anime_id,mal_id,availability_status');
  const existing=await allRows('anime_shikimori_metadata','*');
  const documents=await allRows('anime_search_documents','anime_id,description,studios,genres');
  const needsDetail=new Set(documents.filter(r=>!r.description?.trim()||!r.studios?.length||!r.genres?.length).map(r=>Number(r.anime_id)));
  const detailMalIds=new Set(mapping.filter(r=>r.availability_status==='playable'&&needsDetail.has(Number(r.anime_id))).map(r=>Number(r.mal_id)));
  const byId=new Map(existing.map(r=>[Number(r.mal_id),r]));
  let calendar, freshCalendar=true;
  try { calendar=await request('calendar'); }
  catch(error){
    const saved=await db.from('anime_schedule_snapshots').select('payload,updated_at').eq('provider','shikimori').maybeSingle();
    const age=Date.now()-Date.parse(saved.data?.updated_at);
    if(saved.error||!saved.data?.payload?.complete||!Number.isFinite(age)||age < -60_000||age>48*3600_000)throw error;
    calendar=saved.data.payload.anime;freshCalendar=false;
    console.log('Calendar unavailable; keeping saved calendar timestamp and continuing metadata sync');
  }
  if(!Array.isArray(calendar)||calendar.length>300)throw new Error('Invalid calendar response');
  const validCalendar=calendar.filter(r=>r?.anime && Number.isSafeInteger(r.anime.id) &&
    typeof r.anime.name==='string' && typeof r.next_episode_at==='string' &&
    /(?:Z|[+-]\d{2}:\d{2})$/.test(r.next_episode_at) && Number.isFinite(Date.parse(r.next_episode_at)) &&
    (r.next_episode==null||(Number.isSafeInteger(r.next_episode)&&r.next_episode>0)));
  if(calendar.length && !validCalendar.length)throw new Error('Invalid calendar entries');
  if(freshCalendar){
  const {error}=await db.from('anime_schedule_snapshots').upsert({provider:'shikimori',payload:{anime:validCalendar,complete:true},updated_at:new Date().toISOString()},{onConflict:'provider'});
  if(error)throw new Error(`Calendar write: ${error.message}`);
  console.log(`Calendar saved: ${validCalendar.length} entries`);
  }
  const ids=[...new Set([...mapping.map(r=>Number(r.mal_id)),...validCalendar.map(r=>r.anime.id)])]
    .filter(id=>Number.isSafeInteger(id)&&id>0);
  const due=ids.filter(id=>!byId.has(id)||Date.now()-Date.parse(byId.get(id).fetched_at)>24*3600_000);
  let imported=0;
  for(let offset=0;offset<due.length;offset+=50){
    const batch=due.slice(offset,offset+50);
    const json=await request(`animes?ids=${batch.join(',')}&limit=${batch.length}`);
    if(!Array.isArray(json))throw new Error('Invalid anime list');
    const rows=json.map(r=>normalizeShikimoriMetadata(r)).filter(r=>r&&batch.includes(r.mal_id)).map(row=>{
      const previous=byId.get(row.mal_id);
      // A list response has no description/studios/genres; keep detail fields.
      return {...preserveMissing(row,previous),description:row.description||previous?.description||null,
        genres:row.genres.length?row.genres:previous?.genres||[],studios:row.studios.length?row.studios:previous?.studios||[],
        detail_fetched_at:previous?.detail_fetched_at||null};
    });
    await save(rows);for(const row of rows)byId.set(row.mal_id,row);
    imported+=rows.length;console.log(`Metadata saved: ${imported}/${due.length}`);
  }
  const detailIds=ids.filter(id=>{
    const row=byId.get(id);return detailMalIds.has(id)&&row&&(!row.detail_fetched_at||Date.now()-Date.parse(row.detail_fetched_at)>7*24*3600_000);
  }).slice(0,maxDetails);
  let detailed=0;
  for(const id of detailIds){
    const json=await request(`animes/${id}`);const row=normalizeShikimoriMetadata(json,undefined,true);
    if(!row||row.mal_id!==id)throw new Error('Unexpected detail ID');
    const previous=byId.get(id);
    const merged={...preserveMissing(row,previous),description:row.description||previous.description||null,
      genres:row.genres.length?row.genres:previous.genres,studios:row.studios.length?row.studios:previous.studios};
    await save([merged]);byId.set(id,merged);detailed++;
    if(detailed%10===0||detailed===detailIds.length)console.log(`Details saved: ${detailed}/${detailIds.length}`);
  }
  console.log('Sync complete. Repeated runs skip fresh metadata and completed details.');
}catch(error){
  // Never print request/DB objects containing credentials.
  console.error(error instanceof Error?error.message:'Sync failed');process.exitCode=1;
}
