import {
  failure,
  readBody,
  response,
} from '@/lib/community-server';
import { heartbeatWatchPartyRoom } from '@/lib/watch-party-rooms-server';
import { enforceIpRateLimit } from '@/lib/api-rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  context: { params: Promise<{ roomId: string }> },
) {
  try {
    const limited = await enforceIpRateLimit(request, {
      scope: 'watch_heartbeat_ip',
      limit: 600,
      windowSeconds: 60,
    });
    if (limited) return limited;

    const { roomId } = await context.params;
    const body = await readBody(request);
    await heartbeatWatchPartyRoom(roomId, body);
    return response({ ok: true });
  } catch (error) {
    return failure(error);
  }
}
