import {
  ApiError,
  failure,
  response,
} from '@/lib/community-server';
import { consumeIpRateLimit, rateLimitResponse } from '@/lib/api-rate-limit';
import { resolveWatchPartyRoomForJoin } from '@/lib/watch-party-rooms-server';
import { privateNoStoreHeaders } from '@/lib/edge-cache-policy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    if (
      !(await consumeIpRateLimit(request, {
        scope: 'watch_party_room_resolve_ip',
        limit: 40,
        windowSeconds: 60,
      }))
    ) {
      return rateLimitResponse();
    }

    const params = new URL(request.url).searchParams;
    const room = await resolveWatchPartyRoomForJoin({
      roomId: params.get('roomId'),
      roomCode: params.get('code'),
    });

    return Response.json(
      { ok: true, room },
      { headers: privateNoStoreHeaders() },
    );
  } catch (error) {
    if (error instanceof ApiError) return failure(error);
    return failure(error);
  }
}
