'use client';

import type { CSSProperties, ReactNode } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import Icon from '@/components/Icon';
import KodikPlayer from '@/components/KodikPlayer';
import { useWatchSession } from '@/components/useWatchSession';
import Hls from 'hls.js';

export type TranslationOption = {
  title: string;
  url: string;
  type?: 'hls' | 'iframe' | 'video' | 'kodik';
};

export type PlayerSource = {
  name: string;
  translations: TranslationOption[];
  type?: 'hls' | 'iframe' | 'video' | 'kodik';
};

type WatchStateResponse = {
  state?: {
    episode: number;
    positionMs: number;
    durationMs: number | null;
    coverageMs: number;
    activeMs: number;
    completed: boolean;
    watchedAt: string | null;
  } | null;
};

interface AnimePlayerProps {
  animeId?: number;
  title: string;
  episodeNumber: number;
  totalEpisodes?: number | null;
  totalEpisodesKnown?: boolean;
  poster?: string;
  sources?: PlayerSource[];
  src?: string;
  hasPrev?: boolean;
  hasNext?: boolean;
  onPrev?: () => void;
  onNext?: () => void;
  onEpisodeChange?: (episode: number) => void;
}

type DropdownOption = {
  id: string;
  label: string;
  meta?: string;
};

type DropdownProps = {
  label: string;
  value: string;
  options: DropdownOption[];
  onChange: (id: string) => void;
  icon?: ReactNode;
  align?: 'left' | 'right';
};

function toProxyHls(url: string): string {
  if (!/^https?:\/\//i.test(url)) return url;
  return `/api/hls?url=${encodeURIComponent(url)}`;
}

function sourceLabel(name?: string) {
  if (!name) return 'Источник';
  if (name === 'Kodik') return 'Kodik';
  if (name === 'AniLiberty') return 'AniLiberty';
  return name;
}

const TRANSLATION_PREFERENCE_PREFIX = 'animebox:translation:v1';

function normalizePreferenceValue(value?: string) {
  return value?.trim().toLocaleLowerCase('ru-RU') || '';
}

function translationPreferenceKey(animeId: number | undefined, sourceName: string) {
  const animeKey = typeof animeId === 'number' && Number.isFinite(animeId)
    ? String(animeId)
    : 'global';

  return `${TRANSLATION_PREFERENCE_PREFIX}:${animeKey}:${normalizePreferenceValue(sourceName)}`;
}

function readTranslationPreference(animeId: number | undefined, sourceName: string) {
  try {
    return window.localStorage.getItem(translationPreferenceKey(animeId, sourceName));
  } catch {
    return null;
  }
}

function writeTranslationPreference(
  animeId: number | undefined,
  sourceName: string,
  translationTitle: string,
) {
  try {
    window.localStorage.setItem(
      translationPreferenceKey(animeId, sourceName),
      translationTitle,
    );
  } catch {
    // localStorage can be unavailable in strict/private browser modes.
  }
}

function PlayerDropdown({
  label,
  value,
  options,
  onChange,
  icon,
  align = 'left',
}: DropdownProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const selected = options.find((option) => option.id === value);

  useEffect(() => {
    function handleOutside(event: MouseEvent) {
      if (
        rootRef.current &&
        event.target instanceof Node &&
        !rootRef.current.contains(event.target)
      ) {
        setOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }

    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, []);

  return (
    <div ref={rootRef} className="relative min-w-0">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        className={`group flex min-h-11 w-full items-center gap-3 rounded-2xl border px-3.5 text-left transition duration-200 sm:min-w-[210px] ${
          open
            ? 'border-violet-400/35 bg-violet-500/[0.08] shadow-[0_0_0_4px_rgba(139,92,246,0.07)]'
            : 'border-white/[0.07] bg-white/[0.025] hover:border-white/[0.12] hover:bg-white/[0.045]'
        }`}
      >
        {icon && (
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-white/[0.06] bg-black/20 text-violet-300">
            {icon}
          </span>
        )}

        <span className="min-w-0 flex-1">
          <span className="block text-[9px] font-extrabold uppercase tracking-[0.16em] text-white/30">
            {label}
          </span>
          <span className="mt-0.5 block truncate text-xs font-bold text-white/85">
            {selected?.label || 'Выбрать'}
          </span>
        </span>

        <svg
          viewBox="0 0 20 20"
          fill="none"
          className={`h-4 w-4 shrink-0 text-white/35 transition-transform duration-200 ${
            open ? 'rotate-180' : ''
          }`}
          aria-hidden="true"
        >
          <path
            d="m6 8 4 4 4-4"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      <div
        className={`absolute top-[calc(100%+10px)] z-50 w-full min-w-[240px] overflow-hidden rounded-2xl border border-violet-400/15 bg-[#090d19]/[0.98] shadow-[0_24px_70px_rgba(0,0,0,0.52),0_0_0_1px_rgba(255,255,255,0.025)] backdrop-blur-xl transition duration-200 ${
          align === 'right' ? 'right-0' : 'left-0'
        } ${
          open
            ? 'visible translate-y-0 scale-100 opacity-100'
            : 'invisible -translate-y-2 scale-[0.985] opacity-0'
        }`}
      >
        <div className="border-b border-white/[0.05] px-3.5 py-3">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-white/30">
            {label}
          </p>
        </div>

        <div className="max-h-[310px] overflow-y-auto p-2 [scrollbar-color:rgba(139,92,246,.34)_transparent] [scrollbar-width:thin]">
          {options.map((option) => {
            const active = option.id === value;

            return (
              <button
                key={option.id}
                type="button"
                onClick={() => {
                  onChange(option.id);
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition ${
                  active
                    ? 'bg-gradient-to-r from-violet-500/[0.16] to-indigo-500/[0.08] text-white ring-1 ring-inset ring-violet-400/15'
                    : 'text-white/60 hover:bg-white/[0.045] hover:text-white'
                }`}
              >
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] ${
                    active
                      ? 'border-violet-400/45 bg-violet-500/20 text-violet-200'
                      : 'border-white/[0.08] bg-white/[0.025] text-transparent'
                  }`}
                >
                  ✓
                </span>

                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-bold">
                    {option.label}
                  </span>
                  {option.meta && (
                    <span className="mt-0.5 block truncate text-[10px] text-white/28">
                      {option.meta}
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function AnimePlayer({
  animeId,
  title,
  episodeNumber,
  totalEpisodes,
  totalEpisodesKnown = true,
  poster,
  sources = [],
  src,
  hasPrev = false,
  hasNext = false,
  onPrev,
  onNext,
  onEpisodeChange,
}: AnimePlayerProps) {
  const [activeSourceIndex, setActiveSourceIndex] = useState(0);
  const [activeTranslationIndex, setActiveTranslationIndex] = useState(0);
  const [playerError, setPlayerError] = useState<string | null>(null);
  const [started, setStarted] = useState(false);
  const [playerReady, setPlayerReady] = useState(false);
  const [theaterMode, setTheaterMode] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [resumeSeconds, setResumeSeconds] = useState(0);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const resumeAppliedRef = useRef(false);
  const playerViewportRef = useRef<HTMLDivElement | null>(null);

  const currentSource = sources[activeSourceIndex];
  const currentTranslation = currentSource?.translations[activeTranslationIndex];
  const rawLink = currentTranslation?.url || src || '';
  const normalizedLink = rawLink.startsWith('//') ? `https:${rawLink}` : rawLink;
  const mediaType =
    currentTranslation?.type ||
    currentSource?.type ||
    (/\.m3u8(?:$|\?)/i.test(normalizedLink) ? 'hls' : 'iframe');

  const isKodik = mediaType === 'kodik';
  const isIframe = mediaType === 'iframe' || isKodik;
  const isHls = mediaType === 'hls';
  const videoLink = isHls ? toProxyHls(normalizedLink) : normalizedLink;

  const trackableNativeVideo = !isIframe && Boolean(videoLink);

  const watchSession = useWatchSession({
    enabled: started && (isKodik || trackableNativeVideo),
    animeId,
    episode: episodeNumber,
    requiredEpisodes: totalEpisodes,
    sourceUrl: normalizedLink || videoLink,
  });

  const trackingMessage = watchSession.message;

  const episodeMeta = totalEpisodes
    ? totalEpisodesKnown
      ? `Серия ${episodeNumber} из ${totalEpisodes}`
      : `Серия ${episodeNumber} · вышло ${totalEpisodes}`
    : `Серия ${episodeNumber}`;

  const translationOptions = useMemo<DropdownOption[]>(
    () =>
      (currentSource?.translations || []).map((translation, index) => ({
        id: String(index),
        label: translation.title || 'Озвучка',
        meta: currentSource?.name === 'Kodik' ? 'Озвучка Kodik' : sourceLabel(currentSource?.name),
      })),
    [currentSource],
  );

  const episodeOptions = useMemo<DropdownOption[]>(() => {
    const count = Math.max(totalEpisodes || episodeNumber, episodeNumber);

    return Array.from({ length: count }, (_, index) => {
      const value = index + 1;
      return {
        id: String(value),
        label: `${value} серия`,
        meta: value === episodeNumber ? 'Сейчас смотрите' : undefined,
      };
    });
  }, [episodeNumber, totalEpisodes]);

  const brandStyles = {
    '--player-accent': '#8b5cf6',
    '--player-accent-2': '#6366f1',
    '--player-border': 'rgba(139, 92, 246, 0.18)',
    '--player-shadow': '0 34px 110px rgba(0,0,0,.56), 0 0 70px rgba(109,74,255,.08)',
  } as CSSProperties;

  useEffect(() => {
    let active = true;
    resumeAppliedRef.current = false;
    queueMicrotask(() => {
      if (active) setResumeSeconds(0);
    });

    if (!animeId) return;

    fetch(`/api/watch?animeId=${encodeURIComponent(String(animeId))}&episode=${encodeURIComponent(String(episodeNumber))}`, {
      method: 'GET',
      cache: 'no-store',
    })
      .then(async (response) => {
        if (response.status === 401) return null;
        if (!response.ok) return null;
        return (await response.json()) as WatchStateResponse;
      })
      .then((payload) => {
        if (!active || !payload?.state || payload.state.completed) return;

        const positionSeconds = Math.floor(payload.state.positionMs / 1000);
        const durationSeconds =
          payload.state.durationMs == null
            ? null
            : Math.floor(payload.state.durationMs / 1000);

        if (positionSeconds < 10) return;
        if (durationSeconds != null && durationSeconds - positionSeconds < 20) {
          return;
        }

        setResumeSeconds(positionSeconds);
      })
      .catch(() => undefined);

    return () => {
      active = false;
    };
  }, [animeId, episodeNumber]);

  useEffect(() => {
    const video = videoRef.current;

    if (
      !started ||
      !video ||
      isIframe ||
      resumeSeconds <= 0 ||
      resumeAppliedRef.current
    ) {
      return;
    }

    const applyResume = () => {
      if (
        resumeAppliedRef.current ||
        !Number.isFinite(video.duration) ||
        video.duration <= 0
      ) {
        return;
      }

      // Do not pull the viewer backwards if playback already advanced.
      if (video.currentTime > 5) {
        resumeAppliedRef.current = true;
        return;
      }

      video.currentTime = Math.min(
        resumeSeconds,
        Math.max(0, video.duration - 10),
      );
      resumeAppliedRef.current = true;
    };

    video.addEventListener('loadedmetadata', applyResume);
    if (video.readyState >= 1) applyResume();

    return () => {
      video.removeEventListener('loadedmetadata', applyResume);
    };
  }, [isIframe, resumeSeconds, started, videoLink]);

  useEffect(() => {
    if (!theaterMode) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [theaterMode]);

  useEffect(() => {
    function onFullscreenChange() {
      const activeElement =
        document.fullscreenElement ||
        (document as Document & { webkitFullscreenElement?: Element | null })
          .webkitFullscreenElement;

      setFullscreen(Boolean(activeElement));
    }

    document.addEventListener('fullscreenchange', onFullscreenChange);
    document.addEventListener('webkitfullscreenchange', onFullscreenChange as EventListener);

    return () => {
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', onFullscreenChange as EventListener);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function restoreTranslationPreference() {
      // Defer the state sync until after the current render/effect pass.
      await Promise.resolve();

      if (cancelled) return;

      const source = sources[activeSourceIndex];

      if (!source || source.translations.length === 0) {
        return;
      }

      const rememberedTitle = readTranslationPreference(animeId, source.name);

      if (!rememberedTitle) {
        setActiveTranslationIndex((current) =>
          current >= 0 && current < source.translations.length ? current : 0,
        );
        return;
      }

      const rememberedValue = normalizePreferenceValue(rememberedTitle);
      const rememberedIndex = source.translations.findIndex(
        (translation) =>
          normalizePreferenceValue(translation.title) === rememberedValue,
      );

      setActiveTranslationIndex(rememberedIndex >= 0 ? rememberedIndex : 0);
    }

    void restoreTranslationPreference();

    return () => {
      cancelled = true;
    };
  }, [activeSourceIndex, animeId, sources]);

  useEffect(() => {
    const video = videoRef.current;
    if (!started || !video || !isHls || !videoLink) return;

    let hls: Hls | null = null;

    const onVideoError = () => {
      setPlayerError('Не удалось воспроизвести HLS-поток.');
    };

    video.addEventListener('error', onVideoError);

    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = videoLink;
      video.load();
    } else if (Hls.isSupported()) {
      hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        backBufferLength: 90,
        maxBufferLength: 30,
      });

      hls.loadSource(videoLink);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setPlayerReady(true);
        void video.play().catch(() => undefined);
      });

      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (!data.fatal) return;

        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
          hls?.startLoad();
        } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
          hls?.recoverMediaError();
        } else {
          setPlayerError(data.details || 'Ошибка HLS-потока.');
          hls?.destroy();
        }
      });
    } else {
      window.setTimeout(() => {
        setPlayerError('Этот браузер не поддерживает HLS.');
      }, 0);
    }

    return () => {
      video.removeEventListener('error', onVideoError);
      hls?.destroy();
    };
  }, [videoLink, isHls, started]);

  function selectSource(index: number) {
    setActiveSourceIndex(index);
    setActiveTranslationIndex(0);
    setPlayerError(null);
    setPlayerReady(false);
  }

  function selectTranslation(id: string) {
    const nextIndex = Number(id);
    const source = sources[activeSourceIndex];
    const translation = source?.translations[nextIndex];

    if (
      !Number.isSafeInteger(nextIndex) ||
      nextIndex < 0 ||
      !source ||
      !translation
    ) {
      return;
    }

    setActiveTranslationIndex(nextIndex);

    if (translation.title?.trim()) {
      writeTranslationPreference(animeId, source.name, translation.title);
    }

    setPlayerError(null);
    setPlayerReady(false);
  }

  function selectEpisode(id: string) {
    const nextEpisode = Number(id);
    if (!Number.isSafeInteger(nextEpisode) || nextEpisode < 1) return;
    if (nextEpisode === episodeNumber) return;

    onEpisodeChange?.(nextEpisode);
  }

  async function toggleFullscreen() {
    const node = playerViewportRef.current as
      | (HTMLDivElement & { webkitRequestFullscreen?: () => Promise<void> | void })
      | null;

    if (!node) return;

    const doc = document as Document & {
      webkitExitFullscreen?: () => Promise<void> | void;
      webkitFullscreenElement?: Element | null;
    };

    try {
      if (document.fullscreenElement || doc.webkitFullscreenElement) {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        } else {
          await doc.webkitExitFullscreen?.();
        }
      } else if (node.requestFullscreen) {
        await node.requestFullscreen();
      } else {
        await node.webkitRequestFullscreen?.();
      }
    } catch (error) {
      console.warn('[AnimePlayer] fullscreen unavailable:', error);
    }
  }

  const playerBody = (
    <section
      style={brandStyles}
      className={`relative overflow-visible rounded-[28px] border border-[color:var(--player-border)] bg-[linear-gradient(180deg,rgba(14,19,35,.985),rgba(6,9,18,.99))] [box-shadow:var(--player-shadow)] ${
        theaterMode ? 'mx-auto w-full max-w-[1480px]' : ''
      }`}
    >
      <div className="pointer-events-none absolute inset-x-20 top-0 h-px bg-gradient-to-r from-transparent via-violet-400/70 to-transparent" />
      <div className="pointer-events-none absolute -inset-12 -z-10 bg-[radial-gradient(ellipse_at_center,rgba(121,78,255,.16),transparent_65%)] blur-3xl" />

      {/* Premium header */}
      <div className="flex flex-col gap-5 border-b border-white/[0.055] px-4 py-4 sm:px-5 md:flex-row md:items-end md:justify-between md:px-6 md:py-5">
        <div className="min-w-0">
          <div className="mb-2 flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-violet-400 shadow-[0_0_14px_rgba(167,139,250,.95)]" />
            <span className="text-[9px] font-extrabold uppercase tracking-[0.2em] text-violet-300/65">
              AnimeBox Cinema
            </span>
          </div>

          <h1 className="truncate text-base font-black tracking-[-0.025em] text-white sm:text-lg md:text-xl">
            {title}
          </h1>
          <p className="mt-1 text-xs font-semibold text-white/35">{episodeMeta}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {sources.length > 1 && (
            <div className="flex items-center rounded-2xl border border-white/[0.07] bg-black/20 p-1">
              {sources.map((source, index) => {
                const active = activeSourceIndex === index;

                return (
                  <button
                    key={`${source.name}-${index}`}
                    type="button"
                    onClick={() => selectSource(index)}
                    className={`rounded-xl px-3.5 py-2 text-[11px] font-extrabold transition-all duration-200 ${
                      active
                        ? 'bg-gradient-to-r from-violet-600 to-indigo-500 text-white shadow-[0_8px_26px_rgba(105,72,255,.30)]'
                        : 'text-white/40 hover:bg-white/[0.05] hover:text-white/75'
                    }`}
                  >
                    {sourceLabel(source.name)}
                  </button>
                );
              })}
            </div>
          )}

          <button
            type="button"
            onClick={() => setTheaterMode((current) => !current)}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.025] px-3.5 text-[11px] font-bold text-white/55 transition hover:border-violet-400/20 hover:bg-violet-500/[0.07] hover:text-white"
          >
            <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" aria-hidden="true">
              <path d="M4 7h16v10H4z" stroke="currentColor" strokeWidth="1.7" />
              <path d="M8 20h8M12 17v3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
            </svg>
            <span className="hidden sm:inline">{theaterMode ? 'Обычный режим' : 'Кинотеатр'}</span>
          </button>

          <button
            type="button"
            onClick={() => void toggleFullscreen()}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.025] px-3.5 text-[11px] font-bold text-white/55 transition hover:border-violet-400/20 hover:bg-violet-500/[0.07] hover:text-white"
          >
            <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" aria-hidden="true">
              <path d="M8 4H4v4M16 4h4v4M8 20H4v-4M16 20h4v-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="hidden sm:inline">Полный экран</span>
          </button>
        </div>
      </div>

      {/* Custom controls */}
      <div className="grid gap-2.5 border-b border-white/[0.05] bg-white/[0.01] px-4 py-3 sm:grid-cols-2 sm:px-5 md:grid-cols-[minmax(190px,230px)_minmax(240px,1fr)] md:px-6">
        <PlayerDropdown
          label="Серия"
          value={String(episodeNumber)}
          options={episodeOptions}
          onChange={selectEpisode}
          icon={<Icon name="play" className="h-3.5 w-3.5" />}
        />

        {translationOptions.length > 0 && (
          <PlayerDropdown
            label={currentSource?.name === 'Kodik' ? 'Озвучка' : 'Качество'}
            value={String(activeTranslationIndex)}
            options={translationOptions}
            onChange={selectTranslation}
            align="right"
            icon={
              <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" aria-hidden="true">
                <path d="M5 9v6M9 6v12M13 8v8M17 5v14M21 10v4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
              </svg>
            }
          />
        )}
      </div>

      {/* Player shell */}
      <div className="relative bg-[radial-gradient(circle_at_50%_0%,rgba(98,68,190,.10),transparent_48%)] p-2.5 sm:p-3.5 md:p-4">
        <div
          ref={playerViewportRef}
          className={`relative w-full overflow-hidden bg-black transition-all duration-300 ${
            fullscreen
              ? 'h-screen w-screen rounded-none border-0'
              : 'aspect-video rounded-[22px] border border-violet-400/[0.12] shadow-[0_28px_80px_rgba(0,0,0,.55),0_0_50px_rgba(105,72,255,.055)] ring-1 ring-black/40'
          }`}
        >
          {!videoLink ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.04] text-xl text-white/35">
                ▶
              </div>
              <div>
                <p className="text-sm font-extrabold text-white/75">Видео недоступно</p>
                <p className="mt-1 text-xs text-white/35">Для этой серии пока не найден источник.</p>
              </div>
            </div>
          ) : !started ? (
            <button
              type="button"
              onClick={() => {
                setPlayerReady(false);
                setStarted(true);
              }}
              className="group absolute inset-0 isolate overflow-hidden text-white"
              aria-label={`Смотреть ${title}, серия ${episodeNumber}`}
            >
              {poster ? (
                <>
                  <div
                    aria-hidden="true"
                    className="absolute -inset-8 scale-110 bg-cover bg-center opacity-80 blur-2xl transition duration-700 group-hover:scale-[1.14]"
                    style={{ backgroundImage: `url("${poster}")` }}
                  />
                  <div
                    aria-hidden="true"
                    className="absolute inset-0 scale-[1.015] bg-cover bg-center opacity-60 transition duration-700 group-hover:scale-[1.035] group-hover:opacity-70"
                    style={{ backgroundImage: `url("${poster}")` }}
                  />
                </>
              ) : (
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_30%,rgba(126,87,255,.30),transparent_38%),linear-gradient(135deg,#11162a,#070a12)]" />
              )}

              <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(4,6,13,.20),rgba(4,6,13,.72)),radial-gradient(circle_at_center,rgba(126,87,255,.12),transparent_32%)] backdrop-blur-[2px]" />

              <div className="absolute inset-0 flex flex-col items-center justify-center px-5 text-center">
                <div className="relative mb-5">
                  <span className="absolute inset-0 animate-ping rounded-full bg-violet-500/20 [animation-duration:2.2s]" />
                  <span className="absolute -inset-4 rounded-full border border-violet-300/10 bg-violet-500/[0.04]" />
                  <span className="relative flex h-[86px] w-[86px] items-center justify-center rounded-full border border-white/20 bg-gradient-to-br from-violet-500 via-violet-600 to-indigo-600 shadow-[0_20px_65px_rgba(105,72,255,.48),inset_0_1px_0_rgba(255,255,255,.28)] transition duration-300 group-hover:scale-105">
                    <Icon name="play" className="ml-1 h-9 w-9 text-white" />
                  </span>
                </div>

                <p className="text-[10px] font-extrabold uppercase tracking-[0.22em] text-violet-200/70">AnimeBox Player</p>
                <h2 className="mt-2 max-w-2xl text-xl font-black tracking-[-0.03em] drop-shadow-lg sm:text-2xl md:text-3xl">
                  {resumeSeconds > 0 ? 'Продолжить' : `Смотреть ${episodeNumber} серию`}
                </h2>
                <p className="mt-2 text-xs font-semibold text-white/55 sm:text-sm">
                  {resumeSeconds > 0
                    ? `с ${Math.floor(resumeSeconds / 60)}:${String(resumeSeconds % 60).padStart(2, '0')} · ${currentTranslation?.title || sourceLabel(currentSource?.name)}`
                    : currentTranslation?.title || sourceLabel(currentSource?.name)}
                </p>
              </div>

              <div className="absolute bottom-4 left-4 rounded-full border border-white/[0.12] bg-black/40 px-3 py-1.5 text-[10px] font-extrabold text-white/70 backdrop-blur-md">
                {sourceLabel(currentSource?.name)}
              </div>
            </button>
          ) : (
            <>
              {!playerReady && !playerError && (
                <div className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-[#05070d]/90 backdrop-blur-md">
                  <div className="h-10 w-10 animate-spin rounded-full border-2 border-white/10 border-t-violet-400" />
                  <span className="text-xs font-bold text-white/45">Запускаем AnimeBox Player…</span>
                </div>
              )}

              {isKodik ? (
                <KodikPlayer
                  key={`${videoLink}:${episodeNumber}`}
                  src={videoLink}
                  title={`${title} — серия ${episodeNumber}`}
                  episodeNumber={episodeNumber}
                  resumeSeconds={resumeSeconds}
                  onReady={() => setPlayerReady(true)}
                  onTimeUpdate={watchSession.onSample}
                  onProviderSkip={watchSession.onProviderSkip}
                />
              ) : isIframe ? (
                <iframe
                  key={videoLink}
                  src={videoLink}
                  width="100%"
                  height="100%"
                  className="absolute inset-0 h-full w-full border-0"
                  allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
                  allowFullScreen
                  title="Anime player"
                  onLoad={() => setPlayerReady(true)}
                />
              ) : (
                <video
                  ref={videoRef}
                  key={videoLink}
                  className="absolute inset-0 h-full w-full bg-black object-contain"
                  controls
                  autoPlay
                  playsInline
                  muted={false}
                  poster={poster || undefined}
                  preload="auto"
                  src={!isHls ? videoLink : undefined}
                  onCanPlay={() => setPlayerReady(true)}
                  onTimeUpdate={(event) => {
                    const video = event.currentTarget;
                    watchSession.onSample({
                      positionSeconds: video.currentTime,
                      durationSeconds:
                        Number.isFinite(video.duration) && video.duration > 0
                          ? video.duration
                          : null,
                      origin: window.location.origin,
                    });
                  }}
                >
                  Ваш браузер не поддерживает воспроизведение видео.
                </video>
              )}
            </>
          )}

          {playerError && !isIframe && (
            <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/80 p-6 text-center backdrop-blur-md">
              <div className="max-w-sm rounded-2xl border border-red-400/15 bg-red-500/10 px-5 py-4">
                <p className="text-sm font-bold text-red-100">Не удалось запустить видео</p>
                <p className="mt-1 text-xs text-red-200/65">{playerError}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bottom navigation */}
      <div className="grid grid-cols-2 gap-2 border-t border-white/[0.05] bg-black/10 p-3 sm:grid-cols-[minmax(0,1fr)_minmax(170px,230px)_minmax(0,1fr)] sm:items-center sm:px-4 md:p-4 md:px-5">
        <button
          type="button"
          onClick={onPrev}
          disabled={!hasPrev}
          className="group inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.025] px-4 text-xs font-bold text-white/55 transition hover:border-white/[0.12] hover:bg-white/[0.05] hover:text-white disabled:cursor-not-allowed disabled:opacity-25"
        >
          <Icon name="chevron" className="h-4 w-4 rotate-180 transition-transform group-hover:-translate-x-0.5" />
          Пред. серия
        </button>

        <div className="order-first col-span-2 flex min-h-11 min-w-0 items-center justify-center gap-2 rounded-xl border border-violet-400/[0.10] bg-violet-500/[0.035] px-3 text-center sm:order-none sm:col-span-1">
          <span className="shrink-0 text-[9px] font-extrabold uppercase tracking-[0.16em] text-violet-300/55">
            {sourceLabel(currentSource?.name)}
          </span>
          <span
            aria-hidden="true"
            className="h-1 w-1 shrink-0 rounded-full bg-violet-300/35"
          />
          <span className="min-w-0 truncate text-xs font-bold text-white/62">
            {currentTranslation?.title || episodeMeta}
          </span>
        </div>

        <button
          type="button"
          onClick={onNext}
          disabled={!hasNext}
          className="group inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-500 px-4 text-xs font-extrabold text-white shadow-[0_10px_30px_rgba(105,72,255,.25)] transition hover:-translate-y-px hover:shadow-[0_15px_38px_rgba(105,72,255,.34)] disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:translate-y-0"
        >
          След. серия
          <Icon name="chevron" className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        </button>
      </div>

      {trackingMessage && (
        <p role="status" className="border-t border-white/[0.04] px-4 py-2 text-center text-[10px] text-white/25">
          {trackingMessage}
        </p>
      )}
    </section>
  );

  return (
    <div className={`relative isolate w-full ${theaterMode ? 'z-[10001]' : ''}`}>
      {theaterMode && (
        <button
          type="button"
          aria-label="Выйти из режима кинотеатра"
          onClick={() => setTheaterMode(false)}
          className="fixed inset-0 z-[10000] cursor-default bg-[#02040a]/90 backdrop-blur-md"
        />
      )}

      <div
        className={
          theaterMode
            ? 'fixed inset-x-3 top-1/2 z-[10002] max-h-[96vh] -translate-y-1/2 overflow-y-auto md:inset-x-8'
            : ''
        }
      >
        {playerBody}
      </div>
    </div>
  );
}
