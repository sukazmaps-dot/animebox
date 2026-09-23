import {
  failure,
  readBody,
  response,
} from '@/lib/community-server';
import { reportWatchPartyRoom } from '@/lib/watch-party-rooms-server';
import { enforceIpRateLimit } from '@/lib/api-rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  context: { params: Promise<{ roomId: string }> },
) {
  try {
    const limited = await enforceIpRateLimit(request, {
      scope: 'watch_report_ip',
      limit: 20,
      windowSeconds: 3600,
    });
    if (limited) return limited;

    const { roomId } = await context.params;
    const body = await readBody(request);
    await reportWatchPartyRoom(roomId, body);
    return response({ ok: true }, 201);
  } catch (error) {
    return failure(error);
  }
}
