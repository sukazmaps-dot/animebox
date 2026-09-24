import { NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import {
  TASTE_GRAPH_VERSION,
  normalizeTasteToken,
  type TasteGraph,
  type TasteMoodWeightKey,
} from '@/lib/taste-graph';
import { enforceIpAndUserRateLimit, enforceIpRateLimit } from '@/lib/api-rate-limit';

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
  metadata: Record<string, unknown> | null;
  created_at: string;
};

type FeedbackRow = {
  anime_id: number;
  signal:
    | 'like_more'
    | 'not_interested'
    | 'already_watched'
    | 'less_like_this'
    | 'hidden';
  updated_at: string | null;
};

type RatingRow = {
  anime_id: number;
  score: number;
  updated_at: string | null;
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

/**
 * Long-term taste decays smoothly instead of dropping off at an arbitrary date.
 * At 120 days a signal keeps about 50% of its original weight; very old
 * explicit preferences retain a small floor instead of disappearing entirely.
 */
function recencyMultiplier(
  dateValue: string | null | undefined,
  halfLifeDays = 120,
  floor = 0.18,
) {
  if (!dateValue) return 0.55;
  const timestamp = Date.parse(dateValue);
  if (!Number.isFinite(timestamp)) return 0.55;
  const ageDays = Math.max(0, (Date.now() - timestamp) / 86_400_000);
  return Math.max(floor, Math.exp((-Math.LN2 * ageDays) / halfLifeDays));
}

function normalizeWeights(weights: Map<string, number>) {
  const entries = [...weights.entries()].filter(([, weight]) => weight > 0.01);
  const max = Math.max(1, ...entries.map(([, weight]) => weight));
  return Object.fromEntries(
    entries
      .map(([token, weight]) => [token, clamp(weight / max)] as const)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 30),
  );
}

function isMood(value: unknown): value is TasteMoodWeightKey {
  return ['comfort', 'tension', 'emotion', 'adventure'].includes(String(value));
}

function normalizeMoodWeights(weights: Map<TasteMoodWeightKey, number>) {
  const max = Math.max(1, ...weights.values());
  return Object.fromEntries(
    [...weights.entries()]
      .map(([mood, weight]) => [mood, clamp(weight / max)] as const)
      .filter(([, weight]) => weight > 0.01)
      .sort((a, b) => b[1] - a[1]),
  ) as Partial<Record<TasteMoodWeightKey, number>>;
}

function eventMood(event: ProductEventRow): TasteMoodWeightKey | null {
  const metadataMood = event.metadata?.mood;
  if (isMood(metadataMood)) return metadataMood;
  if (isMood(event.entity_id)) return event.entity_id;
  return null;
}

export async function GET(request: Request) {
  try {
    const ipLimited = await enforceIpRateLimit(request, {
      scope: 'taste_graph_ip',
      limit: 30,
      windowSeconds: 60,
    });
    if (ipLimited) return ipLimited;

    const supabase = await createClient();
    const { data: authData } = await supabase.auth.getUser();
    const userId = authData.user?.id;

    if (!userId) {
      return NextResponse.json(
        { graph: null },
        {
          status: 401,
          headers: { 'Cache-Control': 'private, no-store' },
        },
      );
    }

    const limited = await enforceIpAndUserRateLimit(request, userId, {
      ip: { scope: 'taste_graph_auth_ip', limit: 30, windowSeconds: 60 },
      user: { scope: 'taste_graph_user', limit: 12, windowSeconds: 60 },
    });
    if (limited) return limited;

    const admin = createSupabaseAdmin();
    const [
      libraryResult,
      historyResult,
      eventsResult,
      feedbackResult,
      ratingsResult,
    ] = await Promise.all([
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
        .select('event_name,entity_id,metadata,created_at')
        .eq('user_id', userId)
        .in('event_name', [
          'recommendation_click',
          'recommendation_planned',
          'recommendation_dismiss',
          'recommendation_started',
          'recommendation_completed',
          'recommendation_watch_15m',
          'recommendation_watch_30m',
          'recommendation_mood_change',
        ])
        .order('created_at', { ascending: false })
        .limit(1000),
      admin
        .from('recommendation_feedback')
        .select('anime_id,signal,updated_at')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false })
        .limit(1000),
      admin
        .from('anime_ratings')
        .select('anime_id,score,updated_at')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false })
        .limit(1000),
    ]);

    if (libraryResult.error) {
      console.warn('[Taste Graph] library', libraryResult.error);
    }
    if (historyResult.error) {
      console.warn('[Taste Graph] history', historyResult.error);
    }
    if (eventsResult.error) {
      console.warn('[Taste Graph] product events', eventsResult.error);
    }
    if (feedbackResult.error) {
      console.warn('[Taste Graph] feedback', feedbackResult.error);
    }
    if (ratingsResult.error) {
      console.warn('[Taste Graph] ratings', ratingsResult.error);
    }

    const library = (libraryResult.data ?? []) as LibraryRow[];
    const history = (historyResult.data ?? []) as HistoryRow[];
    const events = (eventsResult.data ?? []) as ProductEventRow[];
    const feedback = (feedbackResult.data ?? []) as FeedbackRow[];
    const ratings = (ratingsResult.data ?? []) as RatingRow[];

    const ids = [
      ...new Set(
        [
          ...library.map((item) => Number(item.anime_id)),
          ...history.map((item) => Number(item.anime_id)),
          ...events
            .map((item) => Number(item.entity_id))
            .filter((id) => Number.isSafeInteger(id) && id > 0),
          ...feedback
            .map((item) => Number(item.anime_id))
            .filter((id) => Number.isSafeInteger(id) && id > 0),
          ...ratings
            .map((item) => Number(item.anime_id))
            .filter((id) => Number.isSafeInteger(id) && id > 0),
        ].filter((id) => Number.isSafeInteger(id) && id > 0),
      ),
    ].slice(0, 1200);

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

    const catalog = new Map(
      catalogRows.map((row) => [Number(row.id), row]),
    );
    const positive = new Map<string, number>();
    const negative = new Map<string, number>();
    const completedPositive = new Map<string, number>();
    const moodPreference = new Map<TasteMoodWeightKey, number>();
    const positiveEpisodeCounts: number[] = [];
    const completedByAnime = new Map<number, number>();

    for (const item of history) {
      const animeId = Number(item.anime_id);
      completedByAnime.set(
        animeId,
        (completedByAnime.get(animeId) ?? 0) + 1,
      );
    }

    const addGenres = (
      animeId: number,
      weight: number,
      negativeSignal = false,
    ) => {
      const row = catalog.get(animeId);
      if (!row) return;

      const target = negativeSignal ? negative : positive;
      for (const rawGenre of row.genres ?? []) {
        const genre = normalizeTasteToken(rawGenre);
        if (!genre) continue;
        target.set(genre, (target.get(genre) ?? 0) + weight);
      }

      if (
        !negativeSignal &&
        weight >= 0.35 &&
        row.total_episodes &&
        row.total_episodes > 0
      ) {
        positiveEpisodeCounts.push(row.total_episodes);
      }
    };

    const addCompletedGenres = (animeId: number, weight: number) => {
      const row = catalog.get(animeId);
      if (!row) return;

      for (const rawGenre of row.genres ?? []) {
        const genre = normalizeTasteToken(rawGenre);
        if (!genre) continue;
        completedPositive.set(
          genre,
          (completedPositive.get(genre) ?? 0) + weight,
        );
      }
    };

    for (const item of library) {
      const animeId = Number(item.anime_id);
      const recency = recencyMultiplier(item.updated_at);
      const status = item.status.trim().toLowerCase();

      if (status === 'completed') {
        addGenres(animeId, 2.2 * recency);
        addCompletedGenres(animeId, 2.5 * recency);
      } else if (status === 'watching') {
        addGenres(animeId, 1.35 * recency);
      } else if (status === 'planned') {
        addGenres(animeId, 0.42 * recency);
      } else if (status === 'dropped') {
        addGenres(animeId, 1.4 * recency, true);
      }
    }

    for (const [animeId, count] of completedByAnime) {
      const weight = Math.min(1.8, 0.3 + Math.log2(count + 1) * 0.34);
      addGenres(animeId, weight);
      addCompletedGenres(animeId, Math.min(2.1, weight * 1.15));
    }

    for (const event of events) {
      if (event.event_name === 'recommendation_mood_change') {
        const mood = eventMood(event);
        if (mood) {
          const recency = recencyMultiplier(event.created_at, 60, 0.08);
          moodPreference.set(
            mood,
            (moodPreference.get(mood) ?? 0) + recency,
          );
        }
        continue;
      }

      const animeId = Number(event.entity_id);
      if (!Number.isSafeInteger(animeId) || animeId <= 0) continue;

      const recency = recencyMultiplier(event.created_at, 90, 0.12);
      if (event.event_name === 'recommendation_completed') {
        addGenres(animeId, 1.2 * recency);
        addCompletedGenres(animeId, 1.25 * recency);
      } else if (event.event_name === 'recommendation_watch_30m') {
        addGenres(animeId, 1.05 * recency);
      } else if (event.event_name === 'recommendation_watch_15m') {
        addGenres(animeId, 0.85 * recency);
      } else if (event.event_name === 'recommendation_started') {
        addGenres(animeId, 0.7 * recency);
      } else if (event.event_name === 'recommendation_planned') {
        addGenres(animeId, 0.6 * recency);
      } else if (event.event_name === 'recommendation_click') {
        addGenres(animeId, 0.25 * recency);
      } else if (event.event_name === 'recommendation_dismiss') {
        addGenres(animeId, 0.75 * recency, true);
      }
    }

    const ratedAnimeIds: number[] = [];
    const highRatedAnimeIds: number[] = [];
    const lowRatedAnimeIds: number[] = [];
    const validRatingScores: number[] = [];

    for (const item of ratings) {
      const animeId = Number(item.anime_id);
      const score = Math.round(Number(item.score));
      if (
        !Number.isSafeInteger(animeId) ||
        animeId <= 0 ||
        !Number.isFinite(score) ||
        score < 1 ||
        score > 10
      ) {
        continue;
      }

      ratedAnimeIds.push(animeId);
      validRatingScores.push(score);
      const recency = recencyMultiplier(item.updated_at, 180, 0.28);

      if (score >= 9) {
        highRatedAnimeIds.push(animeId);
        addGenres(animeId, 2.6 * recency);
      } else if (score >= 7) {
        highRatedAnimeIds.push(animeId);
        addGenres(animeId, 1.35 * recency);
      } else if (score === 6) {
        addGenres(animeId, 0.35 * recency);
      } else if (score <= 4) {
        lowRatedAnimeIds.push(animeId);
        addGenres(animeId, 2.1 * recency, true);
      } else {
        addGenres(animeId, 0.28 * recency, true);
      }
    }

    const feedbackLikedIds: number[] = [];
    const feedbackExcludedIds: number[] = [];

    for (const item of feedback) {
      const animeId = Number(item.anime_id);
      if (!Number.isSafeInteger(animeId) || animeId <= 0) continue;

      const recency = recencyMultiplier(item.updated_at, 180, 0.3);

      if (item.signal === 'like_more') {
        feedbackLikedIds.push(animeId);
        addGenres(animeId, 2.8 * recency);
      } else if (item.signal === 'not_interested') {
        feedbackExcludedIds.push(animeId);
        addGenres(animeId, 2.4 * recency, true);
      } else if (item.signal === 'less_like_this') {
        feedbackExcludedIds.push(animeId);
        addGenres(animeId, 1.25 * recency, true);
      } else if (item.signal === 'hidden') {
        feedbackExcludedIds.push(animeId);
        addGenres(animeId, 3.1 * recency, true);
      } else if (item.signal === 'already_watched') {
        feedbackExcludedIds.push(animeId);
      }
    }

    const genreWeights = normalizeWeights(positive);
    const negativeGenreWeights = normalizeWeights(negative);
    const completedGenreWeights = normalizeWeights(completedPositive);
    const moodWeights = normalizeMoodWeights(moodPreference);

    const libraryIds = library
      .map((item) => Number(item.anime_id))
      .filter((id) => Number.isSafeInteger(id) && id > 0);

    const completedAnimeIds = [
      ...new Set([
        ...library
          .filter(
            (item) => item.status.trim().toLowerCase() === 'completed',
          )
          .map((item) => Number(item.anime_id)),
        ...completedByAnime.keys(),
      ]),
    ]
      .filter((id) => Number.isSafeInteger(id) && id > 0)
      .slice(0, 2000);

    const droppedAnimeIds = [
      ...new Set(
        library
          .filter(
            (item) => item.status.trim().toLowerCase() === 'dropped',
          )
          .map((item) => Number(item.anime_id)),
      ),
    ]
      .filter((id) => Number.isSafeInteger(id) && id > 0)
      .slice(0, 2000);

    const likedAnimeIds = [...new Set(feedbackLikedIds)].slice(0, 2000);
    const uniqueRatedAnimeIds = [...new Set(ratedAnimeIds)].slice(0, 2000);
    const uniqueHighRatedAnimeIds = [
      ...new Set(highRatedAnimeIds),
    ].slice(0, 2000);
    const uniqueLowRatedAnimeIds = [
      ...new Set(lowRatedAnimeIds),
    ].slice(0, 2000);

    const excludedAnimeIds = [
      ...new Set([
        ...libraryIds,
        ...completedAnimeIds,
        ...feedbackExcludedIds,
        ...likedAnimeIds,
        ...uniqueRatedAnimeIds,
      ]),
    ].slice(0, 2000);

    const completedEpisodes = history.length;

    const resolvedStatuses = library.filter((item) => {
      const status = item.status.trim().toLowerCase();
      return status === 'completed' || status === 'dropped';
    });
    const completedTitles = resolvedStatuses.filter(
      (item) => item.status.trim().toLowerCase() === 'completed',
    ).length;
    const completionRate = resolvedStatuses.length
      ? clamp(completedTitles / resolvedStatuses.length)
      : 0;

    const sevenDaysAgo = Date.now() - 7 * 86_400_000;
    const recentCompletedEpisodes = history.filter((item) => {
      if (!item.completed_at) return false;
      const timestamp = Date.parse(item.completed_at);
      return Number.isFinite(timestamp) && timestamp >= sevenDaysAgo;
    }).length;
    const bingeScore = clamp(recentCompletedEpisodes / 28);

    const averageRating = validRatingScores.length
      ? Math.round(
          (validRatingScores.reduce((sum, score) => sum + score, 0) /
            validRatingScores.length) *
            100,
        ) / 100
      : null;

    const recommendationSignalEvents = events.filter(
      (event) => event.event_name !== 'recommendation_mood_change',
    ).length;

    const signalBreakdown = {
      library: library.length,
      completedTitles: completedAnimeIds.length,
      completedEpisodes,
      recommendationEvents: recommendationSignalEvents,
      explicitFeedback: feedback.length,
      ratings: validRatingScores.length,
    };

    const effectiveSample =
      library.length * 1.2 +
      Math.min(completedByAnime.size, 80) * 1.1 +
      Math.min(history.length, 100) * 0.12 +
      Math.min(recommendationSignalEvents, 100) * 0.22 +
      feedback.length * 1.8 +
      validRatingScores.length * 1.7;

    const sampleSize = Math.max(0, Math.round(effectiveSample));
    const confidence = clamp(1 - Math.exp(-effectiveSample / 16));
    const explicitDepth = Math.min(
      0.02,
      (feedback.length + validRatingScores.length) / 250,
    );
    const explorationRate = clamp(
      0.2 - confidence * 0.1 - explicitDepth,
      0.08,
      0.2,
    );

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
      completionRate,
      bingeScore,
      preferredEpisodeCount: median(positiveEpisodeCounts.slice(0, 160)),
      averageRating,
      ratingsCount: validRatingScores.length,
      explorationRate,
      moodWeights,
      signalBreakdown,
      genreWeights,
      negativeGenreWeights,
      completedGenreWeights,
      excludedAnimeIds,
      completedAnimeIds,
      droppedAnimeIds,
      likedAnimeIds,
      ratedAnimeIds: uniqueRatedAnimeIds,
      highRatedAnimeIds: uniqueHighRatedAnimeIds,
      lowRatedAnimeIds: uniqueLowRatedAnimeIds,
      explicitFeedbackCount: feedback.length,
      topGenres,
    };

    return NextResponse.json(
      { graph },
      {
        headers: {
          'Cache-Control': 'private, max-age=60, stale-while-revalidate=300',
        },
      },
    );
  } catch (error) {
    console.error('[Taste Graph] endpoint', error);
    return NextResponse.json(
      { graph: null },
      {
        status: 200,
        headers: { 'Cache-Control': 'private, no-store' },
      },
    );
  }
}
