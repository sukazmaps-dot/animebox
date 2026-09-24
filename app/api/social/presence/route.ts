import {
  failure,
  readBody,
  response,
  userClient,
} from '@/lib/community-server';
import { enforceIpAndUserRateLimit } from '@/lib/api-rate-limit';
import {
  touchSocialPresence,
  type SocialSurface,
} from '@/lib/social-community-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SURFACES = new Set<SocialSurface>([
  'site',
  'player',
  'watch_together',
  'chat',
]);

export async function POST(request: Request) {
  try {
    const { user } = await userClient();
    const limited = await enforceIpAndUserRateLimit(request, user.id, {
      ip: { scope: 'social_presence_ip', limit: 180, windowSeconds: 60 },
      user: { scope: 'social_presence_user', limit: 90, windowSeconds: 60 },
    });
    if (limited) return limited;

    const body = await readBody(request);
    const raw =
      typeof body.surface === 'string'
        ? body.surface.trim()
        : 'site';
    const surface = SURFACES.has(raw as SocialSurface)
      ? raw as SocialSurface
      : 'site';

    await touchSocialPresence(user.id, surface);
    return response({ ok: true });
  } catch (error) {
    return failure(error);
  }
}
