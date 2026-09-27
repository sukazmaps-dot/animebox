import {
  ApiError,
  adminClient,
  failure,
  response,
  userClient,
} from '@/lib/community-server';
import { getUserEntitlements } from '@/lib/entitlements-server';
import { normalizeProgression } from '@/lib/progression';
import {
  PROGRESSION_MILESTONES,
  progressionEvolutionState,
} from '@/lib/progression-milestones';

export async function GET() {
  try {
    const { user } = await userClient();
    const admin = adminClient();

    const [{ data, error }, entitlements] = await Promise.all([
      admin
        .from('user_progression')
        .select(
          'total_xp,activity_xp,premium_bonus_xp,achievement_xp,challenge_xp,admin_adjustment_xp,updated_at',
        )
        .eq('user_id', user.id)
        .maybeSingle(),
      getUserEntitlements(user.id).catch(() => null),
    ]);

    if (error) throw new ApiError(500, 'Не удалось загрузить прогрессию.');

    // Historical premium_bonus_xp remains visible for audit/backward compatibility,
    // but Premium no longer changes XP earnings. It only enables visual evolution.
    const progression = normalizeProgression(data, false);
    const premium = Boolean(entitlements?.premiumBadge);
    const evolution = progressionEvolutionState(progression, premium);

    return response({
      progression: {
        ...progression,
        premiumBoostActive: false,
      },
      evolution,
      milestones: PROGRESSION_MILESTONES.map((item) => ({
        ...item,
        unlocked: progression.level >= item.level,
      })),
      premium,
    });
  } catch (error) {
    return failure(error);
  }
}
