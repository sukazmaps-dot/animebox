'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

type Sample = {
  positionSeconds: number;
  origin?: string | null;
  durationSeconds?: number | null;
};

type StartResponse = {
  sessionId: string;
};

type HeartbeatResponse = {
  completed?: boolean;
  newlyCompleted?: boolean;
};

type Options = {
  enabled: boolean;
  animeId?: number;
  episode: number;
  requiredEpisodes?: number | null;
  sourceUrl: string;
};

async function watchRequest<T>(body: Record<string, unknown>, keepalive = false): Promise<T> {
  const response = await fetch('/api/watch', {
    method: 'POST',
    cache: 'no-store',
    keepalive,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const data = (await response.json().catch(() => ({}))) as { error?: string } & T;
  if (!response.ok) {
    const error = new Error(data.error || 'Не удалось сохранить прогресс просмотра.') as Error & {
      status?: number;
    };
    error.status = response.status;
    throw error;
  }

  return data;
}

function toMs(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return null;
  return Math.min(28_800_000, Math.max(0, Math.round(seconds * 1000)));
}

export function useWatchSession({
  enabled,
  animeId,
  episode,
  requiredEpisodes,
  sourceUrl,
}: Options) {
  const [message, setMessage] = useState('');
  const sessionRef = useRef<string | null>(null);
  const seqRef = useRef(0);
  const latestPositionRef = useRef<number | null>(null);
  const latestDurationRef = useRef<number | null>(null);
  const messageOriginRef = useRef<string | null>(null);
  const lastSentPositionRef = useRef<number | null>(null);
  const startingRef = useRef<Promise<void> | null>(null);
  const sendingRef = useRef(false);
  const disabledRef = useRef(false);

  const startSession = useCallback(async () => {
    if (
      !enabled ||
      !animeId ||
      disabledRef.current ||
      sessionRef.current ||
      startingRef.current ||
      latestPositionRef.current == null
    ) {
      return;
    }

    const task = (async () => {
      try {
        const result = await watchRequest<StartResponse>({
          action: 'start',
          animeId,
          episode,
          requiredEpisodes: requiredEpisodes || episode,
          sourceUrl,
          messageOrigin: messageOriginRef.current,
          positionMs: latestPositionRef.current,
          durationMs: latestDurationRef.current,
        });

        sessionRef.current = result.sessionId;
        seqRef.current = 0;
        lastSentPositionRef.current = latestPositionRef.current;
        setMessage('');
      } catch (error) {
        const status = (error as Error & { status?: number }).status;
        // Logged-out viewers may watch normally; telemetry simply stays off.
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
  }, [animeId, enabled, episode, requiredEpisodes, sourceUrl]);

  const sendHeartbeat = useCallback(async () => {
    if (sendingRef.current || disabledRef.current || !enabled || !animeId) return;

    if (!sessionRef.current) {
      await startSession();
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
  }, [animeId, enabled, startSession]);

  const onSample = useCallback(
    ({ positionSeconds, origin, durationSeconds }: Sample) => {
      if (!enabled || disabledRef.current) return;

      const nextPosition = toMs(positionSeconds);
      if (nextPosition == null) return;

      latestPositionRef.current = nextPosition;

      const nextDuration = durationSeconds == null ? null : toMs(durationSeconds);
      if (nextDuration && nextDuration >= 1_000) latestDurationRef.current = nextDuration;
      if (origin) messageOriginRef.current = origin;

      if (!sessionRef.current && !startingRef.current) {
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

    if (!enabled || !animeId) return;

    const timer = window.setInterval(() => {
      void sendHeartbeat();
    }, 5_000);

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') void sendHeartbeat();
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
    };
  }, [animeId, enabled, episode, sendHeartbeat, sourceUrl]);

  return { onSample, message };
}
