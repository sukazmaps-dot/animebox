import {
  ApiError,
  adminClient,
  failure,
  readBody,
  response,
  userClient,
} from '@/lib/community-server';
import { isWatchPartyRoomId } from '@/lib/watch-party';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function text(value: unknown, max: number) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

export async function POST(request: Request) {
  try {
    const { user } = await userClient();
    const body = await readBody(request);
    const roomId = text(body.roomId, 24).toLowerCase();

    if (!isWatchPartyRoomId(roomId)) {
      throw new ApiError(400, 'Некорректная комната.');
    }

    const admin = adminClient();
    const { data: room, error } = await admin
      .from('watch_party_rooms')
      .select(
        'id,join_secret,host_user_id,anime_slug,anime_title,episode,visibility,status,participant_count,max_participants,last_heartbeat_at,expires_at',
      )
      .eq('id', roomId)
      .maybeSingle();

    if (error) throw error;
    if (!room) throw new ApiError(404, 'Комната не найдена.');

    if (room.visibility !== 'public') {
      throw new ApiError(403, 'Эта комната доступна только по приглашению.');
    }
    if (room.status === 'ended') throw new ApiError(410, 'Комната уже завершена.');
    if (Date.parse(room.expires_at) <= Date.now()) {
      throw new ApiError(410, 'Срок жизни комнаты закончился.');
    }
    if (Date.now() - Date.parse(room.last_heartbeat_at) > 90_000) {
      throw new ApiError(410, 'Хост комнаты сейчас недоступен.');
    }
    if (Number(room.participant_count) >= Number(room.max_participants)) {
      throw new ApiError(409, 'В комнате уже нет свободных мест.');
    }

    const path =
      `/watch-together/${encodeURIComponent(room.anime_slug)}/episode/${Number(room.episode)}`;
    const roomUrl =
      `${path}?party=${encodeURIComponent(room.id)}#partyKey=${encodeURIComponent(room.join_secret)}`;

    return response({
      ok: true,
      roomId: room.id,
      roomUrl,
      animeSlug: room.anime_slug,
      animeTitle: room.anime_title,
      episode: Number(room.episode),
      viewerUserId: user.id,
    });
  } catch (error) {
    return failure(error);
  }
}
