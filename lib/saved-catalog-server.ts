import 'server-only';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { findAnimeGenre, findAnimeTag } from '@/lib/anime-taxonomy';
import { normalizeSearchText } from '@/lib/smart-search';
import { stableAnimeSlug } from '@/lib/anime-url';
import type { GetAnimesOptions } from '@/lib/anilist';
import type { Anime } from '@/types/anime';
import { createPublicResultCache } from '@/lib/public-result-cache';
import { mergeAnimeMetadata } from '@/lib/anime-metadata-merge';

type SavedDocument = {
  anime_id: number; slug: string | null; title: string; aliases: string[];
  description: string | null; genres: string[]; tags: string[];
  poster_url: string | null; studios: string[]; format: string | null;
  start_year: number | null; total_episodes: number | null; finished: boolean | null;
  mal_id: number | null;
  provider_status?:string|null; start_month?:number|null;provider_score?:number|null;
  episodes_aired?:number|null;provider_romaji?:string|null;
};

const fields = 'anime_id,slug,title,aliases,description,genres,tags,poster_url,studios,format,start_year,total_episodes,finished,mal_id,provider_status,start_month,provider_score,episodes_aired,provider_romaji';
const formatNames: Record<string, string[]> = {
  TV: ['TV', 'ТВ'], MOVIE: ['MOVIE', 'Фильм'], OVA: ['OVA'],
  ONA: ['ONA'], SPECIAL: ['SPECIAL', 'Спешл'],
};

export function savedDocumentToAnime(row: SavedDocument): Anime {
  const latin = (row.aliases ?? []).filter(value => /[a-z]/i.test(value) && !/[а-яё]/i.test(value));
  return {
    id: Number(row.anime_id),
    idMal: Number.isSafeInteger(Number(row.mal_id)) && Number(row.mal_id) > 0 ? Number(row.mal_id) : null,
    slug: row.slug || stableAnimeSlug(Number(row.anime_id), latin[0] || row.title),
    title: { russian: row.title, romaji: row.provider_romaji || latin[0] || row.title, english: latin[1] || null },
    synonyms: row.aliases ?? [], description: row.description,
    genres: row.genres ?? [], tags: row.tags ?? [],
    studios: (row.studios ?? []).map(name => ({ name })),
    format: row.format, startDate: row.start_year ? {year: row.start_year, month: row.start_month} : null,
    episodes: row.total_episodes,
    // false does not distinguish releasing, upcoming, hiatus or cancelled.
    status: ({released:'Вышло',ongoing:'Онгоинг',anons:'Анонс',paused:'Пауза',discontinued:'Отменено'} as Record<string,string>)[row.provider_status??''] || (row.finished === true ? 'Вышло' : null),
    score: row.provider_score == null ? null : Number(row.provider_score),
    episodesAired: row.episodes_aired ?? null,
    coverImage: row.poster_url ? {extraLarge: row.poster_url, large: row.poster_url} : null,
    catalogEligible: true,
    metadataSource: 'saved',
  };
}

export async function getSavedCatalogPage(options: GetAnimesOptions) {
  const limit = Math.min(50, Math.max(1, options.limit ?? 20));
  const page = Math.max(1, options.page ?? 1);
  const unsupportedFilters: string[] = [];
  if (unsupportedFilters.length) return {anime: [] as Anime[], hasNextPage: false, unsupportedFilters};

  const admin = createSupabaseAdmin();
  // The join in this view filters playable cards before pagination.
  let query = admin.from('anime_saved_playable_catalog').select(fields);
  const words = normalizeSearchText(options.search ?? '').split(' ').filter(Boolean).slice(0, 12);
  // Separate AND predicates; untrusted text never becomes a PostgREST expression.
  for (const word of words) query = query.ilike('search_text', `%${word}%`);
  const genres = options.genres?.length ? options.genres : options.genre != null ? [options.genre] : [];
  for (const value of genres) {
    const genre = findAnimeGenre(value);
    query = query.overlaps('genres', genre ? [genre.value, genre.label] : [String(value)]);
  }
  for (const value of options.tags ?? []) {
    const tag = findAnimeTag(value);
    query = query.overlaps('tags', tag ? [tag.value, tag.label] : [value]);
  }
  if (options.studioNames?.length) query = query.contains('studios', options.studioNames);
  if (options.year != null) query = query.eq('start_year', options.year);
  if (options.format) query = query.in('format', formatNames[options.format]);
  if (options.status === 'finished') query = query.eq('finished', true);
  if (options.status === 'ongoing') query = query.eq('provider_status', 'ongoing');
  if (options.status === 'upcoming') query = query.eq('provider_status', 'anons');
  if (options.season) {
    const months={WINTER:[1,2,3],SPRING:[4,5,6],SUMMER:[7,8,9],FALL:[10,11,12]};
    query=query.in('start_month',months[options.season]);
  }
  // Shikimori scores are available after sync; popularity remains unknown.
  if (options.order === 'ranked') query=query.order('provider_score',{ascending:false,nullsFirst:false});
  if (options.order === 'updated') query = query.order('updated_at', {ascending: false});
  query = query.order('last_success_at', {ascending: false, nullsFirst: false})
    .order('anime_id', {ascending: true});
  const offset = (page - 1) * limit;
  if (!Number.isSafeInteger(offset)) throw new Error('Invalid catalog page');
  const {data, error} = await query.range(offset, offset + limit);
  if (error) throw new Error(`Saved catalog unavailable: ${error.message}`);
  const rows = (data ?? []) as SavedDocument[];
  return {
    anime: rows.slice(0, limit).map(savedDocumentToAnime),
    hasNextPage: rows.length > limit,
    unsupportedFilters,
  };
}

// One bounded query for the whole grid; only public title data enters this cache.
const savedMetadataCache = createPublicResultCache<Anime[]>({
  ttlMs: 30_000, maxEntries: 128, cacheWhen: items => items.length > 0,
});

export async function getSavedAnimeMetadata(ids: number[]): Promise<Anime[]> {
  const unique = [...new Set(ids.filter(id => Number.isSafeInteger(id) && id > 0))].slice(0, 50).sort((a,b) => a-b);
  if (!unique.length) return [];
  try {
    return await savedMetadataCache(unique.join(','), async () => {
      const {data, error} = await createSupabaseAdmin()
        .from('anime_saved_playable_catalog').select(fields).in('anime_id', unique)
        .abortSignal(AbortSignal.timeout(1200));
      if (error) throw new Error(error.message);
      return ((data ?? []) as SavedDocument[]).map(savedDocumentToAnime);
    });
  } catch (error) {
    console.warn('[saved anime metadata] optional batch unavailable:', error);
    return [];
  }
}

export async function enrichAnimesWithSavedMetadata(anime: Anime[]): Promise<Anime[]> {
  const saved = await getSavedAnimeMetadata(anime.map(item => item.id));
  const byId = new Map(saved.map(item => [item.id, item]));
  return anime.map(item => mergeAnimeMetadata(item, byId.get(item.id)));
}
