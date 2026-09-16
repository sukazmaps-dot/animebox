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
     * AnimeBox owns the episode / voice UI.
     * Kodik expects boolean iframe options as the literal strings
     * "true" / "false". The previous value "1" was ignored,
     * which is why Kodik's own selectors were still visible.
     */
    nextUrl.searchParams.set('hide_selectors', 'true');
    nextUrl.searchParams.set('translations', 'false');

    /*
     * Open Kodik already scoped to the AnimeBox route episode.
     * This removes the provider-side next/episode navigation and also
     * avoids loading episode 1 first and correcting it afterwards.
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

export default function KodikPlayer({
  src,
  title = 'Kodik Player',
  episodeNumber,
  onReady,
  onTimeUpdate,
}: Props) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const durationRef = useRef<number | null>(null);

  const playerSrc = useMemo(
    () => buildPlayerUrl(src, episodeNumber),
    [src, episodeNumber],
  );

  const handleLoad = useCallback(() => {
    onReady?.();
  }, [onReady]);

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (
        iframeRef.current?.contentWindow &&
        event.source !== iframeRef.current.contentWindow
      ) {
        return;
      }

      const message = parseMessage(event.data);
      if (!message) return;

      const { key, value } = message;

      // Kodik sends this event as postMessage while the video is playing.
      // Some builds serialize the whole message as JSON, so parseMessage
      // deliberately supports both object and string payloads.
      if (key === 'kodik_player_time_update') {
        const time = readTimeValue(value);
        if (!time || time.position < 0) return;

        if (time.duration != null && time.duration > 0) {
          durationRef.current = time.duration;
        }

        onTimeUpdate?.({
          positionSeconds: time.position,
          durationSeconds: time.duration ?? durationRef.current,
          origin: event.origin || null,
        });
        return;
      }

      // Kept as a best-effort compatibility path for Kodik builds that
      // publish duration separately from time updates.
      if (key === 'kodik_player_duration_update' || key === 'kodik_player_duration') {
        const duration = finiteNumber(value);
        if (duration != null && duration > 0) durationRef.current = duration;
      }
    }

    window.addEventListener('message', onMessage);

    return () => {
      window.removeEventListener('message', onMessage);
    };
  }, [onTimeUpdate]);

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
