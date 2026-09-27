import 'server-only';

import { syncUserChallenges } from '@/lib/challenges-server';
import { trackProductEvents } from '@/lib/product-events-server';
import { syncUserProgression } from '@/lib/progression-server';
import type { WatchTrustAssessment } from '@/lib/watch-trust';

type TrustDecision = Pick<
  WatchTrustAssessment,
  'state' | 'score' | 'rewardEligible' | 'signals'
>;

export type TrustedProgressionPipelineResult = {
  rewardEligible: boolean;
  quarantined: boolean;
  challengeRewardXp: number;
  progressionEarnedXp: number;
};

function signalCodes(trust: TrustDecision) {
  return trust.signals.map((signal) => signal.code);
}

export async function applyTrustedEpisodeCompletion(input: {
  userId: string;
  sessionId: string;
  animeId: number;
  episode: number;
  completedTitle: boolean;
  trust: TrustDecision;
}): Promise<TrustedProgressionPipelineResult> {
  if (!input.trust.rewardEligible) {
    return {
      rewardEligible: false,
      quarantined: true,
      challengeRewardXp: 0,
      progressionEarnedXp: 0,
    };
  }

  const challenge = await syncUserChallenges({
    userId: input.userId,
    eventKey: `episode:${input.animeId}:${input.episode}`,
    completedEpisodes: 1,
    completedTitles: input.completedTitle ? 1 : 0,
  });

  // This event is the durable identity ledger for trusted completed titles.
  // The progression SQL uses it only for title/genre metrics; watch minutes and
  // episode counts come from challenge_activity_events.
  await trackProductEvents([
    {
      eventName: 'trusted_episode_completed',
      userId: input.userId,
      sessionId: input.sessionId,
      source: 'trusted_progression',
      entityType: 'anime_id',
      entityId: String(input.animeId),
      metadata: {
        episode: input.episode,
        completed_title: input.completedTitle,
        trust_state: input.trust.state,
        trust_score: input.trust.score,
        trust_signals: signalCodes(input.trust),
      },
      dedupeKey: `trusted-episode:${input.userId}:${input.animeId}:${input.episode}`,
    },
  ]);

  const progression = await syncUserProgression({
    userId: input.userId,
    eventKey: `watch:episode:${input.animeId}:${input.episode}`,
    reason: 'trusted_episode_completed',
  });

  return {
    rewardEligible: true,
    quarantined: false,
    challengeRewardXp: Number(challenge?.reward_xp ?? 0),
    progressionEarnedXp: Number(progression?.earned_now ?? 0),
  };
}

export async function applyTrustedWatchSessionEnd(input: {
  userId: string;
  sessionId: string;
  acceptedMs: number;
  trust: TrustDecision;
}): Promise<TrustedProgressionPipelineResult> {
  if (!input.trust.rewardEligible) {
    return {
      rewardEligible: false,
      quarantined: true,
      challengeRewardXp: 0,
      progressionEarnedXp: 0,
    };
  }

  const challenge = await syncUserChallenges({
    userId: input.userId,
    eventKey: `watch:end:${input.sessionId}`,
    activeMs: Math.max(0, Math.floor(input.acceptedMs)),
  });

  const progression = await syncUserProgression({
    userId: input.userId,
    eventKey: `watch:end:${input.sessionId}`,
    reason: 'trusted_watch_session_end',
  });

  return {
    rewardEligible: true,
    quarantined: false,
    challengeRewardXp: Number(challenge?.reward_xp ?? 0),
    progressionEarnedXp: Number(progression?.earned_now ?? 0),
  };
}


export async function applyCommunityCommentProgression(input: {
  userId: string;
  eventKey: string;
}): Promise<TrustedProgressionPipelineResult> {
  const challenge = await syncUserChallenges({
    userId: input.userId,
    eventKey: input.eventKey,
    comments: 1,
  });

  const progression = await syncUserProgression({
    userId: input.userId,
    eventKey: input.eventKey,
    reason: 'community_comment_created',
  });

  return {
    rewardEligible: true,
    quarantined: false,
    challengeRewardXp: Number(challenge?.reward_xp ?? 0),
    progressionEarnedXp: Number(progression?.earned_now ?? 0),
  };
}
