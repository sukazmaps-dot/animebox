'use client';

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef } from 'react';

type KodikTimeSample = {
  positionSeconds: number;
  durationSeconds?: number | null;
  origin?: string | null;
};

export type KodikProviderSkipSignal = {
  kind: 'opening' | 'ending';
  atSeconds: number | null;
  durationSeconds: number | null;
  origin?: string | null;
};

export type KodikPlayerHandle = {
  play: () => void;
  pause: () => void;
  seek: (seconds: number) => void;
  getState: () => {
    positionSeconds: number;
    durationSeconds: number | null;
    playing: boolean;
  };
};

export type KodikPlaybackActionEvent = {
  action: 'play' | 'pause' | 'seek';
  positionSeconds: number;
};

export type KodikPlaybackStateEvent = {
  positionSeconds: number;
  durationSeconds: number | null;
  playing: boolean;
};

type Props = {
  src: string;
  title?: string;
  episodeNumber?: number;
  resumeSeconds?: number;
  onReady?: () => void;
  onTimeUpdate?: (sample: KodikTimeSample) => void;
  onPlaybackAction?: (event: KodikPlaybackActionEvent) => void;
  onPlaybackState?: (event: KodikPlaybackStateEvent) => void;
  onProviderSkip?: (signal: KodikProviderSkipSignal) => void;
  onEnded?: () => void;
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


function skipText(value: unknown) {
  if (typeof value === 'string') return value.toLowerCase();
  if (!value || typeof value !== 'object' || Array.isArray(value)) return '';

  const record = value as Record<string, unknown>;
  return [
    record.type,
    record.kind,
    record.name,
    record.title,
    record.label,
    record.text,
    record.button,
  ]
    .filter((item): item is string => typeof item === 'string')
    .join(' ')
    .toLowerCase();
}

function readSkipKind(
  value: unknown,
  positionSeconds: number | null,
  durationSeconds: number | null,
): 'opening' | 'ending' | null {
  const text = skipText(value);

  if (/опен|opening|intro|\bop\b/i.test(text)) return 'opening';
  if (/эндинг|концов|ending|outro|\bed\b/i.test(text)) return 'ending';

  // Some Kodik builds send the skip event without a useful label.
  // Infer only from a safe part of the timeline; ambiguous middle-of-episode
  // events are ignored rather than treated as trusted skips.
  if (
    positionSeconds != null &&
    durationSeconds != null &&
    durationSeconds > 0
  ) {
    if (positionSeconds <= Math.min(600, durationSeconds * 0.25)) {
      return 'opening';
    }

    if (positionSeconds >= durationSeconds * 0.65) {
      return 'ending';
    }
  }

  return null;
}

const KodikPlayer = forwardRef<KodikPlayerHandle, Props>(function KodikPlayer({
  src,
  title = 'Kodik Player',
  episodeNumber,
  resumeSeconds = 0,
  onReady,
  onTimeUpdate,
  onPlaybackAction,
  onPlaybackState,
  onProviderSkip,
  onEnded,
}, ref) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const durationRef = useRef<number | null>(null);
  const currentPositionRef = useRef<number | null>(null);
  const lastForcedEpisodeRef = useRef<number | null>(null);
  const resumeAppliedRef = useRef(false);
  const endedFiredRef = useRef(false);
  const pendingPlayRef = useRef(false);
  const playingRef = useRef(false);
  const lastSampleAtRef = useRef<number | null>(null);
  const lastAdvanceAtRef = useRef<number | null>(null);
  const pauseInferenceTimerRef = useRef<number | null>(null);

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

  const postApiCommand = useCallback((method: string, value: Record<string, unknown> = {}) => {
    const frameWindow = iframeRef.current?.contentWindow;
    if (!frameWindow) return;

    frameWindow.postMessage(
      {
        key: 'kodik_player_api',
        value: {
          method,
          ...value,
        },
      },
      expectedOrigin || '*',
    );
  }, [expectedOrigin]);

  useImperativeHandle(
    ref,
    () => ({
      play() {
        pendingPlayRef.current = true;
        playingRef.current = true;
        postApiCommand('play');
      },
      pause() {
        pendingPlayRef.current = false;
        playingRef.current = false;
        postApiCommand('pause');
      },
      seek(seconds) {
        if (!Number.isFinite(seconds) || seconds < 0) return;
        const normalized = Math.min(28_800, Math.max(0, seconds));
        currentPositionRef.current = normalized;
        postApiCommand('seek', { seconds: normalized });
      },
      getState() {
        return {
          positionSeconds: currentPositionRef.current ?? 0,
          durationSeconds: durationRef.current,
          playing: playingRef.current,
        };
      },
    }),
    [postApiCommand],
  );

  const handleLoad = useCallback(() => {
    onReady?.();

    if (pendingPlayRef.current) {
      postApiCommand('play');
    }
  }, [onReady, postApiCommand]);

  useEffect(() => {
    durationRef.current = null;
    currentPositionRef.current = null;
    lastForcedEpisodeRef.current = null;
    resumeAppliedRef.current = false;
    endedFiredRef.current = false;
    pendingPlayRef.current = false;
    playingRef.current = false;
    lastSampleAtRef.current = null;
    lastAdvanceAtRef.current = null;
    if (pauseInferenceTimerRef.current != null) {
      window.clearTimeout(pauseInferenceTimerRef.current);
      pauseInferenceTimerRef.current = null;
    }
  }, [playerSrc, resumeSeconds]);

  useEffect(() => {
    function fireEndedOnce() {
      if (endedFiredRef.current) return;
      endedFiredRef.current = true;
      onEnded?.();
    }

    function emitPlaybackState() {
      onPlaybackState?.({
        positionSeconds: currentPositionRef.current ?? 0,
        durationSeconds: durationRef.current,
        playing: playingRef.current,
      });
    }

    function emitPlaybackAction(action: KodikPlaybackActionEvent['action'], position?: number) {
      const nextPosition =
        typeof position === 'number' && Number.isFinite(position)
          ? Math.max(0, position)
          : currentPositionRef.current ?? 0;

      onPlaybackAction?.({ action, positionSeconds: nextPosition });
    }

    function markPlaying() {
      lastAdvanceAtRef.current = Date.now();
      if (!playingRef.current) {
        playingRef.current = true;
        emitPlaybackAction('play');
      }
      emitPlaybackState();

      if (pauseInferenceTimerRef.current != null) {
        window.clearTimeout(pauseInferenceTimerRef.current);
      }

      pauseInferenceTimerRef.current = window.setTimeout(() => {
        if (Date.now() - (lastAdvanceAtRef.current ?? 0) < 1_700) return;
        if (!playingRef.current) return;
        playingRef.current = false;
        emitPlaybackAction('pause');
        emitPlaybackState();
      }, 1_850);
    }

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

        const previousPosition = currentPositionRef.current;
        const previousSampleAt = lastSampleAtRef.current;
        const now = Date.now();
        currentPositionRef.current = time.position;
        lastSampleAtRef.current = now;

        if (time.duration != null && time.duration > 0) {
          durationRef.current = time.duration;
        }

        if (previousPosition != null && previousSampleAt != null) {
          const delta = time.position - previousPosition;
          const wallSeconds = Math.max(0.05, (now - previousSampleAt) / 1000);

          if (Math.abs(delta) > Math.max(3, wallSeconds * 2.5 + 1.25)) {
            emitPlaybackAction('seek', time.position);
          } else if (delta > 0.04) {
            markPlaying();
          }
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

        const knownDuration = time.duration ?? durationRef.current;

        onTimeUpdate?.({
          positionSeconds: time.position,
          durationSeconds: knownDuration,
          origin: event.origin || null,
        });

        emitPlaybackState();

        if (
          knownDuration != null &&
          knownDuration > 0 &&
          time.position >= Math.max(0, knownDuration - 0.6)
        ) {
          fireEndedOnce();
        }

        return;
      }

      if (key === 'kodik_player_play' || key === 'kodik_player_playing' || key === 'kodik_player_resume') {
        playingRef.current = true;
        lastAdvanceAtRef.current = Date.now();
        emitPlaybackAction('play');
        emitPlaybackState();
        return;
      }

      if (key === 'kodik_player_pause' || key === 'kodik_player_paused') {
        playingRef.current = false;
        emitPlaybackAction('pause');
        emitPlaybackState();
        return;
      }

      if (key === 'kodik_player_seek' || key === 'kodik_player_seeked') {
        const seek = readTimeValue(value);
        if (seek && seek.position >= 0) {
          currentPositionRef.current = seek.position;
          emitPlaybackAction('seek', seek.position);
          emitPlaybackState();
        }
        return;
      }

      if (
        key === 'kodik_player_ended' ||
        key === 'kodik_player_end' ||
        key === 'kodik_player_video_ended'
      ) {
        playingRef.current = false;
        emitPlaybackState();
        fireEndedOnce();
        return;
      }

      if (
        key === 'kodik_player_skip_button' ||
        key === 'kodik_player_skip' ||
        key === 'kodik_player_skip_opening' ||
        key === 'kodik_player_skip_ending'
      ) {
        const kind =
          key === 'kodik_player_skip_opening'
            ? 'opening'
            : key === 'kodik_player_skip_ending'
              ? 'ending'
              : readSkipKind(
                  value,
                  currentPositionRef.current,
                  durationRef.current,
                );

        if (kind) {
          onProviderSkip?.({
            kind,
            atSeconds: currentPositionRef.current,
            durationSeconds: durationRef.current,
            origin: event.origin || null,
          });
        }
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
      if (pauseInferenceTimerRef.current != null) {
        window.clearTimeout(pauseInferenceTimerRef.current);
        pauseInferenceTimerRef.current = null;
      }
    };
  }, [
    episodeNumber,
    expectedOrigin,
    onEnded,
    onPlaybackAction,
    onPlaybackState,
    onProviderSkip,
    onTimeUpdate,
    resumeSeconds,
  ]);

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

    </>
  );
});

KodikPlayer.displayName = 'KodikPlayer';

export default KodikPlayer;
