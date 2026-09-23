import { assertBrowserMutationRequest, failure, response } from '@/lib/community-server';
import { endWatchPartyRoom } from '@/lib/watch-party-rooms-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(
  _request: Request,
  context: { params: Promise<{ roomId: string }> },
) {
  try {
    assertBrowserMutationRequest(_request);
    const { roomId } = await context.params;
    await endWatchPartyRoom(roomId);
    return response({ ok: true });
  } catch (error) {
    return failure(error);
  }
}
