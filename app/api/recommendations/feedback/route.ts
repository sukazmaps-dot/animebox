import {
  ApiError,
  adminClient,
  readJsonBody,
  response,
  userClient,
} from '@/lib/community-server';
import { enforceIpAndUserRateLimit } from '@/lib/api-rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SIGNALS = new Set([
  'like_more',
  'not_interested',
  'already_watched',
  'less_like_this',
  'hidden',
]);

const SAFE_CONTEXT_ID = /^[A-Za-z0-9._:-]{8,120}$/;
const SAFE_VERSION = /^[A-Za-z0-9._:-]{2,80}$/;

export async function POST(request: Request) {
  try {
    const { user } = await userClient();
    const limited = await enforceIpAndUserRateLimit(request, user.id, {
      ip: {
        scope: 'recommendation_feedback_ip',
        limit: 80,
        windowSeconds: 60,
      },
      user: {
        scope: 'recommendation_feedback_user',
        limit: 40,
        windowSeconds: 60,
      },
    });
    if (limited) return limited;

    const body = await readJsonBody(request, { maxBytes: 5_000 });
    const animeId = Number(body.animeId);
    const signal = typeof body.signal === 'string' ? body.signal : '';
    const source = typeof body.source === 'string'
      ? body.source.trim().slice(0, 64)
      : 'recommendation';
    const reason = typeof body.reason === 'string'
      ? body.reason.trim().slice(0, 240)
      : null;
    const modelVersion = typeof body.modelVersion === 'string'
      ? body.modelVersion.trim().slice(0, 80)
      : null;
    const recommendationRaw = typeof body.recommendationId === 'string'
      ? body.recommendationId.trim().slice(0, 120)
      : '';
    const recommendationSessionRaw =
      typeof body.recommendationSessionId === 'string'
        ? body.recommendationSessionId.trim().slice(0, 100)
        : '';
    const algorithmRaw = typeof body.algorithmVersion === 'string'
      ? body.algorithmVersion.trim().slice(0, 80)
      : '';
    const rowId = typeof body.rowId === 'string'
      ? body.rowId.trim().slice(0, 64)
      : null;
    const position = Number(body.position);
    const mood = typeof body.mood === 'string'
      ? body.mood.trim().slice(0, 32)
      : null;

    const recommendationId =
      recommendationRaw && SAFE_CONTEXT_ID.test(recommendationRaw)
        ? recommendationRaw
        : null;
    const recommendationSessionId =
      recommendationSessionRaw && SAFE_CONTEXT_ID.test(recommendationSessionRaw)
        ? recommendationSessionRaw
        : null;
    const algorithmVersion =
      algorithmRaw && SAFE_VERSION.test(algorithmRaw)
        ? algorithmRaw
        : modelVersion && SAFE_VERSION.test(modelVersion)
          ? modelVersion
          : null;

    if (!Number.isSafeInteger(animeId) || animeId <= 0) {
      throw new ApiError(400, 'Некорректный тайтл.');
    }
    if (!SIGNALS.has(signal)) {
      throw new ApiError(400, 'Некорректный сигнал рекомендаций.');
    }

    const admin = adminClient();
    const basePayload = {
      user_id: user.id,
      anime_id: animeId,
      signal,
      source,
      reason,
      model_version: modelVersion ?? algorithmVersion,
      updated_at: new Date().toISOString(),
    };

    let write = await admin
      .from('recommendation_feedback')
      .upsert(
        {
          ...basePayload,
          recommendation_id: recommendationId,
          recommendation_session_id: recommendationSessionId,
          algorithm_version: algorithmVersion,
          metadata: {
            row_id: rowId,
            position:
              Number.isSafeInteger(position) && position > 0
                ? Math.min(500, position)
                : null,
            mood,
          },
        },
        { onConflict: 'user_id,anime_id' },
      );

    if (
      write.error &&
      /recommendation_id|recommendation_session_id|algorithm_version|metadata|schema cache/i.test(
        write.error.message,
      )
    ) {
      write = await admin
        .from('recommendation_feedback')
        .upsert(basePayload, { onConflict: 'user_id,anime_id' });
    }

    if (write.error) throw write.error;

    return response({ ok: true });
  } catch (error) {
    if (
      error instanceof Error &&
      /recommendation_feedback|schema cache|relation/i.test(error.message)
    ) {
      console.error('[Recommendations] feedback migration missing', error);
      return response({ error: 'Предпочтения временно недоступны.' }, 503);
    }

    if (error instanceof ApiError) {
      return response({ error: error.message }, error.status);
    }

    console.error('[Recommendations] feedback API', error);
    return response({ error: 'Не удалось сохранить предпочтение.' }, 503);
  }
}
