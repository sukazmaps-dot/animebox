import 'server-only';

import { adminClient } from '@/lib/community-server';

export type ProgressionSyncResult = {
  total_xp?: number;
  earned_now?: number;
  premium_bonus_now?: number;
  challenge_xp?: number;
  unlocked?: {
    code?: string;
    title?: string;
    rarity?: string;
    xpReward?: number;
  }[];
};

export async function syncUserProgression({
  userId,
  eventKey,
  reason,
}: {
  userId: string;
  eventKey: string;
  reason: string;
}): Promise<ProgressionSyncResult | null> {
  const admin = adminClient();
  const { data, error } = await admin.rpc('sync_user_progression', {
    p_user: userId,
    // Premium is cosmetic only: never multiply progression XP.
    p_premium_boost: false,
    p_event_key: eventKey.slice(0, 180),
    p_reason: reason.slice(0, 120),
  });

  if (error) throw error;

  return data && typeof data === 'object' && !Array.isArray(data)
    ? (data as ProgressionSyncResult)
    : null;
}
