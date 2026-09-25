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

export type DirectVideoTimeSample = {
  positionSeconds: number;
  durationSeconds: number | null;
};

type DirectVideoPlayerProps = {
  src: string;
  isHls: boolean;
  poster?: string;
  title: string;
  autoPlay?: boolean;
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
  },
  forwardedRef,
) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const controlsTimerRef = useRef<number | null>(null);
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

  useImperativeHandle(forwardedRef, () => videoRef.current as HTMLVideoElement, []);

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

  useEffect(() => () => clearControlsTimer(), [clearControlsTimer]);

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
          onError?.('Этот браузер не поддерживает HLS-воспроизведение.');
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
          onReady?.();
          if (autoPlay) void video.play().catch(() => undefined);
        });

        hls.on(HlsCtor.Events.LEVEL_SWITCHED, (_event, data) => {
          if (hls?.autoLevelEnabled) setQualityLevel(-1);
          else setQualityLevel(data.level);
        });

        hls.on(HlsCtor.Events.ERROR, (_event, data) => {
          if (!data.fatal || !hls) return;
          if (data.type === HlsCtor.ErrorTypes.NETWORK_ERROR) {
            hls.startLoad();
            return;
          }
          if (data.type === HlsCtor.ErrorTypes.MEDIA_ERROR) {
            hls.recoverMediaError();
            return;
          }
          onError?.(data.details || 'Не удалось воспроизвести HLS-поток.');
        });
      } catch {
        onError?.('Не удалось загрузить HLS-модуль AnimeBox Player.');
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
  }, [autoPlay, isHls, onError, onReady, src]);

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
    if (video.paused) void video.play().catch(() => undefined);
    else video.pause();
  }, []);

  const toggleMute = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setMuted(video.muted);
  }, []);

  const setRate = useCallback((rate: number) => {
    const video = videoRef.current;
    if (!video) return;
    const next = clamp(rate, 0.5, 2);
    video.playbackRate = next;
    setPlaybackRate(next);
  }, []);

  const setVolumeValue = useCallback((nextValue: number) => {
    const video = videoRef.current;
    if (!video) return;
    const next = clamp(nextValue, 0, 1);
    video.volume = next;
    video.muted = next === 0;
    setVolume(next);
    setMuted(video.muted);
  }, []);

  const setQuality = useCallback((level: number) => {
    const hls = hlsRef.current;
    if (!hls) return;
    hls.currentLevel = level;
    hls.nextLevel = level;
    setQualityLevel(level);
  }, []);

  const togglePip = useCallback(async () => {
    const video = videoRef.current;
    if (!video || !document.pictureInPictureEnabled || video.disablePictureInPicture) return;
    try {
      if (document.pictureInPictureElement === video) await document.exitPictureInPicture();
      else await video.requestPictureInPicture();
    } catch {
      // Browser/PWA shells can refuse PiP without a user-visible error condition.
    }
  }, []);

  const onKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    if (isEditableTarget(event.target)) return;
    const video = videoRef.current;
    if (!video) return;

    switch (event.key.toLowerCase()) {
      case ' ':
      case 'k':
        event.preventDefault();
        togglePlayback();
        break;
      case 'arrowleft':
        event.preventDefault();
        seek(video.currentTime - 10);
        break;
      case 'arrowright':
        event.preventDefault();
        seek(video.currentTime + 10);
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
        void onToggleFullscreen?.();
        break;
      default:
        break;
    }
    revealControls();
  }, [onToggleFullscreen, revealControls, seek, setVolumeValue, toggleMute, togglePlayback]);

  const canPip = useMemo(() => {
    return typeof document !== 'undefined' && Boolean(document.pictureInPictureEnabled);
  }, []);

  const progress = duration > 0 ? clamp((currentTime / duration) * 100, 0, 100) : 0;
  const bufferedProgress = duration > 0 ? clamp((buffered / duration) * 100, 0, 100) : 0;

  return (
    <div
      ref={rootRef}
      tabIndex={0}
      className="group/direct relative h-full w-full overflow-hidden bg-black outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-violet-400/60"
      onPointerMove={revealControls}
      onPointerDown={revealControls}
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
          setDuration(Number.isFinite(video.duration) ? video.duration : 0);
          setVolume(video.volume);
          setMuted(video.muted);
          onLoadedMetadata?.(video.videoWidth, video.videoHeight);
        }}
        onDurationChange={(event) => {
          const value = event.currentTarget.duration;
          setDuration(Number.isFinite(value) ? value : 0);
        }}
        onCanPlay={() => {
          setBuffering(false);
          onReady?.();
        }}
        onPlaying={() => {
          setPlaying(true);
          setBuffering(false);
          onPlaying?.();
        }}
        onWaiting={() => {
          setBuffering(true);
          onWaiting?.();
        }}
        onPlay={(event) => {
          setPlaying(true);
          onPlay?.(event.currentTarget.currentTime);
        }}
        onPause={(event) => {
          setPlaying(false);
          if (!event.currentTarget.ended) onPause?.(event.currentTarget.currentTime);
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
          onTimeUpdate?.({ positionSeconds: video.currentTime, durationSeconds: nextDuration });
        }}
        onVolumeChange={(event) => {
          setVolume(event.currentTarget.volume);
          setMuted(event.currentTarget.muted);
        }}
        onRateChange={(event) => setPlaybackRate(event.currentTarget.playbackRate)}
        onEnded={() => {
          setPlaying(false);
          onEnded?.();
        }}
        onError={() => {
          if (!isHls) onError?.('Видео не удалось загрузить.');
        }}
        onDoubleClick={() => void onToggleFullscreen?.()}
      />

      <button
        type="button"
        className="absolute inset-0 z-10 cursor-default bg-transparent"
        aria-label={playing ? 'Пауза' : 'Воспроизвести'}
        onClick={togglePlayback}
      />

      {buffering && playing && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-black/55 backdrop-blur-md">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/15 border-t-violet-300" />
          </div>
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
        <div className="pointer-events-auto">
          <div className="relative mb-2 h-5 w-full touch-none">
            <div className="absolute left-0 right-0 top-1/2 h-1 -translate-y-1/2 overflow-hidden rounded-full bg-white/15">
              <span className="absolute inset-y-0 left-0 bg-white/15" style={{ width: `${bufferedProgress}%` }} />
              <span className="absolute inset-y-0 left-0 bg-violet-400" style={{ width: `${progress}%` }} />
            </div>
            <input
              type="range"
              min={0}
              max={duration > 0 ? duration : 0}
              step={0.1}
              value={duration > 0 ? currentTime : 0}
              onChange={(event) => seek(Number(event.target.value))}
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              aria-label="Позиция видео"
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
              {formatTime(currentTime)} <span className="text-white/25">/</span> {formatTime(duration)}
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
              onClick={() => void onToggleFullscreen?.()}
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
