import {
  failure,
  readBody,
  response,
} from '@/lib/community-server';
import { transferWatchPartyRoomHost } from '@/lib/watch-party-rooms-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  context: { params: Promise<{ roomId: string }> },
) {
  try {
    const { roomId } = await context.params;
    const body = await readBody(request);
    const targetUserId =
      typeof body.targetUserId === 'string' ? body.targetUserId.trim() : '';

    await transferWatchPartyRoomHost(roomId, targetUserId);
    return response({ ok: true });
  } catch (error) {
    return failure(error);
  }
}
