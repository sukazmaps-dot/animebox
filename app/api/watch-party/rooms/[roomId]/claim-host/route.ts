import {
  assertBrowserMutationRequest,
  failure,
  response,
} from '@/lib/community-server';
import { enforceIpRateLimit } from '@/lib/api-rate-limit';
import { claimStaleWatchPartyRoomHost } from '@/lib/watch-party-rooms-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  context: { params: Promise<{ roomId: string }> },
) {
  try {
    assertBrowserMutationRequest(request);

    const limited = await enforceIpRateLimit(request, {
      scope: 'watch_party_host_claim_ip',
      limit: 30,
      windowSeconds: 60,
    });
    if (limited) return limited;

    const { roomId } = await context.params;
    const claim = await claimStaleWatchPartyRoomHost(roomId);

    return response({
      ok: true,
      claimed: claim.claimed === true,
      reason: claim.reason ?? null,
      hostUserId: claim.host_user_id ?? null,
      hostEpoch: Number(claim.host_epoch ?? 0),
      electedUserId: claim.elected_user_id ?? null,
    });
  } catch (error) {
    return failure(error);
  }
}
