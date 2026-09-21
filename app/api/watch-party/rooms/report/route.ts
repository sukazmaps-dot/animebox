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
    const reason = text(body.reason, 300);
    const targetUserId = text(body.targetUserId, 64);

    if (!isWatchPartyRoomId(roomId)) throw new ApiError(400, 'Некорректная комната.');
    if (reason.length < 3) throw new ApiError(400, 'Укажи причину жалобы.');

    const admin = adminClient();
    const { data: room, error: roomError } = await admin
      .from('watch_party_rooms')
      .select('id')
      .eq('id', roomId)
      .maybeSingle();

    if (roomError) throw roomError;
    if (!room) throw new ApiError(404, 'Комната не найдена.');

    const { error } = await admin.from('watch_party_room_reports').insert({
      room_id: roomId,
      reporter_user_id: user.id,
      target_user_id: UUID_RE.test(targetUserId) ? targetUserId : null,
      reason,
    });

    if (error) throw error;
    return response({ ok: true });
  } catch (error) {
    return failure(error);
  }
}
