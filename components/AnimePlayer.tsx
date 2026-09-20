'use client';

import type { CSSProperties, ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Icon from '@/components/Icon';
import KodikPlayer, { type KodikPlayerHandle } from '@/components/KodikPlayer';
import { useWatchSession } from '@/components/useWatchSession';
import { useAuthState } from '@/components/AuthStateProvider';
import {
  getWatchProgress,
  removeWatchProgress,
  saveWatchProgress,
} from '@/lib/watch-progress';
import { setAnimeProgress } from '@/lib/anime-storage';
import Hls from 'hls.js';
import {
  hexToRgb,
  resolveReadableTextColor,
  type PremiumStudioSettings,
} from '@/lib/premium-studio';
import {
  WATCH_PARTY_PLAYER_ACTION_EVENT,
  WATCH_PARTY_PLAYER_COMMAND_EVENT,
  WATCH_PARTY_PLAYER_CONTROL_EVENT,
  WATCH_PARTY_PLAYER_STATE_EVENT,
  createWatchPartyMessageId,
  type WatchPartyPlayerAction,
  type WatchPartyPlayerActionDetail,
  type WatchPartyPlayerCommandDetail,
  type WatchPartyPlayerControlDetail,
  type WatchPartyPlayerStateDetail,
} from '@/lib/watch-party';

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

type PremiumStudioResponse = {
  allowed?: boolean;
  settings?: PremiumStudioSettings;
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
  prevLabel?: string;
  nextLabel?: string;
  onPrev?: () => void;
  onNext?: () => void;
  onEnded?: () => void;
  onEpisodeChange?: (episode: number) => void;
  onPlaybackQualified?: () => void;
  watchTogetherMode?: boolean;
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

function normalizeMediaLink(url: string): string {
  return url.startsWith('//') ? `https:${url}` : url;
}

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
const LOCAL_PROGRESS_SAVE_INTERVAL_MS = 10_000;
const LOCAL_RESUME_MIN_SECONDS = 10;
const LOCAL_RESUME_END_GUARD_SECONDS = 20;
const PLAYER_READY_TIMEOUT_MS = 14_000;
const SOURCE_SWITCH_NOTICE_MS = 5_500;

type SourceLoadState = 'idle' | 'loading' | 'ready' | 'error' | 'timeout';
type PlayerFailureKind = Extract<SourceLoadState, 'error' | 'timeout'>;

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
        className={`premium-player-dropdown-trigger ${open ? 'is-open' : ''} group flex min-h-11 w-full items-center gap-3 rounded-2xl border px-3.5 text-left transition duration-200 sm:min-w-[210px] ${
          open
            ? 'border-violet-400/35 bg-violet-500/[0.08] shadow-[0_0_0_4px_rgba(139,92,246,0.07)]'
            : 'border-white/[0.07] bg-white/[0.025] hover:border-white/[0.12] hover:bg-white/[0.045]'
        }`}
      >
        {icon && (
          <span className="premium-player-control-icon flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-white/[0.06] bg-black/20 text-violet-300">
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
                className={`premium-player-dropdown-option ${active ? 'is-active' : ''} flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition ${
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
  prevLabel = 'Пред. серия',
  nextLabel = 'След. серия',
  onPrev,
  onNext,
  onEnded,
  onEpisodeChange,
  onPlaybackQualified,
  watchTogetherMode = false,
}: AnimePlayerProps) {
  const { user, loading: authLoading } = useAuthState();
  const [activeSourceIndex, setActiveSourceIndex] = useState(0);
  const [activeTranslationIndex, setActiveTranslationIndex] = useState(0);
  const [playerError, setPlayerError] = useState<string | null>(null);
  const [playerFailureKind, setPlayerFailureKind] = useState<PlayerFailureKind | null>(null);
  const [sourceNotice, setSourceNotice] = useState<string | null>(null);
  const [sourceStatuses, setSourceStatuses] = useState<Record<string, SourceLoadState>>({});
  const [playerAttempt, setPlayerAttempt] = useState(0);
  const [started, setStarted] = useState(false);
  const [playerReady, setPlayerReady] = useState(false);
  const [theaterMode, setTheaterMode] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [telegramAndroidMiniApp, setTelegramAndroidMiniApp] = useState(false);
  const [telegramPseudoFullscreen, setTelegramPseudoFullscreen] = useState(false);
  const [resumeSeconds, setResumeSeconds] = useState(0);
  const [premiumStudio, setPremiumStudio] = useState<PremiumStudioSettings | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const kodikPlayerRef = useRef<KodikPlayerHandle | null>(null);
  const failedCandidatesRef = useRef<Set<string>>(new Set());
  const resumeAppliedRef = useRef(false);
  const localProgressRef = useRef<{
    positionSeconds: number;
    durationSeconds: number;
  } | null>(null);
  const lastLocalProgressSavedAtRef = useRef(0);
  const playbackQualifiedRef = useRef(false);
  const playerViewportRef = useRef<HTMLDivElement | null>(null);
  const telegramFullscreenOwnedRef = useRef(false);
  const telegramOrientationOwnedRef = useRef(false);
  const telegramWasFullscreenRef = useRef(false);
  const telegramVerticalSwipesWereEnabledRef = useRef<boolean | null>(null);
  const partySuppressUntilRef = useRef(0);
  const pendingPartyCommandRef = useRef<WatchPartyPlayerCommandDetail | null>(null);
  const lastPartyActionRef = useRef<{
    action: WatchPartyPlayerAction;
    position: number;
    at: number;
  } | null>(null);
  const partyStateRef = useRef<WatchPartyPlayerStateDetail>({
    episode: episodeNumber,
    position: 0,
    duration: null,
    playing: false,
    observedAt: 0,
    source: 'native',
  });

  const currentSource = sources[activeSourceIndex];
  const currentTranslation = currentSource?.translations[activeTranslationIndex];
  const rawLink = currentTranslation?.url || src || '';
  const normalizedLink = normalizeMediaLink(rawLink);
  const mediaType =
    currentTranslation?.type ||
    currentSource?.type ||
    (/\.m3u8(?:$|\?)/i.test(normalizedLink) ? 'hls' : 'iframe');

  const isKodik = mediaType === 'kodik';
  const isIframe = mediaType === 'iframe' || isKodik;
  const isHls = mediaType === 'hls';
  const videoLink = isHls ? toProxyHls(normalizedLink) : normalizedLink;
  const currentSourceName = sourceLabel(currentSource?.name);
  const currentCandidateKey = [
    currentSource?.name || 'direct',
    currentTranslation?.title || String(activeTranslationIndex),
    normalizedLink || src || '',
  ].join('::');

  const trackableNativeVideo = !isIframe && Boolean(videoLink);

  const publishPartyState = useCallback((input: {
    position: number;
    duration?: number | null;
    playing: boolean;
  }) => {
    const detail: WatchPartyPlayerStateDetail = {
      episode: episodeNumber,
      position: Math.max(0, Number.isFinite(input.position) ? input.position : 0),
      duration:
        input.duration != null && Number.isFinite(input.duration) && input.duration > 0
          ? input.duration
          : null,
      playing: input.playing,
      observedAt: Date.now(),
      source: isKodik ? 'kodik' : 'native',
    };

    partyStateRef.current = detail;
    window.dispatchEvent(
      new CustomEvent<WatchPartyPlayerStateDetail>(WATCH_PARTY_PLAYER_STATE_EVENT, { detail }),
    );
  }, [episodeNumber, isKodik]);

  const publishPartyAction = useCallback((
    action: WatchPartyPlayerAction,
    position: number,
    playing: boolean,
  ) => {
    const now = Date.now();
    if (now < partySuppressUntilRef.current) return;

    const normalizedPosition = Math.max(0, Number.isFinite(position) ? position : 0);
    const previous = lastPartyActionRef.current;
    if (
      previous &&
      previous.action === action &&
      Math.abs(previous.position - normalizedPosition) < 0.9 &&
      now - previous.at < 850
    ) {
      return;
    }

    lastPartyActionRef.current = { action, position: normalizedPosition, at: now };
    const detail: WatchPartyPlayerActionDetail = {
      actionId: createWatchPartyMessageId(),
      action,
      episode: episodeNumber,
      position: normalizedPosition,
      playing,
      observedAt: now,
    };

    window.dispatchEvent(
      new CustomEvent<WatchPartyPlayerActionDetail>(WATCH_PARTY_PLAYER_ACTION_EVENT, { detail }),
    );
  }, [episodeNumber]);

  const applyPartyCommand = useCallback((
    detail: WatchPartyPlayerCommandDetail,
    remote: boolean,
  ) => {
    if (detail.episode !== episodeNumber) return;
    if (remote) partySuppressUntilRef.current = Date.now() + 2_800;

    const target = Math.max(0, Math.min(28_800, detail.position));

    if (isKodik) {
      setStarted(true);
      const player = kodikPlayerRef.current;
      if (!player) {
        pendingPartyCommandRef.current = detail;
        return;
      }

      const state = player.getState();
      if (detail.action === 'seek' || Math.abs(state.positionSeconds - target) > 2.2) {
        player.seek(target);
      }
      if (detail.action === 'play') player.play();
      if (detail.action === 'pause') player.pause();

      publishPartyState({
        position: target,
        duration: state.durationSeconds,
        playing: detail.action === 'play' ? true : detail.action === 'pause' ? false : detail.playing,
      });
      return;
    }

    const video = videoRef.current;
    if (!started || !video) {
      pendingPartyCommandRef.current = detail;
      setStarted(true);
      return;
    }

    if (detail.action === 'seek' || Math.abs(video.currentTime - target) > 2.2) {
      try {
        video.currentTime = target;
      } catch {
        // Metadata may still be loading; the pending state below will retry.
      }
    }

    if (detail.action === 'play') {
      void video.play().catch(() => undefined);
    } else if (detail.action === 'pause') {
      video.pause();
    }

    publishPartyState({
      position: target,
      duration: Number.isFinite(video.duration) && video.duration > 0 ? video.duration : null,
      playing: detail.action === 'play' ? true : detail.action === 'pause' ? false : !video.paused,
    });
  }, [episodeNumber, isKodik, publishPartyState, started]);

  const watchSession = useWatchSession({
    enabled:
      !authLoading &&
      Boolean(user?.id) &&
      started &&
      (isKodik || trackableNativeVideo),
    userId: user?.id ?? null,
    animeId,
    episode: episodeNumber,
    requiredEpisodes: totalEpisodes,
    sourceUrl: normalizedLink || videoLink,
  });

  const trackingMessage = watchSession.message;
  const serverWatchSample = watchSession.onSample;

  const persistGuestProgress = useCallback(
    (
      sample: {
        positionSeconds: number;
        durationSeconds?: number | null;
      },
      force = false,
    ) => {
      if (
        user?.id ||
        watchTogetherMode ||
        !animeId ||
        !Number.isFinite(sample.positionSeconds) ||
        sample.positionSeconds < 0
      ) {
        return;
      }

      const durationSeconds =
        sample.durationSeconds != null &&
        Number.isFinite(sample.durationSeconds) &&
        sample.durationSeconds > 0
          ? sample.durationSeconds
          : localProgressRef.current?.durationSeconds ?? 0;

      localProgressRef.current = {
        positionSeconds: sample.positionSeconds,
        durationSeconds,
      };

      const now = Date.now();

      if (
        !force &&
        now - lastLocalProgressSavedAtRef.current <
          LOCAL_PROGRESS_SAVE_INTERVAL_MS
      ) {
        return;
      }

      if (
        durationSeconds > 0 &&
        durationSeconds - sample.positionSeconds <=
          LOCAL_RESUME_END_GUARD_SECONDS
      ) {
        removeWatchProgress(animeId, episodeNumber);
        lastLocalProgressSavedAtRef.current = now;
        return;
      }

      if (sample.positionSeconds >= LOCAL_RESUME_MIN_SECONDS) {
        setAnimeProgress(animeId, episodeNumber);
      }

      saveWatchProgress(
        animeId,
        episodeNumber,
        sample.positionSeconds,
        durationSeconds,
      );
      lastLocalProgressSavedAtRef.current = now;
    },
    [animeId, episodeNumber, user?.id, watchTogetherMode],
  );

  const handleTimeSample = useCallback(
    (sample: {
      positionSeconds: number;
      durationSeconds?: number | null;
      origin?: string | null;
    }) => {
      persistGuestProgress(sample);
      serverWatchSample(sample);

      if (
        !watchTogetherMode &&
        !playbackQualifiedRef.current &&
        Number.isFinite(sample.positionSeconds) &&
        sample.positionSeconds >= LOCAL_RESUME_MIN_SECONDS
      ) {
        playbackQualifiedRef.current = true;
        onPlaybackQualified?.();
      }
    },
    [
      onPlaybackQualified,
      persistGuestProgress,
      serverWatchSample,
      watchTogetherMode,
    ],
  );

  const handlePlaybackEnded = useCallback(() => {
    if (animeId && !watchTogetherMode) {
      removeWatchProgress(animeId, episodeNumber);
    }

    localProgressRef.current = null;
    setResumeSeconds(0);
    onEnded?.();
  }, [animeId, episodeNumber, onEnded, watchTogetherMode]);

  useEffect(() => {
    function onPartyCommand(event: Event) {
      const detail = (event as CustomEvent<WatchPartyPlayerCommandDetail>).detail;
      if (!detail) return;
      applyPartyCommand(detail, true);
    }

    function onPartyControl(event: Event) {
      const control = (event as CustomEvent<WatchPartyPlayerControlDetail>).detail;
      if (!control) return;

      const state = partyStateRef.current;
      const position =
        typeof control.position === 'number' && Number.isFinite(control.position)
          ? Math.max(0, control.position)
          : state.position;
      const playing =
        control.action === 'play'
          ? true
          : control.action === 'pause'
            ? false
            : state.playing;
      const command: WatchPartyPlayerCommandDetail = {
        action: control.action,
        episode: episodeNumber,
        position,
        playing,
        seq: 0,
      };

      applyPartyCommand(command, false);
      publishPartyAction(control.action, position, playing);
      partySuppressUntilRef.current = Date.now() + 1_200;
    }

    window.addEventListener(WATCH_PARTY_PLAYER_COMMAND_EVENT, onPartyCommand);
    window.addEventListener(WATCH_PARTY_PLAYER_CONTROL_EVENT, onPartyControl);

    return () => {
      window.removeEventListener(WATCH_PARTY_PLAYER_COMMAND_EVENT, onPartyCommand);
      window.removeEventListener(WATCH_PARTY_PLAYER_CONTROL_EVENT, onPartyControl);
    };
  }, [applyPartyCommand, episodeNumber, publishPartyAction]);

  useEffect(() => {
    const pending = pendingPartyCommandRef.current;
    if (!pending || !started) return;
    if (isKodik && !kodikPlayerRef.current) return;
    if (!isKodik && !videoRef.current) return;

    pendingPartyCommandRef.current = null;
    applyPartyCommand(pending, true);
  }, [applyPartyCommand, isKodik, playerReady, started, videoLink]);

  useEffect(() => {
    partyStateRef.current = {
      episode: episodeNumber,
      position: 0,
      duration: null,
      playing: false,
      observedAt: Date.now(),
      source: isKodik ? 'kodik' : 'native',
    };
    pendingPartyCommandRef.current = null;
    partySuppressUntilRef.current = 0;
    lastPartyActionRef.current = null;
  }, [episodeNumber, isKodik, videoLink]);

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

  const syncedPremiumTheme = premiumStudio?.syncPlayerTheme ? premiumStudio : null;

  const brandStyles = useMemo(() => {
    const accent = syncedPremiumTheme?.accentColor ?? '#8b5cf6';
    const primary = syncedPremiumTheme?.primaryColor ?? '#0e1323';
    const requestedText = syncedPremiumTheme?.textColor ?? '#ffffff';
    const text = resolveReadableTextColor(requestedText, primary);
    const onAccent = resolveReadableTextColor(requestedText, accent);
    const { r, g, b } = hexToRgb(accent);
    const glow = syncedPremiumTheme
      ? 0.08 + (syncedPremiumTheme.glowStrength / 100) * 0.24
      : 0.08;

    return {
      '--player-accent': accent,
      '--player-accent-2': accent,
      '--player-primary': primary,
      '--player-text': text,
      '--player-on-accent': onAccent,
      '--player-accent-rgb': `${r}, ${g}, ${b}`,
      '--player-border': `rgba(${r}, ${g}, ${b}, ${syncedPremiumTheme ? 0.30 : 0.18})`,
      '--player-shadow': `0 34px 110px rgba(0,0,0,.56), 0 0 70px rgba(${r},${g},${b},${glow})`,
    } as CSSProperties;
  }, [syncedPremiumTheme]);

  useEffect(() => {
    let active = true;

    const loadPremiumStudio = () => {
      void fetch('/api/premium/studio', { cache: 'no-store' })
        .then(async (response) => {
          if (response.status === 401 || response.status === 403) return null;
          if (!response.ok) return null;
          return (await response.json()) as PremiumStudioResponse;
        })
        .then((payload) => {
          if (!active) return;
          if (payload?.allowed && payload.settings?.syncPlayerTheme) {
            setPremiumStudio(payload.settings);
          } else {
            setPremiumStudio(null);
          }
        })
        .catch(() => {
          if (active) setPremiumStudio(null);
        });
    };

    loadPremiumStudio();
    window.addEventListener('animebox:premium-studio-updated', loadPremiumStudio);
    window.addEventListener('animebox:entitlements-changed', loadPremiumStudio);

    return () => {
      active = false;
      window.removeEventListener('animebox:premium-studio-updated', loadPremiumStudio);
      window.removeEventListener('animebox:entitlements-changed', loadPremiumStudio);
    };
  }, []);

  useEffect(() => {
    let active = true;
    resumeAppliedRef.current = false;
    localProgressRef.current = null;
    lastLocalProgressSavedAtRef.current = 0;
    playbackQualifiedRef.current = false;

    if (!animeId) {
      queueMicrotask(() => {
        if (active) setResumeSeconds(0);
      });

      return () => {
        active = false;
      };
    }

    const localProgress = watchTogetherMode
      ? null
      : getWatchProgress(animeId, episodeNumber);

    const localPosition =
      localProgress &&
      localProgress.currentTime >= LOCAL_RESUME_MIN_SECONDS &&
      (localProgress.duration <= 0 ||
        localProgress.duration - localProgress.currentTime >
          LOCAL_RESUME_END_GUARD_SECONDS)
        ? Math.floor(localProgress.currentTime)
        : 0;

    if (localProgress && localPosition <= 0) {
      removeWatchProgress(animeId, episodeNumber);
    }

    queueMicrotask(() => {
      if (active) setResumeSeconds(localPosition);
    });

    // Guest resume is intentionally local-only. It must not create server
    // watch-time, achievements or leaderboard credit before registration.
    if (authLoading || !user?.id) {
      return () => {
        active = false;
      };
    }

    fetch(`/api/watch?animeId=${encodeURIComponent(String(animeId))}&episode=${encodeURIComponent(String(episodeNumber))}`, {
      method: 'GET',
      cache: 'no-store',
    })
      .then(async (response) => {
        if (!response.ok) return null;
        return (await response.json()) as WatchStateResponse;
      })
      .then((payload) => {
        if (!active || !payload?.state) return;

        const parsedServerUpdatedAt = payload.state.watchedAt
          ? Date.parse(payload.state.watchedAt)
          : 0;
        const serverUpdatedAt = Number.isFinite(parsedServerUpdatedAt)
          ? parsedServerUpdatedAt
          : 0;
        const localUpdatedAt = localProgress?.updatedAt ?? 0;

        // A position saved while the visitor was a guest is the freshest
        // source until authenticated tracking has produced a newer state.
        if (localPosition > 0 && localUpdatedAt > serverUpdatedAt) {
          return;
        }

        if (payload.state.completed) {
          if (!watchTogetherMode) {
            removeWatchProgress(animeId, episodeNumber);
          }
          setResumeSeconds(0);
          return;
        }

        const positionSeconds = Math.floor(payload.state.positionMs / 1000);
        const durationSeconds =
          payload.state.durationMs == null
            ? null
            : Math.floor(payload.state.durationMs / 1000);

        const serverHasResume =
          positionSeconds >= LOCAL_RESUME_MIN_SECONDS &&
          (
            durationSeconds == null ||
            durationSeconds - positionSeconds >
              LOCAL_RESUME_END_GUARD_SECONDS
          );

        if (!serverHasResume) {
          // The authenticated state is newer and explicitly says there is no
          // useful resume point. Do not leave an older guest position active.
          if (!watchTogetherMode) {
            removeWatchProgress(animeId, episodeNumber);
          }
          setResumeSeconds(0);
          return;
        }

        if (!watchTogetherMode) {
          removeWatchProgress(animeId, episodeNumber);
        }
        setResumeSeconds(positionSeconds);
      })
      .catch(() => undefined);

    return () => {
      active = false;
    };
  }, [animeId, authLoading, episodeNumber, user?.id, watchTogetherMode]);

  useEffect(() => {
    const flushLocalProgress = () => {
      const latest = localProgressRef.current;
      if (!latest) return;

      persistGuestProgress(
        {
          positionSeconds: latest.positionSeconds,
          durationSeconds: latest.durationSeconds,
        },
        true,
      );
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        flushLocalProgress();
      }
    };

    window.addEventListener('pagehide', flushLocalProgress);
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      flushLocalProgress();
      window.removeEventListener('pagehide', flushLocalProgress);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [persistGuestProgress]);

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
    const telegram = window.Telegram?.WebApp;
    const platform = telegram?.platform?.toLowerCase() || '';
    const isTelegramAndroid = Boolean(
      telegram?.initData &&
        (platform === 'android' || platform.startsWith('android_')),
    );

    const timer = window.setTimeout(() => {
      setTelegramAndroidMiniApp(isTelegramAndroid);
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!theaterMode) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [theaterMode]);

  useEffect(() => {
    if (!telegramPseudoFullscreen) return;

    const telegram = window.Telegram?.WebApp;
    const root = document.documentElement;
    const body = document.body;
    const previousBodyOverflow = body.style.overflow;
    const previousBodyOverscroll = body.style.overscrollBehavior;
    const previousRootOverflow = root.style.overflow;

    body.style.overflow = 'hidden';
    body.style.overscrollBehavior = 'none';
    root.style.overflow = 'hidden';
    root.classList.add('animebox-player-telegram-fullscreen');

    telegramWasFullscreenRef.current = Boolean(telegram?.isFullscreen);
    telegramFullscreenOwnedRef.current = false;
    telegramOrientationOwnedRef.current = false;
    telegramVerticalSwipesWereEnabledRef.current =
      typeof telegram?.isVerticalSwipesEnabled === 'boolean'
        ? telegram.isVerticalSwipesEnabled
        : null;

    try {
      telegram?.expand();

      // Disable Telegram's own vertical collapse gesture only while the
      // player occupies the whole Mini App. Normal pages keep vertical swipes
      // enabled so document scrolling continues to work on Android.
      telegram?.disableVerticalSwipes?.();

      if (!telegramWasFullscreenRef.current && telegram?.requestFullscreen) {
        telegram.requestFullscreen();
        telegramFullscreenOwnedRef.current = true;
      }

      // Telegram can only lock the CURRENT orientation. Lock it only when the
      // viewer already rotated the phone to landscape; never trap portrait.
      if (
        window.innerWidth > window.innerHeight &&
        telegram?.lockOrientation &&
        !telegram.isOrientationLocked
      ) {
        telegram.lockOrientation();
        telegramOrientationOwnedRef.current = true;
      }
    } catch (error) {
      // The CSS layer below is the actual Android fallback, so a Telegram SDK
      // failure must not prevent the viewer from getting a full player surface.
      console.warn('[AnimePlayer] Telegram fullscreen request failed:', error);
    }

    return () => {
      body.style.overflow = previousBodyOverflow;
      body.style.overscrollBehavior = previousBodyOverscroll;
      root.style.overflow = previousRootOverflow;
      root.classList.remove('animebox-player-telegram-fullscreen');

      try {
        // Undo only the gesture change AnimeBox made for pseudo-fullscreen.
        // If Telegram already had vertical swipes disabled, keep that state.
        if (telegramVerticalSwipesWereEnabledRef.current !== false) {
          telegram?.enableVerticalSwipes?.();
        }

        if (telegramOrientationOwnedRef.current) {
          telegram?.unlockOrientation?.();
        }

        if (
          telegramFullscreenOwnedRef.current &&
          !telegramWasFullscreenRef.current
        ) {
          telegram?.exitFullscreen?.();
        }
      } catch (error) {
        console.warn('[AnimePlayer] Telegram fullscreen cleanup failed:', error);
      } finally {
        telegramFullscreenOwnedRef.current = false;
        telegramOrientationOwnedRef.current = false;
        telegramVerticalSwipesWereEnabledRef.current = null;
      }
    };
  }, [telegramPseudoFullscreen]);

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

  const setSourceStatus = useCallback((sourceName: string | undefined, status: SourceLoadState) => {
    const key = sourceName?.trim() || 'Источник';
    setSourceStatuses((current) => {
      if (current[key] === status) return current;
      return { ...current, [key]: status };
    });
  }, []);

  const markPlayerReady = useCallback(() => {
    setPlayerReady(true);
    setPlayerError(null);
    setPlayerFailureKind(null);
    setSourceStatus(currentSource?.name, 'ready');
  }, [currentSource?.name, setSourceStatus]);

  const findFallbackCandidate = useCallback(() => {
    if (sources.length < 2) return null;

    const preferredTranslation = normalizePreferenceValue(currentTranslation?.title);

    for (let offset = 1; offset <= sources.length; offset += 1) {
      const sourceIndex = (activeSourceIndex + offset) % sources.length;
      if (sourceIndex === activeSourceIndex) continue;

      const source = sources[sourceIndex];
      if (!source?.translations?.length) continue;

      const matchingIndex = preferredTranslation
        ? source.translations.findIndex(
            (translation) =>
              normalizePreferenceValue(translation.title) === preferredTranslation,
          )
        : -1;
      const translationIndex = matchingIndex >= 0 ? matchingIndex : 0;
      const translation = source.translations[translationIndex];
      if (!translation?.url?.trim()) continue;

      const candidateKey = [
        source.name || 'direct',
        translation.title || String(translationIndex),
        normalizeMediaLink(translation.url),
      ].join('::');

      if (failedCandidatesRef.current.has(candidateKey)) continue;

      return { sourceIndex, translationIndex, source, candidateKey };
    }

    return null;
  }, [activeSourceIndex, currentTranslation?.title, sources]);

  const switchToFallback = useCallback((failureMessage: string) => {
    const fallback = findFallbackCandidate();
    if (!fallback) return false;

    const from = currentSourceName;
    const to = sourceLabel(fallback.source.name);

    setActiveSourceIndex(fallback.sourceIndex);
    setActiveTranslationIndex(fallback.translationIndex);
    setPlayerReady(false);
    setPlayerError(null);
    setPlayerFailureKind(null);
    setPlayerAttempt((current) => current + 1);
    setSourceStatus(fallback.source.name, 'loading');
    setSourceNotice(`${failureMessage} Переключили ${from} → ${to}.`);

    return true;
  }, [currentSourceName, findFallbackCandidate, setSourceStatus]);

  const failCurrentSource = useCallback((kind: PlayerFailureKind, message: string) => {
    failedCandidatesRef.current.add(currentCandidateKey);
    setPlayerReady(false);
    setSourceStatus(currentSource?.name, kind);

    const reason = kind === 'timeout'
      ? `${currentSourceName} не ответил вовремя.`
      : `${currentSourceName} не удалось запустить.`;

    if (switchToFallback(reason)) return;

    setPlayerFailureKind(kind);
    setPlayerError(message);
  }, [currentCandidateKey, currentSource?.name, currentSourceName, setSourceStatus, switchToFallback]);

  const retryCurrentSource = useCallback(() => {
    failedCandidatesRef.current.delete(currentCandidateKey);
    setPlayerError(null);
    setPlayerFailureKind(null);
    setPlayerReady(false);
    setSourceNotice(null);
    setSourceStatus(currentSource?.name, 'loading');
    setPlayerAttempt((current) => current + 1);
  }, [currentCandidateKey, currentSource?.name, setSourceStatus]);

  useEffect(() => {
    if (!sourceNotice) return;

    const timer = window.setTimeout(() => setSourceNotice(null), SOURCE_SWITCH_NOTICE_MS);
    return () => window.clearTimeout(timer);
  }, [sourceNotice]);

  useEffect(() => {
    if (!started || !videoLink || playerReady || playerError) return;

    const timer = window.setTimeout(() => {
      failCurrentSource(
        'timeout',
        'Источник слишком долго загружался. Попробуйте повторить или выбрать другой источник.',
      );
    }, PLAYER_READY_TIMEOUT_MS);

    return () => window.clearTimeout(timer);
  }, [
    currentCandidateKey,
    failCurrentSource,
    playerAttempt,
    playerError,
    playerReady,
    started,
    videoLink,
  ]);

  useEffect(() => {
    if (!started || !playerError) return;
    if (!failedCandidatesRef.current.has(currentCandidateKey)) return;

    // A fallback provider may arrive after the first source has already failed.
    // Retry the automatic switch whenever the parent publishes new sources.
    switchToFallback(`${currentSourceName} недоступен.`);
  }, [
    currentCandidateKey,
    currentSourceName,
    playerError,
    sources,
    started,
    switchToFallback,
  ]);

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
      failCurrentSource('error', 'Не удалось воспроизвести HLS-поток.');
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
        markPlayerReady();
        void video.play().catch(() => undefined);
      });

      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (!data.fatal) return;

        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
          hls?.startLoad();
        } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
          hls?.recoverMediaError();
        } else {
          failCurrentSource('error', data.details || 'Ошибка HLS-потока.');
          hls?.destroy();
        }
      });
    } else {
      window.setTimeout(() => {
        failCurrentSource('error', 'Этот браузер не поддерживает HLS.');
      }, 0);
    }

    return () => {
      video.removeEventListener('error', onVideoError);
      hls?.destroy();
    };
  }, [failCurrentSource, isHls, markPlayerReady, playerAttempt, started, videoLink]);

  function selectSource(index: number) {
    if (!Number.isSafeInteger(index) || index < 0 || index >= sources.length) return;

    if (index === activeSourceIndex && playerError) {
      retryCurrentSource();
      return;
    }

    const source = sources[index];
    const rememberedTitle = source ? readTranslationPreference(animeId, source.name) : null;
    const rememberedValue = normalizePreferenceValue(rememberedTitle || undefined);
    const rememberedIndex = rememberedValue
      ? source?.translations.findIndex(
          (translation) => normalizePreferenceValue(translation.title) === rememberedValue,
        ) ?? -1
      : -1;

    setActiveSourceIndex(index);
    setActiveTranslationIndex(rememberedIndex >= 0 ? rememberedIndex : 0);
    setPlayerError(null);
    setPlayerFailureKind(null);
    setSourceNotice(null);
    setPlayerReady(false);
    setSourceStatus(source?.name, started ? 'loading' : 'idle');
    setPlayerAttempt((current) => current + 1);
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
    setPlayerFailureKind(null);
    setSourceNotice(null);
    setPlayerReady(false);
    setSourceStatus(source.name, started ? 'loading' : 'idle');
    setPlayerAttempt((current) => current + 1);
  }

  function selectEpisode(id: string) {
    const nextEpisode = Number(id);
    if (!Number.isSafeInteger(nextEpisode) || nextEpisode < 1) return;
    if (nextEpisode === episodeNumber) return;

    onEpisodeChange?.(nextEpisode);
  }

  function startPlayback() {
    setPlayerError(null);
    setPlayerFailureKind(null);
    setSourceNotice(null);
    if (!playerReady) setSourceStatus(currentSource?.name, 'loading');

    /*
     * Kodik is preloaded behind the AnimeBox cover. Sending play from the
     * original click keeps the provider start inside the same user gesture,
     * so the viewer does not have to press Kodik's play button a second time.
     */
    if (isKodik) {
      const player = kodikPlayerRef.current;
      player?.play();
      const state = player?.getState();
      publishPartyAction('play', state?.positionSeconds ?? 0, true);
      publishPartyState({
        position: state?.positionSeconds ?? 0,
        duration: state?.durationSeconds ?? null,
        playing: true,
      });
      setStarted(true);
      return;
    }

    setPlayerReady(false);
    setStarted(true);
  }

  async function toggleFullscreen() {
    /*
     * Telegram Android WebView can reject native DOM/iframe fullscreen even
     * when the same player works in Chrome. In that environment we make the
     * Mini App fullscreen and pin the AnimeBox viewport over the whole WebView.
     * Playback is NOT remounted, so Kodik/HLS position is preserved.
     */
    if (telegramAndroidMiniApp) {
      setTelegramPseudoFullscreen((current) => !current);
      return;
    }

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

  const fullscreenActive = fullscreen || telegramPseudoFullscreen;

  const playerBody = (
    <section
      style={brandStyles}
      className={`animebox-premium-player ${watchTogetherMode ? 'watch-together-player' : ''} ${syncedPremiumTheme ? 'is-premium-themed' : ''} relative overflow-visible rounded-[28px] border border-[color:var(--player-border)] bg-[linear-gradient(180deg,rgba(14,19,35,.985),rgba(6,9,18,.99))] [box-shadow:var(--player-shadow)] ${
        theaterMode ? 'mx-auto w-full max-w-[1480px]' : ''
      }`}
    >
      <div className="premium-player-accent-line pointer-events-none absolute inset-x-20 top-0 h-px bg-gradient-to-r from-transparent via-violet-400/70 to-transparent" />
      <div className="premium-player-glow pointer-events-none absolute -inset-12 -z-10 bg-[radial-gradient(ellipse_at_center,rgba(121,78,255,.16),transparent_65%)] blur-3xl" />

      {/* Premium header */}
      <div
        className={`${
          watchTogetherMode ? 'watch-together-player-header' : ''
        } flex flex-col gap-5 border-b border-white/[0.055] px-4 py-4 sm:px-5 md:flex-row md:items-end md:justify-between md:px-6 md:py-5`}
      >
        {!watchTogetherMode && (
          <div className="min-w-0">
            <div className="mb-2 flex items-center gap-2">
              <span className="premium-player-dot h-1.5 w-1.5 rounded-full bg-violet-400 shadow-[0_0_14px_rgba(167,139,250,.95)]" />
              <span className="premium-player-accent-text text-[9px] font-extrabold uppercase tracking-[0.2em] text-violet-300/65">
                AnimeBox Cinema
              </span>
            </div>

            <h1 className="truncate text-base font-black tracking-[-0.025em] text-white sm:text-lg md:text-xl">
              {title}
            </h1>
            <p className="mt-1 text-xs font-semibold text-white/35">{episodeMeta}</p>
          </div>
        )}

        <div className={`anime-player__toolbar ${watchTogetherMode ? 'watch-together-player-toolbar' : ''} flex flex-wrap items-center gap-2`}>
          {sources.length > 1 && (
            <div className="flex items-center rounded-2xl border border-white/[0.07] bg-black/20 p-1">
              {sources.map((source, index) => {
                const active = activeSourceIndex === index;
                const status = sourceStatuses[source.name] || 'idle';

                return (
                  <button
                    key={`${source.name}-${index}`}
                    type="button"
                    onClick={() => selectSource(index)}
                    className={`premium-player-source ${active ? 'is-active' : ''} rounded-xl px-3.5 py-2 text-[11px] font-extrabold transition-all duration-200 ${
                      active
                        ? 'bg-gradient-to-r from-violet-600 to-indigo-500 text-white shadow-[0_8px_26px_rgba(105,72,255,.30)]'
                        : 'text-white/40 hover:bg-white/[0.05] hover:text-white/75'
                    }`}
                  >
                    <span className="inline-flex items-center gap-1.5">
                      <span
                        aria-hidden="true"
                        className={`h-1.5 w-1.5 rounded-full ${
                          status === 'ready'
                            ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,.65)]'
                            : status === 'loading'
                              ? 'animate-pulse bg-violet-300'
                              : status === 'timeout'
                                ? 'bg-amber-400'
                                : status === 'error'
                                  ? 'bg-red-400'
                                  : 'bg-white/20'
                        }`}
                      />
                      {sourceLabel(source.name)}
                    </span>
                  </button>
                );
              })}
            </div>
          )}


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

          {!watchTogetherMode && (
            <button
              type="button"
              onClick={() => setTheaterMode((current) => !current)}
              className="premium-player-toolbar-button inline-flex h-10 items-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.025] px-3.5 text-[11px] font-bold text-white/55 transition hover:border-violet-400/20 hover:bg-violet-500/[0.07] hover:text-white"
            >
              <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" aria-hidden="true">
                <path d="M4 7h16v10H4z" stroke="currentColor" strokeWidth="1.7" />
                <path d="M8 20h8M12 17v3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
              </svg>
              <span className="hidden sm:inline">{theaterMode ? 'Обычный режим' : 'Кинотеатр'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => void toggleFullscreen()}
            className="premium-player-toolbar-button inline-flex h-10 items-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.025] px-3.5 text-[11px] font-bold text-white/55 transition hover:border-violet-400/20 hover:bg-violet-500/[0.07] hover:text-white"
          >
            <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" aria-hidden="true">
              <path d="M8 4H4v4M16 4h4v4M8 20H4v-4M16 20h4v-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="hidden sm:inline">{fullscreenActive ? 'Выйти из полного экрана' : 'Полный экран'}</span>
          </button>
        </div>
      </div>

      {/* Player shell */}
      <div
        className={`relative bg-[radial-gradient(circle_at_50%_0%,rgba(98,68,190,.10),transparent_48%)] p-2.5 sm:p-3.5 md:p-4 ${
          watchTogetherMode ? 'watch-together-player-stage-shell' : ''
        }`}
      >
        {sourceNotice && (
          <div
            role="status"
            className="mb-2.5 flex items-center gap-2 rounded-xl border border-violet-400/15 bg-violet-500/[0.07] px-3 py-2 text-[11px] font-semibold text-violet-100/80 sm:mb-3"
          >
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-violet-300 shadow-[0_0_9px_rgba(196,181,253,.55)]" />
            <span>{sourceNotice}</span>
          </div>
        )}

        <div
          ref={playerViewportRef}
          className={`${watchTogetherMode && !fullscreenActive ? 'watch-together-player-viewport' : ''} ${
            telegramPseudoFullscreen
              ? 'fixed inset-0 z-[2147483000] m-0 max-w-none overflow-hidden rounded-none border-0 bg-black shadow-none ring-0'
              : fullscreen
                ? 'relative h-screen w-screen overflow-hidden rounded-none border-0 bg-black'
                : 'relative aspect-video w-full overflow-hidden rounded-[22px] border border-violet-400/[0.12] bg-black shadow-[0_28px_80px_rgba(0,0,0,.55),0_0_50px_rgba(105,72,255,.055)] ring-1 ring-black/40'
          } transition-all duration-300`}
          style={
            telegramPseudoFullscreen
              ? {
                  position: 'fixed',
                  inset: 0,
                  top: 0,
                  right: 0,
                  bottom: 0,
                  left: 0,
                  width: '100vw',
                  height: 'var(--animebox-tg-stable-height, 100dvh)',
                  maxWidth: 'none',
                  margin: 0,
                  zIndex: 2147483000,
                }
              : undefined
          }
        >
          {isKodik && videoLink && (
            <KodikPlayer
              ref={kodikPlayerRef}
              key={`${videoLink}:${episodeNumber}:${playerAttempt}`}
              src={videoLink}
              title={`${title} — серия ${episodeNumber}`}
              episodeNumber={episodeNumber}
              resumeSeconds={resumeSeconds}
              onReady={markPlayerReady}
              onError={() =>
                failCurrentSource('error', 'Kodik не удалось загрузить. Попробуйте другой источник.')
              }
              onTimeUpdate={handleTimeSample}
              onPlaybackAction={(event) => {
                const state = kodikPlayerRef.current?.getState();
                publishPartyAction(
                  event.action,
                  event.positionSeconds,
                  event.action === 'play' ? true : event.action === 'pause' ? false : state?.playing ?? false,
                );
              }}
              onPlaybackState={(event) => {
                publishPartyState({
                  position: event.positionSeconds,
                  duration: event.durationSeconds,
                  playing: event.playing,
                });
              }}
              onProviderSkip={watchSession.onProviderSkip}
              onEnded={handlePlaybackEnded}
            />
          )}

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
              onClick={startPlayback}
              className="group absolute inset-0 z-30 isolate overflow-hidden text-white"
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
                  <span className="premium-player-play-button relative flex h-[86px] w-[86px] items-center justify-center rounded-full border border-white/20 bg-gradient-to-br from-violet-500 via-violet-600 to-indigo-600 shadow-[0_20px_65px_rgba(105,72,255,.48),inset_0_1px_0_rgba(255,255,255,.28)] transition duration-300 group-hover:scale-105">
                    <Icon name="play" className="ml-1 h-9 w-9 text-white" />
                  </span>
                </div>

                <p className="premium-player-accent-text text-[10px] font-extrabold uppercase tracking-[0.22em] text-violet-200/70">AnimeBox Player</p>
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

              {!isKodik && (
                isIframe ? (
                  <iframe
                    key={`${videoLink}:${playerAttempt}`}
                    src={videoLink}
                    width="100%"
                    height="100%"
                    className="absolute inset-0 h-full w-full border-0"
                    allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
                    allowFullScreen
                    title="Anime player"
                    onLoad={markPlayerReady}
                    onError={() =>
                      failCurrentSource('error', 'Внешний плеер не удалось загрузить.')
                    }
                  />
                ) : (
                  <video
                    ref={videoRef}
                    key={`${videoLink}:${playerAttempt}`}
                    className="absolute inset-0 h-full w-full bg-black object-contain"
                    controls
                    autoPlay
                    playsInline
                    muted={false}
                    poster={poster || undefined}
                    preload="auto"
                    src={!isHls ? videoLink : undefined}
                    onCanPlay={markPlayerReady}
                    onError={() => {
                      if (!isHls) {
                        failCurrentSource('error', 'Видео не удалось загрузить.')
                      }
                    }}
                    onEnded={handlePlaybackEnded}
                    onTimeUpdate={(event) => {
                      const video = event.currentTarget;
                      const duration =
                        Number.isFinite(video.duration) && video.duration > 0
                          ? video.duration
                          : null;
                      handleTimeSample({
                        positionSeconds: video.currentTime,
                        durationSeconds: duration,
                        origin: window.location.origin,
                      });
                      publishPartyState({
                        position: video.currentTime,
                        duration,
                        playing: !video.paused && !video.ended,
                      });
                    }}
                    onPlay={(event) => {
                      const video = event.currentTarget;
                      publishPartyAction('play', video.currentTime, true);
                    }}
                    onPause={(event) => {
                      const video = event.currentTarget;
                      if (!video.ended) publishPartyAction('pause', video.currentTime, false);
                    }}
                    onSeeked={(event) => {
                      const video = event.currentTarget;
                      publishPartyAction('seek', video.currentTime, !video.paused && !video.ended);
                    }}
                  >
                    Ваш браузер не поддерживает воспроизведение видео.
                  </video>
                )
              )}
            </>
          )}

          {telegramAndroidMiniApp && started && videoLink && (
            <button
              type="button"
              onClick={() => void toggleFullscreen()}
              className="absolute right-3 top-3 z-[70] inline-flex h-10 items-center gap-2 rounded-xl border border-white/15 bg-black/65 px-3 text-[11px] font-extrabold text-white shadow-[0_12px_36px_rgba(0,0,0,.45)] backdrop-blur-md transition active:scale-95"
              aria-label={
                telegramPseudoFullscreen
                  ? 'Выйти из полного экрана'
                  : 'Открыть плеер на весь экран'
              }
            >
              {telegramPseudoFullscreen ? (
                <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" aria-hidden="true">
                  <path d="M7 7l10 10M17 7 7 17" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" aria-hidden="true">
                  <path d="M8 4H4v4M16 4h4v4M8 20H4v-4M16 20h4v-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
              <span className="hidden min-[390px]:inline">
                {telegramPseudoFullscreen ? 'Выйти' : 'На весь экран'}
              </span>
            </button>
          )}

          {playerError && (
            <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/85 p-5 text-center backdrop-blur-md">
              <div className="w-full max-w-md rounded-2xl border border-white/[0.10] bg-[#0b0f1b]/95 p-5 shadow-[0_24px_70px_rgba(0,0,0,.55)]">
                <div className={`mx-auto flex h-11 w-11 items-center justify-center rounded-2xl border ${
                  playerFailureKind === 'timeout'
                    ? 'border-amber-400/20 bg-amber-500/10 text-amber-200'
                    : 'border-red-400/20 bg-red-500/10 text-red-200'
                }`}>
                  !
                </div>
                <p className="mt-3 text-sm font-extrabold text-white">
                  {playerFailureKind === 'timeout' ? 'Источник не ответил' : 'Не удалось запустить видео'}
                </p>
                <p className="mt-1.5 text-xs leading-5 text-white/45">{playerError}</p>
                <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-center">
                  <button
                    type="button"
                    onClick={retryCurrentSource}
                    className="inline-flex min-h-10 items-center justify-center rounded-xl bg-gradient-to-r from-violet-600 to-indigo-500 px-4 text-xs font-extrabold text-white shadow-[0_10px_28px_rgba(105,72,255,.22)] transition hover:-translate-y-px"
                  >
                    Повторить
                  </button>
                  {sources.length > 1 && (
                    <button
                      type="button"
                      onClick={() => {
                        const fallback = findFallbackCandidate();
                        if (fallback) {
                          setActiveSourceIndex(fallback.sourceIndex);
                          setActiveTranslationIndex(fallback.translationIndex);
                          setPlayerError(null);
                          setPlayerFailureKind(null);
                          setPlayerReady(false);
                          setSourceStatus(fallback.source.name, 'loading');
                          setPlayerAttempt((current) => current + 1);
                        } else {
                          const nextIndex = (activeSourceIndex + 1) % sources.length;
                          failedCandidatesRef.current.clear();
                          selectSource(nextIndex);
                        }
                      }}
                      className="inline-flex min-h-10 items-center justify-center rounded-xl border border-white/[0.09] bg-white/[0.04] px-4 text-xs font-bold text-white/65 transition hover:bg-white/[0.07] hover:text-white"
                    >
                      Другой источник
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bottom navigation */}
      <div className={`${watchTogetherMode ? 'watch-together-player-nav' : ''} grid grid-cols-2 gap-2 border-t border-white/[0.05] bg-black/10 p-3 sm:grid-cols-[minmax(0,1fr)_minmax(170px,230px)_minmax(0,1fr)] sm:items-center sm:px-4 md:p-4 md:px-5`}>
        <button
          type="button"
          onClick={onPrev}
          disabled={!hasPrev}
          className="group inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.025] px-4 text-xs font-bold text-white/55 transition hover:border-white/[0.12] hover:bg-white/[0.05] hover:text-white disabled:cursor-not-allowed disabled:opacity-25"
        >
          <Icon name="chevron" className="h-4 w-4 rotate-180 transition-transform group-hover:-translate-x-0.5" />
          {prevLabel}
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
          className="premium-player-next-button group inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-500 px-4 text-xs font-extrabold text-white shadow-[0_10px_30px_rgba(105,72,255,.25)] transition hover:-translate-y-px hover:shadow-[0_15px_38px_rgba(105,72,255,.34)] disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:translate-y-0"
        >
          {nextLabel}
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
    <div
      className={`relative isolate w-full ${watchTogetherMode ? 'watch-together-player-root h-full min-h-0' : ''} ${theaterMode ? 'z-[10001]' : ''}`}
    >
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
            : watchTogetherMode
              ? 'watch-together-player-mount h-full min-h-0'
              : ''
        }
      >
        {playerBody}
      </div>
    </div>
  );
}
