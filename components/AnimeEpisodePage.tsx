'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import EpisodeComments from '@/components/EpisodeComments';
import LibraryStatusControl from '@/components/LibraryStatusControl';
import AdSlot from '@/components/monetization/AdSlot';
import AnimeNotificationControl from '@/components/AnimeNotificationControl';
import type { Anime } from '@/types/anime';
import {
  addAnimeToList,
  getAnimeProgress,
  recordAnimeView,
  setAnimeProgress,
} from '@/lib/anime-storage';
import { cleanShikimoriDescription } from '@/lib/shikimori-text';
import { getAnimeTitle } from '@/lib/anime-display';
import {
  getEpisodeAvailability,
  peekEpisodeAvailability,
} from '@/lib/episode-availability-client';
import type { EpisodeAvailabilityResponse } from '@/types/episode-availability';
import type { EpisodeTimelineMeta, EpisodeTimelineResponse } from '@/types/episode-timeline';
import { timelineDurationMatchesObserved } from '@/lib/episode-timeline-safety';

import EpisodeCompletion from '@/components/EpisodeCompletion';
import AnimePlayer, { PlayerSource } from '@/components/AnimePlayer';
import WatchPartyPanel from '@/components/watch-party/WatchPartyPanel';
import theaterStyles from '@/components/watch-party/WatchTogetherTheater.module.css';
import {
  WATCH_PARTY_EPISODE_CHANGE_EVENT,
  WATCH_PARTY_EXIT_EVENT,
  type WatchPartyEpisodeChangeDetail,
} from '@/lib/watch-party';
import { trackProductClientEvent } from '@/lib/product-events-client';
import AnimeImage from '@/components/AnimeImage';
import EpisodeList from '@/components/EpisodeList';
import type { EpisodeSeasonTab, EpisodeSeasonsResponse } from '@/types/episode-seasons';
import type { PlayerProviderKey, PlayerSourcePolicyResponse } from '@/types/player-source-policy';

type SourceApiResponse = {
  episodes?: number[];
  hls?: Array<{
    title: string;
    url: string;
    type?: 'hls';
  }>;
  externalPlayer?: string | null;
  reason?: string;
  error?: string;
  message?: string;
};


const DIRECT_PLAYER_ENABLED = process.env.NEXT_PUBLIC_DIRECT_PLAYER_ENABLED === 'true';

type DirectSourceApiResponse = {
  enabled?: boolean;
  provider?: string;
  streams?: Array<{
    title: string;
    url: string;
    type: 'hls' | 'video';
    quality?: string | null;
  }>;
  reason?: string;
  message?: string;
};
type KodikApiResponse = {
  name?: string;
  translations?: Array<{
    title: string;
    url: string;
    type?: 'kodik';
  }>;
  status?: 'available' | 'unavailable' | 'unknown';
  maxEpisode?: number | null;
  error?: string;
  reason?: string;
  message?: string;
};

export default function AnimeEpisodePage({ anime, requestedEpisode, theaterMode = false }: { anime: Anime; requestedEpisode: number; theaterMode?: boolean }) {
  const router = useRouter();
  const animeIdParam = anime.slug as string;
  const [theaterChatOpen, setTheaterChatOpen] = useState(false);
  const [watchedUpTo, setWatchedUpTo] = useState(0);
  const [providerEpisodes, setProviderEpisodes] = useState<number[]>([]);
  const [sources, setSources] = useState<PlayerSource[]>([]);
  const [loadingSources, setLoadingSources] = useState(false);
  const [sourceMessage, setSourceMessage] = useState('');
  const [sourceIdentity, setSourceIdentity] = useState('');
  const [seasonNavigation, setSeasonNavigation] = useState<EpisodeSeasonsResponse | null>(null);
  const [episodeAvailability, setEpisodeAvailability] =
    useState<EpisodeAvailabilityResponse | null>(
      () => peekEpisodeAvailability(anime.id),
    );
  const [timeline, setTimeline] = useState<EpisodeTimelineMeta | null>(null);
  const timelineRequestSequenceRef = useRef(0);
  const timelineAbortRef = useRef<AbortController | null>(null);
  const observedTimelineDurationRef = useRef<number | null>(null);

  const metadataEpisodes = Math.max(anime.episodes || 0, anime.episodesAired || 0) || null;
  const providerMaxEpisode = providerEpisodes.length
    ? Math.max(...providerEpisodes)
    : null;
  const availableEpisodes =
    episodeAvailability?.status === 'available'
      ? episodeAvailability.maxEpisode
      : episodeAvailability?.status === 'unavailable'
        ? null
        : providerMaxEpisode || metadataEpisodes;

  const totalEpisodesKnown = Boolean(
    anime?.episodes && anime.episodes > 0,
  );

  const episodeNumber = useMemo(() => {
    if (!Number.isSafeInteger(requestedEpisode) || requestedEpisode < 1) {
      return 1;
    }

    return requestedEpisode;
  }, [requestedEpisode]);

  const requestEpisodeTimeline = useCallback(
    (durationSeconds?: number | null) => {
      timelineAbortRef.current?.abort();

      const controller = new AbortController();
      timelineAbortRef.current = controller;
      const requestSequence = ++timelineRequestSequenceRef.current;

      const params = new URLSearchParams({
        animeId: String(anime.id),
        episode: String(episodeNumber),
      });

      if (
        durationSeconds != null &&
        Number.isFinite(durationSeconds) &&
        durationSeconds > 0
      ) {
        params.set(
          'durationSeconds',
          String(Math.max(1, Math.round(durationSeconds))),
        );
      }

      return fetch(`/api/episodes/timeline?${params.toString()}`, {
        signal: controller.signal,
        cache: 'no-store',
      })
        .then(async (response) => {
          if (!response.ok) return null;
          return (await response.json()) as EpisodeTimelineResponse;
        })
        .then((payload) => {
          if (
            controller.signal.aborted ||
            requestSequence !== timelineRequestSequenceRef.current ||
            !payload?.ok
          ) {
            return;
          }

          setTimeline(payload.timeline);
        })
        .catch((error) => {
          if (controller.signal.aborted) return;
          console.warn('[Episode Timeline] metadata unavailable:', error);
        });
    },
    [anime.id, episodeNumber],
  );

  useEffect(() => {
    observedTimelineDurationRef.current = null;
    queueMicrotask(() => setTimeline(null));
    void requestEpisodeTimeline();

    return () => {
      timelineAbortRef.current?.abort();
    };
  }, [requestEpisodeTimeline]);

  const handleTimelineDurationObserved = useCallback(
    (durationSeconds: number) => {
      if (
        !Number.isFinite(durationSeconds) ||
        durationSeconds <= 0
      ) {
        return;
      }

      const roundedDuration = Math.max(
        1,
        Math.round(durationSeconds),
      );
      const previousObserved =
        observedTimelineDurationRef.current;

      if (
        previousObserved != null &&
        Math.abs(previousObserved - roundedDuration) <= 2
      ) {
        return;
      }

      observedTimelineDurationRef.current = roundedDuration;

      if (
        timeline?.lookupStatus === 'found' &&
        timelineDurationMatchesObserved(
          timeline.durationMs,
          roundedDuration,
        )
      ) {
        return;
      }

      void requestEpisodeTimeline(roundedDuration);
    },
    [requestEpisodeTimeline, timeline],
  );

  useEffect(() => {
    if (!theaterMode) return;

    document.documentElement.classList.add('animebox-watch-together-theater');
    document.body.classList.add('animebox-watch-together-theater');

    return () => {
      document.documentElement.classList.remove('animebox-watch-together-theater');
      document.body.classList.remove('animebox-watch-together-theater');
    };
  }, [theaterMode]);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const cached = peekEpisodeAvailability(anime.id);

    if (cached) {
      queueMicrotask(() => {
        if (active) setEpisodeAvailability(cached);
      });
      return () => {
        active = false;
        controller.abort();
      };
    }

    getEpisodeAvailability(anime.id, { signal: controller.signal })
      .then((data) => {
        if (active) setEpisodeAvailability(data);
      })
      .catch((error) => {
        if (!active || controller.signal.aborted) return;
        console.warn('Episode availability unavailable:', error);
        setEpisodeAvailability({
          animeId: anime.id,
          status: 'unknown',
          episodes: [],
          maxEpisode: null,
          providers: [],
        });
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [anime.id]);

  useEffect(() => {
    queueMicrotask(() => {
      setWatchedUpTo(getAnimeProgress(anime.id));
    });
  }, [anime.id, episodeNumber]);

  const handlePlaybackQualified = () => {
    addAnimeToList(anime);
    setAnimeProgress(anime.id, episodeNumber);
    recordAnimeView(anime);
    setWatchedUpTo(episodeNumber);
  };

  const expectedSourceIdentity = `${animeIdParam}:${episodeNumber}`;

  useEffect(() => {
    if (!anime) return;

    const controller = new AbortController();
    let active = true;
    let publishedAny = false;
    const publishedProviders = new Set<PlayerProviderKey>();
    let enabledProviders = new Set<PlayerProviderKey>([
      'direct',
      'kodik',
      'aniliberty',
    ]);
    let sourcePriority = new Map<PlayerProviderKey, number>([
      ['direct', 10],
      ['kodik', 20],
      ['aniliberty', 30],
    ]);
    const identity = `${animeIdParam}:${episodeNumber}`;
    const timeout = window.setTimeout(() => controller.abort(), 10_000);

    queueMicrotask(() => {
      if (!active) return;
      setLoadingSources(true);
      setSources([]);
      setSourceIdentity('');
      setSourceMessage('');
    });

    function providerKeyForSource(name: string): PlayerProviderKey {
      if (name === 'AnimeBox Direct') return 'direct';
      if (name === 'Kodik') return 'kodik';
      return 'aniliberty';
    }

    function publishSource(source: PlayerSource) {
      if (!active || controller.signal.aborted || source.translations.length === 0) {
        return;
      }

      const providerKey = providerKeyForSource(source.name);
      if (!enabledProviders.has(providerKey)) return;

      publishedAny = true;
      publishedProviders.add(providerKey);

      setSources((current) => {
        const withoutSameSource = current.filter((item) => item.name !== source.name);
        const next = [...withoutSameSource, source];

        const priority = (name: string) =>
          sourcePriority.get(providerKeyForSource(name)) ?? 999;

        return next.sort((a, b) => priority(a.name) - priority(b.name));
      });

      setSourceIdentity(identity);
      setSourceMessage('');
      setLoadingSources(false);
    }

    async function loadDirect() {
      if (!DIRECT_PLAYER_ENABLED) return false;
      const shikimoriId = anime.idMal || anime.mal_id;
      if (!shikimoriId) return false;

      try {
        const response = await fetch(
          `/api/player/direct-source?shikimoriId=${encodeURIComponent(String(shikimoriId))}&animeId=${encodeURIComponent(String(anime.id))}&season=${encodeURIComponent(String(anime.providerSeason || 1))}&episode=${encodeURIComponent(String(episodeNumber))}`,
          {
            signal: controller.signal,
            cache: 'no-store',
          },
        );

        const data = (await response.json()) as DirectSourceApiResponse;

        if (data.reason === 'copyright_restricted') {
          setSourceMessage(
            data.message ||
              'Доступ к источнику ограничен по обращению правообладателя.',
          );
          return false;
        }

        if (!response.ok || !data.enabled || !Array.isArray(data.streams) || data.streams.length === 0) {
          return false;
        }

        const translations = data.streams
          .filter((stream) => Boolean(stream?.url?.trim()))
          .map((stream) => ({
            title: stream.title || stream.quality || 'Авто',
            url: stream.url,
            type: stream.type,
          }));

        if (translations.length === 0) return false;

        publishSource({
          name: 'AnimeBox Direct',
          type: translations[0]?.type || 'hls',
          translations,
        });
        return true;
      } catch (error) {
        if (controller.signal.aborted) throw error;
        console.warn('[Direct Player] source unavailable:', error);
        return false;
      }
    }

    async function loadKodik() {
      const shikimoriId = anime.idMal || anime.mal_id;
      if (!shikimoriId) return false;

      try {
        const response = await fetch(
          `/api/players/kodik?shikimoriId=${encodeURIComponent(String(shikimoriId))}&animeId=${encodeURIComponent(String(anime.id))}&season=${encodeURIComponent(String(anime.providerSeason || 1))}&episode=${encodeURIComponent(String(episodeNumber))}`,
          {
            signal: controller.signal,
            cache: 'no-store',
          },
        );

        const data = (await response.json()) as KodikApiResponse;

        if (data.reason === 'copyright_restricted') {
          setSourceMessage(
            data.message ||
              'Доступ к источнику ограничен по обращению правообладателя.',
          );
          return false;
        }

        if (data.maxEpisode && data.maxEpisode > 0) {
          setProviderEpisodes((current) => [
            ...new Set([
              ...current,
              ...Array.from({ length: data.maxEpisode! }, (_, index) => index + 1),
            ]),
          ].sort((a, b) => a - b));
        }

        if (
          response.ok &&
          Array.isArray(data.translations) &&
          data.translations.length > 0
        ) {
          const translations = data.translations
            .filter((item) => Boolean(item?.url?.trim()))
            .map((item) => ({
              title: item.title || 'Озвучка',
              url: item.url,
              type: 'kodik' as const,
            }));

          if (translations.length > 0) {
            publishSource({
              name: 'Kodik',
              type: 'kodik',
              translations,
            });
            return true;
          }
        }

        return false;
      } catch (error) {
        if (controller.signal.aborted) throw error;
        console.warn('[Kodik] source unavailable:', error);
        return false;
      }
    }

    async function loadFallback() {
      try {
        const response = await fetch(
          `/api/anilibria?slug=${encodeURIComponent(animeIdParam)}&title=${encodeURIComponent(
            anime.title.romaji || anime.title.english || '',
          )}&season=${anime.providerSeason || 1}&episode=${episodeNumber}`,
          {
            signal: controller.signal,
            cache: 'no-store',
          },
        );

        const data = (await response.json()) as SourceApiResponse;

        if (!response.ok) {
          if (data.reason === 'copyright_restricted') {
            setSourceMessage(
              data.message ||
                'Доступ к источнику ограничен по обращению правообладателя.',
            );
          }
          return (
            data.error ||
            data.message ||
            data.reason ||
            `Источник HTTP ${response.status}`
          );
        }

        if (!active || controller.signal.aborted) return '';

        if (data.episodes?.length) {
          setProviderEpisodes((current) =>
            [...new Set([...current, ...data.episodes!])].sort((a, b) => a - b),
          );
        }

        if (data.hls?.length) {
          const translations = data.hls
            .filter((item) => Boolean(item?.url?.trim()))
            .map((item) => ({
              title: item.title || 'HLS',
              url: item.url,
              type: 'hls' as const,
            }));

          if (translations.length > 0) {
            publishSource({
              name: 'AniLiberty',
              type: 'hls',
              translations,
            });
          }
        }

        if (data.externalPlayer?.trim()) {
          publishSource({
            name: 'Внешний плеер',
            type: 'iframe',
            translations: [
              {
                title: 'Плеер',
                url: data.externalPlayer,
                type: 'iframe',
              },
            ],
          });
        }

        return data.reason || '';
      } catch (error) {
        if (controller.signal.aborted) throw error;
        console.warn('[AniLiberty] source unavailable:', error);
        return error instanceof Error ? error.message : 'Не удалось загрузить резервный источник.';
      }
    }

    async function loadSources() {
      let fallbackReason = '';

      try {
        try {
          const policyResponse = await fetch(
            `/api/player/source-policy?animeId=${encodeURIComponent(String(anime.id))}&season=${encodeURIComponent(String(anime.providerSeason || 1))}&episode=${encodeURIComponent(String(episodeNumber))}`,
            {
              signal: controller.signal,
              cache: 'no-store',
            },
          );

          if (policyResponse.ok) {
            const policy =
              (await policyResponse.json()) as PlayerSourcePolicyResponse;

            if (policy.ok && Array.isArray(policy.providers)) {
              enabledProviders = new Set(
                policy.providers
                  .filter((provider) => provider.enabled)
                  .map((provider) => provider.key),
              );
              sourcePriority = new Map(
                policy.providers.map((provider) => [
                  provider.key,
                  provider.priority,
                ]),
              );

              if (enabledProviders.size === 0) {
                const copyrightOnly = policy.providers.some(
                  (provider) =>
                    provider.reason === 'copyright_restricted',
                );

                setSourceIdentity(identity);
                setLoadingSources(false);
                setSourceMessage(
                  copyrightOnly
                    ? 'Доступ к этой серии ограничен по обращению правообладателя.'
                    : 'Источники просмотра временно недоступны. Попробуйте позже.',
                );
                return;
              }
            }
          }
        } catch (policyError) {
          if (controller.signal.aborted) throw policyError;
          console.warn('[Player Source Policy] fallback to defaults:', policyError);
        }

        /*
         * Direct Player is the preferred path only when the server-side feature
         * flag is enabled and a real direct stream is available. The endpoint
         * returns immediately while disabled, so current Kodik startup is not
         * penalized before provider terms are confirmed.
         */
        const enabledByPriority = [...enabledProviders].sort(
          (a, b) =>
            (sourcePriority.get(a) ?? 999) -
            (sourcePriority.get(b) ?? 999),
        );
        const directIsPrimary =
          enabledByPriority[0] === 'direct' &&
          enabledProviders.has('direct');

        if (directIsPrimary) {
          const directReady = await loadDirect();

          if (!active || controller.signal.aborted) return;

          if (directReady) {
            if (enabledProviders.has('kodik')) {
              void loadKodik().catch(() => undefined);
            }
            if (enabledProviders.has('aniliberty')) {
              void loadFallback().catch(() => undefined);
            }
            return;
          }
        }

        const attempts: Array<{
          key: PlayerProviderKey;
          promise: Promise<boolean | string>;
        }> = [];

        if (enabledProviders.has('direct') && !directIsPrimary) {
          attempts.push({ key: 'direct', promise: loadDirect() });
        }
        if (enabledProviders.has('kodik')) {
          attempts.push({ key: 'kodik', promise: loadKodik() });
        }
        if (enabledProviders.has('aniliberty')) {
          attempts.push({ key: 'aniliberty', promise: loadFallback() });
        }

        const settled = await Promise.allSettled(
          attempts.map((attempt) => attempt.promise),
        );

        if (!active) return;

        if (controller.signal.aborted) {
          if (!publishedAny) {
            setSourceIdentity(identity);
            setLoadingSources(false);
            setSourceMessage(
              'Проверка источников заняла слишком много времени. Попробуйте ещё раз.',
            );
          }
          return;
        }

        const aniIndex = attempts.findIndex(
          (attempt) => attempt.key === 'aniliberty',
        );
        const aniResult = aniIndex >= 0 ? settled[aniIndex] : null;

        fallbackReason =
          aniResult?.status === 'fulfilled' &&
          typeof aniResult.value === 'string'
            ? aniResult.value
            : '';

        if (publishedAny || publishedProviders.size > 0) {
          return;
        }

        setSourceIdentity(identity);
        setLoadingSources(false);
        setSourceMessage((current) => {
          if (current) return current;
          if (fallbackReason === 'copyright_restricted') {
            return 'Доступ к этой серии ограничен по обращению правообладателя.';
          }
          return ['not_found', 'episode_unavailable'].includes(fallbackReason)
            ? 'Видео для этой серии пока недоступно.'
            : fallbackReason || 'Видеоисточник для этой серии не найден.';
        });
      } catch (error) {
        if (!active) return;

        setSourceIdentity(identity);
        setLoadingSources(false);
        setSourceMessage(
          controller.signal.aborted
            ? 'Проверка источника заняла слишком много времени. Обновите страницу.'
            : error instanceof Error
              ? error.message
              : 'Не удалось загрузить видео.',
        );
      } finally {
        window.clearTimeout(timeout);
      }
    }

    void loadSources();

    return () => {
      active = false;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [anime, animeIdParam, episodeNumber]);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    fetch(`/api/anime/${anime.id}/seasons`, {
      signal: controller.signal,
      cache: 'force-cache',
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Season navigation HTTP ${response.status}`);
        }

        return (await response.json()) as EpisodeSeasonsResponse;
      })
      .then((data) => {
        if (active) setSeasonNavigation(data);
      })
      .catch((error) => {
        if (!active || controller.signal.aborted) return;
        console.warn('Player season navigation unavailable:', error);
        setSeasonNavigation(null);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [anime.id]);

  const seasonRoute = useMemo(() => {
    const seasons = seasonNavigation?.seasons ?? [];
    const currentIndex = seasons.findIndex(
      (season) => season.id === anime.id || season.isCurrent,
    );

    if (currentIndex < 0) {
      return {
        current: null as EpisodeSeasonTab | null,
        previous: null as EpisodeSeasonTab | null,
        next: null as EpisodeSeasonTab | null,
      };
    }

    return {
      current: seasons[currentIndex] ?? null,
      previous: currentIndex > 0 ? seasons[currentIndex - 1] ?? null : null,
      next:
        currentIndex + 1 < seasons.length
          ? seasons[currentIndex + 1] ?? null
          : null,
    };
  }, [anime.id, seasonNavigation?.seasons]);

  const waitingForSources = loadingSources || sourceIdentity !== expectedSourceIdentity;

  useEffect(() => {
    const knownCurrentEpisodes =
      availableEpisodes ??
      seasonRoute.current?.episodes.length ??
      0;

    if (knownCurrentEpisodes > 0 && episodeNumber < knownCurrentEpisodes) {
      router.prefetch(
        `/anime/${animeIdParam}/episode/${episodeNumber + 1}`,
      );
    }

    if (seasonRoute.next?.slug && seasonRoute.next.episodes.length > 0) {
      router.prefetch(`/anime/${seasonRoute.next.slug}/episode/1`);
    }

    const previousLastEpisode = seasonRoute.previous?.episodes.at(-1);
    if (seasonRoute.previous?.slug && previousLastEpisode) {
      router.prefetch(
        `/anime/${seasonRoute.previous.slug}/episode/${previousLastEpisode}`,
      );
    }
  }, [
    animeIdParam,
    availableEpisodes,
    episodeNumber,
    router,
    seasonRoute.current?.episodes.length,
    seasonRoute.next,
    seasonRoute.previous,
  ]);

  const currentSeasonEpisodes =
    episodeAvailability?.status === 'available'
      ? availableEpisodes ?? 0
      : episodeAvailability?.status === 'unavailable'
        ? 0
        : Math.max(
            availableEpisodes ?? 0,
            seasonRoute.current?.episodes.length ?? 0,
          );

  const previousSeasonLastEpisode =
    seasonRoute.previous?.episodes.at(-1) ?? null;

  const nextSeasonFirstEpisode =
    seasonRoute.next && seasonRoute.next.episodes.length > 0 ? 1 : null;

  const atFirstEpisode = episodeNumber <= 1;
  const atLastKnownEpisode =
    currentSeasonEpisodes > 0 && episodeNumber >= currentSeasonEpisodes;

  const hasPrev =
    episodeNumber > 1 ||
    Boolean(seasonRoute.previous && previousSeasonLastEpisode);

  const hasNext =
    (currentSeasonEpisodes > 0 && episodeNumber < currentSeasonEpisodes) ||
    Boolean(seasonRoute.next && nextSeasonFirstEpisode);

  const navigateToEpisode = useCallback((slug: string, number: number) => {
    if (!theaterMode) {
      router.push(`/anime/${slug}/episode/${number}`, { scroll: false });
      return;
    }

    const current = new URL(window.location.href);
    const next = new URL(
      `/watch-together/${encodeURIComponent(slug)}/episode/${number}`,
      window.location.origin,
    );
    const roomId = current.searchParams.get('party');

    if (roomId) next.searchParams.set('party', roomId);
    next.hash = current.hash;

    router.push(`${next.pathname}${next.search}${next.hash}`, { scroll: false });
  }, [router, theaterMode]);

  useEffect(() => {
    if (!theaterMode) return;

    const onEpisodeChange = (event: Event) => {
      const detail = (
        event as CustomEvent<WatchPartyEpisodeChangeDetail>
      ).detail;

      if (
        !detail ||
        !detail.animeSlug ||
        !Number.isSafeInteger(detail.episode) ||
        detail.episode < 1 ||
        (detail.animeSlug === animeIdParam &&
          detail.episode === episodeNumber)
      ) {
        return;
      }

      navigateToEpisode(detail.animeSlug, detail.episode);
    };

    window.addEventListener(
      WATCH_PARTY_EPISODE_CHANGE_EVENT,
      onEpisodeChange,
    );

    return () => {
      window.removeEventListener(
        WATCH_PARTY_EPISODE_CHANGE_EVENT,
        onEpisodeChange,
      );
    };
  }, [
    animeIdParam,
    episodeNumber,
    navigateToEpisode,
    theaterMode,
  ]);

  const goToEpisode = (number: number) => {
    navigateToEpisode(animeIdParam, number);
  };

  const goToPrevious = () => {
    if (episodeNumber > 1) {
      goToEpisode(episodeNumber - 1);
      return;
    }

    if (seasonRoute.previous && previousSeasonLastEpisode) {
      navigateToEpisode(seasonRoute.previous.slug, previousSeasonLastEpisode);
    }
  };

  const goToNext = () => {
    if (currentSeasonEpisodes > 0 && episodeNumber < currentSeasonEpisodes) {
      trackProductClientEvent('player_next_episode', {
        source: theaterMode ? 'watch_together' : 'player',
        path: window.location.pathname,
        entityType: 'episode',
        entityId: `${anime.id}:${episodeNumber}`,
        metadata: {
          anime_id: anime.id,
          from_episode: episodeNumber,
          to_episode: episodeNumber + 1,
          transition: 'episode',
          watch_together: theaterMode,
        },
        flush: true,
      });
      goToEpisode(episodeNumber + 1);
      return;
    }

    if (seasonRoute.next && nextSeasonFirstEpisode) {
      trackProductClientEvent('player_next_season', {
        source: theaterMode ? 'watch_together' : 'player',
        path: window.location.pathname,
        entityType: 'episode',
        entityId: `${anime.id}:${episodeNumber}`,
        metadata: {
          anime_id: anime.id,
          from_episode: episodeNumber,
          next_slug: seasonRoute.next.slug,
          to_episode: 1,
          transition: 'season',
          watch_together: theaterMode,
        },
        flush: true,
      });
      navigateToEpisode(seasonRoute.next.slug, 1);
    }
  };

  const title = getAnimeTitle(anime);
  const accentColor = anime.coverImage?.color || '#7c68ee';
  const titleAccentStyle = {
    '--anime-page-accent': accentColor,
    '--ab-accent': accentColor,
    '--ab-iris': accentColor,
    '--ab-ember': accentColor,
  } as CSSProperties;

  const poster =
    anime.coverImage?.extraLarge ||
    anime.coverImage?.large ||
    anime.coverImage?.medium ||
    undefined;

  const description = cleanShikimoriDescription(anime.description);

  if (theaterMode) {
    return (
      <div className={theaterStyles.viewport}>
        <div className={theaterStyles.shell}>
          <header className={theaterStyles.header}>
            <div className={theaterStyles.brandRow}>
              <span className={theaterStyles.brandMark} aria-hidden="true">✦</span>
              <div className={theaterStyles.brandCopy}>
                <span>ANIMEBOX · WATCH TOGETHER</span>
                <strong>{title} · {episodeNumber} серия</strong>
              </div>
            </div>

            <div className={theaterStyles.headerActions}>
              <span className={theaterStyles.headerStatus}>КОМНАТА</span>
              <button
                type="button"
                className={theaterStyles.chatToggle}
                onClick={() => setTheaterChatOpen((current) => !current)}
                aria-expanded={theaterChatOpen}
              >
                {theaterChatOpen ? 'Скрыть чат' : 'Чат'}
              </button>
              <button
                type="button"
                className={theaterStyles.exitButton}
                onClick={() => window.dispatchEvent(new Event(WATCH_PARTY_EXIT_EVENT))}
              >
                ← К серии
              </button>
            </div>
          </header>

          <div className={theaterStyles.content}>
            <main className={theaterStyles.playerColumn}>
              <div className={theaterStyles.playerWrap}>
                {waitingForSources ? (
                  <div className={theaterStyles.loadingPlayer}>
                    <div className={theaterStyles.loadingInner}>
                      <span className={theaterStyles.spinner} aria-hidden="true" />
                      <span>Подбираем лучший источник…</span>
                    </div>
                  </div>
                ) : (
                  <AnimePlayer
                    animeId={anime.id}
                    key={`${expectedSourceIdentity}:theater`}
                    title={title}
                    episodeNumber={episodeNumber}
                    totalEpisodes={availableEpisodes}
                    totalEpisodesKnown={totalEpisodesKnown}
                    poster={poster}
                    sources={sources}
                    timeline={timeline}
                    hasPrev={hasPrev}
                    hasNext={hasNext}
                    prevLabel={atFirstEpisode && seasonRoute.previous ? 'Пред. сезон' : 'Пред. серия'}
                    nextLabel={atLastKnownEpisode && seasonRoute.next ? 'След. сезон' : 'След. серия'}
                    onPrev={goToPrevious}
                    onNext={goToNext}
                    onEnded={hasNext ? goToNext : undefined}
                    onEpisodeChange={goToEpisode}
                    onDurationObserved={handleTimelineDurationObserved}
                    watchTogetherMode
                  />
                )}

                {!waitingForSources && sources.length === 0 && sourceMessage && (
                  <div className={theaterStyles.sourceError}>{sourceMessage}</div>
                )}
              </div>
            </main>

            <button
              type="button"
              className={theaterStyles.drawerBackdrop}
              data-open={theaterChatOpen}
              aria-label="Закрыть чат"
              onClick={() => setTheaterChatOpen(false)}
            />

            <aside
              className={theaterStyles.roomColumn}
              data-open={theaterChatOpen}
              aria-label="Комната Watch Together"
            >
              <WatchPartyPanel
                animeTitle={title}
                animeSlug={animeIdParam}
                episodeNumber={episodeNumber}
                mode="theater"
              />
            </aside>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="detail episode-page anime-title-accent-scope" style={titleAccentStyle}>
      <nav className="episode-seo-breadcrumbs" aria-label="Навигационная цепочка">
        <Link href="/">AnimeBox</Link>
        <span aria-hidden="true">›</span>
        <Link href="/search">Каталог</Link>
        <span aria-hidden="true">›</span>
        <Link href={`/anime/${animeIdParam}`}>{title}</Link>
        <span aria-hidden="true">›</span>
        <span aria-current="page">{episodeNumber} серия</span>
      </nav>

      {waitingForSources ? (
        <div className="relative isolate overflow-hidden rounded-[26px] border border-white/[0.08] bg-[linear-gradient(180deg,rgba(14,19,34,0.98),rgba(7,10,20,0.98))] p-3 shadow-[0_28px_90px_rgba(0,0,0,0.50)] md:p-4">
          <div className="pointer-events-none absolute inset-x-16 top-0 h-px bg-gradient-to-r from-transparent via-violet-400/60 to-transparent" />
          <div className="relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-[20px] border border-white/[0.08] bg-black">
            <div className="flex flex-col items-center gap-3 text-center">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/10 border-t-violet-400" />
              <span className="text-xs font-semibold text-white/45">
                Подбираем лучший источник…
              </span>
            </div>
          </div>
        </div>
      ) : (
        <AnimePlayer
          animeId={anime.id}
          key={expectedSourceIdentity}
          title={title}
          episodeNumber={episodeNumber}
          totalEpisodes={availableEpisodes}
          totalEpisodesKnown={totalEpisodesKnown}
          poster={poster}
          sources={sources}
          timeline={timeline}
          hasPrev={hasPrev}
          hasNext={hasNext}
          prevLabel={atFirstEpisode && seasonRoute.previous ? 'Пред. сезон' : 'Пред. серия'}
          nextLabel={atLastKnownEpisode && seasonRoute.next ? 'След. сезон' : 'След. серия'}
          onPrev={goToPrevious}
          onNext={goToNext}
          onPlaybackQualified={handlePlaybackQualified}
          onDurationObserved={handleTimelineDurationObserved}
          onEnded={hasNext ? goToNext : undefined}
          onEpisodeChange={goToEpisode}
        />
      )}

      {!waitingForSources && sources.length === 0 && sourceMessage && (
        <div className="mt-3 rounded-lg border border-amber-900/40 bg-amber-950/20 py-3 text-center text-sm text-amber-400">
          {sourceMessage}
        </div>
      )}

      <section className="episode-seo-context" aria-label="О серии">
        <div>
          <span className="episode-seo-context__eyebrow">Сейчас смотрят</span>
          <strong>{episodeNumber} серия · {title}</strong>
          <p>
            Прогресс сохраняется автоматически. Переход между соседними сериями
            уже доступен прямо под плеером.
          </p>
        </div>

        <nav
          className="episode-seo-context__links"
          aria-label="Все эпизоды"
          style={{ gridTemplateColumns: 'minmax(0, 1fr)' }}
        >
          <Link href={`/anime/${animeIdParam}`}>Все серии</Link>
        </nav>
      </section>

      <WatchPartyPanel
        animeTitle={title}
        animeSlug={animeIdParam}
        episodeNumber={episodeNumber}
        mode="inline"
      />

      <EpisodeCompletion key={`${anime.id}:${episodeNumber}`} animeId={anime.id} episode={episodeNumber} />

      <section className="episode-engagement-grid" aria-label="Отслеживание и уведомления">
        <LibraryStatusControl animeId={anime.id} variant="compact" />

        <AnimeNotificationControl
          animeId={anime.id}
          animeSlug={anime.slug || String(anime.id)}
          animeTitle={title}
          episodesAired={anime.episodesAired || 0}
          variant="compact"
        />

        <a href="#episode-comments" className="episode-engagement-comments">
          <span className="episode-engagement-comments__eyebrow">Community</span>
          <strong>Обсудить {episodeNumber}-ю серию</strong>
          <span>Отдельная ветка только для этого эпизода — меньше случайных спойлеров.</span>
          <b>Перейти к комментариям ↓</b>
        </a>
      </section>

      <section className="detail__section episode-page__body">
        <div className="episode-page__info">
          <div className="episode-page__poster-shell">
            <AnimeImage
              image={anime.coverImage}
              alt={title}
              englishName={anime.title?.english || anime.title?.romaji}
              loading="lazy"
            />
          </div>

          <div>
            <h1 className="episode-page__title">{title} — {episodeNumber} серия</h1>

            <p className="mt-2 text-sm font-medium text-violet-200/70">
              Эпизод {episodeNumber} · прогресс просмотра сохраняется автоматически
            </p>

            {description && (
              <p className="episode-page__description">{description}</p>
            )}
          </div>
        </div>
      </section>

      <section className="detail__section detail__episodes">
        <div className="detail__section-header">
          <h2>Эпизоды</h2>

          {availableEpisodes && (
            <span>
              {totalEpisodesKnown
                ? `${availableEpisodes} эпизодов`
                : `Вышло ${availableEpisodes} эпизодов`}
            </span>
          )}
        </div>

        <EpisodeList
          trackingAnimeId={anime.id}
          animeId={animeIdParam}
          episodes={availableEpisodes}
          episodesAired={anime.episodesAired}
          totalEpisodesKnown={totalEpisodesKnown}
          currentEpisode={episodeNumber}
          watchedUpTo={watchedUpTo}
        />
      </section>
      <EpisodeComments
        animeId={anime.id}
        episode={episodeNumber}
      />

      <div className="episode-ad-break" aria-label="Рекламная пауза">
        <AdSlot
          placement="watch-below-engagement"
          format="horizontal"
          className="monetization-ad--watch"
        />
      </div>
    </div>

  );
}

