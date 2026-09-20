import { failure, response, userClient } from '@/lib/community-server';
import { getUserChallengesSnapshot } from '@/lib/challenges-server';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { user } = await userClient();
    const snapshot = await getUserChallengesSnapshot(user.id);
    return response(snapshot);
  } catch (error) {
    return failure(error);
  }
}
