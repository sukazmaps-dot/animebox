'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

const HEARTBEAT_INTERVAL_MS = 10_000;
const ACTIVE_SAMPLE_WINDOW_MS = 4_000;
const MIN_ACTIVE_DELTA_MS = 100;
const MAX_SAMPLE_ADVANCE_MS = 30_000;

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
  };
};

type HeartbeatResponse = {
  completed?: boolean;
  newlyCompleted?: boolean;
  coverageMs?: number | null;
  activeMs?: number | null;
  durationMs?: number | null;
};

type Options = {
  enabled: boolean;
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
  percent: number | null;
  completed: boolean;
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

function progressPercent(coverageMs: number, durationMs: number | null) {
  if (!durationMs || durationMs <= 0) return null;
  return Math.min(100, Math.max(0, Math.round((coverageMs / durationMs) * 100)));
}

export function useWatchSession({
  enabled,
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
  const latestDurationRef = useRef<number | null>(null);
  const messageOriginRef = useRef<string | null>(null);
  const lastSentPositionRef = useRef<number | null>(null);
  const lastSampleAtRef = useRef<number | null>(null);
  const activeRef = useRef(false);
  const startingRef = useRef<Promise<void> | null>(null);
  const sendingRef = useRef(false);
  const disabledRef = useRef(false);

  const publishProgress = useCallback(
    (input: {
      coverageMs?: number | null;
      activeMs?: number | null;
      durationMs?: number | null;
      completed?: boolean;
    }) => {
      if (!animeId) return;

      const coverageMs = Math.max(0, Number(input.coverageMs ?? 0));
      const activeMs = Math.max(0, Number(input.activeMs ?? 0));
      const durationMs =
        input.durationMs == null || Number(input.durationMs) <= 0
          ? latestDurationRef.current
          : Number(input.durationMs);
      const nextPercent = progressPercent(coverageMs, durationMs);
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
            percent: nextPercent,
            completed: isCompleted,
          },
        }),
      );
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
      !activeRef.current
    ) {
      return;
    }

    const task = (async () => {
      try {
        const result = await watchRequest<StartResponse>({
          action: 'start',
          animeId,
          episode,
          requiredEpisodes: requiredEpisodes ?? episode,
          sourceUrl,
          messageOrigin: messageOriginRef.current,
          positionMs: latestPositionRef.current,
          durationMs: latestDurationRef.current,
        });

        sessionRef.current = result.sessionId;
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
    async (force = false) => {
      if (
        sendingRef.current ||
        disabledRef.current ||
        !enabled ||
        !animeId
      ) {
        return;
      }

      if (!force) {
        if (document.visibilityState !== 'visible' || !activeRef.current) {
          return;
        }

        const lastSampleAt = lastSampleAtRef.current;
        if (
          lastSampleAt == null ||
          Date.now() - lastSampleAt > ACTIVE_SAMPLE_WINDOW_MS
        ) {
          activeRef.current = false;
          return;
        }
      }

      if (!sessionRef.current) {
        if (!force) await startSession();
        return;
      }

      const position = latestPositionRef.current;
      if (position == null || position === lastSentPositionRef.current) return;

      sendingRef.current = true;
      const seq = seqRef.current + 1;

      try {
        const result = await watchRequest<HeartbeatResponse>({
          action: 'heartbeat',
          sessionId: sessionRef.current,
          seq,
          positionMs: position,
          durationMs: latestDurationRef.current,
        });

        seqRef.current = seq;
        lastSentPositionRef.current = position;

        if (result.durationMs && result.durationMs > 0) {
          latestDurationRef.current = result.durationMs;
        }

        publishProgress({
          coverageMs: result.coverageMs,
          activeMs: result.activeMs,
          durationMs: result.durationMs,
          completed: result.completed,
        });

        if (result.newlyCompleted) {
          setMessage('Серия засчитана: подтверждено не менее 90% просмотра.');
          window.dispatchEvent(new Event('episode-completed'));
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
          seqRef.current = 0;
          lastSentPositionRef.current = null;
        } else {
          setMessage((error as Error).message);
        }
      } finally {
        sendingRef.current = false;
      }
    },
    [animeId, enabled, publishProgress, startSession],
  );

  const onSample = useCallback(
    ({ positionSeconds, origin, durationSeconds }: Sample) => {
      if (!enabled || disabledRef.current) return;

      const nextPosition = toMs(positionSeconds);
      if (nextPosition == null) return;

      const previousPosition = latestPositionRef.current;
      latestPositionRef.current = nextPosition;

      const nextDuration =
        durationSeconds == null ? null : toMs(durationSeconds);
      if (nextDuration != null && nextDuration >= 1_000) {
        latestDurationRef.current = nextDuration;
      }

      if (origin) messageOriginRef.current = origin;

      if (previousPosition != null) {
        const delta = nextPosition - previousPosition;

        activeRef.current =
          document.visibilityState === 'visible' &&
          delta >= MIN_ACTIVE_DELTA_MS &&
          delta <= MAX_SAMPLE_ADVANCE_MS;
      } else {
        activeRef.current = false;
      }

      lastSampleAtRef.current = Date.now();

      if (
        activeRef.current &&
        !sessionRef.current &&
        !startingRef.current
      ) {
        void startSession();
      }
    },
    [enabled, startSession],
  );

  useEffect(() => {
    disabledRef.current = false;
    sessionRef.current = null;
    seqRef.current = 0;
    latestPositionRef.current = null;
    latestDurationRef.current = null;
    messageOriginRef.current = null;
    lastSentPositionRef.current = null;
    lastSampleAtRef.current = null;
    activeRef.current = false;

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
        void sendHeartbeat(true);
        activeRef.current = false;
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
        ).catch(() => undefined);
      }

      sessionRef.current = null;
      startingRef.current = null;
      sendingRef.current = false;
      activeRef.current = false;
    };
  }, [animeId, enabled, episode, sendHeartbeat, sourceUrl]);

  return {
    onSample,
    message,
    progressPercent: percent,
    completed,
  };
}
