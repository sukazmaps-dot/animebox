import { failure, response, userClient } from '@/lib/community-server';
import {
  getBoostyPremiumBridgeStatus,
  verifyBoostyPremiumForUser,
} from '@/lib/boosty-premium';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  try {
    const { user } = await userClient();
    const status = await getBoostyPremiumBridgeStatus(user.id);
    return response({ ok: true, ...status });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request) {
  try {
    const origin = request.headers.get('origin');
    if (origin && origin !== new URL(request.url).origin) {
      return response({ ok: false, error: 'invalid_origin' }, 403);
    }
    const { user } = await userClient();
    const status = await verifyBoostyPremiumForUser(user.id);
    return response({ ok: true, ...status });
  } catch (error) {
    return failure(error);
  }
}
