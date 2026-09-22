'use client';

import { animeHref } from '@/lib/anime-url';

import { startTransition, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import dynamic from 'next/dynamic';
import type { Anime, AnimeImage as AnimeImageType } from '@/types/anime';

import AnimeCard from '@/components/AnimeCard';
import HomeContinueWatching from '@/components/HomeContinueWatching';
import HomeMoodPicker from '@/components/HomeMoodPicker';
import Icon from '@/components/Icon';
import AnimeImage from '@/components/AnimeImage';
import HomeHeroCarousel from '@/components/HomeHeroCarousel';
import { getAnimes } from '@/lib/anime-client';
import { getPersonalizedRecommendations } from '@/lib/recommendations';
import { readAnimeProgressMap, readWatchHistory, type AnimeHistoryEntry } from '@/lib/anime-storage';
import { getLatestWatchProgress, hasResumePosition } from '@/lib/watch-progress';
import { useAuthState } from '@/components/AuthStateProvider';
import type { RecentWatchResponse, WatchTitleOverview } from '@/types/watch';
import TopAnimeItem from '@/components/TopAnimeItem';
import ScheduleItem from '@/components/ScheduleItem';
import { readTasteProfile, setTasteMood, type TasteMood } from '@/lib/personalization';
import { fetchTasteGraph } from '@/lib/taste-graph';
import HomePersonalPulse from '@/components/HomePersonalPulse';
import HomeActivationPanel from '@/components/HomeActivationPanel';
import HomeRetentionHub, {
  type HomeRetentionCompletionSignal,
  type HomeRetentionEpisodeSignal,
} from '@/components/HomeRetentionHub';
import { trackProductClientEvent } from '@/lib/product-events-client';

const SmartRecommendationFeed = dynamic(
  () => import('@/components/SmartRecommendationFeed'),
  {
    ssr: false,
    loading: () => (
      <div className="loading-grid" aria-hidden="true">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="skeleton skeleton--card" />
        ))}
      </div>
    ),
  },
);

const HomeChatTeaser = dynamic(
  () => import('@/components/chat/HomeChatTeaser'),
  { ssr: false },
);

const TelegramPromoCard = dynamic(
  () => import('@/components/TelegramPromoCard'),
  { ssr: false },
);

const SupportAnimeBoxCard = dynamic(
  () =>
    import('@/components/monetization/SupportAnimeBox').then(
      (module) => module.SupportAnimeBoxCard,
    ),
  { ssr: false },
);

const subscribeHydration = () => () => {};

type HomeScheduleItem = {
  id: number;
  airingAt: number;
  episode: number;
  media: {
    id: number;
    idMal: number | null;
    format: string | null;
    status: string | null;
    title: {
      russian: string | null;
      romaji: string | null;
      english: string | null;
      native: string | null;
    };
    coverImage: AnimeImageType | null;
    bannerImage: string | null;
  };
};

type HomeScheduleResponse = {
  items?: HomeScheduleItem[];
};

type ScheduleDay = {
  key: string;
  label: string;
};

function getLocalDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function capitalize(value: string): string {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}

function createScheduleDays(): ScheduleDay[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() + index);

    let label: string;

    if (index === 0) {
      label = 'Сегодня';
    } else if (index === 1) {
      label = 'Завтра';
    } else {
      label = capitalize(
        date.toLocaleDateString('ru-RU', {
          weekday: 'long',
        }),
      );
    }

    return {
      key: getLocalDateKey(date),
      label,
    };
  });
}

function getScheduleTitle(item: HomeScheduleItem): string {
  return (
    item.media.title.russian ||
    item.media.title.english ||
    item.media.title.romaji ||
    item.media.title.native ||
    'Без названия'
  );
}

function formatScheduleTime(airingAt: number): string {
  return new Date(airingAt * 1000).toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatUpcomingDate(airingAt: number): string {
  const date = new Date(airingAt * 1000);
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);

  const dateKey = getLocalDateKey(date);
  const todayKey = getLocalDateKey(now);
  const tomorrowKey = getLocalDateKey(tomorrow);

  const prefix =
    dateKey === todayKey
      ? 'Сегодня'
      : dateKey === tomorrowKey
        ? 'Завтра'
        : capitalize(
            date.toLocaleDateString('ru-RU', {
              weekday: 'short',
            }),
          );

  return `${prefix} · ${formatScheduleTime(airingAt)}`;
}

type HomeTopAnimePanelProps = {
  popular: Anime[];
  mobile?: boolean;
};

function HomeTopAnimePanel({
  popular,
  mobile = false,
}: HomeTopAnimePanelProps) {
  const items = popular.slice(0, mobile ? 3 : 6);

  return (
    <div
      className={`panel right-rail__primary home-top-anime-panel ${
        mobile
          ? 'home-top-anime-panel--mobile'
          : 'home-top-anime-panel--desktop'
      }`}
    >
      <div className="panel__head panel__head--branded">
        <span className="panel__title-with-icon">
          <Image src="/brand/brand-mark.webp" alt="" width={20} height={20} sizes="20px" aria-hidden="true" />
          Топ аниме
        </span>
        <span className="section-link">Сегодня</span>
      </div>

      <div className="panel__body">
        {items.map((anime, index) => (
          <TopAnimeItem key={anime.id} anime={anime} rank={index + 1} />
        ))}
      </div>
    </div>
  );
}

export default function HomePage({
  initialPopular = [],
  initialOngoing = [],
}: {
  initialPopular?: Anime[];
  initialOngoing?: Anime[];
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
  const hydrated = useSyncExternalStore(subscribeHydration, () => true, () => false);

  const [scheduleItems, setScheduleItems] = useState<HomeScheduleItem[]>([]);
  const scheduleSectionRef = useRef<HTMLElement | null>(null);
  const [scheduleDays] = useState<ScheduleDay[]>(createScheduleDays);
  const [selectedScheduleDay, setSelectedScheduleDay] = useState(
    () => scheduleDays[0]?.key ?? '',
  );
  const [scheduleLoading, setScheduleLoading] = useState(true);
  const [scheduleError, setScheduleError] = useState('');
  const [clockNow, setClockNow] = useState(() => Date.now());

  /*
   * Главная лента.
   * Здесь больше не блокируем первый экран десятками проверок источников.
   * Наличие видео проверяется уже при открытии тайтла/серии.
   */
  useEffect(() => {
    const popularController = hasInitialPopular ? null : new AbortController();
    const ongoingController = hasInitialOngoing ? null : new AbortController();

    /*
     * SSR normally supplies both lists, so the real hero is already present in
     * the first HTML and its LCP image can start immediately. These requests
     * are only a resilience fallback for an upstream/cache miss on the server.
     */
    if (popularController) {
      getAnimes(
        {
          limit: 20,
          page: 1,
          order: 'ranked',
        },
        { signal: popularController.signal },
      )
        .then((data) => {
          if (!popularController.signal.aborted) setPopular(data);
        })
        .catch((err: unknown) => {
          if (!(err instanceof Error && err.name === 'AbortError')) {
            console.error(err);
            setPopularError('Не удалось загрузить популярное.');
          }
        })
        .finally(() => {
          if (!popularController.signal.aborted) setPopularLoading(false);
        });
    }

    if (ongoingController) {
      getAnimes(
        {
          limit: 20,
          page: 1,
          order: 'popularity',
          status: 'ongoing',
        },
        { signal: ongoingController.signal },
      )
        .then((data) => {
          if (!ongoingController.signal.aborted) setOngoing(data);
        })
        .catch((err: unknown) => {
          if (!(err instanceof Error && err.name === 'AbortError')) {
            console.error(err);
            setOngoingError('Не удалось загрузить онгоинги.');
          }
        })
        .finally(() => {
          if (!ongoingController.signal.aborted) setOngoingLoading(false);
        });
    }

    return () => {
      popularController?.abort();
      ongoingController?.abort();
    };
  }, [hasInitialOngoing, hasInitialPopular]);

  /*
   * История просмотра хранится в localStorage.
   * Отдельная ревизия нужна, чтобы рекомендации обновлялись после
   * возврата с плеера, в том числе через back/forward cache браузера.
   */
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
          .map((item) => `${item.id}:${item.viewCount}:${item.lastViewedAt}`)
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
      document.removeEventListener('visibilitychange', onVisibilityChange);
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
            throw new Error(`Recent watch HTTP ${response.status}`);
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
          if (
            !(error instanceof Error && error.name === 'AbortError')
          ) {
            console.debug('[Home] recent watch unavailable');
          }
        }).finally(() => { inFlight = false; });
    };

    const onVisible = () => { if (document.visibilityState === 'visible') loadRecent(); };
    loadRecent();
    window.addEventListener('focus', loadRecent);
    window.addEventListener('pageshow', loadRecent);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('watch-state-updated', loadRecent);

    return () => {
      controller.abort();
      window.removeEventListener('watch-state-updated', loadRecent);
      window.removeEventListener('focus', loadRecent);
      window.removeEventListener('pageshow', loadRecent);
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
      window.removeEventListener('animebox-taste-changed', refreshTaste);
      window.removeEventListener('animebox-taste-graph-updated', refreshTaste);
    };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setClockNow(Date.now());
    }, 60_000);

    return () => window.clearInterval(timer);
  }, []);

  /*
   * Реальное расписание с уже существующего /api/schedule.
   * Загружается независимо и не тормозит hero/основную ленту.
   */
  useEffect(() => {
    const controller = new AbortController();
    let observer: IntersectionObserver | null = null;
    let fallbackTimer: number | null = null;
    let desktopTimer: number | null = null;
    let started = false;

    async function loadSchedule() {
      try {
        setScheduleLoading(true);
        setScheduleError('');

        const response = await fetch('/api/schedule', {
          signal: controller.signal,
          cache: 'default',
        });

        if (!response.ok) {
          throw new Error(`Schedule HTTP ${response.status}`);
        }

        const data = (await response.json()) as HomeScheduleResponse;

        if (!Array.isArray(data.items)) {
          throw new Error('Некорректный ответ расписания');
        }

        setScheduleItems(
          [...data.items].sort((a, b) => a.airingAt - b.airingAt),
        );
      } catch (err: unknown) {
        if (!(err instanceof Error && err.name === 'AbortError')) {
          console.error('Home schedule error:', err);
          setScheduleError('Не удалось загрузить расписание.');
        }
      } finally {
        if (!controller.signal.aborted) {
          setScheduleLoading(false);
        }
      }
    }

    const start = () => {
      if (started || controller.signal.aborted) return;
      started = true;
      observer?.disconnect();
      if (fallbackTimer !== null) window.clearTimeout(fallbackTimer);
      void loadSchedule();
    };

    const mobile = window.matchMedia('(max-width: 720px)').matches;

    if (!mobile) {
      // Desktop has the compact "Ближайшие серии" panel in the visible
      // right rail, so keep it responsive while still letting LCP start first.
      desktopTimer = window.setTimeout(start, 700);
    } else if (
      typeof IntersectionObserver !== 'undefined' &&
      scheduleSectionRef.current
    ) {
      // On phones the schedule is several screens below the hero. Do not let
      // this API request compete with the LCP image on slow 4G.
      observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting)) start();
        },
        {
          rootMargin: '700px 0px',
          threshold: 0.01,
        },
      );

      observer.observe(scheduleSectionRef.current);

      // Accessibility / unusual browser fallback: data still arrives even if
      // the observer never fires.
      fallbackTimer = window.setTimeout(start, 8_000);
    } else {
      fallbackTimer = window.setTimeout(start, 4_500);
    }

    return () => {
      controller.abort();
      observer?.disconnect();
      if (fallbackTimer !== null) window.clearTimeout(fallbackTimer);
      if (desktopTimer !== null) window.clearTimeout(desktopTimer);
    };
  }, []);

  /*
   * Ranking used to run on every unrelated HomePage render (including the
   * one-minute schedule clock). Keep it hot only when catalogue/taste/history
   * actually changes.
   */
  const smartRecommendations = useMemo(() => {
    // localStorage-backed ranking cannot be deterministic during SSR.
    // Defer it until after hydration so React sees the exact same first tree
    // on the server and in the browser.
    if (!hydrated) return [];

    // Re-read local-first signals when their revision changes.
    void historyRevision;
    void tasteRevision;

    return getPersonalizedRecommendations([...popular, ...ongoing], {
      mood,
      limit: 12,
    });
  }, [hydrated, popular, ongoing, mood, historyRevision, tasteRevision]);

  const progress = useMemo(() => {
    void historyRevision;
    return readAnimeProgressMap();
  }, [historyRevision]);

  const personalEpisodeByAnime = useMemo(() => {
    const map = new Map<number, number>();

    for (const [animeId, episode] of Object.entries(progress)) {
      const id = Number(animeId);
      const value = Number(episode);

      if (Number.isInteger(id) && id > 0 && Number.isInteger(value) && value > 0) {
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

  const continueWatchingItems = useMemo(() => {
    const localById = new Map(
      watchHistory.map((anime) => [anime.id, anime] as const),
    );
    const catalogueById = new Map(
      [...popular, ...ongoing].map((anime) => [anime.id, anime] as const),
    );

    const localItems = watchHistory.flatMap((anime) => {
      const exact = getLatestWatchProgress(anime.id);
      if (!hasResumePosition(exact)) return [];
      const episode = exact.episode;

      return [{
        anime,
        episode,
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
        const local = localItems.find((item) => item.anime.id === state.animeId);
        const serverAt = state.lastWatchedAt ? Date.parse(state.lastWatchedAt) : 0;
        return local && local.sortAt > (Number.isFinite(serverAt) ? serverAt : 0)
          ? [{ ...local, completedEpisodes: state.completedEpisodes }] : [];
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
            coverImage: sourceAnime.coverImage || serverCoverImage,
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
      const exact = getLatestWatchProgress(state.animeId);
      const localIsNewer = Boolean(
        hasResumePosition(exact) &&
          exact.updatedAt > serverAt,
      );

      return [{
        anime,
        episode: localIsNewer ? exact!.episode : state.resumeEpisode,
        resumeMode: localIsNewer
          ? ('resume' as const)
          : (state.resumeMode ?? 'resume'),
        resumeSeconds: localIsNewer
          ? Math.floor(exact!.currentTime)
          : Math.floor(state.resumePositionMs / 1000),
        completedEpisodes: state.completedEpisodes,
        totalEpisodes: state.totalEpisodes,
        lastWatchedAt: localIsNewer ? exact!.updatedAt : serverAt,
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
    if (!personalizedHome || personalHomeTrackedRef.current) return;
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
      if (Number.isSafeInteger(anime.id) && anime.id > 0) ids.add(anime.id);
    }
    for (const item of serverContinue) {
      if (Number.isSafeInteger(item.animeId) && item.animeId > 0) {
        ids.add(item.animeId);
      }
    }

    return ids;
  }, [serverContinue, watchHistory]);

  const personalScheduleItems = useMemo(() => {
    if (!personalizedHome || personalAnimeIds.size === 0) return [];

    const nowSeconds = Math.floor(clockNow / 1000);
    const recentWindowStart = nowSeconds - 6 * 60 * 60;
    const futureWindowEnd = nowSeconds + 72 * 60 * 60;

    return scheduleItems
      .filter(
        (item) =>
          personalAnimeIds.has(item.media.id) &&
          item.airingAt >= recentWindowStart &&
          item.airingAt <= futureWindowEnd,
      )
      .sort((a, b) => a.airingAt - b.airingAt)
      .slice(0, 4);
  }, [
    clockNow,
    personalAnimeIds,
    personalizedHome,
    scheduleItems,
  ]);

  const personalAnimeIdList = useMemo(
    () => [...personalAnimeIds],
    [personalAnimeIds],
  );

  const retentionEpisodeSignal = useMemo<HomeRetentionEpisodeSignal | null>(() => {
    if (personalAnimeIds.size === 0 || scheduleItems.length === 0) return null;

    const nowSeconds = Math.floor(clockNow / 1000);
    const windowStart = nowSeconds - 6 * 60 * 60;
    const windowEnd = nowSeconds + 24 * 60 * 60;
    const candidates = scheduleItems.filter(
      (item) =>
        personalAnimeIds.has(item.media.id) &&
        item.airingAt >= windowStart &&
        item.airingAt <= windowEnd,
    );

    const released = candidates
      .filter((item) => item.airingAt <= nowSeconds)
      .sort((a, b) => b.airingAt - a.airingAt)[0];
    const upcoming = candidates
      .filter((item) => item.airingAt > nowSeconds)
      .sort((a, b) => a.airingAt - b.airingAt)[0];
    const item = released ?? upcoming;

    if (!item) return null;

    return {
      animeId: item.media.id,
      slug: null,
      title: getScheduleTitle(item),
      episode: Math.max(1, item.episode),
      airingAt: item.airingAt,
      coverImage: item.media.coverImage,
      released: Boolean(released),
    };
  }, [clockNow, personalAnimeIds, scheduleItems]);

  const retentionCompletionSignal = useMemo<HomeRetentionCompletionSignal | null>(() => {
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

      const fallbackEpisode = Math.min(total, Math.max(1, completed + 1));
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
        lastWatchedAt: Number.isFinite(lastWatchedAt) ? lastWatchedAt : 0,
      }];
    });

    candidates.sort(
      (a, b) =>
        a.remainingEpisodes - b.remainingEpisodes ||
        b.lastWatchedAt - a.lastWatchedAt,
    );

    const distinct = candidates.find(
      (item) => item.animeId !== retentionEpisodeSignal?.animeId,
    );

    return distinct ?? candidates[0] ?? null;
  }, [retentionEpisodeSignal?.animeId, serverContinue]);

  const personalScheduleSignature = personalScheduleItems
    .map((item) => `${item.media.id}:${item.episode}:${item.airingAt}`)
    .join('|');
  const personalScheduleTrackedRef = useRef('');

  useEffect(() => {
    if (
      !personalScheduleSignature ||
      personalScheduleTrackedRef.current === personalScheduleSignature
    ) {
      return;
    }

    personalScheduleTrackedRef.current = personalScheduleSignature;
    trackProductClientEvent('personal_schedule_impression', {
      source: 'personal_home',
      path: '/',
      entityType: 'surface',
      entityId: 'personal_schedule',
      metadata: {
        count: personalScheduleItems.length,
        items: personalScheduleItems.map((item) => ({
          anime_id: item.media.id,
          episode: item.episode,
          airing_at: item.airingAt,
        })),
      },
    });
  }, [personalScheduleItems, personalScheduleSignature]);

  const fallbackItems = ongoing.length > 0 ? ongoing : popular;
  const heroLoading =
    popularLoading &&
    ongoingLoading &&
    popular.length === 0 &&
    ongoing.length === 0;

  const visibleScheduleItems = useMemo(() => {
    if (!selectedScheduleDay) {
      return [];
    }

    return scheduleItems.filter((item) => {
      const date = new Date(item.airingAt * 1000);
      return getLocalDateKey(date) === selectedScheduleDay;
    });
  }, [scheduleItems, selectedScheduleDay]);

  const upcomingScheduleItems = useMemo(() => {
    const nowSeconds = Math.floor(clockNow / 1000);

    return scheduleItems
      .filter((item) => item.airingAt >= nowSeconds)
      .slice(0, 5);
  }, [scheduleItems, clockNow]);

  return (
    <div className="home-page">
      <div className="home-grid home-grid--main">
        <div className="main-column">
        {heroLoading ? (
          <section className="page-hero page-hero--empty">
            <div className="page-hero__content">
              <span className="pill pill--accent">ANIMEBOX</span>

              <h1>Загружаем AnimeBox…</h1>

              <p>Секунду — собираем главную.</p>
            </div>
          </section>
        ) : (
          <HomeHeroCarousel popular={popular} ongoing={ongoing} />
        )}

        <HomeContinueWatching items={continueWatchingItems} />

        <HomeActivationPanel
          hasHistory={hasWatchHistory}
          hasContinue={continueWatchingItems.length > 0}
        />

        <nav className="home-shortcuts" aria-label="Быстрые переходы AnimeBox">
          <Link href="/search" className="home-shortcuts__item">
            <span className="home-shortcuts__index">01</span>
            <span>
              <strong>Каталог</strong>
              <small>По жанрам и тегам</small>
            </span>
            <b aria-hidden="true">↗</b>
          </Link>
          <Link href="/schedule" className="home-shortcuts__item">
            <span className="home-shortcuts__index">02</span>
            <span>
              <strong>Релизы сегодня</strong>
              <small>Свежие эпизоды</small>
            </span>
            <b aria-hidden="true">→</b>
          </Link>
          <Link href="/list" className="home-shortcuts__item">
            <span className="home-shortcuts__index">03</span>
            <span>
              <strong>Мой список</strong>
              <small>Продолжить просмотр</small>
            </span>
            <b aria-hidden="true">→</b>
          </Link>
          <Link href="/watch-together" className="home-shortcuts__item">
            <span className="home-shortcuts__index">04</span>
            <span>
              <strong>Комнаты</strong>
              <small>Смотреть с друзьями</small>
            </span>
            <b aria-hidden="true">→</b>
          </Link>
        </nav>

        {(hasWatchHistory || serverContinue.length > 0) && (
          <HomeRetentionHub
            episode={retentionEpisodeSignal}
            completion={retentionCompletionSignal}
            personalAnimeIds={personalAnimeIdList}
            enableRooms={Boolean(user?.id)}
          />
        )}

        {!personalizedHome && <HomeTopAnimePanel popular={popular} mobile />}

        <HomePersonalPulse />

        {personalScheduleItems.length > 0 && (
          <section className="section personal-schedule-section">
            <div className="section-head">
              <div>
                <span className="smart-section-eyebrow">Твои онгоинги</span>
                <h2 className="section-title">Расписание твоих аниме</h2>
                <p>
                  Время эфира в Японии. Перевод и озвучка могут появиться позже.
                </p>
              </div>
              <Link className="section-link" href="/notifications">
                Настроить уведомления →
              </Link>
            </div>

            <div className="personal-schedule-grid">
              {personalScheduleItems.map((item) => {
                const title = getScheduleTitle(item);
                const watchHref = `${animeHref(item.media)}/watch?ep=${Math.max(
                  1,
                  item.episode,
                )}`;

                return (
                  <div className="personal-schedule-card" key={item.id}>
                    <ScheduleItem
                      href={watchHref}
                      title={title}
                      image={item.media.coverImage}
                      episode={item.episode}
                      dateLabel={formatUpcomingDate(item.airingAt)}
                      airingAt={item.airingAt}
                      onOpen={() => {
                        trackProductClientEvent('personal_schedule_click', {
                          source: 'personal_home',
                          path: '/',
                          entityType: 'episode',
                          entityId: `${item.media.id}:${item.episode}`,
                          metadata: {
                            anime_id: item.media.id,
                            episode: item.episode,
                            airing_at: item.airingAt,
                          },
                          flush: true,
                        });
                      }}
                    />
                  </div>
                );
              })}
            </div>
          </section>
        )}

        <HomeMoodPicker
          value={mood}
          onChange={(nextMood) => {
            if (nextMood === mood) return;

            // Active chip responds immediately. The localStorage/event refresh
            // is lower priority so it cannot compete with the feed animation.
            setMood(nextMood);
            startTransition(() => {
              setTasteMood(nextMood);
            });
          }}
        />

        <section id="animebox-for-you" className="section smart-feed-section">
          <div className="section-head">
            <div className="smart-feed-heading">
              <span className="smart-section-eyebrow">После титров</span>
              <div className="smart-feed-heading__line">
                <span
                  className="section-title__icon section-title__icon--asset smart-feed-heading__asset"
                  aria-hidden="true"
                >
                  <Image
                    src="/brand/icons/sections/recommendations.svg"
                    alt=""
                    width={16}
                    height={16}
                    sizes="16px"
                  />
                </span>
                <h2 className="section-title">Что смотреть дальше</h2>
              </div>
              <p>Тайтлы под твой сегодняшний вайб и то, что уже успело зацепить.</p>
            </div>

            <Link className="section-link" href="/search">
              Весь каталог →
            </Link>
          </div>

          {!hydrated || (popularLoading && ongoingLoading && smartRecommendations.length === 0) ? (
            <div className="loading-grid" aria-label="Загружаем персональные рекомендации">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="skeleton skeleton--card" />
              ))}
            </div>
          ) : (
            <SmartRecommendationFeed
              items={smartRecommendations}
              mood={mood}
              hasWatchHistory={hasWatchHistory}
            />
          )}
        </section>

        {personalizedHome && <HomeTopAnimePanel popular={popular} mobile />}

        <HomeChatTeaser />

        <section className="section">
          <div className="section-head">
            <h2 className="section-title">
              <span className="section-title__icon section-title__icon--asset" aria-hidden="true">
                <Image
                  src="/brand/icons/sections/popular.svg"
                  alt=""
                  width={16}
                  height={16}
                  sizes="16px"
                />
              </span>
              Популярные аниме
            </h2>

            <Link className="section-link" href="/search">
              Смотреть все →
            </Link>
          </div>

          {popularLoading ? (
            <div className="loading-grid">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="skeleton skeleton--card" />
              ))}
            </div>
          ) : popularError ? (
            <div className="empty-state">
              <strong>Не удалось загрузить популярное</strong>
              <span>{popularError}</span>
            </div>
          ) : (
            <div className="anime-grid">
              {popular.slice(0, 8).map((anime) => (
                <AnimeCard
                  key={anime.id}
                  anime={anime}
                  watchedEpisode={personalEpisodeByAnime.get(anime.id) ?? null}
                />
              ))}
            </div>
          )}
        </section>

        <section className="section">
          <div className="section-head">
            <h2 className="section-title">
              <span className="section-title__icon section-title__icon--asset" aria-hidden="true">
                <Image
                  src="/brand/icons/sections/ongoing.svg"
                  alt=""
                  width={16}
                  height={16}
                  sizes="16px"
                />
              </span>
              Продолжающиеся
            </h2>

            <Link className="section-link" href="/schedule">
              Расписание →
            </Link>
          </div>

          {ongoingLoading && fallbackItems.length === 0 ? (
            <div className="loading-grid">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="skeleton skeleton--card" />
              ))}
            </div>
          ) : ongoingError && fallbackItems.length === 0 ? (
            <div className="empty-state">
              <strong>Не удалось загрузить онгоинги</strong>
              <span>{ongoingError}</span>
            </div>
          ) : (
            <div className="anime-grid">
              {fallbackItems.slice(0, 8).map((anime) => (
                <AnimeCard
                  key={anime.id}
                  anime={anime}
                  watchedEpisode={personalEpisodeByAnime.get(anime.id) ?? null}
                />
              ))}
            </div>
          )}
        </section>

        <section ref={scheduleSectionRef} className="section schedule">
          <div className="section-head">
            <h2 className="section-title">
              <span className="section-title__icon section-title__icon--ui" aria-hidden="true">
                <Icon name="calendar" />
              </span>
              Расписание выхода серий
            </h2>

            <Link className="section-link" href="/schedule">
              Полное расписание →
            </Link>
          </div>

          <div className="schedule__tabs">
            {scheduleDays.map((day) => (
              <button
                key={day.key}
                type="button"
                className={`schedule__tab ${
                  selectedScheduleDay === day.key ? 'is-active' : ''
                }`}
                onClick={() => setSelectedScheduleDay(day.key)}
                style={{ border: 0, cursor: 'pointer' }}
              >
                {day.label}
              </button>
            ))}
          </div>

          {scheduleLoading ? (
            <div className="schedule__cards">
              {Array.from({ length: 4 }).map((_, index) => (
                <div
                  key={index}
                  className="schedule__card skeleton"
                  style={{ minHeight: 64 }}
                />
              ))}
            </div>
          ) : scheduleError ? (
            <div className="empty-state">
              <strong>Расписание временно недоступно</strong>
              <span>{scheduleError}</span>
            </div>
          ) : visibleScheduleItems.length === 0 ? (
            <div className="empty-state">
              <strong>На этот день серий нет</strong>
              <span>Попробуй выбрать соседний день.</span>
            </div>
          ) : (
            <div className="schedule__cards">
              {visibleScheduleItems.slice(0, 4).map((item) => {
                const title = getScheduleTitle(item);
                const released = item.airingAt * 1000 <= clockNow;

                return (
                  <Link
                    key={item.id}
                    href={animeHref(item.media)}
                    className="schedule__card"
                  >
                    <AnimeImage
                      image={item.media.coverImage}
                      alt={title}
                      englishName={
                        item.media.title.english || item.media.title.romaji
                      }
                      className="anime-schedule-image"
                      sizes="58px"
                      quality={60}
                    />

                    <div style={{ minWidth: 0, overflow: 'hidden' }}>
                      <strong title={title}>{title}</strong>
                      <span>Эпизод {item.episode}</span>
                    </div>

                    <span className="schedule__time">
                      {formatScheduleTime(item.airingAt)}
                      {released ? ' · Вышел' : ''}
                    </span>
                  </Link>
                );
              })}
            </div>
          )}
        </section>
        </div>

      <aside className="right-rail">
        <HomeTopAnimePanel popular={popular} />

        <div className="panel home-upcoming-panel">
          <div className="panel__head">Ближайшие серии</div>

          <div className="panel__body rank-list home-upcoming-panel__list">
            {scheduleLoading ? (
              Array.from({ length: 5 }).map((_, index) => (
                <div key={index} className="rank-item skeleton" />
              ))
            ) : upcomingScheduleItems.length > 0 ? (
              upcomingScheduleItems.map((item) => {
                const title = getScheduleTitle(item);

                return (
                  <ScheduleItem
                    key={item.id}
                    href={animeHref(item.media)}
                    title={title}
                    image={item.media.coverImage}
                    episode={item.episode}
                    dateLabel={formatUpcomingDate(item.airingAt)}
                    airingAt={item.airingAt}
                  />
                );
              })
            ) : (
              <div className="empty-state">
                <span>Ближайших серий пока нет.</span>
              </div>
            )}
          </div>
        </div>

        <div className="home-utility-grid">
          <div className="panel home-library-panel right-rail__secondary">
            <span className="home-library-panel__symbol home-library-panel__symbol--brand" aria-hidden="true">
              <Image src="/brand/brand-mark.webp" alt="" width={20} height={20} sizes="20px" />
            </span>
            <span className="home-library-panel__eyebrow">Твоя коллекция</span>
            <h2>
              Ни один эпизод
              <br />
              не потеряется.
            </h2>
            <p>Отмечай просмотренное, следи за новыми сериями и держи список в порядке.</p>
            <Link className="btn btn--primary" href="/list">
              Открыть список <span aria-hidden="true">↗</span>
            </Link>

            <Image
              className="home-library-panel__mascot"
              src="/brand/animebox-mascot.webp"
              alt=""
              width={68}
              height={76}
              sizes="68px"
              loading="lazy"
              aria-hidden="true"
            />
          </div>

          <SupportAnimeBoxCard />
          <TelegramPromoCard />
        </div>
      </aside>
      </div>
    </div>
  );
}
