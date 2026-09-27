'use client';

import type Hls from 'hls.js';
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import Icon from '@/components/Icon';
import {
  HLS_MEDIA_RECOVERY_LIMIT,
  HLS_NETWORK_RECOVERY_LIMIT,
  PLAYBACK_RECOVERY_WINDOW_MS,
  canAttemptRecovery,
  createPlaybackEngineState,
  reducePlaybackEngineState,
  type PlaybackEngineEvent,
  type PlaybackEngineState,
} from '@/lib/playback-core';

export type DirectVideoTimeSample = {
  positionSeconds: number;
  durationSeconds: number | null;
};

export type DirectPlayerTimelineMarker = {
  startSeconds: number;
  endSeconds: number;
  kind: 'opening' | 'ending';
};

export type DirectPlayerControlAction =
  | 'play'
  | 'pause'
  | 'seek'
  | 'volume'
  | 'mute'
  | 'unmute'
  | 'speed'
  | 'pip'
  | 'fullscreen'
  | 'quality';

type DirectVideoPlayerProps = {
  src: string;
  isHls: boolean;
  poster?: string;
  title: string;
  autoPlay?: boolean;
  initialVolume?: number;
  initialMuted?: boolean;
  initialPlaybackRate?: number;
  timelineMarkers?: DirectPlayerTimelineMarker[];
  fullscreenActive?: boolean;
  onToggleFullscreen?: () => void | Promise<void>;
  onReady?: () => void;
  onError?: (message: string) => void;
  onLoadedMetadata?: (width: number, height: number) => void;
  onTimeUpdate?: (sample: DirectVideoTimeSample) => void;
  onPlay?: (positionSeconds: number) => void;
  onPause?: (positionSeconds: number) => void;
  onSeeked?: (positionSeconds: number, playing: boolean) => void;
  onEnded?: () => void;
  onWaiting?: () => void;
  onPlaying?: () => void;
  onVolumeChange?: (volume: number, muted: boolean) => void;
  onRateChange?: (rate: number) => void;
  onControlAction?: (
    action: DirectPlayerControlAction,
    metadata?: Record<string, unknown>,
  ) => void;
  onEngineStateChange?: (state: PlaybackEngineState) => void;
};

type QualityOption = {
  id: number;
  label: string;
  bitrate: number | null;
};

const CONTROL_HIDE_DELAY_MS = 2600;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function formatTime(value: number) {
  if (!Number.isFinite(value) || value < 0) return '0:00';
  const total = Math.floor(value);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(target.closest('input, textarea, select, [contenteditable="true"]'));
}

const DirectVideoPlayer = forwardRef<HTMLVideoElement, DirectVideoPlayerProps>(function DirectVideoPlayer(
  {
    src,
    isHls,
    poster,
    title,
    autoPlay = true,
    initialVolume = 1,
    initialMuted = false,
    initialPlaybackRate = 1,
    timelineMarkers = [],
    fullscreenActive = false,
    onToggleFullscreen,
    onReady,
    onError,
    onLoadedMetadata,
    onTimeUpdate,
    onPlay,
    onPause,
    onSeeked,
    onEnded,
    onWaiting,
    onPlaying,
    onVolumeChange,
    onRateChange,
    onControlAction,
    onEngineStateChange,
  },
  forwardedRef,
) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const controlsTimerRef = useRef<number | null>(null);
  const touchTapTimerRef = useRef<number | null>(null);
  const lastTouchTapRef = useRef<{ at: number; zone: 'left' | 'center' | 'right' } | null>(null);
  const lastPointerTypeRef = useRef<string>('mouse');
  const timelineInteractingRef = useRef(false);
  const onReadyRef = useRef(onReady);
  const onErrorRef = useRef(onError);
  const onEngineStateChangeRef = useRef(onEngineStateChange);
  const engineStateRef = useRef(
    createPlaybackEngineState(isHls ? 'hls' : 'native'),
  );
  const networkRecoveryRef = useRef({ attempts: 0, firstAttemptAt: null as number | null });
  const mediaRecoveryRef = useRef({ attempts: 0, firstAttemptAt: null as number | null });
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [qualities, setQualities] = useState<QualityOption[]>([]);
  const [qualityLevel, setQualityLevel] = useState(-1);
  const [pipActive, setPipActive] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [enginePhase, setEnginePhase] = useState<PlaybackEngineState['phase']>('idle');
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [hoverPercent, setHoverPercent] = useState(0);
  const [timelineInteracting, setTimelineInteracting] = useState(false);
  const [scrubTime, setScrubTime] = useState<number | null>(null);
  const [tapFeedback, setTapFeedback] = useState<'back' | 'forward' | null>(null);

  useImperativeHandle(forwardedRef, () => videoRef.current as HTMLVideoElement, []);

  useEffect(() => {
    onReadyRef.current = onReady;
    onErrorRef.current = onError;
    onEngineStateChangeRef.current = onEngineStateChange;
  }, [onEngineStateChange, onError, onReady]);

  const transitionEngine = useCallback((event: PlaybackEngineEvent) => {
    const next = reducePlaybackEngineState(engineStateRef.current, event);
    engineStateRef.current = next;
    setEnginePhase(next.phase);
    onEngineStateChangeRef.current?.(next);
  }, []);

  const clearControlsTimer = useCallback(() => {
    if (controlsTimerRef.current != null) {
      window.clearTimeout(controlsTimerRef.current);
      controlsTimerRef.current = null;
    }
  }, []);

  const scheduleControlsHide = useCallback(() => {
    clearControlsTimer();
    if (!playing || settingsOpen) return;
    controlsTimerRef.current = window.setTimeout(() => {
      setControlsVisible(false);
    }, CONTROL_HIDE_DELAY_MS);
  }, [clearControlsTimer, playing, settingsOpen]);

  const revealControls = useCallback(() => {
    setControlsVisible(true);
    scheduleControlsHide();
  }, [scheduleControlsHide]);

  useEffect(() => () => {
    clearControlsTimer();
    if (touchTapTimerRef.current != null) {
      window.clearTimeout(touchTapTimerRef.current);
      touchTapTimerRef.current = null;
    }
  }, [clearControlsTimer]);

  useEffect(() => {
    if (playing) scheduleControlsHide();
    else {
      clearControlsTimer();
      setControlsVisible(true);
    }
  }, [clearControlsTimer, playing, scheduleControlsHide]);

  useEffect(() => {
    if (settingsOpen) {
      clearControlsTimer();
      setControlsVisible(true);
    } else {
      scheduleControlsHide();
    }
  }, [clearControlsTimer, scheduleControlsHide, settingsOpen]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;

    let disposed = false;
    let hls: Hls | null = null;

    engineStateRef.current = createPlaybackEngineState(isHls ? 'hls' : 'native');
    networkRecoveryRef.current = { attempts: 0, firstAttemptAt: null };
    mediaRecoveryRef.current = { attempts: 0, firstAttemptAt: null };
    transitionEngine({ type: 'load' });

    setQualities([]);
    setQualityLevel(-1);
    setBuffering(true);

    async function attach() {
      if (!video || disposed) return;

      if (!isHls) {
        video.src = src;
        video.load();
        if (autoPlay) void video.play().catch(() => undefined);
        return;
      }

      if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = src;
        video.load();
        if (autoPlay) void video.play().catch(() => undefined);
        return;
      }

      try {
        const hlsModule = await import('hls.js');
        if (disposed) return;
        const HlsCtor = hlsModule.default;

        if (!HlsCtor.isSupported()) {
          const message = 'Этот браузер не поддерживает HLS-воспроизведение.';
          transitionEngine({ type: 'error', message });
          onErrorRef.current?.(message);
          return;
        }

        hls = new HlsCtor({
          enableWorker: true,
          lowLatencyMode: false,
          backBufferLength: 90,
          maxBufferLength: 30,
          capLevelToPlayerSize: true,
          startLevel: -1,
        });
        hlsRef.current = hls;
        hls.loadSource(src);
        hls.attachMedia(video);

        hls.on(HlsCtor.Events.MANIFEST_PARSED, () => {
          if (disposed || !hls) return;
          const options = hls.levels
            .map((level, index) => ({
              id: index,
              label: level.height ? `${level.height}p` : level.width ? `${level.width}px` : `Уровень ${index + 1}`,
              bitrate: Number.isFinite(level.bitrate) ? level.bitrate : null,
            }))
            .sort((a, b) => {
              const ah = Number.parseInt(a.label, 10) || 0;
              const bh = Number.parseInt(b.label, 10) || 0;
              return bh - ah;
            });
          setQualities(options);
          setQualityLevel(-1);
          // <video>.canplay is the canonical readiness signal. The HLS
          // manifest alone does not guarantee decoded media is ready.
          if (autoPlay) void video.play().catch(() => undefined);
        });

        hls.on(HlsCtor.Events.LEVEL_SWITCHED, (_event, data) => {
          if (hls?.autoLevelEnabled) setQualityLevel(-1);
          else setQualityLevel(data.level);
        });

        hls.on(HlsCtor.Events.ERROR, (_event, data) => {
          if (!data.fatal || !hls) return;

          if (data.type === HlsCtor.ErrorTypes.NETWORK_ERROR) {
            const recovery = networkRecoveryRef.current;
            const now = Date.now();
            if (
              recovery.firstAttemptAt != null &&
              now - recovery.firstAttemptAt > PLAYBACK_RECOVERY_WINDOW_MS
            ) {
              recovery.attempts = 0;
              recovery.firstAttemptAt = null;
            }

            if (
              canAttemptRecovery({
                attempts: recovery.attempts,
                limit: HLS_NETWORK_RECOVERY_LIMIT,
                firstAttemptAt: recovery.firstAttemptAt,
                now,
              })
            ) {
              recovery.attempts += 1;
              recovery.firstAttemptAt ??= now;
              transitionEngine({ type: 'recover', attempt: recovery.attempts });
              hls.startLoad();
              return;
            }

            const message = data.details || 'HLS-сеть не восстановилась после повторных попыток.';
            transitionEngine({ type: 'error', message });
            onErrorRef.current?.(message);
            return;
          }

          if (data.type === HlsCtor.ErrorTypes.MEDIA_ERROR) {
            const recovery = mediaRecoveryRef.current;
            const now = Date.now();
            if (
              recovery.firstAttemptAt != null &&
              now - recovery.firstAttemptAt > PLAYBACK_RECOVERY_WINDOW_MS
            ) {
              recovery.attempts = 0;
              recovery.firstAttemptAt = null;
            }

            if (
              canAttemptRecovery({
                attempts: recovery.attempts,
                limit: HLS_MEDIA_RECOVERY_LIMIT,
                firstAttemptAt: recovery.firstAttemptAt,
                now,
              })
            ) {
              recovery.attempts += 1;
              recovery.firstAttemptAt ??= now;
              transitionEngine({ type: 'recover', attempt: recovery.attempts });
              hls.recoverMediaError();
              return;
            }

            const message = data.details || 'HLS-медиа не восстановилось после повторных попыток.';
            transitionEngine({ type: 'error', message });
            onErrorRef.current?.(message);
            return;
          }

          const message = data.details || 'Не удалось воспроизвести HLS-поток.';
          transitionEngine({ type: 'error', message });
          onErrorRef.current?.(message);
        });
      } catch {
        const message = 'Не удалось загрузить HLS-модуль AnimeBox Player.';
        transitionEngine({ type: 'error', message });
        onErrorRef.current?.(message);
      }
    }

    void attach();

    return () => {
      disposed = true;
      hls?.destroy();
      hlsRef.current = null;
      video.removeAttribute('src');
      video.load();
    };
  }, [autoPlay, isHls, src, transitionEngine]);

  useEffect(() => {
    const onPipChange = () => {
      setPipActive(document.pictureInPictureElement === videoRef.current);
    };
    document.addEventListener('enterpictureinpicture', onPipChange);
    document.addEventListener('leavepictureinpicture', onPipChange);
    return () => {
      document.removeEventListener('enterpictureinpicture', onPipChange);
      document.removeEventListener('leavepictureinpicture', onPipChange);
    };
  }, []);

  const seek = useCallback((seconds: number) => {
    const video = videoRef.current;
    if (!video || !Number.isFinite(video.duration) || video.duration <= 0) return;
    video.currentTime = clamp(seconds, 0, Math.max(0, video.duration - 0.05));
    setCurrentTime(video.currentTime);
  }, []);

  const togglePlayback = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    if (video.paused) {
      onControlAction?.('play', { positionSeconds: video.currentTime });
      void video.play().catch(() => undefined);
    } else {
      onControlAction?.('pause', { positionSeconds: video.currentTime });
      video.pause();
    }
  }, [onControlAction]);

  const toggleMute = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setMuted(video.muted);
    onControlAction?.(video.muted ? 'mute' : 'unmute', {
      volume: video.volume,
    });
  }, [onControlAction]);

  const setRate = useCallback((rate: number) => {
    const video = videoRef.current;
    if (!video) return;
    const next = clamp(rate, 0.5, 2);
    video.playbackRate = next;
    setPlaybackRate(next);
    onControlAction?.('speed', { rate: next });
  }, [onControlAction]);

  const setVolumeValue = useCallback((nextValue: number) => {
    const video = videoRef.current;
    if (!video) return;
    const next = clamp(nextValue, 0, 1);
    video.volume = next;
    video.muted = next === 0;
    setVolume(next);
    setMuted(video.muted);
    onControlAction?.('volume', {
      volume: next,
      muted: video.muted,
    });
  }, [onControlAction]);

  const setQuality = useCallback((level: number) => {
    const hls = hlsRef.current;
    if (!hls) return;
    hls.currentLevel = level;
    hls.nextLevel = level;
    setQualityLevel(level);
    onControlAction?.('quality', {
      level,
      mode: level === -1 ? 'auto' : 'manual',
    });
  }, [onControlAction]);

  const togglePip = useCallback(async () => {
    const video = videoRef.current;
    if (!video || !document.pictureInPictureEnabled || video.disablePictureInPicture) return;
    try {
      if (document.pictureInPictureElement === video) {
        await document.exitPictureInPicture();
        onControlAction?.('pip', { active: false });
      } else {
        await video.requestPictureInPicture();
        onControlAction?.('pip', { active: true });
      }
    } catch {
      // Browser/PWA shells can refuse PiP without a user-visible error condition.
    }
  }, [onControlAction]);

  const onKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    if (isEditableTarget(event.target)) return;
    const video = videoRef.current;
    if (!video) return;

    const commitKeyboardSeek = (seconds: number) => {
      seek(seconds);
      onControlAction?.('seek', {
        positionSeconds: clamp(
          seconds,
          0,
          Number.isFinite(video.duration) && video.duration > 0
            ? Math.max(0, video.duration - 0.05)
            : Math.max(0, seconds),
        ),
        input: 'keyboard',
      });
    };

    switch (event.key.toLowerCase()) {
      case ' ':
      case 'k':
        event.preventDefault();
        togglePlayback();
        break;
      case 'arrowleft':
        event.preventDefault();
        commitKeyboardSeek(video.currentTime - 5);
        break;
      case 'arrowright':
        event.preventDefault();
        commitKeyboardSeek(video.currentTime + 5);
        break;
      case 'j':
        event.preventDefault();
        commitKeyboardSeek(video.currentTime - 10);
        break;
      case 'l':
        event.preventDefault();
        commitKeyboardSeek(video.currentTime + 10);
        break;
      case 'arrowup':
        event.preventDefault();
        setVolumeValue(video.volume + 0.05);
        break;
      case 'arrowdown':
        event.preventDefault();
        setVolumeValue(video.volume - 0.05);
        break;
      case 'm':
        event.preventDefault();
        toggleMute();
        break;
      case 'f':
        event.preventDefault();
        onControlAction?.('fullscreen', { active: !fullscreenActive });
        void onToggleFullscreen?.();
        break;
      case 'p':
        event.preventDefault();
        void togglePip();
        break;
      case '>':
        event.preventDefault();
        setRate(playbackRate + 0.25);
        break;
      case '<':
        event.preventDefault();
        setRate(playbackRate - 0.25);
        break;
      default:
        break;
    }
    revealControls();
  }, [
    fullscreenActive,
    onControlAction,
    onToggleFullscreen,
    playbackRate,
    revealControls,
    seek,
    setRate,
    setVolumeValue,
    toggleMute,
    togglePip,
    togglePlayback,
  ]);

  const commitTimelineSeek = useCallback((value: number, input: 'timeline' | 'touch') => {
    seek(value);
    onControlAction?.('seek', {
      positionSeconds: value,
      input,
    });
  }, [onControlAction, seek]);

  const updateTimelineHover = useCallback((
    clientX: number,
    element: HTMLElement,
  ) => {
    if (duration <= 0) return;
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0) return;

    const ratio = clamp((clientX - rect.left) / rect.width, 0, 1);
    setHoverPercent(ratio * 100);
    setHoverTime(ratio * duration);
  }, [duration]);

  const handleTouchSurface = useCallback((
    event: React.PointerEvent<HTMLButtonElement>,
  ) => {
    lastPointerTypeRef.current = event.pointerType;
    if (event.pointerType !== 'touch') return;

    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = rect.width > 0
      ? clamp((event.clientX - rect.left) / rect.width, 0, 1)
      : 0.5;
    const zone = ratio < 0.34 ? 'left' : ratio > 0.66 ? 'right' : 'center';
    const now = Date.now();
    const previous = lastTouchTapRef.current;

    if (
      previous &&
      previous.zone === zone &&
      now - previous.at <= 320 &&
      zone !== 'center'
    ) {
      if (touchTapTimerRef.current != null) {
        window.clearTimeout(touchTapTimerRef.current);
        touchTapTimerRef.current = null;
      }

      lastTouchTapRef.current = null;
      const video = videoRef.current;
      if (!video) return;

      const delta = zone === 'left' ? -10 : 10;
      const target = video.currentTime + delta;
      commitTimelineSeek(target, 'touch');
      setTapFeedback(zone === 'left' ? 'back' : 'forward');
      window.setTimeout(() => setTapFeedback(null), 520);
      revealControls();
      return;
    }

    lastTouchTapRef.current = { at: now, zone };
    if (touchTapTimerRef.current != null) {
      window.clearTimeout(touchTapTimerRef.current);
    }

    touchTapTimerRef.current = window.setTimeout(() => {
      revealControls();
      lastTouchTapRef.current = null;
      touchTapTimerRef.current = null;
    }, 280);
  }, [commitTimelineSeek, revealControls]);

  const canPip = useMemo(() => {
    return typeof document !== 'undefined' && Boolean(document.pictureInPictureEnabled);
  }, []);

  const displayedTime =
    timelineInteracting && scrubTime != null
      ? scrubTime
      : currentTime;
  const progress = duration > 0 ? clamp((displayedTime / duration) * 100, 0, 100) : 0;
  const bufferedProgress = duration > 0 ? clamp((buffered / duration) * 100, 0, 100) : 0;

  return (
    <div
      ref={rootRef}
      tabIndex={0}
      className="group/direct relative h-full w-full overflow-hidden bg-black outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-violet-400/60"
      onPointerMove={revealControls}
      onPointerDown={revealControls}
      data-animebox-player-controls-root
      onMouseLeave={() => {
        if (playing && !settingsOpen) scheduleControlsHide();
      }}
      onKeyDown={onKeyDown}
      aria-label={`AnimeBox Player: ${title}`}
    >
      <video
        ref={videoRef}
        className="absolute inset-0 h-full w-full bg-black object-contain"
        playsInline
        preload="auto"
        poster={poster}
        aria-label={title}
        onLoadedMetadata={(event) => {
          const video = event.currentTarget;
          const nextVolume = clamp(initialVolume, 0, 1);
          const nextRate = clamp(initialPlaybackRate, 0.25, 2);

          video.volume = nextVolume;
          video.muted = initialMuted || nextVolume === 0;
          video.playbackRate = nextRate;

          setDuration(Number.isFinite(video.duration) ? video.duration : 0);
          setVolume(video.volume);
          setMuted(video.muted);
          setPlaybackRate(video.playbackRate);
          onVolumeChange?.(video.volume, video.muted);
          onRateChange?.(video.playbackRate);
          onLoadedMetadata?.(video.videoWidth, video.videoHeight);
        }}
        onDurationChange={(event) => {
          const value = event.currentTarget.duration;
          setDuration(Number.isFinite(value) ? value : 0);
        }}
        onCanPlay={(event) => {
          const observedDuration = event.currentTarget.duration;
          setBuffering(false);
          transitionEngine({
            type: 'ready',
            durationSeconds:
              Number.isFinite(observedDuration) && observedDuration > 0
                ? observedDuration
                : null,
          });
          onReadyRef.current?.();
        }}
        onPlaying={() => {
          setPlaying(true);
          setBuffering(false);
          transitionEngine({ type: 'play' });
          onPlaying?.();
        }}
        onWaiting={() => {
          setBuffering(true);
          transitionEngine({ type: 'buffering' });
          onWaiting?.();
        }}
        onPlay={(event) => {
          setPlaying(true);
          transitionEngine({ type: 'play' });
          onPlay?.(event.currentTarget.currentTime);
        }}
        onPause={(event) => {
          setPlaying(false);
          if (!event.currentTarget.ended) {
            transitionEngine({ type: 'pause' });
            onPause?.(event.currentTarget.currentTime);
          }
        }}
        onSeeked={(event) => {
          const video = event.currentTarget;
          onSeeked?.(video.currentTime, !video.paused && !video.ended);
        }}
        onTimeUpdate={(event) => {
          const video = event.currentTarget;
          const nextDuration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : null;
          setCurrentTime(video.currentTime);
          if (video.buffered.length > 0) {
            setBuffered(video.buffered.end(video.buffered.length - 1));
          }
          transitionEngine({
            type: 'time',
            positionSeconds: video.currentTime,
            durationSeconds: nextDuration,
          });
          onTimeUpdate?.({ positionSeconds: video.currentTime, durationSeconds: nextDuration });
        }}
        onVolumeChange={(event) => {
          const video = event.currentTarget;
          setVolume(video.volume);
          setMuted(video.muted);
          onVolumeChange?.(video.volume, video.muted);
        }}
        onRateChange={(event) => {
          const rate = event.currentTarget.playbackRate;
          setPlaybackRate(rate);
          onRateChange?.(rate);
        }}
        onEnded={() => {
          setPlaying(false);
          transitionEngine({ type: 'ended' });
          onEnded?.();
        }}
        onError={() => {
          if (!isHls) {
            const message = 'Видео не удалось загрузить.';
            transitionEngine({ type: 'error', message });
            onErrorRef.current?.(message);
          }
        }}
        onDoubleClick={() => void onToggleFullscreen?.()}
      />

      <button
        type="button"
        className="absolute inset-0 z-10 cursor-default bg-transparent"
        aria-label={playing ? 'Пауза' : 'Воспроизвести'}
        onPointerDown={(event) => {
          lastPointerTypeRef.current = event.pointerType;
        }}
        onPointerUp={handleTouchSurface}
        onClick={(event) => {
          if (lastPointerTypeRef.current === 'touch' && event.detail > 0) return;
          togglePlayback();
        }}
      />

      {(buffering || enginePhase === 'recovering') && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
          <div className="flex min-h-12 items-center gap-3 rounded-2xl border border-white/10 bg-black/60 px-4 py-3 text-white backdrop-blur-md">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/15 border-t-violet-300" />
            {enginePhase === 'recovering' && (
              <span className="text-[11px] font-bold text-white/65">
                Восстанавливаем поток…
              </span>
            )}
          </div>
        </div>
      )}

      {tapFeedback && (
        <div
          className={`pointer-events-none absolute top-1/2 z-20 -translate-y-1/2 rounded-full border border-white/10 bg-black/55 px-4 py-3 text-sm font-black text-white/85 backdrop-blur-md ${
            tapFeedback === 'back' ? 'left-[18%] -translate-x-1/2' : 'right-[18%] translate-x-1/2'
          }`}
          aria-hidden="true"
        >
          {tapFeedback === 'back' ? '−10 сек.' : '+10 сек.'}
        </div>
      )}

      <div
        className={`pointer-events-none absolute inset-x-0 bottom-0 z-30 bg-gradient-to-t from-black/90 via-black/45 to-transparent px-3 pb-3 pt-16 transition-opacity duration-200 sm:px-4 sm:pb-4 ${
          controlsVisible || !playing ? 'opacity-100' : 'opacity-0'
        }`}
        style={
          fullscreenActive
            ? {
                paddingBottom:
                  'max(0.75rem, var(--animebox-tg-safe-bottom, 0px), env(safe-area-inset-bottom))',
                paddingLeft:
                  'max(0.75rem, var(--animebox-tg-safe-left, 0px), env(safe-area-inset-left))',
                paddingRight:
                  'max(0.75rem, var(--animebox-tg-safe-right, 0px), env(safe-area-inset-right))',
              }
            : undefined
        }
      >
        <div
          className="pointer-events-auto"
          onPointerEnter={clearControlsTimer}
          onPointerLeave={scheduleControlsHide}
        >
          <div
            className="relative mb-2 h-6 w-full touch-none"
            onPointerMove={(event) => updateTimelineHover(event.clientX, event.currentTarget)}
            onPointerLeave={() => {
              if (!timelineInteractingRef.current) setHoverTime(null);
            }}
          >
            <div className="absolute left-0 right-0 top-1/2 h-1 -translate-y-1/2 overflow-hidden rounded-full bg-white/15">
              <span className="absolute inset-y-0 left-0 bg-white/15" style={{ width: `${bufferedProgress}%` }} />
              <span className="absolute inset-y-0 left-0 bg-violet-400" style={{ width: `${progress}%` }} />
              {duration > 0 &&
                timelineMarkers.map((marker) => {
                  const start = clamp((marker.startSeconds / duration) * 100, 0, 100);
                  const end = clamp((marker.endSeconds / duration) * 100, start, 100);
                  return (
                    <span
                      key={`${marker.kind}:${marker.startSeconds}:${marker.endSeconds}`}
                      className={`absolute inset-y-0 ${
                        marker.kind === 'opening'
                          ? 'bg-fuchsia-300/55'
                          : 'bg-amber-300/50'
                      }`}
                      style={{
                        left: `${start}%`,
                        width: `${Math.max(0.4, end - start)}%`,
                      }}
                      aria-hidden="true"
                    />
                  );
                })}
            </div>
            {hoverTime != null && (
              <div
                className="pointer-events-none absolute bottom-full mb-1 -translate-x-1/2 rounded-lg border border-white/10 bg-black/85 px-2 py-1 text-[10px] font-bold tabular-nums text-white/85 shadow-xl backdrop-blur"
                style={{ left: `${hoverPercent}%` }}
              >
                {formatTime(hoverTime)}
              </div>
            )}
            <input
              type="range"
              min={0}
              max={duration > 0 ? duration : 0}
              step={0.1}
              value={duration > 0 ? displayedTime : 0}
              onPointerDown={(event) => {
                timelineInteractingRef.current = true;
                setTimelineInteracting(true);
                setScrubTime(Number(event.currentTarget.value));
              }}
              onPointerUp={(event) => {
                const value = Number(event.currentTarget.value);
                timelineInteractingRef.current = false;
                setTimelineInteracting(false);
                setScrubTime(null);
                commitTimelineSeek(value, 'timeline');
              }}
              onPointerCancel={() => {
                timelineInteractingRef.current = false;
                setTimelineInteracting(false);
                setScrubTime(null);
              }}
              onChange={(event) => {
                const value = Number(event.target.value);
                if (timelineInteractingRef.current) {
                  setScrubTime(value);
                  return;
                }
                commitTimelineSeek(value, 'timeline');
              }}
              onKeyUp={(event) => {
                if (event.key.startsWith('Arrow')) {
                  onControlAction?.('seek', {
                    positionSeconds: Number(event.currentTarget.value),
                    input: 'timeline-keyboard',
                  });
                }
              }}
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              aria-label="Позиция видео"
              aria-valuetext={formatTime(displayedTime)}
            />
            <span
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-violet-500 shadow-[0_0_0_3px_rgba(139,92,246,.18)]"
              style={{ left: `${progress}%` }}
            />
          </div>

          <div className="flex min-w-0 items-center gap-1.5 text-white sm:gap-2">
            <button
              type="button"
              onClick={togglePlayback}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white/90 transition hover:bg-white/10 hover:text-white"
              aria-label={playing ? 'Пауза' : 'Воспроизвести'}
            >
              {playing ? (
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden="true"><path d="M7 5h4v14H7zM13 5h4v14h-4z" /></svg>
              ) : (
                <Icon name="play" className="ml-0.5 h-5 w-5" />
              )}
            </button>

            <button
              type="button"
              onClick={() => seek(currentTime - 10)}
              className="hidden h-10 min-w-10 items-center justify-center rounded-xl px-2 text-[11px] font-extrabold text-white/65 transition hover:bg-white/10 hover:text-white sm:inline-flex"
              aria-label="Назад на 10 секунд"
            >
              −10
            </button>
            <button
              type="button"
              onClick={() => seek(currentTime + 10)}
              className="hidden h-10 min-w-10 items-center justify-center rounded-xl px-2 text-[11px] font-extrabold text-white/65 transition hover:bg-white/10 hover:text-white sm:inline-flex"
              aria-label="Вперёд на 10 секунд"
            >
              +10
            </button>

            <div className="group/volume flex min-w-0 items-center">
              <button
                type="button"
                onClick={toggleMute}
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white/75 transition hover:bg-white/10 hover:text-white"
                aria-label={muted ? 'Включить звук' : 'Выключить звук'}
              >
                <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" aria-hidden="true">
                  <path d="M5 9v6h4l5 4V5L9 9H5Z" fill="currentColor" />
                  {!muted && volume > 0 ? <path d="M17 9a4 4 0 0 1 0 6M19.5 6.5a7.5 7.5 0 0 1 0 11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /> : <path d="m17 9 5 6M22 9l-5 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />}
                </svg>
              </button>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={muted ? 0 : volume}
                onChange={(event) => setVolumeValue(Number(event.target.value))}
                className="hidden w-20 accent-violet-400 md:block"
                aria-label="Громкость"
              />
            </div>

            <span className="shrink-0 text-[11px] font-semibold tabular-nums text-white/55 sm:text-xs">
              {formatTime(displayedTime)} <span className="text-white/25">/</span> {formatTime(duration)}
            </span>

            <span className="min-w-0 flex-1 truncate px-1 text-center text-[10px] font-extrabold uppercase tracking-[0.12em] text-white/28 sm:text-[11px]">
              AnimeBox Player
            </span>

            {canPip && (
              <button
                type="button"
                onClick={() => void togglePip()}
                className={`hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl transition sm:inline-flex ${pipActive ? 'bg-violet-500/15 text-violet-200' : 'text-white/65 hover:bg-white/10 hover:text-white'}`}
                aria-label={pipActive ? 'Закрыть картинку в картинке' : 'Картинка в картинке'}
              >
                <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" aria-hidden="true"><rect x="3.5" y="5" width="17" height="14" rx="2" stroke="currentColor" strokeWidth="1.6"/><rect x="11.5" y="11" width="7" height="5" rx="1" fill="currentColor"/></svg>
              </button>
            )}

            <div className="relative">
              <button
                type="button"
                onClick={() => setSettingsOpen((value) => !value)}
                className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition ${settingsOpen ? 'bg-violet-500/15 text-violet-200' : 'text-white/65 hover:bg-white/10 hover:text-white'}`}
                aria-label="Настройки плеера"
                aria-expanded={settingsOpen}
              >
                <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" aria-hidden="true"><path d="M12 8.25A3.75 3.75 0 1 0 12 15.75 3.75 3.75 0 0 0 12 8.25Z" stroke="currentColor" strokeWidth="1.7"/><path d="M19 13.2v-2.4l-2.05-.7a5.6 5.6 0 0 0-.48-1.16l.96-1.94-1.7-1.7-1.94.96a5.6 5.6 0 0 0-1.16-.48L11.93 3h-2.4l-.7 2.05c-.4.13-.78.3-1.16.48L5.73 4.57l-1.7 1.7.96 1.94c-.2.37-.36.76-.48 1.16L2.46 10.07v2.4l2.05.7c.12.4.28.79.48 1.16l-.96 1.94 1.7 1.7 1.94-.96c.38.2.76.36 1.16.48l.7 2.05h2.4l.7-2.05c.4-.12.79-.28 1.16-.48l1.94.96 1.7-1.7-.96-1.94c.2-.37.36-.76.48-1.16L19 13.2Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/></svg>
              </button>

              {settingsOpen && (
                <div className="absolute bottom-12 right-0 w-56 overflow-hidden rounded-2xl border border-white/10 bg-[#090d17]/95 p-2 shadow-[0_20px_60px_rgba(0,0,0,.55)] backdrop-blur-xl">
                  <div className="px-2 pb-2 pt-1 text-[9px] font-extrabold uppercase tracking-[0.16em] text-white/30">Качество</div>
                  <button type="button" onClick={() => setQuality(-1)} disabled={!hlsRef.current} className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-xs font-bold transition ${qualityLevel === -1 ? 'bg-violet-500/12 text-violet-100' : 'text-white/55 hover:bg-white/5 hover:text-white'}`}><span>Авто</span>{qualityLevel === -1 && <span>✓</span>}</button>
                  {qualities.map((quality) => (
                    <button key={quality.id} type="button" onClick={() => setQuality(quality.id)} className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-xs font-bold transition ${qualityLevel === quality.id ? 'bg-violet-500/12 text-violet-100' : 'text-white/55 hover:bg-white/5 hover:text-white'}`}>
                      <span>{quality.label}</span>
                      <span className="text-[9px] font-semibold text-white/25">{quality.bitrate ? `${Math.round(quality.bitrate / 1_000_000 * 10) / 10} Mbps` : qualityLevel === quality.id ? '✓' : ''}</span>
                    </button>
                  ))}
                  <div className="my-1 border-t border-white/[0.06]" />
                  <div className="px-2 pb-1 pt-2 text-[9px] font-extrabold uppercase tracking-[0.16em] text-white/30">Скорость</div>
                  <div className="grid grid-cols-4 gap-1 px-1 pb-1">
                    {[0.75, 1, 1.25, 1.5, 2].map((rate) => (
                      <button key={rate} type="button" onClick={() => setRate(rate)} className={`rounded-lg px-1.5 py-2 text-[10px] font-bold transition ${playbackRate === rate ? 'bg-violet-500/15 text-violet-100' : 'text-white/45 hover:bg-white/5 hover:text-white'}`}>{rate}×</button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => {
                onControlAction?.('fullscreen', { active: !fullscreenActive });
                void onToggleFullscreen?.();
              }}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white/65 transition hover:bg-white/10 hover:text-white"
              aria-label={fullscreenActive ? 'Выйти из полного экрана' : 'Полный экран'}
            >
              <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" aria-hidden="true"><path d={fullscreenActive ? 'M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5' : 'M8 4H4v4M16 4h4v4M8 20H4v-4M16 20h4v-4'} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
});

export default DirectVideoPlayer;
