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
import {
  privateNoStoreHeaders,
  publicApiCacheHeaders,
} from '@/lib/edge-cache-policy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const rawLimit = Number(new URL(request.url).searchParams.get('limit') || 12);
    const limit = Number.isSafeInteger(rawLimit) ? Math.min(30, Math.max(1, rawLimit)) : 12;
    const rooms = await listPublicWatchPartyRooms(limit);

    return Response.json(
      { rooms },
      {
        headers: publicApiCacheHeaders({
          browserSeconds: 5,
          edgeSeconds: 12,
          staleWhileRevalidateSeconds: 24,
        }),
      },
    );
  } catch (error) {
    const result = failure(error);
    const headers = new Headers(result.headers);
    for (const [key, value] of Object.entries(privateNoStoreHeaders())) {
      headers.set(key, value);
    }

    return new Response(result.body, {
      status: result.status,
      statusText: result.statusText,
      headers,
    });
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
