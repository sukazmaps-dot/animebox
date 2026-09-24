'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { KodikProviderSkipSignal } from '@/components/KodikPlayer';
import { invalidateTrackerSnapshot } from '@/lib/tracker-client';
import { invalidateCommunityProfile } from '@/lib/community-profile-cache';
import { trackRecommendationWatchProgress } from '@/lib/product-events-client';

const HEARTBEAT_INTERVAL_MS = 20_000;
const ACTIVE_ADVANCE_WINDOW_MS = 15_000;
const MIN_ACTIVE_DELTA_MS = 100;
const MAX_SAMPLE_ADVANCE_MS = 30_000;
const PROVIDER_SKIP_SIGNAL_TTL_MS = 8_000;
const MIN_PROVIDER_SKIP_MS = 15_000;
const MAX_PROVIDER_SKIP_MS = 240_000;

type Sample = {
  positionSeconds: number;
  origin?: string | null;
  durationSeconds?: number | null;
};

type StartResponse = {
  sessionId: string;
  durationMs?: number | null;
  progress?: {
    coverageMs?: number;
    activeMs?: number;
    completedAt?: string | null;
    resumePositionMs?: number;
    excludedMs?: number;
    eligibleDurationMs?: number | null;
  };
};

type HeartbeatResponse = {
  completed?: boolean;
  newlyCompleted?: boolean;
  coverageMs?: number | null;
  activeMs?: number | null;
  durationMs?: number | null;
  excludedMs?: number | null;
  eligibleDurationMs?: number | null;
};

type Options = {
  enabled: boolean;
  userId?: string | null;
  animeId?: number;
  episode: number;
  requiredEpisodes?: number | null;
  sourceUrl: string;
};

export type WatchProgressEventDetail = {
  animeId: number;
  episode: number;
  coverageMs: number;
  activeMs: number;
  durationMs: number | null;
  eligibleDurationMs: number | null;
  excludedMs: number;
  percent: number | null;
  completed: boolean;
};

type PendingProviderSkip = {
  kind: 'opening' | 'ending';
  fromMs: number;
  toMs: number;
  origin: string | null;
};

type PendingSkipSignal = {
  kind: 'opening' | 'ending';
  fromMs: number;
  origin: string | null;
  createdAt: number;
};

type RecentLargeJump = {
  fromMs: number;
  toMs: number;
  origin: string | null;
  createdAt: number;
};

async function watchRequest<T>(
  body: Record<string, unknown>,
  keepalive = false,
): Promise<T> {
  const response = await fetch('/api/watch', {
    method: 'POST',
    cache: 'no-store',
    keepalive,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const data = (await response.json().catch(() => ({}))) as {
    error?: string;
  } & T;

  if (!response.ok) {
    const error = new Error(
      data.error || 'Не удалось сохранить прогресс просмотра.',
    ) as Error & { status?: number };

    error.status = response.status;
    throw error;
  }

  return data;
}

function toMs(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return null;
  return Math.min(28_800_000, Math.max(0, Math.round(seconds * 1000)));
}

function progressPercent(coverageMs: number, eligibleDurationMs: number | null) {
  if (!eligibleDurationMs || eligibleDurationMs <= 0) return null;
  return Math.min(
    100,
    Math.max(0, Math.round((coverageMs / eligibleDurationMs) * 100)),
  );
}

export function useWatchSession({
  enabled,
  userId,
  animeId,
  episode,
  requiredEpisodes,
  sourceUrl,
}: Options) {
  const [message, setMessage] = useState('');
  const [percent, setPercent] = useState<number | null>(null);
  const [completed, setCompleted] = useState(false);

  const sessionRef = useRef<string | null>(null);
  const seqRef = useRef(0);
  const latestPositionRef = useRef<number | null>(null);
  // First position observed before a watch session is created. Keeping this
  // anchor lets the server see an opening jump even when Kodik performs the
  // skip before the first session/heartbeat has been established.
  const sessionAnchorPositionRef = useRef<number | null>(null);
  const latestDurationRef = useRef<number | null>(null);
  const messageOriginRef = useRef<string | null>(null);
  const lastSentPositionRef = useRef<number | null>(null);
  // Timestamp of the latest *real forward playback advance*.
  // Repeated integer samples from Kodik (24 -> 24) must not mark playback idle.
  const lastAdvanceAtRef = useRef<number | null>(null);
  const pendingSkipSignalRef = useRef<PendingSkipSignal | null>(null);
  const pendingProviderSkipRef = useRef<PendingProviderSkip | null>(null);
  const recentLargeJumpRef = useRef<RecentLargeJump | null>(null);
  const startingRef = useRef<Promise<void> | null>(null);
  const sendingRef = useRef(false);
  const disabledRef = useRef(false);

  const publishProgress = useCallback(
    (input: {
      coverageMs?: number | null;
      activeMs?: number | null;
      durationMs?: number | null;
      eligibleDurationMs?: number | null;
      excludedMs?: number | null;
      completed?: boolean;
    }) => {
      if (!animeId) return;

      const coverageMs = Math.max(0, Number(input.coverageMs ?? 0));
      const activeMs = Math.max(0, Number(input.activeMs ?? 0));
      const durationMs =
        input.durationMs == null || Number(input.durationMs) <= 0
          ? latestDurationRef.current
          : Number(input.durationMs);
      const excludedMs = Math.max(0, Number(input.excludedMs ?? 0));
      const eligibleDurationMs =
        input.eligibleDurationMs == null || Number(input.eligibleDurationMs) <= 0
          ? durationMs == null
            ? null
            : Math.max(1, durationMs - excludedMs)
          : Number(input.eligibleDurationMs);
      const nextPercent = progressPercent(coverageMs, eligibleDurationMs);
      const isCompleted = Boolean(input.completed);

      setPercent(nextPercent);
      setCompleted(isCompleted);

      window.dispatchEvent(
        new CustomEvent<WatchProgressEventDetail>('watch-progress', {
          detail: {
            animeId,
            episode,
            coverageMs,
            activeMs,
            durationMs,
            eligibleDurationMs,
            excludedMs,
            percent: nextPercent,
            completed: isCompleted,
          },
        }),
      );

      trackRecommendationWatchProgress({
        animeId,
        episode,
        activeMs,
        completed: isCompleted,
      });
    },
    [animeId, episode],
  );

  const startSession = useCallback(async () => {
    if (
      !enabled ||
      !animeId ||
      disabledRef.current ||
      sessionRef.current ||
      startingRef.current ||
      latestPositionRef.current == null ||
      (pendingProviderSkipRef.current == null &&
        (lastAdvanceAtRef.current == null ||
          Date.now() - lastAdvanceAtRef.current > ACTIVE_ADVANCE_WINDOW_MS))
    ) {
      return;
    }

    const latestPosition = latestPositionRef.current;
    const anchorPosition = sessionAnchorPositionRef.current;
    const anchorDelta =
      anchorPosition == null ? null : latestPosition - anchorPosition;
    const startPosition =
      anchorPosition != null &&
      anchorDelta != null &&
      anchorDelta >= 0 &&
      anchorDelta <= MAX_PROVIDER_SKIP_MS
        ? anchorPosition
        : latestPosition;

    const task = (async () => {
      try {
        const result = await watchRequest<StartResponse>({
          action: 'start',
          animeId,
          episode,
          requiredEpisodes: requiredEpisodes ?? episode,
          sourceUrl,
          messageOrigin: messageOriginRef.current,
          positionMs: startPosition,
          durationMs: latestDurationRef.current,
        });

        sessionRef.current = result.sessionId;
        sessionAnchorPositionRef.current = null;
        seqRef.current = 0;
        lastSentPositionRef.current = latestPositionRef.current;
        setMessage('');

        if (result.durationMs && result.durationMs > 0) {
          latestDurationRef.current = result.durationMs;
        }

        if (result.progress) {
          publishProgress({
            coverageMs: result.progress.coverageMs,
            activeMs: result.progress.activeMs,
            durationMs: result.durationMs,
            eligibleDurationMs: result.progress.eligibleDurationMs,
            excludedMs: result.progress.excludedMs,
            completed: Boolean(result.progress.completedAt),
          });
        }
      } catch (error) {
        const status = (error as Error & { status?: number }).status;

        if (status === 401) {
          disabledRef.current = true;
          setMessage('');
          return;
        }

        setMessage((error as Error).message);
      }
    })().finally(() => {
      startingRef.current = null;
    });

    startingRef.current = task;
    await task;
  }, [
    animeId,
    enabled,
    episode,
    publishProgress,
    requiredEpisodes,
    sourceUrl,
  ]);

  const sendHeartbeat = useCallback(
    async (force = false, keepalive = false) => {
      if (
        sendingRef.current ||
        disabledRef.current ||
        !enabled ||
        !animeId
      ) {
        return;
      }

      if (!force) {
        if (document.visibilityState !== 'visible') {
          return;
        }

        const lastAdvanceAt = lastAdvanceAtRef.current;
        if (
          lastAdvanceAt == null ||
          Date.now() - lastAdvanceAt > ACTIVE_ADVANCE_WINDOW_MS
        ) {
          return;
        }
      }

      if (!sessionRef.current) {
        await startSession();
        if (!sessionRef.current) return;
      }

      const position = latestPositionRef.current;
      const pendingProviderSkip = pendingProviderSkipRef.current;
      if (
        position == null ||
        (position === lastSentPositionRef.current && pendingProviderSkip == null)
      ) {
        return;
      }

      sendingRef.current = true;
      const seq = seqRef.current + 1;

      try {
        const providerSkip = pendingProviderSkipRef.current;
        const result = await watchRequest<HeartbeatResponse>(
          {
            action: 'heartbeat',
            sessionId: sessionRef.current,
            seq,
            positionMs: position,
            durationMs: latestDurationRef.current,
            providerSkip,
          },
          keepalive,
        );

        seqRef.current = seq;
        lastSentPositionRef.current = position;
        if (providerSkip === pendingProviderSkipRef.current) {
          pendingProviderSkipRef.current = null;
    recentLargeJumpRef.current = null;
        }

        if (result.durationMs && result.durationMs > 0) {
          latestDurationRef.current = result.durationMs;
        }

        publishProgress({
          coverageMs: result.coverageMs,
          activeMs: result.activeMs,
          durationMs: result.durationMs,
          eligibleDurationMs: result.eligibleDurationMs,
          excludedMs: result.excludedMs,
          completed: result.completed,
        });

        if (userId) {
          invalidateTrackerSnapshot(userId);
          invalidateCommunityProfile(userId);
        }
        window.dispatchEvent(new Event('watch-state-updated'));

        if (result.newlyCompleted) {
          setMessage('Серия засчитана: подтверждено не менее 90% просмотра.');
          window.dispatchEvent(new Event('episode-completed'));
          window.dispatchEvent(new Event('library-updated'));
          window.dispatchEvent(new Event('animebox:progression-updated'));
        } else {
          setMessage('');
        }
      } catch (error) {
        const status = (error as Error & { status?: number }).status;

        if (status === 401) {
          disabledRef.current = true;
          setMessage('');
        } else if (status === 404 || status === 409 || status === 410) {
          sessionRef.current = null;
          sessionAnchorPositionRef.current = latestPositionRef.current;
          seqRef.current = 0;
          lastSentPositionRef.current = null;
        } else {
          setMessage((error as Error).message);
        }
      } finally {
        sendingRef.current = false;
      }
    },
    [animeId, enabled, publishProgress, startSession, userId],
  );

  const onSample = useCallback(
    ({ positionSeconds, origin, durationSeconds }: Sample) => {
      if (!enabled || disabledRef.current) return;

      const nextPosition = toMs(positionSeconds);
      if (nextPosition == null) return;

      const previousPosition = latestPositionRef.current;
      if (
        !sessionRef.current &&
        !startingRef.current &&
        sessionAnchorPositionRef.current == null
      ) {
        sessionAnchorPositionRef.current = nextPosition;
      }
      latestPositionRef.current = nextPosition;

      const nextDuration =
        durationSeconds == null ? null : toMs(durationSeconds);
      if (nextDuration != null && nextDuration >= 1_000) {
        latestDurationRef.current = nextDuration;
      }

      if (origin) messageOriginRef.current = origin;

      const pendingSignal = pendingSkipSignalRef.current;
      if (pendingSignal) {
        const signalAge = Date.now() - pendingSignal.createdAt;
        const jumpMs = nextPosition - pendingSignal.fromMs;

        if (signalAge > PROVIDER_SKIP_SIGNAL_TTL_MS) {
          pendingSkipSignalRef.current = null;
        } else if (
          jumpMs >= MIN_PROVIDER_SKIP_MS &&
          jumpMs <= MAX_PROVIDER_SKIP_MS
        ) {
          pendingProviderSkipRef.current = {
            kind: pendingSignal.kind,
            fromMs: pendingSignal.fromMs,
            toMs: nextPosition,
            origin: pendingSignal.origin ?? origin ?? null,
          };
          pendingSkipSignalRef.current = null;
          void sendHeartbeat(true);
        }
      }

      if (previousPosition != null) {
        const delta = nextPosition - previousPosition;

        if (
          delta > MAX_SAMPLE_ADVANCE_MS &&
          delta <= MAX_PROVIDER_SKIP_MS
        ) {
          recentLargeJumpRef.current = {
            fromMs: previousPosition,
            toMs: nextPosition,
            origin: origin ?? messageOriginRef.current,
            createdAt: Date.now(),
          };
        }

        /*
         * Kodik reports rounded seconds and may repeat the same value:
         * 23 -> 24 -> 24 -> 25. A repeated sample is not a pause.
         * We only refresh the playback-activity timestamp on a plausible
         * forward advance and otherwise leave the previous timestamp alone.
         */
        if (
          document.visibilityState === 'visible' &&
          delta >= MIN_ACTIVE_DELTA_MS &&
          delta <= MAX_SAMPLE_ADVANCE_MS
        ) {
          lastAdvanceAtRef.current = Date.now();
        }
      }

      if (
        lastAdvanceAtRef.current != null &&
        Date.now() - lastAdvanceAtRef.current <= ACTIVE_ADVANCE_WINDOW_MS &&
        !sessionRef.current &&
        !startingRef.current
      ) {
        void startSession();
      }
    },
    [enabled, sendHeartbeat, startSession],
  );

  const onProviderSkip = useCallback(
    (signal: KodikProviderSkipSignal) => {
      if (!enabled || disabledRef.current) return;

      const fromMs =
        signal.atSeconds == null
          ? latestPositionRef.current
          : toMs(signal.atSeconds);

      if (fromMs == null) return;

      if (signal.durationSeconds != null) {
        const durationMs = toMs(signal.durationSeconds);
        if (durationMs != null && durationMs >= 1_000) {
          latestDurationRef.current = durationMs;
        }
      }

      if (signal.origin) {
        messageOriginRef.current = signal.origin;
      }

      const recentJump = recentLargeJumpRef.current;
      if (
        recentJump &&
        Date.now() - recentJump.createdAt <= 2_500 &&
        recentJump.toMs - recentJump.fromMs >= MIN_PROVIDER_SKIP_MS
      ) {
        pendingProviderSkipRef.current = {
          kind: signal.kind,
          fromMs: recentJump.fromMs,
          toMs: recentJump.toMs,
          origin: signal.origin ?? recentJump.origin ?? messageOriginRef.current,
        };
        recentLargeJumpRef.current = null;
        pendingSkipSignalRef.current = null;
        void sendHeartbeat(true);
        return;
      }

      pendingSkipSignalRef.current = {
        kind: signal.kind,
        fromMs,
        origin: signal.origin ?? messageOriginRef.current,
        createdAt: Date.now(),
      };
    },
    [enabled, sendHeartbeat],
  );

  useEffect(() => {
    disabledRef.current = false;
    sessionRef.current = null;
    sessionAnchorPositionRef.current = null;
    seqRef.current = 0;
    latestPositionRef.current = null;
    latestDurationRef.current = null;
    messageOriginRef.current = null;
    lastSentPositionRef.current = null;
    lastAdvanceAtRef.current = null;
    pendingSkipSignalRef.current = null;
    pendingProviderSkipRef.current = null;
    recentLargeJumpRef.current = null;

    queueMicrotask(() => {
      setMessage('');
      setPercent(null);
      setCompleted(false);
    });

    if (!enabled || !animeId) return;

    const timer = window.setInterval(() => {
      void sendHeartbeat();
    }, HEARTBEAT_INTERVAL_MS);

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        void sendHeartbeat(true, true);
      }
    };

    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);

      const sessionId = sessionRef.current;
      if (sessionId) {
        void watchRequest(
          {
            action: 'end',
            sessionId,
            positionMs: latestPositionRef.current,
          },
          true,
        )
          .then(() => {
            if (userId) {
              invalidateTrackerSnapshot(userId);
              invalidateCommunityProfile(userId);
            }
            window.dispatchEvent(new Event('watch-state-updated'));
            window.dispatchEvent(new Event('animebox:progression-updated'));
          })
          .catch(() => undefined);
      }

      sessionRef.current = null;
      sessionAnchorPositionRef.current = null;
      startingRef.current = null;
      sendingRef.current = false;
    };
  }, [animeId, enabled, episode, sendHeartbeat, sourceUrl, userId]);

  const flushProgress = useCallback(async () => {
    await sendHeartbeat(true, true);

    if (userId) {
      invalidateTrackerSnapshot(userId);
      invalidateCommunityProfile(userId);
    }

    window.dispatchEvent(new Event('watch-state-updated'));
  }, [sendHeartbeat, userId]);

  return {
    onSample,
    onProviderSkip,
    flushProgress,
    message,
    progressPercent: percent,
    completed,
  };
}
