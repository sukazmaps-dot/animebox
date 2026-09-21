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

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function text(value: unknown, max: number) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

export async function POST(request: Request) {
  try {
    const { user } = await userClient();
    const body = await readBody(request);
    const roomId = text(body.roomId, 24).toLowerCase();
    const newHostUserId = text(body.newHostUserId, 64);

    if (!isWatchPartyRoomId(roomId) || !UUID_RE.test(newHostUserId)) {
      throw new ApiError(400, 'Некорректные данные передачи комнаты.');
    }
    if (newHostUserId === user.id) {
      throw new ApiError(400, 'Ты уже управляешь этой комнатой.');
    }

    const admin = adminClient();
    const { data: room, error: roomError } = await admin
      .from('watch_party_rooms')
      .select('id,host_user_id,status')
      .eq('id', roomId)
      .maybeSingle();

    if (roomError) throw roomError;
    if (!room) throw new ApiError(404, 'Комната не найдена.');
    if (room.host_user_id !== user.id) {
      throw new ApiError(403, 'Передать комнату может только текущий хост.');
    }
    if (room.status === 'ended') {
      throw new ApiError(410, 'Комната уже завершена.');
    }

    const { data: targetProfile, error: targetError } = await admin
      .from('profiles')
      .select('id')
      .eq('id', newHostUserId)
      .maybeSingle();

    if (targetError) throw targetError;
    if (!targetProfile) throw new ApiError(404, 'Новый хост не найден.');

    const now = new Date().toISOString();
    const { data, error } = await admin
      .from('watch_party_rooms')
      .update({
        host_user_id: newHostUserId,
        updated_at: now,
        last_heartbeat_at: now,
      })
      .eq('id', roomId)
      .eq('host_user_id', user.id)
      .select('id,host_user_id,status')
      .maybeSingle();

    if (error) throw error;
    if (!data) throw new ApiError(409, 'Хост комнаты уже изменился.');

    return response({
      ok: true,
      roomId,
      hostUserId: newHostUserId,
    });
  } catch (error) {
    return failure(error);
  }
}
