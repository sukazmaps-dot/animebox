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
]);

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

    if (!Number.isSafeInteger(animeId) || animeId <= 0) {
      throw new ApiError(400, 'Некорректный тайтл.');
    }
    if (!SIGNALS.has(signal)) {
      throw new ApiError(400, 'Некорректный сигнал рекомендаций.');
    }

    const { error } = await adminClient()
      .from('recommendation_feedback')
      .upsert(
        {
          user_id: user.id,
          anime_id: animeId,
          signal,
          source,
          reason,
          model_version: modelVersion,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,anime_id' },
      );

    if (error) throw error;

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
