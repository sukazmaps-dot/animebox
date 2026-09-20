import { ApiError, adminClient, failure, readBody, response, userClient } from '@/lib/community-server';
import { progressionFromXp } from '@/lib/progression';

const MAX_EVENTS = 12;

function eventIds(value: unknown) {
  if (!Array.isArray(value) || value.length > MAX_EVENTS) {
    throw new ApiError(400, 'Некорректный список событий.');
  }

  const ids = value
    .map((item) => Number(item))
    .filter((item) => Number.isSafeInteger(item) && item > 0);

  if (ids.length !== value.length) {
    throw new ApiError(400, 'Некорректный ID события.');
  }

  return [...new Set(ids)];
}

export async function GET() {
  try {
    const { user } = await userClient();
    const admin = adminClient();

    const { data: rows, error } = await admin
      .from('progression_events')
      .select('id,previous_total_xp,base_xp,premium_bonus_xp,achievement_xp,challenge_xp,total_xp,unlocked_codes,challenge_codes,created_at')
      .eq('user_id', user.id)
      .is('seen_at', null)
      .order('created_at', { ascending: true })
      .limit(MAX_EVENTS);

    if (error) throw error;

    const achievementCodes = [
      ...new Set(
        (rows ?? []).flatMap((row) =>
          Array.isArray(row.unlocked_codes)
            ? row.unlocked_codes.filter((code): code is string => typeof code === 'string')
            : [],
        ),
      ),
    ];

    const challengeCodes = [
      ...new Set(
        (rows ?? []).flatMap((row) =>
          Array.isArray(row.challenge_codes)
            ? row.challenge_codes.filter((code): code is string => typeof code === 'string')
            : [],
        ),
      ),
    ];

    const [achievementsResult, challengesResult] = await Promise.all([
      achievementCodes.length
        ? admin
            .from('achievements')
            .select('code,title,description,icon,rarity,xp_reward')
            .in('code', achievementCodes)
        : Promise.resolve({ data: [], error: null }),
      challengeCodes.length
        ? admin
            .from('challenge_definitions')
            .select('code,title,description,xp_reward')
            .in('code', challengeCodes)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (achievementsResult.error) throw achievementsResult.error;
    if (challengesResult.error) throw challengesResult.error;

    const achievementByCode = new Map<string, Record<string, unknown>>();
    for (const achievement of achievementsResult.data ?? []) {
      achievementByCode.set(achievement.code, achievement as Record<string, unknown>);
    }

    const challengeByCode = new Map<string, Record<string, unknown>>();
    for (const challenge of challengesResult.data ?? []) {
      challengeByCode.set(challenge.code, challenge as Record<string, unknown>);
    }

    const events = (rows ?? []).map((row) => {
      const previousTotalXp = Number(row.previous_total_xp ?? 0);
      const earnedXp = Number(row.total_xp ?? 0);
      const totalXp = previousTotalXp + earnedXp;
      const before = progressionFromXp(previousTotalXp);
      const after = progressionFromXp(totalXp);
      const codes = Array.isArray(row.unlocked_codes) ? row.unlocked_codes : [];
      const completedChallenges = Array.isArray(row.challenge_codes)
        ? row.challenge_codes
        : [];

      return {
        id: Number(row.id),
        previousTotalXp,
        totalXp,
        earnedXp,
        baseXp: Number(row.base_xp ?? 0),
        premiumBonusXp: Number(row.premium_bonus_xp ?? 0),
        achievementXp: Number(row.achievement_xp ?? 0),
        challengeXp: Number(row.challenge_xp ?? 0),
        createdAt: row.created_at,
        levelBefore: before.level,
        levelAfter: after.level,
        rankBefore: before.rank,
        rankAfter: after.rank,
        achievements: codes
          .map((code) => achievementByCode.get(String(code)))
          .filter(Boolean)
          .map((achievement) => ({
            code: String(achievement!.code),
            title: String(achievement!.title),
            description: String(achievement!.description),
            icon: String(achievement!.icon),
            rarity: String(achievement!.rarity),
            xpReward: Number(achievement!.xp_reward ?? 0),
          })),
        challenges: completedChallenges
          .map((code) => challengeByCode.get(String(code)))
          .filter(Boolean)
          .map((challenge) => ({
            code: String(challenge!.code),
            title: String(challenge!.title),
            description: String(challenge!.description),
            xpReward: Number(challenge!.xp_reward ?? 0),
          })),
      };
    });

    return response({ events });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request) {
  try {
    const { user } = await userClient();
    const body = await readBody(request);
    const ids = eventIds(body.ids);

    if (!ids.length) return response({ success: true });

    const admin = adminClient();
    const { error } = await admin
      .from('progression_events')
      .update({ seen_at: new Date().toISOString() })
      .eq('user_id', user.id)
      .in('id', ids)
      .is('seen_at', null);

    if (error) throw error;
    return response({ success: true });
  } catch (error) {
    return failure(error);
  }
}
