import {shikimoriPoster} from '@/lib/shikimori-metadata.mjs';
import 'server-only';
import {createSupabaseAdmin} from '@/lib/supabase/admin';
import {stableAnimeSlug} from '@/lib/anime-url';

type CalendarEntry = {
  next_episode: number | null; next_episode_at: string;
  anime: {id:number; name:string; russian?:string|null; kind?:string|null; status?:string|null; image?:{original?:string|null}};
};
type Snapshot = {entries:CalendarEntry[]; updatedAt:string; stale:boolean};
const FRESH_MS=3600_000, MAX_STALE_MS=48*3600_000;
let inFlight:Promise<Snapshot>|null=null;

function validEntry(value: unknown): value is CalendarEntry {
  if (!value || typeof value !== 'object') return false;
  const row=value as CalendarEntry;
  return !!row.anime && Number.isSafeInteger(row.anime.id) && row.anime.id>0 &&
    typeof row.anime.name==='string' && typeof row.next_episode_at==='string' &&
    /(?:Z|[+-]\d{2}:\d{2})$/.test(row.next_episode_at) && Number.isFinite(Date.parse(row.next_episode_at)) &&
    (row.next_episode==null || (Number.isSafeInteger(row.next_episode) && row.next_episode>0));
}

function compact(row:CalendarEntry):CalendarEntry {
  return {next_episode:row.next_episode??null,next_episode_at:row.next_episode_at,
    anime:{id:row.anime.id,name:row.anime.name,russian:row.anime.russian,
      kind:row.anime.kind,status:row.anime.status,image:{original:shikimoriPoster(row.anime.image?.original)}}};
}

async function refresh():Promise<Snapshot> {
  const admin=createSupabaseAdmin();
  let saved:Snapshot|null=null;
  try {
    const {data,error}=await admin.from('anime_schedule_snapshots').select('payload,updated_at')
      .eq('provider','shikimori').abortSignal(AbortSignal.timeout(3000)).maybeSingle();
    if(error) throw new Error(error.message);
    if(data){
      const age=Date.now()-Date.parse(data.updated_at);
      const rows=data.payload?.anime;
      if(Number.isFinite(age) && age>=-60_000 && age<=MAX_STALE_MS && data.payload?.complete===true &&
        Array.isArray(rows) && rows.length<=300 && rows.every(validEntry)) {
        saved={entries:rows,updatedAt:data.updated_at,stale:age>FRESH_MS};
      }
    }
  } catch(error){console.warn('SCHEDULE_SHIKIMORI_SNAPSHOT_READ_FAILED',error);}
  if(saved && !saved.stale) return saved;
  const started=Date.now();let stage='headers',status:number|undefined;
  try {
    const response=await fetch('https://shikimori.io/api/calendar',{
      headers:{'User-Agent':'AnimeBox/1.0',Accept:'application/json'},cache:'no-store',signal:AbortSignal.timeout(15_000),
    });
    status=response.status;
    if(!response.ok)throw new Error(`HTTP ${status}`);
    stage='body';const json:unknown=await response.json();stage='validate';
    if(!Array.isArray(json) || json.length>300 || (json.length>0 && !json.some(validEntry)))throw new Error('Invalid calendar');
    const snapshot:Snapshot={entries:json.filter(validEntry).map(compact),updatedAt:new Date().toISOString(),stale:false};
    console.info('SCHEDULE_SHIKIMORI_REQUEST',JSON.stringify({status,stage:'complete',elapsedMs:Date.now()-started,items:snapshot.entries.length}));
    try {
      const {error}=await admin.from('anime_schedule_snapshots').upsert({provider:'shikimori',
        payload:{anime:snapshot.entries,complete:true},updated_at:snapshot.updatedAt}, {onConflict:'provider'})
        .abortSignal(AbortSignal.timeout(3000));
      if(error)throw new Error(error.message);
    }catch(error){console.warn('SCHEDULE_SHIKIMORI_SNAPSHOT_WRITE_FAILED',error);}
    return snapshot;
  }catch(error){
    const message=error instanceof Error?`${error.name}: ${error.message}`:'unknown';
    console.warn('SCHEDULE_SHIKIMORI_REQUEST',JSON.stringify({status,stage,elapsedMs:Date.now()-started,error:message}));
    if(saved)return saved;
    throw new Error(`Shikimori calendar ${stage}: ${message}`);
  }
}

function load():Promise<Snapshot>{
  if(inFlight)return inFlight;
  inFlight=refresh().finally(()=>{inFlight=null;});return inFlight;
}

export async function getShikimoriSchedule(from:number,to:number,limit?:number|null){
  const snapshot=await load();
  const selected=snapshot.entries.filter(row=>{
    const time=Date.parse(row.next_episode_at)/1000;return time>=from && time<to;
  });
  const admin=createSupabaseAdmin();const mapping=new Map<number,Set<number>>();
  for(let offset=0;offset<selected.length;offset+=100){
    const {data,error}=await admin.from('anime_availability').select('anime_id,mal_id')
      .in('mal_id',selected.slice(offset,offset+100).map(row=>row.anime.id));
    if(error)throw new Error('Shikimori schedule mapping unavailable');
    for(const row of data??[]){
      const id=Number(row.anime_id),mal=Number(row.mal_id);
      if(!Number.isSafeInteger(id)||id<=0||!Number.isSafeInteger(mal)||mal<=0)continue;
      const matches=mapping.get(mal)??new Set<number>();matches.add(id);mapping.set(mal,matches);
    }
  }
  const ids=[...new Set([...mapping.values()].filter(matches=>matches.size===1).map(matches=>[...matches][0]))];
  type Card={anime_id:number;slug:string|null;title:string;poster_url:string|null;format:string|null};
  const cards=new Map<number,Card>();
  for(let offset=0;offset<ids.length;offset+=100){
    const {data,error}=await admin.from('anime_search_documents').select('anime_id,slug,title,poster_url,format')
      .in('anime_id',ids.slice(offset,offset+100));
    if(error)throw new Error('Shikimori schedule cards unavailable');
    for(const row of (data??[]) as Card[])cards.set(Number(row.anime_id),row);
  }
  const events=new Map<string,{
    id:string;airingAt:number;episode:number|null;timingKind:'planned';
    media:{id:number|null;idMal:number;slug:string|null;format:string|null;status:string|null;
      title:{russian:string;romaji:string;english:null;native:null};
      coverImage:{large:string;extraLarge:string}|null;bannerImage:null};
  }>();
  for(const row of selected){
    const matches=mapping.get(row.anime.id);
    const id=matches?.size===1?[...matches][0]:null,card=id==null?undefined:cards.get(id);
    const poster=card?.poster_url?.trim()||shikimoriPoster(row.anime.image?.original);
    const airingAt=Date.parse(row.next_episode_at)/1000;
    const key=`shikimori-${row.anime.id}-${airingAt}`;
    events.set(key,{id:key,airingAt,episode:row.next_episode,timingKind:'planned',media:{
      id,idMal:row.anime.id,slug:id==null?null:card?.slug||stableAnimeSlug(id,row.anime.name),format:card?.format||row.anime.kind?.toUpperCase()||null,status:row.anime.status??null,
      title:{russian:card?.title||row.anime.russian||row.anime.name,romaji:row.anime.name,english:null,native:null},
      coverImage:poster?{large:poster,extraLarge:poster}:null,bannerImage:null,
    }});
  }
  const items=[...events.values()].sort((a,b)=>a.airingAt-b.airingAt||a.media.idMal-b.media.idMal).slice(0,limit??undefined);
  return {source:'shikimori',stale:snapshot.stale,snapshotUpdatedAt:snapshot.updatedAt,
    notice:'Календарь Shikimori. Для тайтлов без связи с каталогом доступен поиск по названию. Даты и номера серий плановые; перевод и озвучка могут появиться позже.'
      +(snapshot.stale?` Использованы сохранённые данные от ${snapshot.updatedAt}; они могут быть устаревшими.`:'')
      +(events.size<selected.length?' Показана доступная часть расписания.':''),items};
}
