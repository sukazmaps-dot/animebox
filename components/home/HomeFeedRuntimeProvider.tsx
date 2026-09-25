'use client';

import {
  createContext,
  startTransition,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';

import { useAuthState } from '@/components/AuthStateProvider';
import type { ContinueWatchingItem } from '@/components/HomeContinueWatching';
import type { HomeRetentionCompletionSignal } from '@/components/HomeRetentionHub';
import { getAnimes } from '@/lib/anime-client';
import {
  readAnimeProgressMap,
  readWatchHistory,
  type AnimeHistoryEntry,
} from '@/lib/anime-storage';
import {
  readTasteProfile,
  setTasteMood,
  type TasteMood,
} from '@/lib/personalization';
import { trackProductClientEvent } from '@/lib/product-events-client';
import {
  getPersonalizedRecommendations,
  type RankedRecommendation,
} from '@/lib/recommendations';
import { fetchTasteGraph } from '@/lib/taste-graph';
import {
  getLatestWatchProgress,
  hasResumePosition,
} from '@/lib/watch-progress';
import type { Anime } from '@/types/anime';
import type {
  RecentWatchResponse,
  WatchTitleOverview,
} from '@/types/watch';

const subscribeHydration = () => () => {};

export type HomeFeedRuntimeValue = {
  popular: Anime[];
  ongoing: Anime[];
  fallbackItems: Anime[];
  popularLoading: boolean;
  ongoingLoading: boolean;
  popularError: string;
  ongoingError: string;
  heroLoading: boolean;
  hydrated: boolean;
  userId: string | null;
  hasWatchHistory: boolean;
  hasPersonalHistory: boolean;
  mood: TasteMood;
  updateMood: (mood: TasteMood) => void;
  smartRecommendations: RankedRecommendation[];
  personalEpisodeByAnime: Map<number, number>;
  continueWatchingItems: ContinueWatchingItem[];
  personalizedHome: boolean;
  personalAnimeIds: Set<number>;
  personalAnimeIdList: number[];
  retentionCompletionCandidates: HomeRetentionCompletionSignal[];
};

const HomeFeedRuntimeContext =
  createContext<HomeFeedRuntimeValue | null>(null);

export function useHomeFeedRuntime() {
  const value = useContext(HomeFeedRuntimeContext);

  if (!value) {
    throw new Error(
      'useHomeFeedRuntime must be used inside HomeFeedRuntimeProvider',
    );
  }

  return value;
}

export default function HomeFeedRuntimeProvider({
  initialPopular = [],
  initialOngoing = [],
  children,
}: {
  initialPopular?: Anime[];
  initialOngoing?: Anime[];
  children: ReactNode;
}) {
  const hasInitialPopular = initialPopular.length > 0;
  const hasInitialOngoing = initialOngoing.length > 0;

  const [popular, setPopular] = useState<Anime[]>(initialPopular);
  const [ongoing, setOngoing] = useState<Anime[]>(initialOngoing);
  const [popularLoading, setPopularLoading] = useState(!hasInitialPopular);
  const [ongoingLoading, setOngoingLoading] = useState(!hasInitialOngoing);
  const [popularError, setPopularError] = useState('');
  const [ongoingError, setOngoingError] = useState('');

  const { user, loading: authLoading } = useAuthState();
  const [historyRevision, setHistoryRevision] = useState('');
  const [hasWatchHistory, setHasWatchHistory] = useState(false);
  const [watchHistory, setWatchHistory] = useState<AnimeHistoryEntry[]>([]);
  const [serverContinue, setServerContinue] = useState<WatchTitleOverview[]>([]);
  const [mood, setMood] = useState<TasteMood>('any');
  const [tasteRevision, setTasteRevision] = useState(0);
  const hydrated = useSyncExternalStore(
    subscribeHydration,
    () => true,
    () => false,
  );

  useEffect(() => {
    const popularController = hasInitialPopular
      ? null
      : new AbortController();
    const ongoingController = hasInitialOngoing
      ? null
      : new AbortController();

    if (popularController) {
      getAnimes(
        {
          limit: 12,
          page: 1,
          order: 'ranked',
        },
        { signal: popularController.signal },
      )
        .then((data) => {
          if (!popularController.signal.aborted) {
            setPopular(data);
          }
        })
        .catch((error: unknown) => {
          if (!(error instanceof Error && error.name === 'AbortError')) {
            console.error(error);
            setPopularError('Не удалось загрузить популярное.');
          }
        })
        .finally(() => {
          if (!popularController.signal.aborted) {
            setPopularLoading(false);
          }
        });
    }

    if (ongoingController) {
      getAnimes(
        {
          limit: 12,
          page: 1,
          order: 'popularity',
          status: 'ongoing',
        },
        { signal: ongoingController.signal },
      )
        .then((data) => {
          if (!ongoingController.signal.aborted) {
            setOngoing(data);
          }
        })
        .catch((error: unknown) => {
          if (!(error instanceof Error && error.name === 'AbortError')) {
            console.error(error);
            setOngoingError('Не удалось загрузить онгоинги.');
          }
        })
        .finally(() => {
          if (!ongoingController.signal.aborted) {
            setOngoingLoading(false);
          }
        });
    }

    return () => {
      popularController?.abort();
      ongoingController?.abort();
    };
  }, [
    hasInitialOngoing,
    hasInitialPopular,
  ]);

  useEffect(() => {
    if (authLoading || !user?.id) return;

    const controller = new AbortController();

    void fetchTasteGraph(controller.signal).catch((error) => {
      if (error instanceof Error && error.name === 'AbortError') return;
      console.warn('Taste Graph refresh failed:', error);
    });

    return () => controller.abort();
  }, [authLoading, user?.id]);

  useEffect(() => {
    const refreshHistory = () => {
      const history = readWatchHistory();

      setHasWatchHistory(history.length > 0);
      setWatchHistory([...history]);
      setHistoryRevision(
        history
          .map(
            (item) =>
              `${item.id}:${item.viewCount}:${item.lastViewedAt}`,
          )
          .join('|'),
      );
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refreshHistory();
      }
    };

    refreshHistory();

    window.addEventListener('focus', refreshHistory);
    window.addEventListener('pageshow', refreshHistory);
    window.addEventListener('storage', refreshHistory);
    window.addEventListener('watch-state-updated', refreshHistory);
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      window.removeEventListener('focus', refreshHistory);
      window.removeEventListener('pageshow', refreshHistory);
      window.removeEventListener('storage', refreshHistory);
      window.removeEventListener('watch-state-updated', refreshHistory);
      document.removeEventListener(
        'visibilitychange',
        onVisibilityChange,
      );
    };
  }, []);

  useEffect(() => {
    if (authLoading) return;

    if (!user?.id) {
      queueMicrotask(() => setServerContinue([]));
      return;
    }

    const controller = new AbortController();
    let inFlight = false;

    const loadRecent = () => {
      if (inFlight || controller.signal.aborted) return;

      inFlight = true;

      void fetch('/api/watch/recent?limit=12', {
        signal: controller.signal,
        cache: 'no-store',
      })
        .then(async (response) => {
          if (!response.ok) {
            throw new Error(
              `Recent watch HTTP ${response.status}`,
            );
          }

          return (await response.json()) as RecentWatchResponse;
        })
        .then((data) => {
          if (!controller.signal.aborted) {
            setServerContinue(
              Array.isArray(data.items) ? data.items : [],
            );
          }
        })
        .catch((error: unknown) => {
          if (!(error instanceof Error && error.name === 'AbortError')) {
            console.debug('[Home] recent watch unavailable');
          }
        })
        .finally(() => {
          inFlight = false;
        });
    };

    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        loadRecent();
      }
    };

    loadRecent();
    window.addEventListener('focus', loadRecent);
    window.addEventListener('pageshow', loadRecent);
    window.addEventListener('watch-state-updated', loadRecent);
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      controller.abort();
      window.removeEventListener('focus', loadRecent);
      window.removeEventListener('pageshow', loadRecent);
      window.removeEventListener('watch-state-updated', loadRecent);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [authLoading, user?.id]);

  useEffect(() => {
    const refreshTaste = () => {
      setMood(readTasteProfile().mood);
      setTasteRevision((revision) => revision + 1);
    };

    refreshTaste();
    window.addEventListener('animebox-taste-changed', refreshTaste);
    window.addEventListener('animebox-taste-graph-updated', refreshTaste);

    return () => {
      window.removeEventListener(
        'animebox-taste-changed',
        refreshTaste,
      );
      window.removeEventListener(
        'animebox-taste-graph-updated',
        refreshTaste,
      );
    };
  }, []);

  const smartRecommendations = useMemo(() => {
    if (!hydrated) return [];

    void historyRevision;
    void tasteRevision;

    return getPersonalizedRecommendations(
      [...popular, ...ongoing],
      {
        mood,
        limit: 24,
      },
    );
  }, [
    hydrated,
    popular,
    ongoing,
    mood,
    historyRevision,
    tasteRevision,
  ]);

  const progress = useMemo(() => {
    if (!hydrated) return {};

    void historyRevision;
    return readAnimeProgressMap();
  }, [hydrated, historyRevision]);

  const personalEpisodeByAnime = useMemo(() => {
    const map = new Map<number, number>();

    for (const [animeId, episode] of Object.entries(progress)) {
      const id = Number(animeId);
      const value = Number(episode);

      if (
        Number.isInteger(id) &&
        id > 0 &&
        Number.isInteger(value) &&
        value > 0
      ) {
        map.set(id, value);
      }
    }

    for (const state of serverContinue) {
      if (
        Number.isInteger(state.animeId) &&
        state.animeId > 0 &&
        Number.isInteger(state.resumeEpisode) &&
        Number(state.resumeEpisode) > 0
      ) {
        map.set(state.animeId, Number(state.resumeEpisode));
      }
    }

    return map;
  }, [progress, serverContinue]);

  const continueWatchingItems = useMemo<ContinueWatchingItem[]>(() => {
    const localById = new Map(
      watchHistory.map((anime) => [anime.id, anime] as const),
    );
    const catalogueById = new Map(
      [...popular, ...ongoing].map(
        (anime) => [anime.id, anime] as const,
      ),
    );

    const localItems = watchHistory.flatMap((anime) => {
      const exact = getLatestWatchProgress(
        anime.id,
        user?.id ?? null,
      );

      if (!hasResumePosition(exact)) return [];

      return [{
        anime,
        episode: exact.episode,
        resumeSeconds: Math.floor(exact.currentTime),
        resumeMode: 'resume' as const,
        totalEpisodes:
          anime.episodes && anime.episodes > 0
            ? anime.episodes
            : null,
        lastWatchedAt: exact.updatedAt,
        sortAt: exact.updatedAt,
      }];
    });

    if (!user?.id) {
      return localItems
        .sort((a, b) => b.sortAt - a.sortAt)
        .slice(0, 4);
    }

    const serverItems = serverContinue.flatMap((state) => {
      if (!state.resumeEpisode) {
        const local = localItems.find(
          (item) => item.anime.id === state.animeId,
        );
        const serverAt = state.lastWatchedAt
          ? Date.parse(state.lastWatchedAt)
          : 0;

        return local &&
          local.sortAt >
            (Number.isFinite(serverAt) ? serverAt : 0)
          ? [{
              ...local,
              completedEpisodes: state.completedEpisodes,
            }]
          : [];
      }

      const localAnime = localById.get(state.animeId);
      const catalogueAnime = catalogueById.get(state.animeId);
      const sourceAnime = localAnime ?? catalogueAnime;
      const serverCoverImage = state.posterUrl
        ? {
            extraLarge: state.posterUrl,
            large: state.posterUrl,
            medium: state.posterUrl,
          }
        : null;

      const anime: AnimeHistoryEntry = sourceAnime
        ? {
            ...sourceAnime,
            slug: sourceAnime.slug || state.slug || undefined,
            coverImage:
              sourceAnime.coverImage || serverCoverImage,
            lastViewedAt:
              state.lastWatchedAt &&
              Number.isFinite(Date.parse(state.lastWatchedAt))
                ? Date.parse(state.lastWatchedAt)
                : Date.now(),
            viewCount:
              'viewCount' in sourceAnime &&
              typeof sourceAnime.viewCount === 'number'
                ? sourceAnime.viewCount
                : 1,
          }
        : {
            id: state.animeId,
            slug: state.slug || undefined,
            title: {
              russian: state.title,
              romaji: state.title,
              english: null,
              native: null,
            },
            genres: [],
            episodes: state.totalEpisodes,
            coverImage: serverCoverImage,
            lastViewedAt:
              state.lastWatchedAt &&
              Number.isFinite(Date.parse(state.lastWatchedAt))
                ? Date.parse(state.lastWatchedAt)
                : Date.now(),
            viewCount: 1,
          };

      const serverAt =
        state.lastWatchedAt &&
        Number.isFinite(Date.parse(state.lastWatchedAt))
          ? Date.parse(state.lastWatchedAt)
          : 0;
      const exact = getLatestWatchProgress(
        state.animeId,
        user?.id ?? null,
      );
      const localIsNewer = Boolean(
        hasResumePosition(exact) &&
          exact.updatedAt > serverAt,
      );

      return [{
        anime,
        episode: localIsNewer
          ? exact!.episode
          : state.resumeEpisode,
        resumeMode: localIsNewer
          ? ('resume' as const)
          : (state.resumeMode ?? 'resume'),
        resumeSeconds: localIsNewer
          ? Math.floor(exact!.currentTime)
          : Math.floor(state.resumePositionMs / 1000),
        completedEpisodes: state.completedEpisodes,
        totalEpisodes: state.totalEpisodes,
        lastWatchedAt: localIsNewer
          ? exact!.updatedAt
          : serverAt,
        sortAt: localIsNewer ? exact!.updatedAt : serverAt,
      }];
    });

    const serverIds = new Set(
      serverContinue.map((item) => item.animeId),
    );

    return [
      ...serverItems,
      ...localItems.filter(
        (item) => !serverIds.has(item.anime.id),
      ),
    ]
      .sort((a, b) => b.sortAt - a.sortAt)
      .slice(0, 4);
  }, [
    ongoing,
    popular,
    serverContinue,
    user?.id,
    watchHistory,
  ]);

  const personalizedHome =
    Boolean(user?.id) &&
    (hasWatchHistory || serverContinue.length > 0);

  const personalHomeTrackedRef = useRef(false);

  useEffect(() => {
    if (
      !personalizedHome ||
      personalHomeTrackedRef.current
    ) {
      return;
    }

    personalHomeTrackedRef.current = true;

    trackProductClientEvent('personal_home_view', {
      source: 'home',
      path: '/',
      entityType: 'surface',
      entityId: 'personal_home',
      metadata: {
        has_continue: continueWatchingItems.length > 0,
        recommendation_count: smartRecommendations.length,
      },
    });
  }, [
    continueWatchingItems.length,
    personalizedHome,
    smartRecommendations.length,
  ]);

  const personalAnimeIds = useMemo(() => {
    const ids = new Set<number>();

    for (const anime of watchHistory) {
      if (
        Number.isSafeInteger(anime.id) &&
        anime.id > 0
      ) {
        ids.add(anime.id);
      }
    }

    for (const item of serverContinue) {
      if (
        Number.isSafeInteger(item.animeId) &&
        item.animeId > 0
      ) {
        ids.add(item.animeId);
      }
    }

    return ids;
  }, [serverContinue, watchHistory]);

  const personalAnimeIdList = useMemo(
    () => [...personalAnimeIds],
    [personalAnimeIds],
  );

  const retentionCompletionCandidates =
    useMemo<HomeRetentionCompletionSignal[]>(() => {
      const candidates = serverContinue.flatMap((state) => {
        const total = Number(state.totalEpisodes ?? 0);
        const completed = Number(state.completedEpisodes ?? 0);

        if (
          state.fullyCompleted ||
          !Number.isSafeInteger(total) ||
          total <= 0 ||
          !Number.isSafeInteger(completed) ||
          completed < 0
        ) {
          return [];
        }

        const remaining = total - completed;
        if (remaining < 1 || remaining > 3) return [];

        const fallbackEpisode = Math.min(
          total,
          Math.max(1, completed + 1),
        );
        const nextEpisode =
          state.resumeEpisode &&
          Number.isSafeInteger(state.resumeEpisode) &&
          state.resumeEpisode > 0
            ? Math.min(total, state.resumeEpisode)
            : fallbackEpisode;

        const lastWatchedAt = state.lastWatchedAt
          ? Date.parse(state.lastWatchedAt)
          : 0;

        return [{
          animeId: state.animeId,
          slug: state.slug,
          title: state.title,
          posterUrl: state.posterUrl,
          completedEpisodes: completed,
          totalEpisodes: total,
          remainingEpisodes: remaining,
          nextEpisode,
          lastWatchedAt: Number.isFinite(lastWatchedAt)
            ? lastWatchedAt
            : 0,
        }];
      });

      candidates.sort(
        (a, b) =>
          a.remainingEpisodes - b.remainingEpisodes ||
          b.lastWatchedAt - a.lastWatchedAt,
      );

      return candidates;
    }, [serverContinue]);

  const fallbackItems =
    ongoing.length > 0 ? ongoing : popular;

  const heroLoading =
    popularLoading &&
    ongoingLoading &&
    popular.length === 0 &&
    ongoing.length === 0;

  const updateMood = useCallback(
    (nextMood: TasteMood) => {
      if (nextMood === mood) return;

      setMood(nextMood);

      startTransition(() => {
        setTasteMood(nextMood);
      });
    },
    [mood],
  );

  const value = useMemo<HomeFeedRuntimeValue>(
    () => ({
      popular,
      ongoing,
      fallbackItems,
      popularLoading,
      ongoingLoading,
      popularError,
      ongoingError,
      heroLoading,
      hydrated,
      userId: user?.id ?? null,
      hasWatchHistory,
      hasPersonalHistory:
        hasWatchHistory || serverContinue.length > 0,
      mood,
      updateMood,
      smartRecommendations,
      personalEpisodeByAnime,
      continueWatchingItems,
      personalizedHome,
      personalAnimeIds,
      personalAnimeIdList,
      retentionCompletionCandidates,
    }),
    [
      continueWatchingItems,
      fallbackItems,
      hasWatchHistory,
      heroLoading,
      hydrated,
      mood,
      ongoing,
      ongoingError,
      ongoingLoading,
      personalAnimeIdList,
      personalAnimeIds,
      personalEpisodeByAnime,
      personalizedHome,
      popular,
      popularError,
      popularLoading,
      retentionCompletionCandidates,
      serverContinue.length,
      smartRecommendations,
      updateMood,
      user?.id,
    ],
  );

  return (
    <HomeFeedRuntimeContext.Provider value={value}>
      {children}
    </HomeFeedRuntimeContext.Provider>
  );
}
