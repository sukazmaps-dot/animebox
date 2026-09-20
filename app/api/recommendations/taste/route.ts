import { NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { TASTE_GRAPH_VERSION, normalizeTasteToken, type TasteGraph } from '@/lib/taste-graph';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type CatalogRow = {
  id: number;
  genres: string[] | null;
  total_episodes: number | null;
};

type LibraryRow = {
  anime_id: number;
  status: string;
  updated_at: string | null;
};

type HistoryRow = {
  anime_id: number;
  completed: boolean;
  completed_at: string | null;
};

type ProductEventRow = {
  event_name: string;
  entity_id: string | null;
  created_at: string;
};

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function median(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[middle - 1] + sorted[middle]) / 2)
    : sorted[middle];
}

function recencyMultiplier(dateValue: string | null | undefined) {
  if (!dateValue) return 0.72;
  const timestamp = Date.parse(dateValue);
  if (!Number.isFinite(timestamp)) return 0.72;
  const ageDays = Math.max(0, (Date.now() - timestamp) / 86_400_000);
  return Math.max(0.35, Math.exp(-ageDays / 120));
}

function normalizeWeights(weights: Map<string, number>) {
  const entries = [...weights.entries()].filter(([, weight]) => weight > 0.01);
  const max = Math.max(1, ...entries.map(([, weight]) => weight));
  return Object.fromEntries(
    entries
      .map(([genre, weight]) => [genre, clamp(weight / max)] as const)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 30),
  );
}

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: authData } = await supabase.auth.getUser();
    const userId = authData.user?.id;

    if (!userId) {
      return NextResponse.json({ graph: null }, { status: 401, headers: { 'Cache-Control': 'private, no-store' } });
    }

    const admin = createSupabaseAdmin();
    const [libraryResult, historyResult, eventsResult] = await Promise.all([
      admin
        .from('anime_library')
        .select('anime_id,status,updated_at')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false })
        .limit(500),
      admin
        .from('episodes_history')
        .select('anime_id,completed,completed_at')
        .eq('user_id', userId)
        .eq('completed', true)
        .order('completed_at', { ascending: false })
        .limit(1500),
      admin
        .from('product_events')
        .select('event_name,entity_id,created_at')
        .eq('user_id', userId)
        .in('event_name', [
          'recommendation_click',
          'recommendation_planned',
          'recommendation_dismiss',
          'recommendation_started',
          'recommendation_completed',
        ])
        .order('created_at', { ascending: false })
        .limit(1000),
    ]);

    if (libraryResult.error) console.warn('[Taste Graph] library', libraryResult.error);
    if (historyResult.error) console.warn('[Taste Graph] history', historyResult.error);
    if (eventsResult.error) console.warn('[Taste Graph] product events', eventsResult.error);

    const library = (libraryResult.data ?? []) as LibraryRow[];
    const history = (historyResult.data ?? []) as HistoryRow[];
    const events = (eventsResult.data ?? []) as ProductEventRow[];

    const ids = [...new Set([
      ...library.map((item) => Number(item.anime_id)),
      ...history.map((item) => Number(item.anime_id)),
      ...events.map((item) => Number(item.entity_id)).filter((id) => Number.isSafeInteger(id) && id > 0),
    ].filter((id) => Number.isSafeInteger(id) && id > 0))].slice(0, 1000);

    const catalogRows: CatalogRow[] = [];
    for (let offset = 0; offset < ids.length; offset += 250) {
      const batch = ids.slice(offset, offset + 250);
      const { data, error } = await admin
        .from('anime_catalog')
        .select('id,genres,total_episodes')
        .in('id', batch);
      if (error) {
        console.warn('[Taste Graph] catalog', error);
        continue;
      }
      catalogRows.push(...((data ?? []) as CatalogRow[]));
    }

    const catalog = new Map(catalogRows.map((row) => [Number(row.id), row]));
    const positive = new Map<string, number>();
    const negative = new Map<string, number>();
    const positiveEpisodeCounts: number[] = [];
    const completedByAnime = new Map<number, number>();

    for (const item of history) {
      const animeId = Number(item.anime_id);
      completedByAnime.set(animeId, (completedByAnime.get(animeId) ?? 0) + 1);
    }

    const addGenres = (animeId: number, weight: number, negativeSignal = false) => {
      const row = catalog.get(animeId);
      if (!row) return;
      const target = negativeSignal ? negative : positive;
      for (const rawGenre of row.genres ?? []) {
        const genre = normalizeTasteToken(rawGenre);
        if (!genre) continue;
        target.set(genre, (target.get(genre) ?? 0) + weight);
      }
      if (!negativeSignal && row.total_episodes && row.total_episodes > 0) {
        positiveEpisodeCounts.push(row.total_episodes);
      }
    };

    for (const item of library) {
      const animeId = Number(item.anime_id);
      const recency = recencyMultiplier(item.updated_at);
      if (item.status === 'completed') addGenres(animeId, 2.2 * recency);
      else if (item.status === 'watching') addGenres(animeId, 1.35 * recency);
      else if (item.status === 'planned') addGenres(animeId, 0.42 * recency);
      else if (item.status === 'dropped') addGenres(animeId, 1.4 * recency, true);
    }

    for (const [animeId, count] of completedByAnime) {
      addGenres(animeId, Math.min(1.8, 0.3 + Math.log2(count + 1) * 0.34));
    }

    for (const event of events) {
      const animeId = Number(event.entity_id);
      if (!Number.isSafeInteger(animeId) || animeId <= 0) continue;
      const recency = recencyMultiplier(event.created_at);
      if (event.event_name === 'recommendation_completed') addGenres(animeId, 1.2 * recency);
      else if (event.event_name === 'recommendation_started') addGenres(animeId, 0.7 * recency);
      else if (event.event_name === 'recommendation_planned') addGenres(animeId, 0.6 * recency);
      else if (event.event_name === 'recommendation_click') addGenres(animeId, 0.25 * recency);
      else if (event.event_name === 'recommendation_dismiss') addGenres(animeId, 0.75 * recency, true);
    }

    const genreWeights = normalizeWeights(positive);
    const negativeGenreWeights = normalizeWeights(negative);
    const sampleSize = library.length + completedByAnime.size + events.length;
    const completedEpisodes = history.length;
    const confidence = clamp(1 - Math.exp(-sampleSize / 14));
    const topGenres = Object.entries(genreWeights)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([genre]) => genre);

    const graph: TasteGraph = {
      version: TASTE_GRAPH_VERSION,
      generatedAt: new Date().toISOString(),
      confidence,
      sampleSize,
      completedEpisodes,
      preferredEpisodeCount: median(positiveEpisodeCounts.slice(0, 120)),
      genreWeights,
      negativeGenreWeights,
      topGenres,
    };

    return NextResponse.json(
      { graph },
      { headers: { 'Cache-Control': 'private, max-age=60, stale-while-revalidate=300' } },
    );
  } catch (error) {
    console.error('[Taste Graph] endpoint', error);
    return NextResponse.json({ graph: null }, { status: 200, headers: { 'Cache-Control': 'private, no-store' } });
  }
}
