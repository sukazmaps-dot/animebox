import {
  ApiError,
  adminClient,
  failure,
  positiveInteger,
  readBody,
  response,
  userClient,
} from '@/lib/community-server';
import { enforceIpAndUserRateLimit } from '@/lib/api-rate-limit';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EVENT_TOLERANCE_BEFORE_MS = 5_000;
const EVENT_TOLERANCE_AFTER_MS = 2_500;
const MIN_TRUSTED_OVERLAP_MS = 2_500;

type PlayedRange = [number, number];

function eventId(value: unknown) {
  if (typeof value !== 'string' || !UUID_RE.test(value)) {
    throw new ApiError(400, 'Некорректный ID события.');
  }
  return value;
}

function positionMs(value: unknown) {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > 28_800_000) {
    throw new ApiError(400, 'Некорректная позиция плеера.');
  }
  return value;
}

function ranges(value: unknown): PlayedRange[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item): PlayedRange[] => {
    if (!Array.isArray(item) || item.length < 2) return [];
    const start = Number(item[0]);
    const end = Number(item[1]);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return [];
    return [[Math.max(0, Math.round(start)), Math.max(0, Math.round(end))]];
  });
}

function overlapMs(input: {
  watchedRanges: PlayedRange[];
  eventAtMs: number;
}) {
  const targetStart = Math.max(0, input.eventAtMs - EVENT_TOLERANCE_BEFORE_MS);
  const targetEnd = input.eventAtMs + EVENT_TOLERANCE_AFTER_MS;

  return input.watchedRanges.reduce((total, [start, end]) => {
    const overlapStart = Math.max(start, targetStart);
    const overlapEnd = Math.min(end, targetEnd);
    return overlapEnd > overlapStart ? total + (overlapEnd - overlapStart) : total;
  }, 0);
}

export async function GET(request: Request) {
  try {
    const { user } = await userClient();
    const url = new URL(request.url);
    const animeId = positiveInteger(Number(url.searchParams.get('animeId')));
    const episode = positiveInteger(Number(url.searchParams.get('episode')));
    const admin = adminClient();

    const { data: events, error: eventsError } = await admin
      .from('episode_events')
      .select('id,event_key,kind,title,description,at_ms,rarity,image_url,confidence')
      .eq('anime_id', animeId)
      .eq('episode_number', episode)
      .eq('status', 'approved')
      .order('at_ms', { ascending: true });

    if (eventsError) throw eventsError;

    const ids = (events ?? []).map((item) => item.id);
    const { data: unlocks, error: unlockError } = ids.length
      ? await admin
          .from('user_episode_events')
          .select('event_id,unlocked_at')
          .eq('user_id', user.id)
          .in('event_id', ids)
      : { data: [], error: null };

    if (unlockError) throw unlockError;

    const unlockedAt = new Map(
      (unlocks ?? []).map((item) => [String(item.event_id), String(item.unlocked_at)]),
    );

    return response({
      events: (events ?? []).map((item) => {
        const unlocked = unlockedAt.has(String(item.id));
        return {
          id: item.id,
          eventKey: item.event_key,
          kind: item.kind,
          atMs: Number(item.at_ms),
          rarity: item.rarity,
          unlocked,
          unlockedAt: unlockedAt.get(String(item.id)) ?? null,
          title: unlocked ? item.title : null,
          description: unlocked ? item.description : null,
          imageUrl: unlocked ? item.image_url : null,
        };
      }),
    });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request) {
  try {
    const { user } = await userClient();
    const limited = await enforceIpAndUserRateLimit(request, user.id, {
      ip: { scope: 'episode_journey_unlock_ip', limit: 120, windowSeconds: 60 },
      user: { scope: 'episode_journey_unlock_user', limit: 60, windowSeconds: 60 },
    });
    if (limited) return limited;

    const body = await readBody(request);
    const id = eventId(body.eventId);
    const observedPositionMs = positionMs(body.observedPositionMs);
    const admin = adminClient();

    const { data: event, error: eventError } = await admin
      .from('episode_events')
      .select('id,anime_id,episode_number,title,description,kind,at_ms,rarity,image_url,status')
      .eq('id', id)
      .eq('status', 'approved')
      .maybeSingle();

    if (eventError) throw eventError;
    if (!event) throw new ApiError(404, 'Событие не найдено.');

    const atMs = Number(event.at_ms);
    if (observedPositionMs + 3_000 < atMs) {
      throw new ApiError(409, 'Событие ещё не достигнуто.');
    }

    const watch = admin.schema('animebox_watch');

    const { data: episodeRow, error: episodeError } = await watch
      .from('episodes')
      .select('id')
      .eq('anime_id', Number(event.anime_id))
      .eq('episode_number', Number(event.episode_number))
      .maybeSingle();

    if (episodeError) throw episodeError;
    if (!episodeRow) throw new ApiError(409, 'Нет подтверждённой сессии просмотра.');

    const { data: progress, error: progressError } = await watch
      .from('progress')
      .select('watched_ranges,last_watched_at')
      .eq('user_id', user.id)
      .eq('episode_id', episodeRow.id)
      .maybeSingle();

    if (progressError) throw progressError;
    if (!progress) throw new ApiError(409, 'Сначала посмотри этот момент серии.');

    const trustedOverlap = overlapMs({
      watchedRanges: ranges(progress.watched_ranges),
      eventAtMs: atMs,
    });

    if (trustedOverlap < MIN_TRUSTED_OVERLAP_MS) {
      throw new ApiError(409, 'Момент не подтверждён трекером просмотра.');
    }

    const { data: existing, error: existingError } = await admin
      .from('user_episode_events')
      .select('event_id,unlocked_at')
      .eq('user_id', user.id)
      .eq('event_id', id)
      .maybeSingle();

    if (existingError) throw existingError;

    if (!existing) {
      const { error: insertError } = await admin
        .from('user_episode_events')
        .insert({
          user_id: user.id,
          event_id: id,
          unlock_position_ms: observedPositionMs,
        });

      if (insertError && insertError.code !== '23505') throw insertError;
    }

    return response({
      unlocked: true,
      event: {
        id: event.id,
        kind: event.kind,
        title: event.title,
        description: event.description,
        rarity: event.rarity,
        imageUrl: event.image_url,
      },
    });
  } catch (error) {
    return failure(error);
  }
}
