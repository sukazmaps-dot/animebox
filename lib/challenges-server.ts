import 'server-only';

import { adminClient } from '@/lib/community-server';
import { normalizeChallengeSnapshot } from '@/lib/challenges';

export async function getUserChallengesSnapshot(userId: string) {
  const admin = adminClient();
  const { data, error } = await admin.rpc('user_challenges_snapshot', {
    p_user: userId,
  });

  if (error) throw error;
  return normalizeChallengeSnapshot(data);
}

export type ChallengeSyncResult = {
  duplicate?: boolean;
  event_id?: number | null;
  reward_xp?: number;
  completed?: string[];
  current_streak?: number;
};

export async function syncUserChallenges({
  userId,
  eventKey,
  activeMs = 0,
  completedEpisodes = 0,
  comments = 0,
  completedTitles = 0,
  activityAt,
}: {
  userId: string;
  eventKey: string;
  activeMs?: number;
  completedEpisodes?: number;
  comments?: number;
  completedTitles?: number;
  activityAt?: string | null;
}): Promise<ChallengeSyncResult | null> {
  const admin = adminClient();
  const { data, error } = await admin.rpc('sync_user_challenges', {
    p_user: userId,
    p_event_key: eventKey.slice(0, 160),
    p_active_ms: Math.max(0, Math.floor(activeMs)),
    p_completed_episodes: Math.max(0, Math.floor(completedEpisodes)),
    p_comments: Math.max(0, Math.floor(comments)),
    p_completed_titles: Math.max(0, Math.floor(completedTitles)),
    p_activity_at: activityAt ?? new Date().toISOString(),
  });

  if (error) throw error;

  return data && typeof data === 'object' && !Array.isArray(data)
    ? (data as ChallengeSyncResult)
    : null;
}
