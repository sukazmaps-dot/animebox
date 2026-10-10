import 'server-only';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { findAnimeGenre, findAnimeTag } from '@/lib/anime-taxonomy';
import { normalizeSearchText } from '@/lib/smart-search';
import type { GetAnimesOptions } from '@/lib/anilist';

const BASE_FIELDS = 'anime_id,slug,title,aliases,description,genres,tags,poster_url,studios,format,start_year,total_episodes,finished';
const BATCH_SIZE = 100;
const MAX_SCAN = 1000;
const formats: Record<string, string[]> = { TV: ['TV', 'ТВ'], MOVIE: ['MOVIE', 'Фильм'], OVA: ['OVA'], ONA: ['ONA'], SPECIAL: ['SPECIAL', 'Спешл'] };

/** Compatibility for deployments missing the optional saved-catalog view.
 * Availability is checked before slicing pages, using only existing tables.
 */
export async function getCompatibleSavedDocuments(options: GetAnimesOptions) {
  const unsupportedFilters = [
    ...(options.season ? ['season'] : []),
    ...(options.status === 'ongoing' || options.status === 'upcoming' ? ['status'] : []),
  ];
  if (unsupportedFilters.length) return { rows: [], hasNextPage: false, unsupportedFilters, scanLimited: false };
  const admin = createSupabaseAdmin();
  const limit = Math.min(50, Math.max(1, options.limit ?? 20));
  const offset = (Math.max(1, options.page ?? 1) - 1) * limit;
  if (!Number.isSafeInteger(offset) || offset + limit >= MAX_SCAN) {
    return { rows: [], hasNextPage: false, unsupportedFilters, scanLimited: true };
  }
  const signal = AbortSignal.timeout(5000);
  const playable: Record<string, unknown>[] = [];
  let exhausted = false;
  for (let cursor = 0; cursor < MAX_SCAN && playable.length <= offset + limit; cursor += BATCH_SIZE) {
    let query = admin.from('anime_search_documents').select(BASE_FIELDS);
    for (const word of normalizeSearchText(options.search ?? '').split(' ').filter(Boolean).slice(0, 12)) query = query.ilike('search_text', `%${word}%`);
    for (const value of options.genres?.length ? options.genres : options.genre != null ? [options.genre] : []) {
      const genre = findAnimeGenre(value);
      query = query.overlaps('genres', genre ? [genre.value, genre.label] : [String(value)]);
    }
    for (const value of options.tags ?? []) {
      const tag = findAnimeTag(value);
      query = query.overlaps('tags', tag ? [tag.value, tag.label] : [value]);
    }
    if (options.studioNames?.length) query = query.contains('studios', options.studioNames);
    if (options.year != null) query = query.eq('start_year', options.year);
    if (options.format) query = query.in('format', formats[options.format]);
    if (options.status === 'finished') query = query.eq('finished', true);
    if (options.order === 'updated') query = query.order('updated_at', { ascending: false });
    query = query.order('anime_id', { ascending: true });
    const { data, error } = await query.range(cursor, cursor + BATCH_SIZE - 1).abortSignal(signal);
    if (error) throw new Error('saved_documents_unavailable');
    const rows = data ?? [];
    if (!rows.length) { exhausted = true; break; }
    const ids = rows.map(row => Number(row.anime_id)).filter(id => Number.isSafeInteger(id) && id > 0);
    const availability = await admin.from('anime_availability').select('anime_id,mal_id')
      .in('anime_id', ids).eq('availability_status', 'playable').gt('max_episode', 0).abortSignal(signal);
    if (availability.error) throw new Error('saved_availability_unavailable');
    const available = new Map((availability.data ?? []).map(row => [Number(row.anime_id), row.mal_id]));
    for (const row of rows) {
      if (available.has(Number(row.anime_id))) playable.push({ ...row, mal_id: available.get(Number(row.anime_id)) });
    }
    if (rows.length < BATCH_SIZE) { exhausted = true; break; }
  }
  return { rows: playable.slice(offset, offset + limit), hasNextPage: playable.length > offset + limit,
    unsupportedFilters, scanLimited: !exhausted && playable.length <= offset + limit };
}
