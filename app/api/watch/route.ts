import {
  ApiError,
  adminClient,
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
  getTitleWatchOverviews,
  getWatchSessionAcceptedMs,
  recordWatchHeartbeat,
  startWatchSession,
} from '@/lib/watch-server';
import { syncUserProgression } from '@/lib/progression-server';
import { syncUserChallenges } from '@/lib/challenges-server';
import { trackProductEvents } from '@/lib/product-events-server';

import { enforceIpAndUserRateLimit } from '@/lib/api-rate-limit';
import { observeApiRoute } from '@/lib/request-observability-server';

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

function providerSkip(value: unknown) {
  if (value == null) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ApiError(400, 'Некорректные данные пропуска заставки.');
  }

  const record = value as Record<string, unknown>;
  const rawKind = record.kind;
  if (rawKind !== 'opening' && rawKind !== 'ending') {
    throw new ApiError(400, 'Некорректный тип пропуска заставки.');
  }

  const fromMs = positionMs(record.fromMs);
  const toMs = positionMs(record.toMs);
  if (fromMs == null || toMs == null || toMs <= fromMs) {
    throw new ApiError(400, 'Некорректный диапазон пропуска заставки.');
  }

  const kind: 'opening' | 'ending' = rawKind;

  return {
    kind,
    fromMs,
    toMs,
    origin: optionalText(record.origin, 500),
  };
}


async function observedGET(request: Request) {
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

async function observedPOST(request: Request) {
  try {
    const { user } = await userClient();
    const body = await readBody(request);
    const action = String(body.action || '');

    /*
     * Heartbeats already carry server-owned session + sequence state and are
     * cadence-gated inside recordWatchHeartbeat(). Paying two durable
     * Postgres rate-bucket RPCs for every normal heartbeat amplified the
     * hottest write path. Keep durable IP+user limits only on session
     * lifecycle actions; heartbeat abuse is rejected before expensive writes
     * by the session's last_received_at guard.
     */
    if (action === 'start' || action === 'end') {
      const limited = await enforceIpAndUserRateLimit(request, user.id, {
        ip: {
          scope: 'watch_session_ip',
          limit: 120,
          windowSeconds: 60,
        },
        user: {
          scope: 'watch_session_user',
          limit: 60,
          windowSeconds: 60,
        },
      });
      if (limited) return limited;
    }

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

      const admin = adminClient();
      const { error: libraryError } = await admin
        .from('anime_library')
        .upsert(
          {
            user_id: user.id,
            anime_id: animeId,
            status: 'watching',
            updated_at: new Date().toISOString(),
          },
          {
            onConflict: 'user_id,anime_id',
            ignoreDuplicates: true,
          },
        );

      if (libraryError) {
        console.error('[watch] auto library sync failed:', libraryError);
      } else {
        // A real playback session is enough to promote "planned" to
        // "watching". Explicit dropped/completed choices are preserved.
        const { error: promoteError } = await admin
          .from('anime_library')
          .update({
            status: 'watching',
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', user.id)
          .eq('anime_id', animeId)
          .eq('status', 'planned');

        if (promoteError) {
          console.error('[watch] planned -> watching sync failed:', promoteError);
        }
      }

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
        providerSkip: providerSkip(body.providerSkip),
      });

      if (result.newlyCompleted) {
        const admin = adminClient();
        let completedTitleNow = false;

        try {
          const [overview] = await getTitleWatchOverviews(
            user.id,
            [result.animeId],
          );

          if (overview?.fullyCompleted) {
            completedTitleNow = true;

            const { error: statusError } = await admin
              .from('anime_library')
              .update({
                status: 'completed',
                updated_at: new Date().toISOString(),
              })
              .eq('user_id', user.id)
              .eq('anime_id', result.animeId)
              .in('status', ['watching', 'planned']);

            if (statusError) {
              console.error('[watch] completed status sync failed:', statusError);
            }
          }
        } catch (syncError) {
          console.error('[watch] title completion sync failed:', syncError);
        }

        try {
          await syncUserChallenges({
            userId: user.id,
            eventKey: `episode:${result.animeId}:${result.episode}`,
            completedEpisodes: 1,
            completedTitles: completedTitleNow ? 1 : 0,
          });
        } catch (challengeError) {
          console.error('[watch] challenge sync failed:', challengeError);
        }

        try {
          await syncUserProgression({
            userId: user.id,
            eventKey: `watch:episode:${result.animeId}:${result.episode}`,
            reason: 'episode_completed',
          });
        } catch (progressionError) {
          console.error('[watch] progression sync failed:', progressionError);
        }

        // Attribute a confirmed episode completion to a recent recommendation
        // start. This is server-side so refreshes/devices cannot fabricate the
        // final conversion merely by clicking a card.
        try {
          const admin = adminClient();
          const since = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
          const { data: attributedStart } = await admin
            .from('product_events')
            .select('id,session_id,source,metadata,created_at')
            .eq('user_id', user.id)
            .eq('event_name', 'recommendation_started')
            .eq('entity_id', String(result.animeId))
            .gte('created_at', since)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (attributedStart) {
            await trackProductEvents([{
              eventName: 'recommendation_completed',
              userId: user.id,
              sessionId: attributedStart.session_id,
              source: attributedStart.source ?? 'recommendation',
              path: `/anime/${result.animeId}/episode/${result.episode}`,
              entityType: 'anime_id',
              entityId: String(result.animeId),
              metadata: {
                episode: result.episode,
                recommendation_started_at: attributedStart.created_at,
                recommendation: attributedStart.metadata ?? {},
              },
              dedupeKey: `recommendation-completed:${user.id}:${result.animeId}:${result.episode}`,
            }]);
          }
        } catch (attributionError) {
          console.error('[watch] recommendation attribution failed:', attributionError);
        }
      }

      return response(result);
    }

    if (action === 'end') {
      const endedSessionId = sessionId(body.sessionId);
      const result = await endWatchSession({
        userId: user.id,
        sessionId: endedSessionId,
        positionMs: positionMs(body.positionMs, true),
      });

      let progressionUpdated = false;

      try {
        const acceptedMs = await getWatchSessionAcceptedMs(
          user.id,
          endedSessionId,
        );

        const challengeResult = await syncUserChallenges({
          userId: user.id,
          eventKey: `watch:end:${endedSessionId}`,
          activeMs: acceptedMs,
        });

        progressionUpdated =
          Number(challengeResult?.reward_xp ?? 0) > 0;
      } catch (challengeError) {
        console.error('[watch] challenge end sync failed:', challengeError);
      }

      try {
        const progression = await syncUserProgression({
          userId: user.id,
          eventKey: `watch:end:${endedSessionId}`,
          reason: 'watch_session_end',
        });
        progressionUpdated =
          progressionUpdated || Number(progression?.earned_now ?? 0) > 0;
      } catch (progressionError) {
        console.error('[watch] progression end sync failed:', progressionError);
      }

      return response({
        ...result,
        progressionUpdated,
      });
    }

    throw new ApiError(400, 'Неизвестное действие трекера просмотра.');
  } catch (error) {
    return failure(error);
  }
}


export const GET = observeApiRoute('/api/watch', observedGET);
export const POST = observeApiRoute('/api/watch', observedPOST);
