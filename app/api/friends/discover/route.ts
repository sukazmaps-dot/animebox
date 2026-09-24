import {
  failure,
  response,
  userClient,
} from '@/lib/community-server';
import { enforceIpAndUserRateLimit } from '@/lib/api-rate-limit';
import { searchFriendDiscovery } from '@/lib/social-community-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { user } = await userClient();
    const limited = await enforceIpAndUserRateLimit(request, user.id, {
      ip: { scope: 'friend_discovery_ip', limit: 120, windowSeconds: 60 },
      user: { scope: 'friend_discovery_user', limit: 60, windowSeconds: 60 },
    });
    if (limited) return limited;

    const query = new URL(request.url).searchParams.get('q') ?? '';

    return response({
      people: await searchFriendDiscovery(user.id, query),
    });
  } catch (error) {
    return failure(error);
  }
}
