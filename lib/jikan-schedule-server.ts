import 'server-only';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { stableAnimeSlug } from '@/lib/anime-url';

type WeeklyAnime = {
  mal_id: number;
  title?: string;
  title_english?: string | null;
  title_japanese?: string | null;
  airing?: boolean;
  broadcast?: { day?: string | null; time?: string | null; timezone?: string | null };
};
type SavedCard = {
  anime_id: number; slug: string | null; title: string; aliases: string[];
  poster_url: string | null; format: string | null;
};

const DAY = 86400;
const JST_OFFSET = 9 * 3600;
const weekdays = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'];

// MAL supplies recurring broadcast slots, not a confirmed next episode/date.
// Only Japan's fixed UTC+9 timezone is supported; unknown zones are omitted.
export function plannedBroadcastTimes(anime: WeeklyAnime, from: number, to: number): number[] {
  const broadcast = anime.broadcast;
  if (anime.airing !== true || broadcast?.timezone !== 'Asia/Tokyo') return [];
  const weekday = weekdays.indexOf(broadcast.day ?? '');
  const match = /^(\d{2}):(\d{2})$/.exec(broadcast.time ?? '');
  if (weekday < 0 || !match) return [];
  const hour = Number(match[1]), minute = Number(match[2]);
  if (hour > 23 || minute > 59) return [];
  const times: number[] = [];
  for (let date = Math.floor((from + JST_OFFSET) / DAY) * DAY;
    date <= Math.floor((to + JST_OFFSET) / DAY) * DAY; date += DAY) {
    if (new Date(date * 1000).getUTCDay() !== weekday) continue;
    const timestamp = date + hour * 3600 + minute * 60 - JST_OFFSET;
    if (timestamp > from && timestamp < to) times.push(timestamp);
  }
  return times;
}

type WeeklySnapshot = { anime: WeeklyAnime[]; complete: boolean; updatedAt: string; stale: boolean };
const FRESH_MS = 3600_000;
const MAX_STALE_MS = 48 * 3600_000;
const PAGE_TIMEOUT_MS = 25_000;
const DOWNLOAD_BUDGET_MS = 60_000;
let inFlight: Promise<WeeklySnapshot> | null = null;

function compactAnime(item: WeeklyAnime): WeeklyAnime {
  return {mal_id: item.mal_id, title: item.title, title_english: item.title_english,
    title_japanese: item.title_japanese, airing: item.airing, broadcast: item.broadcast};
}

async function readSnapshot(): Promise<WeeklySnapshot | null> {
  try {
    const {data, error} = await createSupabaseAdmin().from('anime_schedule_snapshots')
      .select('payload,updated_at').eq('provider', 'jikan').abortSignal(AbortSignal.timeout(3000)).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    const age = Date.now() - Date.parse(data.updated_at);
    const payload = data.payload as {anime?: WeeklyAnime[]; complete?: boolean};
    if (!Number.isFinite(age) || age < -60_000 || age > MAX_STALE_MS ||
      payload.complete !== true || !Array.isArray(payload.anime) || payload.anime.length > 300 ||
      payload.anime.some(item => !item || !Number.isSafeInteger(item.mal_id) || item.mal_id <= 0)) return null;
    return {anime: payload.anime, complete: true, updatedAt: data.updated_at, stale: age > FRESH_MS};
  } catch (error) {
    console.warn('SCHEDULE_SNAPSHOT_READ_FAILED', error instanceof Error ? error.message : 'unknown');
    return null;
  }
}

async function downloadWeeklySchedule(): Promise<WeeklySnapshot> {
  const anime = new Map<number, WeeklyAnime>();
  const downloadStarted = Date.now();
  let complete = false;
  for (let page = 1; page <= 12; page++) {
    if (page > 1) await new Promise(resolve => setTimeout(resolve, 400));
    const remaining = DOWNLOAD_BUDGET_MS - (Date.now() - downloadStarted);
    if (remaining <= 0) throw new Error(`Jikan schedule download budget exceeded before page ${page}`);
    const started = Date.now();
    let stage = 'headers', status: number | undefined;
    try {
      const response = await fetch(`https://api.jikan.moe/v4/schedules?sfw=true&unapproved=false&limit=25&page=${page}`, {
        headers: {Accept: 'application/json'}, cache: 'no-store',
        signal: AbortSignal.timeout(Math.min(PAGE_TIMEOUT_MS, remaining)),
      });
      status = response.status;
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      stage = 'body';
      const json = await response.json() as {data?: WeeklyAnime[]; pagination?: {has_next_page?: boolean}};
      stage = 'validate';
      if (!Array.isArray(json.data) || json.data.length > 25 ||
        typeof json.pagination?.has_next_page !== 'boolean') throw new Error('Invalid response');
      for (const item of json.data) {
        if (item && Number.isSafeInteger(item.mal_id) && item.mal_id > 0) anime.set(item.mal_id, compactAnime(item));
      }
      console.info('SCHEDULE_JIKAN_REQUEST', JSON.stringify({page,stage:'complete',status,
        elapsedMs:Date.now()-started,items:json.data.length}));
      if (!json.pagination.has_next_page) {complete = true; break;}
    } catch (error) {
      const name = error instanceof Error ? error.name : 'UnknownError';
      const message = error instanceof Error ? error.message : 'unknown';
      console.warn('SCHEDULE_JIKAN_REQUEST', JSON.stringify({page,stage,status,elapsedMs:Date.now()-started,error:name}));
      throw new Error(`Jikan schedule page ${page} ${stage}: ${name} ${message} (${Date.now()-started}ms)`);
    }
  }
  return {anime:[...anime.values()], complete, updatedAt:new Date().toISOString(), stale:false};
}

async function refreshWeeklySchedule(): Promise<WeeklySnapshot> {
  const saved = await readSnapshot();
  if (saved && !saved.stale) return saved;
  try {
    const result = await downloadWeeklySchedule();
    // A truncated download must never replace the last complete snapshot.
    if (!result.complete && saved) return saved;
    if (result.complete) {
      try {
        const {error} = await createSupabaseAdmin().from('anime_schedule_snapshots').upsert({
          provider:'jikan', payload:{anime:result.anime,complete:true}, updated_at:result.updatedAt,
        }, {onConflict:'provider'}).abortSignal(AbortSignal.timeout(3000));
        if (error) throw new Error(error.message);
      } catch (error) {
        console.warn('SCHEDULE_SNAPSHOT_WRITE_FAILED', error instanceof Error ? error.message : 'unknown');
      }
    }
    return result;
  } catch (error) {
    if (!saved) throw error;
    console.warn('SCHEDULE_SNAPSHOT_STALE', JSON.stringify({updatedAt:saved.updatedAt,
      reason:error instanceof Error ? error.message : 'unknown'}));
    return saved;
  }
}

function loadWeeklySchedule(): Promise<WeeklySnapshot> {
  if (inFlight) return inFlight;
  inFlight = refreshWeeklySchedule().finally(() => {inFlight = null;});
  return inFlight;
}

export async function getJikanSchedule(from: number, to: number, limit?: number | null) {
  const weekly = await loadWeeklySchedule();
  const candidates = weekly.anime.map(anime => ({anime, times: plannedBroadcastTimes(anime, from, to)}))
    .filter(item => item.times.length > 0);
  const admin = createSupabaseAdmin();
  const mapped = new Map<number, Set<number>>();
  // Never treat a MAL ID as an AniList/AnimeBox ID or guess by title.
  for (let offset = 0; offset < candidates.length; offset += 100) {
    const ids = candidates.slice(offset, offset + 100).map(item => item.anime.mal_id);
    const {data, error} = await admin.from('anime_availability').select('anime_id,mal_id').in('mal_id', ids);
    if (error) throw new Error('Schedule ID mapping unavailable');
    for (const row of data ?? []) {
      const id = Number(row.anime_id), malId = Number(row.mal_id);
      if (!Number.isSafeInteger(id) || id <= 0 || !Number.isSafeInteger(malId) || malId <= 0) continue;
      const matches = mapped.get(malId) ?? new Set<number>();
      matches.add(id); mapped.set(malId, matches);
    }
  }
  const uniqueIds = [...new Set([...mapped.values()].filter(ids => ids.size === 1).map(ids => [...ids][0]))];
  const cards = new Map<number, SavedCard>();
  for (let offset = 0; offset < uniqueIds.length; offset += 100) {
    const {data, error} = await admin.from('anime_search_documents')
      .select('anime_id,slug,title,aliases,poster_url,format').in('anime_id', uniqueIds.slice(offset, offset + 100));
    if (error) throw new Error('Schedule saved titles unavailable');
    for (const row of (data ?? []) as SavedCard[]) cards.set(Number(row.anime_id), row);
  }
  let matchedTitles = 0;
  const items = candidates.flatMap(({anime, times}) => {
    const ids = mapped.get(anime.mal_id);
    if (ids?.size !== 1) return [];
    const id = [...ids][0];
    const card = cards.get(id);
    if (!card?.poster_url) return [];
    matchedTitles++;
    return times.map(airingAt => ({
      id: `mal-${anime.mal_id}-${airingAt}`, airingAt, episode: null, timingKind: 'weekly' as const,
      media: {
        id, idMal: anime.mal_id, slug: card.slug || stableAnimeSlug(id, anime.title || card.title),
        format: card.format, status: 'RELEASING',
        title: { russian: card.title, romaji: anime.title || null,
          english: anime.title_english || null, native: anime.title_japanese || null },
        coverImage: {large: card.poster_url, extraLarge: card.poster_url}, bannerImage: null,
      },
    }));
  }).sort((a, b) => a.airingAt - b.airingAt || a.media.id - b.media.id).slice(0, limit ?? undefined);
  return {
    source: 'jikan',
    snapshotUpdatedAt: weekly.updatedAt, stale: weekly.stale,
    notice: 'Резервное недельное расписание для сопоставленных тайтлов. Время плановое; переносы и номер следующей серии не подтверждены.'
      + (weekly.stale ? ` Использованы сохранённые данные от ${weekly.updatedAt}; они могут быть устаревшими.` : '')
      + (!weekly.complete || matchedTitles < candidates.length ? ' Показана доступная часть расписания.' : ''),
    items,
  };
}
