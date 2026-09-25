'use client';

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type RefObject,
  type SetStateAction,
} from 'react';

import type {
  HomeRetentionCompletionSignal,
  HomeRetentionEpisodeSignal,
} from '@/components/HomeRetentionHub';
import { useHomeFeedRuntime } from '@/components/home/HomeFeedRuntimeProvider';
import { trackProductClientEvent } from '@/lib/product-events-client';
import type { AnimeImage as AnimeImageType } from '@/types/anime';

export type HomeScheduleItem = {
  id: number;
  airingAt: number;
  episode: number;
  media: {
    id: number;
    idMal: number | null;
    format: string | null;
    status: string | null;
    slug?: string | null;
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

export type ScheduleDay = {
  key: string;
  label: string;
};

export type HomeScheduleRuntimeValue = {
  scheduleSectionRef: RefObject<HTMLElement | null>;
  scheduleDays: ScheduleDay[];
  selectedScheduleDay: string;
  setSelectedScheduleDay: Dispatch<SetStateAction<string>>;
  scheduleLoading: boolean;
  scheduleError: string;
  clockNow: number;
  visibleScheduleItems: HomeScheduleItem[];
  upcomingScheduleItems: HomeScheduleItem[];
  personalScheduleItems: HomeScheduleItem[];
  retentionEpisodeSignal: HomeRetentionEpisodeSignal | null;
  retentionCompletionSignal: HomeRetentionCompletionSignal | null;
};

const HomeScheduleRuntimeContext =
  createContext<HomeScheduleRuntimeValue | null>(null);

export function useHomeScheduleRuntime() {
  const value = useContext(HomeScheduleRuntimeContext);

  if (!value) {
    throw new Error(
      'useHomeScheduleRuntime must be used inside HomeScheduleRuntimeProvider',
    );
  }

  return value;
}

function getLocalDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function capitalize(value: string): string {
  return value
    ? value.charAt(0).toUpperCase() + value.slice(1)
    : value;
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

export function getScheduleTitle(
  item: HomeScheduleItem,
): string {
  return (
    item.media.title.russian ||
    item.media.title.romaji ||
    item.media.title.english ||
    item.media.title.native ||
    'Без названия'
  );
}

export function formatScheduleTime(
  airingAt: number,
): string {
  return new Date(airingAt * 1000).toLocaleTimeString(
    'ru-RU',
    {
      hour: '2-digit',
      minute: '2-digit',
    },
  );
}

export function formatUpcomingDate(
  airingAt: number,
): string {
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

export default function HomeScheduleRuntimeProvider({
  children,
}: {
  children: ReactNode;
}) {
  const {
    personalizedHome,
    personalAnimeIds,
    retentionCompletionCandidates,
  } = useHomeFeedRuntime();

  const [scheduleItems, setScheduleItems] =
    useState<HomeScheduleItem[]>([]);
  const scheduleSectionRef = useRef<HTMLElement | null>(null);
  const [scheduleDays] =
    useState<ScheduleDay[]>(createScheduleDays);
  const [selectedScheduleDay, setSelectedScheduleDay] =
    useState(() => scheduleDays[0]?.key ?? '');
  const [scheduleLoading, setScheduleLoading] = useState(true);
  const [scheduleError, setScheduleError] = useState('');
  const [clockNow, setClockNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => {
      setClockNow(Date.now());
    }, 60_000);

    return () => window.clearInterval(timer);
  }, []);

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
          throw new Error(
            `Schedule HTTP ${response.status}`,
          );
        }

        const data =
          (await response.json()) as HomeScheduleResponse;

        if (!Array.isArray(data.items)) {
          throw new Error('Некорректный ответ расписания');
        }

        setScheduleItems(
          [...data.items].sort(
            (a, b) => a.airingAt - b.airingAt,
          ),
        );
      } catch (error: unknown) {
        if (
          !(error instanceof Error && error.name === 'AbortError')
        ) {
          console.error('Home schedule error:', error);
          setScheduleError(
            'Не удалось загрузить расписание.',
          );
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

      if (fallbackTimer !== null) {
        window.clearTimeout(fallbackTimer);
      }

      void loadSchedule();
    };

    const mobile =
      window.matchMedia('(max-width: 720px)').matches;

    if (!mobile) {
      desktopTimer = window.setTimeout(start, 700);
    } else if (
      typeof IntersectionObserver !== 'undefined' &&
      scheduleSectionRef.current
    ) {
      observer = new IntersectionObserver(
        (entries) => {
          if (
            entries.some(
              (entry) => entry.isIntersecting,
            )
          ) {
            start();
          }
        },
        {
          rootMargin: '700px 0px',
          threshold: 0.01,
        },
      );

      observer.observe(scheduleSectionRef.current);
      fallbackTimer = window.setTimeout(start, 8_000);
    } else {
      fallbackTimer = window.setTimeout(start, 4_500);
    }

    return () => {
      controller.abort();
      observer?.disconnect();

      if (fallbackTimer !== null) {
        window.clearTimeout(fallbackTimer);
      }

      if (desktopTimer !== null) {
        window.clearTimeout(desktopTimer);
      }
    };
  }, []);

  const personalScheduleItems = useMemo(() => {
    if (
      !personalizedHome ||
      personalAnimeIds.size === 0
    ) {
      return [];
    }

    const nowSeconds = Math.floor(clockNow / 1000);
    const recentWindowStart =
      nowSeconds - 6 * 60 * 60;
    const futureWindowEnd =
      nowSeconds + 72 * 60 * 60;

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

  const retentionEpisodeSignal =
    useMemo<HomeRetentionEpisodeSignal | null>(() => {
      if (
        personalAnimeIds.size === 0 ||
        scheduleItems.length === 0
      ) {
        return null;
      }

      const nowSeconds = Math.floor(clockNow / 1000);
      const windowStart =
        nowSeconds - 6 * 60 * 60;
      const windowEnd =
        nowSeconds + 24 * 60 * 60;

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
        slug: item.media.slug ?? null,
        title: getScheduleTitle(item),
        episode: Math.max(1, item.episode),
        airingAt: item.airingAt,
        coverImage: item.media.coverImage,
        released: Boolean(released),
      };
    }, [
      clockNow,
      personalAnimeIds,
      scheduleItems,
    ]);

  const retentionCompletionSignal =
    useMemo<HomeRetentionCompletionSignal | null>(() => {
      const distinct =
        retentionCompletionCandidates.find(
          (item) =>
            item.animeId !==
            retentionEpisodeSignal?.animeId,
        );

      return (
        distinct ??
        retentionCompletionCandidates[0] ??
        null
      );
    }, [
      retentionCompletionCandidates,
      retentionEpisodeSignal?.animeId,
    ]);

  const personalScheduleSignature =
    personalScheduleItems
      .map(
        (item) =>
          `${item.media.id}:${item.episode}:${item.airingAt}`,
      )
      .join('|');

  const personalScheduleTrackedRef = useRef('');

  useEffect(() => {
    if (
      !personalScheduleSignature ||
      personalScheduleTrackedRef.current ===
        personalScheduleSignature
    ) {
      return;
    }

    personalScheduleTrackedRef.current =
      personalScheduleSignature;

    trackProductClientEvent(
      'personal_schedule_impression',
      {
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
      },
    );
  }, [
    personalScheduleItems,
    personalScheduleSignature,
  ]);

  const visibleScheduleItems = useMemo(() => {
    if (!selectedScheduleDay) return [];

    return scheduleItems.filter((item) => {
      const date = new Date(item.airingAt * 1000);

      return (
        getLocalDateKey(date) === selectedScheduleDay
      );
    });
  }, [
    scheduleItems,
    selectedScheduleDay,
  ]);

  const upcomingScheduleItems = useMemo(() => {
    const nowSeconds = Math.floor(clockNow / 1000);

    return scheduleItems
      .filter((item) => item.airingAt >= nowSeconds)
      .slice(0, 5);
  }, [
    scheduleItems,
    clockNow,
  ]);

  const value =
    useMemo<HomeScheduleRuntimeValue>(
      () => ({
        scheduleSectionRef,
        scheduleDays,
        selectedScheduleDay,
        setSelectedScheduleDay,
        scheduleLoading,
        scheduleError,
        clockNow,
        visibleScheduleItems,
        upcomingScheduleItems,
        personalScheduleItems,
        retentionEpisodeSignal,
        retentionCompletionSignal,
      }),
      [
        clockNow,
        personalScheduleItems,
        retentionCompletionSignal,
        retentionEpisodeSignal,
        scheduleDays,
        scheduleError,
        scheduleLoading,
        selectedScheduleDay,
        upcomingScheduleItems,
        visibleScheduleItems,
      ],
    );

  return (
    <HomeScheduleRuntimeContext.Provider value={value}>
      {children}
    </HomeScheduleRuntimeContext.Provider>
  );
}
