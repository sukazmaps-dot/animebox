import 'server-only';
import {createSupabaseAdmin} from '@/lib/supabase/admin';
import type {Anime} from '@/types/anime';
export type ShikimoriMetadata = {
  mal_id:number; title_ru:string|null;title_romaji:string|null;description:string|null;poster_url:string|null;
  format:string|null;status:string|null;start_year:number|null;start_month:number|null;
  episodes:number|null;episodes_aired:number|null;score:number|null;genres:string[];studios:string[];
};
export async function readShikimoriMetadata(ids:number[]):Promise<Map<number,ShikimoriMetadata>>{
  const result=new Map<number,ShikimoriMetadata>();
  if(!ids.length)return result;
  try{
    const {data,error}=await createSupabaseAdmin().from('anime_shikimori_metadata').select('*')
      .in('mal_id',[...new Set(ids)].slice(0,100)).abortSignal(AbortSignal.timeout(3000));
    if(error)throw new Error(error.message);
    for(const row of (data??[]) as ShikimoriMetadata[])result.set(Number(row.mal_id),row);
  }catch(error){console.warn('SHIKIMORI_METADATA_READ_FAILED',error);}
  return result;
}
export function mergeShikimoriMetadata(anime:Anime,row:ShikimoriMetadata|undefined):Anime{
  if(!row || Number(row.mal_id)!==anime.idMal)return anime;
  const status:Record<string,string>={released:'Вышло',ongoing:'Онгоинг',anons:'Анонс',paused:'Пауза',discontinued:'Отменено'};
  return {...anime,
    title:{...anime.title,russian:anime.title.russian && /[А-Яа-яЁё]/.test(anime.title.russian)?anime.title.russian:row.title_ru||anime.title.russian,romaji:anime.title.romaji||row.title_romaji},
    description:anime.description||row.description,format:anime.format||row.format,
    status:anime.status||status[row.status??'']||null,
    startDate:anime.startDate?.year?anime.startDate:row.start_year?{year:row.start_year,month:row.start_month}:null,
    episodes:anime.episodes||row.episodes,episodesAired:anime.episodesAired??row.episodes_aired,
    // Keep provider's 10-point score; do not invent AniList popularity.
    score:anime.score??(row.score==null?null:Number(row.score)),
    genres:anime.genres?.length?anime.genres:row.genres,
    studios:anime.studios?.length?anime.studios:row.studios.map(name=>({name})),
    coverImage:anime.coverImage|| (row.poster_url?{large:row.poster_url,extraLarge:row.poster_url}:null),
  };
}
