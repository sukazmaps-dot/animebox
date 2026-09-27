import 'server-only';

import { adminClient } from '@/lib/community-server';
import { trackProductEvents } from '@/lib/product-events-server';
import {
  assessWatchTrust,
  emptyWatchTrustMetrics,
  minimumCompletionDemandMs,
  type WatchTrustAssessment,
  type WatchTrustMetrics,
} from '@/lib/watch-trust';

type TrustPhase = 'completion' | 'session_end';

type HeartbeatRow = {
  received_at: string | null;
  accepted_ms: number | null;
  reason: string | null;
};

function watchClient() {
  return adminClient().schema('animebox_watch');
}

function asMillis(value: string | null | undefined) {
  const parsed = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function reasonCount(rows: HeartbeatRow[], reason: string) {
  return rows.filter((row) => row.reason === reason).length;
}

function acceptedReason(reason: string | null) {
  return Boolean(reason && reason.startsWith('accepted'));
}

export function unavailableWatchTrustAssessment(): WatchTrustAssessment & {
  available: false;
} {
  return {
    ...assessWatchTrust(emptyWatchTrustMetrics()),
    available: false,
  };
}

export async function assessWatchSessionTrust(input: {
  userId: string;
  sessionId: string;
  phase: TrustPhase;
}): Promise<WatchTrustAssessment & { available: true }> {
  const watch = watchClient();
  const now = Date.now();
  const since60m = new Date(now - 60 * 60_000).toISOString();

  const [
    { data: session, error: sessionError },
    { data: heartbeatData, error: heartbeatError },
    { count: recentSessions60m, error: sessionCountError },
    { data: completionRows, error: completionError },
  ] = await Promise.all([
    watch
      .from('sessions')
      .select('id,created_at,ended_at')
      .eq('id', input.sessionId)
      .eq('user_id', input.userId)
      .maybeSingle(),
    watch
      .from('heartbeats')
      .select('received_at,accepted_ms,reason')
      .eq('session_id', input.sessionId)
      .order('seq', { ascending: true })
      .limit(500),
    watch
      .from('sessions')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', input.userId)
      .gte('created_at', since60m),
    watch
      .from('progress')
      .select('episode_id,completed_at')
      .eq('user_id', input.userId)
      .not('completed_at', 'is', null)
      .gte('completed_at', since60m)
      .order('completed_at', { ascending: false })
      .limit(48),
  ]);

  if (sessionError) throw sessionError;
  if (heartbeatError) throw heartbeatError;
  if (sessionCountError) throw sessionCountError;
  if (completionError) throw completionError;

  if (!session) throw new Error('WATCH_TRUST_SESSION_NOT_FOUND');

  const heartbeats = (heartbeatData ?? []) as HeartbeatRow[];
  const episodeIds = [
    ...new Set(
      (completionRows ?? [])
        .map((row) => String(row.episode_id ?? ''))
        .filter(Boolean),
    ),
  ];

  let durationByEpisode = new Map<string, number>();
  if (episodeIds.length) {
    const { data: episodeRows, error: episodeError } = await watch
      .from('episodes')
      .select('id,duration_ms')
      .in('id', episodeIds);

    if (episodeError) throw episodeError;

    durationByEpisode = new Map(
      (episodeRows ?? []).map((row) => [
        String(row.id),
        Number(row.duration_ms ?? 0),
      ]),
    );
  }

  const createdAt = asMillis(session.created_at) ?? now;
  const endedAt = asMillis(session.ended_at) ?? now;
  const sessionWallMs = Math.max(0, endedAt - createdAt);
  const acceptedMs = heartbeats.reduce(
    (total, row) => total + Math.max(0, Number(row.accepted_ms ?? 0)),
    0,
  );

  const metrics: WatchTrustMetrics = {
    heartbeatCount: heartbeats.length,
    acceptedHeartbeatCount: heartbeats.filter((row) =>
      acceptedReason(row.reason),
    ).length,
    acceleratedHeartbeatCount: reasonCount(
      heartbeats,
      'accepted_accelerated',
    ),
    seekForwardCount: reasonCount(heartbeats, 'seek_forward'),
    tooSoonCount: reasonCount(heartbeats, 'too_soon'),
    sequenceGapCount: reasonCount(heartbeats, 'sequence_gap'),
    staleGapCount: reasonCount(heartbeats, 'stale_gap'),
    duplicateCount: reasonCount(heartbeats, 'duplicate'),
    idleCount: reasonCount(heartbeats, 'idle'),
    acceptedMs,
    sessionWallMs,
    recentSessions60m: Number(recentSessions60m ?? 0),
    recentCompletions60m: (completionRows ?? []).length,
    completionDemandMs60m: (completionRows ?? []).reduce((total, row) => {
      return (
        total +
        minimumCompletionDemandMs(
          durationByEpisode.get(String(row.episode_id ?? '')) ?? 0,
        )
      );
    }, 0),
  };

  const assessment = assessWatchTrust(metrics);

  await trackProductEvents([
    {
      eventName: 'watch_trust_assessed',
      userId: input.userId,
      sessionId: input.sessionId,
      source: 'watch_trust',
      entityType: 'watch_session',
      entityId: input.sessionId,
      metadata: {
        version: assessment.version,
        phase: input.phase,
        state: assessment.state,
        score: assessment.score,
        reward_eligible: assessment.rewardEligible,
        signal_codes: assessment.signals.map((signal) => signal.code),
        metrics: assessment.metrics,
      },
      dedupeKey: `watch-trust:${input.sessionId}:${input.phase}`,
    },
  ]);

  return { ...assessment, available: true };
}

function metadataState(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const state = (value as Record<string, unknown>).state;
  return typeof state === 'string' ? state : null;
}

export async function getHighRiskUsersFromTrustEvents(input: {
  userIds: string[];
  startsAt: string;
  endsAt?: string | null;
}) {
  const ids = [...new Set(input.userIds.filter(Boolean))];
  const result = new Set<string>();
  if (!ids.length) return result;

  const admin = adminClient();
  let query = admin
    .from('product_events')
    .select('user_id,metadata,created_at')
    .eq('event_name', 'watch_trust_assessed')
    .in('user_id', ids)
    .gte('created_at', input.startsAt)
    .order('created_at', { ascending: false })
    .limit(1_000);

  if (input.endsAt) {
    query = query.lt('created_at', input.endsAt);
  }

  const { data, error } = await query;
  if (error) throw error;

  for (const row of data ?? []) {
    const userId = typeof row.user_id === 'string' ? row.user_id : null;
    if (userId && metadataState(row.metadata) === 'high_risk') {
      result.add(userId);
    }
  }

  return result;
}
