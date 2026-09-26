import {
  ApiError,
  failure,
  readJsonBody,
  response,
  userClient,
} from '@/lib/community-server';
import { enforceIpAndUserRateLimit } from '@/lib/api-rate-limit';
import {
  getSelectedSeasonFrame,
  listActiveSeasonFrameUnlocks,
  listLeaderboardRewardsForUser,
  selectSeasonFrame,
} from '@/lib/leaderboard-rewards-server';
import {
  isSeasonFrameKey,
  seasonFrameLabel,
} from '@/lib/leaderboard-rewards';
import { reconcilePremiumForUser } from '@/lib/premium-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function rewardId(value: unknown) {
  const id = typeof value === 'string' ? value.trim() : '';
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    throw new ApiError(400, 'Некорректная награда.');
  }
  return id;
}

export async function GET() {
  try {
    const { user } = await userClient();
    const [rewards, unlockedFrames, selectedFrame] = await Promise.all([
      listLeaderboardRewardsForUser(user.id),
      listActiveSeasonFrameUnlocks(user.id),
      getSelectedSeasonFrame(user.id),
    ]);

    return response({
      ok: true,
      rewards,
      pending: rewards.filter((item) => item.status === 'pending'),
      unlockedFrames: unlockedFrames.map((frame) => ({
        key: frame.key,
        label: seasonFrameLabel(frame.key),
        expiresAt: frame.expiresAt,
      })),
      selectedFrame,
    });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request) {
  try {
    const { client, user } = await userClient();
    const limited = await enforceIpAndUserRateLimit(request, user.id, {
      ip: { scope: 'leaderboard_rewards_ip', limit: 35, windowSeconds: 60 },
      user: { scope: 'leaderboard_rewards_user', limit: 18, windowSeconds: 60 },
    });
    if (limited) return limited;

    const body = await readJsonBody(request, { maxBytes: 4_000 });
    const action = String(body.action || '');

    if (action === 'claim') {
      const id = rewardId(body.rewardId);
      const { data, error } = await client.rpc('claim_leaderboard_reward', {
        p_reward_id: id,
      });

      if (error) {
        if (/REWARD_NOT_FOUND/i.test(error.message)) {
          throw new ApiError(404, 'Награда не найдена.');
        }
        throw error;
      }

      const subscriptions = await reconcilePremiumForUser(user.id);
      const premiumUntil = subscriptions.reduce<string | null>((furthest, item) => {
        if (!furthest || Date.parse(item.endsAt) > Date.parse(furthest)) return item.endsAt;
        return furthest;
      }, null);

      const [rewards, unlockedFrames, selectedFrame] = await Promise.all([
        listLeaderboardRewardsForUser(user.id),
        listActiveSeasonFrameUnlocks(user.id),
        getSelectedSeasonFrame(user.id),
      ]);

      return response({
        ok: true,
        claim: data,
        premiumUntil,
        rewards,
        pending: rewards.filter((item) => item.status === 'pending'),
        unlockedFrames: unlockedFrames.map((frame) => ({
          key: frame.key,
          label: seasonFrameLabel(frame.key),
          expiresAt: frame.expiresAt,
        })),
        selectedFrame,
      });
    }

    if (action === 'select_frame') {
      const raw = body.frameKey;
      const frame = raw == null || raw === ''
        ? null
        : isSeasonFrameKey(raw)
          ? raw
          : null;

      if (raw != null && raw !== '' && !frame) {
        throw new ApiError(400, 'Неизвестная сезонная рамка.');
      }

      try {
        await selectSeasonFrame(user.id, frame);
      } catch (error) {
        if (error instanceof Error && error.message === 'SEASON_FRAME_LOCKED') {
          throw new ApiError(403, 'Эта рамка ещё не разблокирована.');
        }
        throw error;
      }

      return response({ ok: true, selectedFrame: frame });
    }

    throw new ApiError(400, 'Неизвестное действие.');
  } catch (error) {
    return failure(error);
  }
}
