import {
  assertBrowserMutationRequest,
  failure,
  readBody,
  response,
} from '@/lib/community-server';
import { enforceIpRateLimit } from '@/lib/api-rate-limit';
import { syncWatchPartyRoomMember } from '@/lib/watch-party-rooms-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  context: { params: Promise<{ roomId: string }> },
) {
  try {
    assertBrowserMutationRequest(request);

    const limited = await enforceIpRateLimit(request, {
      scope: 'watch_party_presence_ip',
      limit: 240,
      windowSeconds: 60,
    });
    if (limited) return limited;

    const { roomId } = await context.params;
    const body = await readBody(request);
    const membership = await syncWatchPartyRoomMember(roomId, body);

    return response({ ok: true, membership });
  } catch (error) {
    return failure(error);
  }
}
