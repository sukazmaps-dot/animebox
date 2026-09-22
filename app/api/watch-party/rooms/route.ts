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
import { consumeIpRateLimit, rateLimitResponse } from '@/lib/api-rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    if (!(await consumeIpRateLimit(request, { scope: 'room_list', limit: 60, windowSeconds: 60 }))) {
      return rateLimitResponse();
    }
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
    if (!(await consumeIpRateLimit(request, { scope: 'room_create_ip', limit: 12, windowSeconds: 60 }))) {
      return rateLimitResponse();
    }
    const body = await readBody(request);
    const room = await createWatchPartyRoom(body);
    return response({ room }, 201);
  } catch (error) {
    if (error instanceof ApiError) return failure(error);
    return failure(error);
  }
}
