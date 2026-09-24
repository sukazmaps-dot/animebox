import {
  failure,
  readBody,
  response,
  userClient,
} from '@/lib/community-server';
import { enforceIpAndUserRateLimit } from '@/lib/api-rate-limit';
import { reportEpisodeComment } from '@/lib/social-community-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const REASONS = new Set([
  'spam',
  'abuse',
  'spoiler',
  'scam',
  'other',
] as const);

export async function POST(request: Request) {
  try {
    const { user } = await userClient();
    const limited = await enforceIpAndUserRateLimit(request, user.id, {
      ip: { scope: 'comment_report_ip', limit: 30, windowSeconds: 3600 },
      user: { scope: 'comment_report_user', limit: 10, windowSeconds: 3600 },
    });
    if (limited) return limited;

    const body = await readBody(request);
    const commentId =
      typeof body.commentId === 'string'
        ? body.commentId.trim()
        : '';
    const reason =
      typeof body.reason === 'string' &&
      REASONS.has(body.reason as 'spam')
        ? body.reason as 'spam' | 'abuse' | 'spoiler' | 'scam' | 'other'
        : null;
    const details =
      typeof body.details === 'string'
        ? body.details.trim().slice(0, 300)
        : '';

    if (!commentId || !reason) {
      return response({ error: 'Некорректная жалоба.' }, 400);
    }

    await reportEpisodeComment({
      userId: user.id,
      commentId,
      reason,
      details,
    });

    return response({ ok: true }, 201);
  } catch (error) {
    return failure(error);
  }
}
