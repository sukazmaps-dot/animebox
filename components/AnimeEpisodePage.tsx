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

type SourceAttemptResult = {
  ready: boolean;
  restricted: boolean;
  reason: string;
  timedOut?: boolean;
};

const CLIENT_DIRECT_PLAYER_HINT =
  process.env.NEXT_PUBLIC_DIRECT_PLAYER_ENABLED === 'true';

const DEFAULT_PROVIDER_ORDER: PlayerProviderKey[] =
  CLIENT_DIRECT_PLAYER_HINT
    ? ['direct', 'kodik', 'aniliberty']
    : ['kodik', 'aniliberty'];

export default function AnimeEpisodePage({ anime, requestedEpisode, theaterMode = false }: { anime: Anime; requestedEpisode: number; theaterMode?: boolean }) {
  const router = useRouter();
  const animeIdParam = anime.slug as string;
  const [theaterChatOpen, setTheaterChatOpen] = useState(false);
  const [watchedUpTo, setWatchedUpTo] = useState(0);
  const [providerEpisodes, setProviderEpisodes] = useState<number[]>([]);
  const [sources, setSources] = useState<PlayerSource[]>([]);
  const [loadingSources, setLoadingSources] = useState(false);
  const [sourceMessage, setSourceMessage] = useState('');
  const [sourceLoadingMessage, setSourceLoadingMessage] = useState(
    'Подключаем лучший источник…',
  );
  const [sourceDiscoveryStartedAtMs, setSourceDiscoveryStartedAtMs] =
    useState<number | null>(null);
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
    const discoveryStartedAt = performance.now();
    const publishedProviders = new Set<PlayerProviderKey>();
    const attemptedProviders = new Set<PlayerProviderKey>();
    let enabledProviders = new Set<PlayerProviderKey>([
      'direct',
      'kodik',
      'aniliberty',
    ]);
    let providerOrder: PlayerProviderKey[] = [...DEFAULT_PROVIDER_ORDER];
    let sourcePriority = new Map<PlayerProviderKey, number>([
      ['direct', 10],
      ['kodik', 20],
      ['aniliberty', 30],
    ]);
    let providerTimeouts = new Map<PlayerProviderKey, number>([
      ['direct', 5_500],
      ['kodik', 7_000],
      ['aniliberty', 9_500],
    ]);
    let maxProviderAttempts = 3;
    let discoveryBudgetMs = 18_500;
    let budgetExpired = false;
    let budgetTimer: number | null = null;
    let policyMode: 'server' | 'client_fallback' = 'client_fallback';
    let strategyVersion = 'source-orchestrator-v2';
    let copyrightBlocked = false;
    let policyAllUnavailable = false;
    let exhaustedTracked = false;
    const identity = `${animeIdParam}:${episodeNumber}`;
    const telemetryEntityId = `${anime.id}:${episodeNumber}`;

    function trackDiscoveryEvent(
      eventName:
        | 'player_discovery_plan'
        | 'player_discovery_attempt'
        | 'player_discovery_ready'
        | 'player_discovery_exhausted',
      provider: PlayerProviderKey | 'orchestrator',
      metadata: Record<string, unknown>,
      flush = false,
    ) {
      trackProductClientEvent(eventName, {
        source: provider,
        path:
          typeof window !== 'undefined'
            ? window.location.pathname
            : undefined,
        entityType: 'episode',
        entityId: telemetryEntityId,
        metadata,
        flush,
      });
    }

    function trackExhausted(reason: string) {
      if (exhaustedTracked || !active) return;
      exhaustedTracked = true;
      trackDiscoveryEvent(
        'player_discovery_exhausted',
        'orchestrator',
        {
          strategyVersion,
          elapsedMs: Math.max(
            0,
            Math.round(performance.now() - discoveryStartedAt),
          ),
          attemptedProviders: attemptedProviders.size,
          finalReason: reason.slice(0, 80),
          budgetExpired,
        },
        true,
      );
    }

    queueMicrotask(() => {
      if (!active) return;
      setLoadingSources(true);
      setSources([]);
      setSourceIdentity('');
      setSourceMessage('');
      setSourceLoadingMessage('Подключаем лучший источник…');
      setSourceDiscoveryStartedAtMs(discoveryStartedAt);
    });

    function providerKeyForSource(name: string): PlayerProviderKey {
      if (name === 'AnimeBox Direct') return 'direct';
      if (name === 'Kodik') return 'kodik';
      return 'aniliberty';
    }

    function publishSource(source: PlayerSource) {
      if (
        !active ||
        controller.signal.aborted ||
        source.translations.length === 0
      ) {
        return;
      }

      const providerKey = providerKeyForSource(source.name);
      if (!enabledProviders.has(providerKey)) return;

      const isFirstPlayableSource = !publishedAny;
      publishedAny = true;
      publishedProviders.add(providerKey);

      if (isFirstPlayableSource) {
        trackDiscoveryEvent(
          'player_discovery_ready',
          providerKey,
          {
            provider: providerKey,
            strategyVersion,
            firstSourceMs: Math.max(
              0,
              Math.round(performance.now() - discoveryStartedAt),
            ),
            attemptCount: attemptedProviders.size,
          },
          true,
        );
      }

      setSources((current) => {
        const withoutSameSource = current.filter(
          (item) => item.name !== source.name,
        );
        const next = [...withoutSameSource, source];

        const priority = (name: string) =>
          sourcePriority.get(providerKeyForSource(name)) ?? 999;

        return next.sort(
          (a, b) => priority(a.name) - priority(b.name),
        );
      });

      setSourceIdentity(identity);
      setSourceMessage('');
      setLoadingSources(false);
    }

    async function loadDirect(signal: AbortSignal): Promise<SourceAttemptResult> {
      const shikimoriId = anime.idMal || anime.mal_id;
      if (!shikimoriId) {
        return {
          ready: false,
          restricted: false,
          reason: 'missing_shikimori_id',
        };
      }

      try {
        const response = await fetch(
          `/api/player/direct-source?shikimoriId=${encodeURIComponent(String(shikimoriId))}&animeId=${encodeURIComponent(String(anime.id))}&season=${encodeURIComponent(String(anime.providerSeason || 1))}&episode=${encodeURIComponent(String(episodeNumber))}`,
          {
            signal,
            cache: 'no-store',
          },
        );

        const data = (await response.json()) as DirectSourceApiResponse;
        const restricted =
          response.status === 451 ||
          data.reason === 'copyright_restricted';

        if (restricted) {
          return {
            ready: false,
            restricted: true,
            reason: 'copyright_restricted',
          };
        }

        if (
          !response.ok ||
          !data.enabled ||
          !Array.isArray(data.streams) ||
          data.streams.length === 0
        ) {
          return {
            ready: false,
            restricted: false,
            reason:
              data.reason ||
              data.message ||
              `provider_http_${response.status}`,
          };
        }

        const translations = data.streams
          .filter((stream) => Boolean(stream?.url?.trim()))
          .map((stream) => ({
            title: stream.title || stream.quality || 'Авто',
            url: stream.url,
            type: stream.type,
          }));

        if (!translations.length) {
          return {
            ready: false,
            restricted: false,
            reason: 'direct_stream_not_found',
          };
        }

        publishSource({
          name: 'AnimeBox Direct',
          type: translations[0]?.type || 'hls',
          translations,
        });

        return {
          ready: true,
          restricted: false,
          reason: '',
        };
      } catch (error) {
        if (signal.aborted) throw error;
        console.warn('[Direct Player] source unavailable:', error);
        return {
          ready: false,
          restricted: false,
          reason: 'provider_unavailable',
        };
      }
    }

    async function loadKodik(signal: AbortSignal): Promise<SourceAttemptResult> {
      const shikimoriId = anime.idMal || anime.mal_id;
      if (!shikimoriId) {
        return {
          ready: false,
          restricted: false,
          reason: 'missing_shikimori_id',
        };
      }

      try {
        const response = await fetch(
          `/api/players/kodik?shikimoriId=${encodeURIComponent(String(shikimoriId))}&animeId=${encodeURIComponent(String(anime.id))}&season=${encodeURIComponent(String(anime.providerSeason || 1))}&episode=${encodeURIComponent(String(episodeNumber))}`,
          {
            signal,
            cache: 'no-store',
          },
        );

        const data = (await response.json()) as KodikApiResponse;
        const restricted =
          response.status === 451 ||
          data.reason === 'copyright_restricted';

        if (restricted) {
          return {
            ready: false,
            restricted: true,
            reason: 'copyright_restricted',
          };
        }

        if (data.maxEpisode && data.maxEpisode > 0) {
          setProviderEpisodes((current) => [
            ...new Set([
              ...current,
              ...Array.from(
                { length: data.maxEpisode! },
                (_, index) => index + 1,
              ),
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

            return {
              ready: true,
              restricted: false,
              reason: '',
            };
          }
        }

        return {
          ready: false,
          restricted: false,
          reason:
            data.reason ||
            data.error ||
            data.message ||
            (data.status === 'unavailable'
              ? 'episode_unavailable'
              : `provider_http_${response.status}`),
        };
      } catch (error) {
        if (signal.aborted) throw error;
        console.warn('[Kodik] source unavailable:', error);
        return {
          ready: false,
          restricted: false,
          reason: 'provider_unavailable',
        };
      }
    }

    async function loadAniLiberty(
      signal: AbortSignal,
    ): Promise<SourceAttemptResult> {
      try {
        const response = await fetch(
          `/api/anilibria?slug=${encodeURIComponent(animeIdParam)}&title=${encodeURIComponent(
            anime.title.romaji || anime.title.english || '',
          )}&season=${anime.providerSeason || 1}&episode=${episodeNumber}`,
          {
            signal,
            cache: 'no-store',
          },
        );

        const data = (await response.json()) as SourceApiResponse;
        const restricted =
          response.status === 451 ||
          data.reason === 'copyright_restricted';

        if (restricted) {
          return {
            ready: false,
            restricted: true,
            reason: 'copyright_restricted',
          };
        }

        if (!response.ok) {
          return {
            ready: false,
            restricted: false,
            reason:
              data.reason ||
              data.error ||
              data.message ||
              `provider_http_${response.status}`,
          };
        }

        if (!active || signal.aborted) {
          return {
            ready: false,
            restricted: false,
            reason: 'aborted',
          };
        }

        if (data.episodes?.length) {
          setProviderEpisodes((current) =>
            [...new Set([...current, ...data.episodes!])].sort(
              (a, b) => a - b,
            ),
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

        return {
          ready: publishedProviders.has('aniliberty'),
          restricted: false,
          reason:
            publishedProviders.has('aniliberty')
              ? ''
              : data.reason || 'episode_unavailable',
        };
      } catch (error) {
        if (signal.aborted) throw error;
        console.warn('[AniLiberty] source unavailable:', error);
        return {
          ready: false,
          restricted: false,
          reason: 'provider_unavailable',
        };
      }
    }

    async function loadProvider(
      provider: PlayerProviderKey,
      signal: AbortSignal,
    ): Promise<SourceAttemptResult> {
      if (provider === 'direct') return loadDirect(signal);
      if (provider === 'kodik') return loadKodik(signal);
      return loadAniLiberty(signal);
    }

    async function runProviderAttempt(
      provider: PlayerProviderKey,
      phase: 'primary' | 'warm' = 'primary',
    ): Promise<SourceAttemptResult> {
      if (!active || controller.signal.aborted) {
        return {
          ready: false,
          restricted: false,
          reason: 'aborted',
        };
      }

      attemptedProviders.add(provider);
      const attemptIndex = attemptedProviders.size;
      const attemptStartedAt = performance.now();

      const attemptController = new AbortController();
      let timedOut = false;
      const timeoutMs = Math.max(
        1_500,
        Math.min(12_000, providerTimeouts.get(provider) ?? 7_000),
      );

      const finishAttempt = (result: SourceAttemptResult) => {
        if (!active) return result;

        const outcome =
          result.ready
            ? 'ready'
            : result.restricted
              ? 'restricted'
              : result.timedOut || result.reason === 'provider_timeout'
                ? 'timeout'
                : result.reason === 'aborted' ||
                    result.reason === 'discovery_budget_exhausted'
                  ? 'aborted'
                  : 'unavailable';

        trackDiscoveryEvent(
          'player_discovery_attempt',
          provider,
          {
            provider,
            phase,
            attemptIndex,
            attemptMs: Math.max(
              0,
              Math.round(performance.now() - attemptStartedAt),
            ),
            timeoutMs,
            outcome,
            reason: result.reason.slice(0, 80),
          },
        );

        return result;
      };

      const abortFromParent = () => attemptController.abort();
      controller.signal.addEventListener('abort', abortFromParent, {
        once: true,
      });
      const timer = window.setTimeout(() => {
        timedOut = true;
        attemptController.abort();
      }, timeoutMs);

      try {
        return finishAttempt(
          await loadProvider(provider, attemptController.signal),
        );
      } catch (error) {
        if (controller.signal.aborted) {
          return finishAttempt({
            ready: false,
            restricted: false,
            reason: budgetExpired ? 'discovery_budget_exhausted' : 'aborted',
          });
        }

        if (timedOut) {
          return finishAttempt({
            ready: false,
            restricted: false,
            reason: 'provider_timeout',
            timedOut: true,
          });
        }

        console.warn(
          `[Source Orchestrator] ${provider} attempt failed:`,
          error,
        );
        return finishAttempt({
          ready: false,
          restricted: false,
          reason: 'provider_unavailable',
        });
      } finally {
        window.clearTimeout(timer);
        controller.signal.removeEventListener('abort', abortFromParent);
      }
    }

    function finalSourceMessage(reason: string) {
      if (reason === 'copyright_restricted') {
        return 'Доступ к этой серии ограничен по обращению правообладателя.';
      }
      if (
        reason === 'episode_unavailable' ||
        reason === 'not_found' ||
        reason === 'direct_stream_not_found'
      ) {
        return 'Видео для этой серии пока недоступно.';
      }
      if (
        reason === 'provider_timeout' ||
        reason === 'discovery_budget_exhausted'
      ) {
        return 'Источники отвечают слишком долго. Попробуйте ещё раз через несколько секунд.';
      }
      return 'Источники просмотра временно недоступны. Попробуйте позже.';
    }

    async function warmFallbacks(
      providers: PlayerProviderKey[],
    ) {
      for (const provider of providers) {
        if (!active || controller.signal.aborted) return;
        await runProviderAttempt(provider, 'warm');
      }
    }

    async function loadSources() {
      let lastReason = '';
      let firstReadyIndex = -1;

      try {
        try {
          const policyController = new AbortController();
          const abortPolicyFromParent = () => policyController.abort();
          controller.signal.addEventListener('abort', abortPolicyFromParent, {
            once: true,
          });
          const policyTimer = window.setTimeout(
            () => policyController.abort(),
            2_500,
          );

          let policyResponse: Response;
          try {
            policyResponse = await fetch(
              `/api/player/source-policy?animeId=${encodeURIComponent(String(anime.id))}&season=${encodeURIComponent(String(anime.providerSeason || 1))}&episode=${encodeURIComponent(String(episodeNumber))}`,
              {
                signal: policyController.signal,
                cache: 'no-store',
              },
            );
          } finally {
            window.clearTimeout(policyTimer);
            controller.signal.removeEventListener(
              'abort',
              abortPolicyFromParent,
            );
          }

          if (policyResponse.ok) {
            const policy =
              (await policyResponse.json()) as PlayerSourcePolicyResponse;

            if (policy.ok && Array.isArray(policy.providers)) {
              policyMode = 'server';
              enabledProviders = new Set(
                policy.providers
                  .filter((provider) => provider.enabled)
                  .map((provider) => provider.key),
              );
              sourcePriority = new Map(
                policy.providers.map((provider) => [
                  provider.key,
                  provider.effectivePriority ?? provider.priority,
                ]),
              );
              providerTimeouts = new Map(
                policy.providers.map((provider) => [
                  provider.key,
                  provider.recommendedTimeoutMs || 7_000,
                ]),
              );

              if (policy.orchestrator) {
                strategyVersion = policy.orchestrator.version;
                copyrightBlocked = policy.orchestrator.copyrightBlocked;
                policyAllUnavailable = policy.orchestrator.allUnavailable;
                providerOrder =
                  policy.orchestrator.orderedProviders.filter((provider) =>
                    enabledProviders.has(provider),
                  );
                maxProviderAttempts = Math.max(
                  0,
                  Math.min(
                    providerOrder.length,
                    policy.orchestrator.maxProviderAttempts,
                  ),
                );
                discoveryBudgetMs = Math.max(
                  6_000,
                  Math.min(
                    25_000,
                    policy.orchestrator.discoveryBudgetMs,
                  ),
                );

              } else {
                providerOrder = policy.providers
                  .filter((provider) => provider.enabled)
                  .sort(
                    (a, b) =>
                      (a.effectivePriority ?? a.priority) -
                      (b.effectivePriority ?? b.priority),
                  )
                  .map((provider) => provider.key);
                maxProviderAttempts = Math.min(
                  3,
                  providerOrder.length,
                );
              }
            }
          }
        } catch (policyError) {
          if (controller.signal.aborted) return;
          console.warn(
            '[Player Source Orchestrator] policy unavailable; provider endpoints remain authoritative:',
            policyError,
          );
        }

        trackDiscoveryEvent(
          'player_discovery_plan',
          'orchestrator',
          {
            strategyVersion,
            policyMode,
            orderedProviders: providerOrder,
            maxProviderAttempts,
            discoveryBudgetMs,
            copyrightBlocked,
            allUnavailable: policyAllUnavailable,
          },
        );

        if (copyrightBlocked) {
          setSourceIdentity(identity);
          setLoadingSources(false);
          setSourceMessage(
            'Доступ к этой серии ограничен по обращению правообладателя.',
          );
          return;
        }

        if (policyAllUnavailable) {
          trackExhausted('all_providers_unavailable');
          setSourceIdentity(identity);
          setLoadingSources(false);
          setSourceMessage(
            'Источники просмотра временно недоступны. Попробуйте позже.',
          );
          return;
        }

        providerOrder = providerOrder.filter((provider) =>
          enabledProviders.has(provider),
        );
        maxProviderAttempts = Math.min(
          Math.max(1, maxProviderAttempts),
          providerOrder.length,
        );

        if (!providerOrder.length) {
          trackExhausted('no_enabled_providers');
          setSourceIdentity(identity);
          setLoadingSources(false);
          setSourceMessage(
            'Источники просмотра временно недоступны. Попробуйте позже.',
          );
          return;
        }

        const discoveryElapsedMs = Math.max(
          0,
          performance.now() - discoveryStartedAt,
        );
        const remainingBudgetMs = Math.max(
          1_000,
          discoveryBudgetMs - discoveryElapsedMs,
        );

        budgetTimer = window.setTimeout(() => {
          budgetExpired = true;
          controller.abort();
        }, remainingBudgetMs);

        const primaryPlan = providerOrder.slice(0, maxProviderAttempts);

        for (let index = 0; index < primaryPlan.length; index += 1) {
          if (!active || controller.signal.aborted) break;

          const provider = primaryPlan[index]!;
          if (index > 0) {
            setSourceLoadingMessage(
              'Основной источник недоступен, пробуем резервный…',
            );
          }
          const result = await runProviderAttempt(provider, 'primary');
          lastReason = result.reason || lastReason;

          if (result.restricted) {
            continue;
          }

          if (result.ready) {
            firstReadyIndex = index;
            break;
          }
        }

        if (!active) return;

        if (firstReadyIndex >= 0 || publishedAny) {
          const readyProvider =
            primaryPlan[firstReadyIndex] ?? null;
          const remaining = providerOrder.filter(
            (provider) =>
              provider !== readyProvider &&
              !publishedProviders.has(provider) &&
              !attemptedProviders.has(provider),
          );

          void warmFallbacks(remaining).finally(() => {
            if (budgetTimer != null) {
              window.clearTimeout(budgetTimer);
              budgetTimer = null;
            }
          });
          return;
        }

        const terminalReason =
          budgetExpired ? 'discovery_budget_exhausted' : lastReason;
        trackExhausted(terminalReason || 'no_playable_source');
        setSourceIdentity(identity);
        setLoadingSources(false);
        setSourceMessage(
          finalSourceMessage(terminalReason),
        );
      } catch (error) {
        if (!active) return;

        trackExhausted(
          budgetExpired
            ? 'discovery_budget_exhausted'
            : 'orchestrator_error',
        );
        setSourceIdentity(identity);
        setLoadingSources(false);
        setSourceMessage(
          budgetExpired
            ? finalSourceMessage('discovery_budget_exhausted')
            : error instanceof Error
              ? 'Не удалось подготовить источник просмотра.'
              : 'Не удалось загрузить видео.',
        );
      } finally {
        if (!publishedAny && budgetTimer != null) {
          window.clearTimeout(budgetTimer);
          budgetTimer = null;
        }
      }
    }

    void loadSources();

    return () => {
      active = false;
      if (budgetTimer != null) {
        window.clearTimeout(budgetTimer);
      }
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
                      <span>{sourceLoadingMessage}</span>
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
                    sourceDiscoveryStartedAtMs={sourceDiscoveryStartedAtMs}
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
                {sourceLoadingMessage}
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
          sourceDiscoveryStartedAtMs={sourceDiscoveryStartedAtMs}
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

      <section
        className="episode-seo-context episode-seo-context--compact"
        aria-label="Навигация по серии"
      >
        <div>
          <span className="episode-seo-context__eyebrow">
            Серия {episodeNumber}
          </span>
          <strong>{title}</strong>
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

