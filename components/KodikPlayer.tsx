'use client';

import { useCallback, useEffect, useMemo, useRef } from 'react';

type KodikTimeSample = {
  positionSeconds: number;
  durationSeconds?: number | null;
  origin?: string | null;
};

type Props = {
  src: string;
  title?: string;
  episodeNumber?: number;
  resumeSeconds?: number;
  onReady?: () => void;
  onTimeUpdate?: (sample: KodikTimeSample) => void;
};

type KodikMessage = {
  key?: string;
  value?: unknown;
};

function normalizePlayerUrl(url: string) {
  return url.startsWith('//') ? `https:${url}` : url;
}

function buildPlayerUrl(url: string, episodeNumber?: number) {
  const normalized = normalizePlayerUrl(url);

  try {
    const nextUrl = new URL(normalized);

    /*
     * AnimeBox owns the episode / translation UI.
     * Kodik expects boolean iframe options as literal "true" / "false".
     */
    nextUrl.searchParams.set('hide_selectors', 'true');
    nextUrl.searchParams.set('translations', 'false');

    /*
     * Open the exact route episode immediately. This prevents a visible
     * "episode 1 -> requested episode" correction after iframe load.
     */
    if (
      typeof episodeNumber === 'number' &&
      Number.isSafeInteger(episodeNumber) &&
      episodeNumber > 0
    ) {
      nextUrl.searchParams.set('episode', String(episodeNumber));
      nextUrl.searchParams.set('only_episode', 'true');
    }

    return nextUrl.toString();
  } catch {
    return normalized;
  }
}

function parseMessage(data: unknown): KodikMessage | null {
  let value = data;

  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  return value as KodikMessage;
}

function finiteNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;

  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }

  return null;
}

function readTimeValue(value: unknown) {
  const direct = finiteNumber(value);
  if (direct != null) return { position: direct, duration: null };

  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;

  const record = value as Record<string, unknown>;
  const position =
    finiteNumber(record.currentTime) ??
    finiteNumber(record.current_time) ??
    finiteNumber(record.time) ??
    finiteNumber(record.position);

  if (position == null) return null;

  const duration =
    finiteNumber(record.duration) ??
    finiteNumber(record.totalTime) ??
    finiteNumber(record.total_time);

  return { position, duration };
}

function readEpisodeNumber(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;

  const record = value as Record<string, unknown>;
  const episode = finiteNumber(record.episode);

  if (episode == null || !Number.isSafeInteger(episode) || episode < 1) {
    return null;
  }

  return episode;
}

export default function KodikPlayer({
  src,
  title = 'Kodik Player',
  episodeNumber,
  resumeSeconds = 0,
  onReady,
  onTimeUpdate,
}: Props) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const durationRef = useRef<number | null>(null);
  const lastForcedEpisodeRef = useRef<number | null>(null);
  const resumeAppliedRef = useRef(false);

  const playerSrc = useMemo(
    () => buildPlayerUrl(src, episodeNumber),
    [src, episodeNumber],
  );

  const expectedOrigin = useMemo(() => {
    try {
      return new URL(playerSrc).origin;
    } catch {
      return null;
    }
  }, [playerSrc]);

  const handleLoad = useCallback(() => {
    onReady?.();
  }, [onReady]);

  useEffect(() => {
    durationRef.current = null;
    lastForcedEpisodeRef.current = null;
    resumeAppliedRef.current = false;
  }, [playerSrc, resumeSeconds]);

  useEffect(() => {
    function forceRouteEpisode() {
      if (
        !iframeRef.current?.contentWindow ||
        typeof episodeNumber !== 'number' ||
        !Number.isSafeInteger(episodeNumber) ||
        episodeNumber < 1
      ) {
        return;
      }

      if (lastForcedEpisodeRef.current === episodeNumber) return;
      lastForcedEpisodeRef.current = episodeNumber;

      iframeRef.current.contentWindow.postMessage(
        {
          key: 'kodik_player_api',
          value: {
            method: 'change_episode',
            episode: episodeNumber,
            without_reload: true,
          },
        },
        expectedOrigin || '*',
      );
    }

    function onMessage(event: MessageEvent) {
      const frameWindow = iframeRef.current?.contentWindow;
      if (!frameWindow || event.source !== frameWindow) return;

      /*
       * The iframe is cross-origin, so event.source is our first boundary.
       * When the iframe URL has a normal http(s) origin, verify it too.
       */
      if (
        expectedOrigin &&
        event.origin &&
        event.origin !== 'null' &&
        event.origin !== expectedOrigin
      ) {
        return;
      }

      const message = parseMessage(event.data);
      if (!message) return;

      const { key, value } = message;

      if (key === 'kodik_player_time_update' || key === 'kodik_player_time') {
        const time = readTimeValue(value);
        if (!time || time.position < 0) return;

        if (time.duration != null && time.duration > 0) {
          durationRef.current = time.duration;
        }

        if (
          !resumeAppliedRef.current &&
          resumeSeconds >= 10 &&
          iframeRef.current?.contentWindow
        ) {
          if (time.position < resumeSeconds - 5) {
            iframeRef.current.contentWindow.postMessage(
              {
                key: 'kodik_player_api',
                value: {
                  method: 'seek',
                  seconds: resumeSeconds,
                },
              },
              expectedOrigin || '*',
            );
          }

          resumeAppliedRef.current = true;
        }

        onTimeUpdate?.({
          positionSeconds: time.position,
          durationSeconds: time.duration ?? durationRef.current,
          origin: event.origin || null,
        });
        return;
      }

      if (
        key === 'kodik_player_duration_update' ||
        key === 'kodik_player_duration'
      ) {
        const duration = finiteNumber(value);
        if (duration != null && duration > 0) {
          durationRef.current = duration;
        }
        return;
      }

      /*
       * Defensive sync. The URL already contains the requested episode.
       * If a Kodik build still reports another episode, force the route
       * episode through the official postMessage API once.
       */
      if (key === 'kodik_player_current_episode') {
        const currentEpisode = readEpisodeNumber(value);

        if (
          currentEpisode != null &&
          typeof episodeNumber === 'number' &&
          currentEpisode !== episodeNumber
        ) {
          forceRouteEpisode();
        }
      }
    }

    window.addEventListener('message', onMessage);

    return () => {
      window.removeEventListener('message', onMessage);
    };
  }, [episodeNumber, expectedOrigin, onTimeUpdate, resumeSeconds]);

  return (
    <>
      <iframe
        ref={iframeRef}
        src={playerSrc}
        title={title}
        className="absolute inset-0 h-full w-full border-0 bg-black"
        allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
        allowFullScreen
        onLoad={handleLoad}
      />

      {/*
       * Kodik renders its "Получить код" control inside a cross-origin iframe.
       * There is no documented iframe option for hiding that specific control,
       * so AnimeBox masks only its small top-right area without touching the
       * playback controls at the bottom.
       */}
      <div
        aria-hidden="true"
        className="pointer-events-auto absolute right-0 top-0 z-10 h-11 w-[138px] bg-gradient-to-l from-black/95 via-black/75 to-transparent sm:h-10 sm:w-[150px]"
      />
    </>
  );
}
