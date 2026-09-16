'use client';

import { useCallback, useEffect, useMemo, useRef } from 'react';

type Props = {
  src: string;
  title?: string;
  episodeNumber?: number;
  onReady?: () => void;
};

function normalizePlayerUrl(url: string) {
  return url.startsWith('//') ? `https:${url}` : url;
}

function buildPlayerUrl(url: string) {
  const normalized = normalizePlayerUrl(url);

  try {
    const nextUrl = new URL(normalized);

    // Kodik iframe parameter: hide built-in season/episode/translation selectors.
    // AnimeBox renders its own controls around the iframe instead.
    nextUrl.searchParams.set('hide_selectors', '1');

    return nextUrl.toString();
  } catch {
    return normalized;
  }
}

export default function KodikPlayer({
  src,
  title = 'Kodik Player',
  episodeNumber,
  onReady,
}: Props) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const switchTimerRef = useRef<number | null>(null);
  const didInitialSyncRef = useRef(false);
  const correctionSentRef = useRef(false);

  const playerSrc = useMemo(() => buildPlayerUrl(src), [src]);

  const targetOrigin = useMemo(() => {
    try {
      return new URL(playerSrc).origin;
    } catch {
      return '*';
    }
  }, [playerSrc]);

  const sendCommand = useCallback(
    (value: Record<string, unknown>) => {
      iframeRef.current?.contentWindow?.postMessage(
        {
          key: 'kodik_player_api',
          value,
        },
        targetOrigin,
      );
    },
    [targetOrigin],
  );

  const changeEpisode = useCallback(() => {
    if (!episodeNumber || episodeNumber < 1) return;

    sendCommand({
      method: 'change_episode',
      episode: episodeNumber,
      without_reload: true,
    });
  }, [episodeNumber, sendCommand]);

  const handleLoad = useCallback(() => {
    onReady?.();

    if (didInitialSyncRef.current) return;
    didInitialSyncRef.current = true;

    if (switchTimerRef.current) {
      window.clearTimeout(switchTimerRef.current);
    }

    // Give Kodik's internal app a moment to initialize, then sync the
    // episode selected in the AnimeBox route.
    switchTimerRef.current = window.setTimeout(changeEpisode, 650);
  }, [changeEpisode, onReady]);

  useEffect(() => {
    didInitialSyncRef.current = false;
    correctionSentRef.current = false;
  }, [playerSrc, episodeNumber]);

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (
        iframeRef.current?.contentWindow &&
        event.source !== iframeRef.current.contentWindow
      ) {
        return;
      }

      if (!event.data || typeof event.data !== 'object') {
        return;
      }

      const { key, value } = event.data as {
        key?: string;
        value?: unknown;
      };

      if (key === 'kodik_player_current_episode') {
        const info = value as { episode?: number | null } | null;

        if (
          episodeNumber &&
          info?.episode &&
          info.episode !== episodeNumber &&
          !correctionSentRef.current
        ) {
          correctionSentRef.current = true;
          changeEpisode();
        }
      }
    }

    window.addEventListener('message', onMessage);

    return () => {
      window.removeEventListener('message', onMessage);

      if (switchTimerRef.current) {
        window.clearTimeout(switchTimerRef.current);
      }
    };
  }, [changeEpisode, episodeNumber]);

  return (
    <iframe
      ref={iframeRef}
      src={playerSrc}
      title={title}
      className="absolute inset-0 h-full w-full border-0 bg-black"
      allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
      allowFullScreen
      onLoad={handleLoad}
    />
  );
}
