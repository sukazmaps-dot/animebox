import {
  adminClient,
  ApiError,
  ensureAnime,
  failure,
  positiveInteger,
  readJsonBody,
  response,
  userClient,
} from '@/lib/community-server';
import { enforceIpAndUserRateLimit } from '@/lib/api-rate-limit';
import { createClient } from '@/lib/supabase/server';
import { trackProductEvents } from '@/lib/product-events-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RatingSummaryRow = {
  anime_id: number;
  average_score: number | string | null;
  rating_count: number | string | null;
};

async function getSummary(animeId: number) {
  const { data, error } = await adminClient()
    .from('anime_rating_summary')
    .select('anime_id,average_score,rating_count')
    .eq('anime_id', animeId)
    .maybeSingle();

  if (error) throw error;

  const row = data as RatingSummaryRow | null;
  const average = row?.average_score == null ? null : Number(row.average_score);
  const count = row?.rating_count == null ? 0 : Number(row.rating_count);

  return {
    average: Number.isFinite(average) ? average : null,
    count: Number.isFinite(count) ? Math.max(0, Math.trunc(count)) : 0,
  };
}

function ratingScore(value: unknown) {
  const score = Number(value);
  if (!Number.isSafeInteger(score) || score < 1 || score > 10) {
    throw new ApiError(400, 'Оценка должна быть от 1 до 10.');
  }
  return score;
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const animeId = positiveInteger(Number(url.searchParams.get('animeId')));
    const [summary, supabase] = await Promise.all([
      getSummary(animeId),
      createClient(),
    ]);

    let myScore: number | null = null;
    const { data: authData } = await supabase.auth.getUser();

    if (authData.user) {
      const { data, error } = await supabase
        .from('anime_ratings')
        .select('score')
        .eq('anime_id', animeId)
        .eq('user_id', authData.user.id)
        .maybeSingle();

      if (error) throw error;
      myScore = typeof data?.score === 'number' ? data.score : null;
    }

    return response({
      ok: true,
      animeId,
      average: summary.average,
      count: summary.count,
      myScore,
    });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request) {
  try {
    const { client, user } = await userClient();
    const limited = await enforceIpAndUserRateLimit(request, user.id, {
      ip: { scope: 'anime_rating_write_ip', limit: 90, windowSeconds: 60 },
      user: { scope: 'anime_rating_write_user', limit: 40, windowSeconds: 60 },
    });
    if (limited) return limited;

    const body = await readJsonBody(request, { maxBytes: 4_000 });
    const animeId = positiveInteger(body.animeId);
    const score = ratingScore(body.score);

    await ensureAnime(animeId);

    const { error } = await client
      .from('anime_ratings')
      .upsert(
        {
          user_id: user.id,
          anime_id: animeId,
          score,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,anime_id' },
      );

    if (error) throw error;

    const summary = await getSummary(animeId);

    await trackProductEvents([
      {
        eventName: 'social_rating_set',
        userId: user.id,
        source: 'anime_rating',
        entityType: 'anime',
        entityId: String(animeId),
        metadata: { score },
        dedupeKey: `social-rating:${user.id}:${animeId}:${score}`,
      },
    ]);

    return response({
      ok: true,
      animeId,
      myScore: score,
      average: summary.average,
      count: summary.count,
    });
  } catch (error) {
    return failure(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const { client, user } = await userClient();
    const limited = await enforceIpAndUserRateLimit(request, user.id, {
      ip: { scope: 'anime_rating_delete_ip', limit: 90, windowSeconds: 60 },
      user: { scope: 'anime_rating_delete_user', limit: 40, windowSeconds: 60 },
    });
    if (limited) return limited;

    const body = await readJsonBody(request, { maxBytes: 4_000 });
    const animeId = positiveInteger(body.animeId);

    const { error } = await client
      .from('anime_ratings')
      .delete()
      .eq('anime_id', animeId)
      .eq('user_id', user.id);

    if (error) throw error;

    const summary = await getSummary(animeId);

    return response({
      ok: true,
      animeId,
      myScore: null,
      average: summary.average,
      count: summary.count,
    });
  } catch (error) {
    return failure(error);
  }
}
