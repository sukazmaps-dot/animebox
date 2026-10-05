import {animeHref} from '@/lib/anime-url';
export function scheduleAnimeHref(media:{id:number|null;slug?:string|null;title:{russian?:string|null;romaji?:string|null;english?:string|null}}){
  if(media.id!=null && Number.isSafeInteger(media.id) && media.id>0)return animeHref({...media,id:media.id});
  return '/search?search='+encodeURIComponent(media.title.russian||media.title.romaji||media.title.english||'');
}
