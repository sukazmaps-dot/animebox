import {
  ApiError,
  failure,
  positiveInteger,
  readBody,
  response,
  userClient,
} from '@/lib/community-server';
import {
  endWatchSession,
  getEpisodeWatchState,
  getLatestWatchState,
  recordWatchHeartbeat,
  startWatchSession,
} from '@/lib/watch-server';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function optionalPositiveInteger(value: unknown, max = 100_000) {
  if (value == null) return null;
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1 || value > max) {
    throw new ApiError(400, 'Некорректное числовое значение.');
  }
  return value;
}

function positionMs(value: unknown, optional = false) {
  if (value == null && optional) return null;
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > 28_800_000) {
    throw new ApiError(400, 'Некорректная позиция плеера.');
  }
  return value;
}

function sessionId(value: unknown) {
  if (typeof value !== 'string' || !UUID_RE.test(value)) {
    throw new ApiError(400, 'Некорректный ID сессии.');
  }
  return value;
}

function optionalText(value: unknown, max: number) {
  if (value == null) return null;
  if (typeof value !== 'string' || value.length > max) {
    throw new ApiError(400, 'Некорректное текстовое значение.');
  }
  return value;
}


export async function GET(request: Request) {
  try {
    const { user } = await userClient();
    const url = new URL(request.url);
    const animeId = positiveInteger(Number(url.searchParams.get('animeId')));
    const episodeParam = url.searchParams.get('episode');

    const state =
      episodeParam == null
        ? await getLatestWatchState(user.id, animeId)
        : await getEpisodeWatchState(
            user.id,
            animeId,
            positiveInteger(Number(episodeParam)),
          );

    return response({ state });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request) {
  try {
    const { client, user } = await userClient();
    const body = await readBody(request);
    const action = String(body.action || '');

    if (action === 'start') {
      const animeId = positiveInteger(body.animeId);
      const episode = optionalPositiveInteger(body.episode);
      if (!episode) throw new ApiError(400, 'Некорректный номер серии.');

      const result = await startWatchSession({
        userId: user.id,
        animeId,
        episode,
        requiredEpisodes: optionalPositiveInteger(body.requiredEpisodes),
        sourceUrl: optionalText(body.sourceUrl, 4_000),
        messageOrigin: optionalText(body.messageOrigin, 500),
        positionMs: positionMs(body.positionMs, true),
        durationMs: optionalPositiveInteger(body.durationMs, 28_800_000),
      });

      return response(result, 201);
    }

    if (action === 'heartbeat') {
      const seq = optionalPositiveInteger(body.seq, 2_147_483_647);
      if (!seq) throw new ApiError(400, 'Некорректный номер heartbeat.');

      const heartbeatPosition = positionMs(body.positionMs);
      if (heartbeatPosition == null) {
        throw new ApiError(400, 'Некорректная позиция плеера.');
      }

      const result = await recordWatchHeartbeat({
        userId: user.id,
        sessionId: sessionId(body.sessionId),
        seq,
        positionMs: heartbeatPosition,
        durationMs: optionalPositiveInteger(body.durationMs, 28_800_000),
      });

      if (result.newlyCompleted) {
        // Keep the existing community history/achievements in sync with the
        // stricter server-side watch tracker when duration is known.
        const { error } = await client.rpc('record_episode', {
          p_anime: result.animeId,
          p_episode: result.episode,
          p_completed: true,
          p_source: 'player',
        });
        if (error) console.error('[watch] record_episode sync failed:', error);
      }

      return response(result);
    }

    if (action === 'end') {
      const result = await endWatchSession({
        userId: user.id,
        sessionId: sessionId(body.sessionId),
        positionMs: positionMs(body.positionMs, true),
      });

      return response(result);
    }

    throw new ApiError(400, 'Неизвестное действие трекера просмотра.');
  } catch (error) {
    return failure(error);
  }
}
