import {
  ApiError,
  failure,
  readBody,
  response,
} from '@/lib/community-server';
import {
  createWatchPartyRoom,
  listPublicWatchPartyRooms,
} from '@/lib/watch-party-rooms-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const rawLimit = Number(new URL(request.url).searchParams.get('limit') || 12);
    const limit = Number.isSafeInteger(rawLimit) ? Math.min(30, Math.max(1, rawLimit)) : 12;
    const rooms = await listPublicWatchPartyRooms(limit);
    return response({ rooms });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = await readBody(request);
    const room = await createWatchPartyRoom(body);
    return response({ room }, 201);
  } catch (error) {
    if (error instanceof ApiError) return failure(error);
    return failure(error);
  }
}
