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
import { selectPersonalHomeSchedule } from '@/lib/home-retention-policy';
import {
  useHomeScheduleData,
  type HomeScheduleItem,
} from '@/components/home/useHomeScheduleData';

export type { HomeScheduleItem } from '@/components/home/useHomeScheduleData';

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
  upcomingScheduleLoading: boolean;
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

  const scheduleSectionRef = useRef<HTMLElement | null>(null);
  const [scheduleDays, setScheduleDays] =
    useState<ScheduleDay[]>([]);
  const [selectedScheduleDay, setSelectedScheduleDay] =
    useState('');
  const [clockNow, setClockNow] = useState(0);
  const autoSelectedDateRef = useRef('');
  const {
    scheduleItems,
    scheduleWindowItems,
    scheduleLoading,
    scheduleError,
    upcomingScheduleLoading,
  } = useHomeScheduleData(scheduleSectionRef);

  useEffect(() => {
    // Server and initial browser render use an empty snapshot. Populate local
    // dates after hydration, including rollover while the page stays open.
    const refreshClock = () => {
      const days = createScheduleDays();
      setClockNow(Date.now());
      setScheduleDays((previous) => previous[0]?.key === days[0]?.key ? previous : days);
      setSelectedScheduleDay((previous) =>
        days.some((day) => day.key === previous) ? previous : days[0]?.key ?? '',
      );
    };
    const frame = window.requestAnimationFrame(refreshClock);
    const timer = window.setInterval(refreshClock, 60_000);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearInterval(timer);
    };
  }, []);

  // Select the next day with an upcoming episode once per calendar day.
  // A manual tab selection must never be overridden by a delayed fetch.
  useEffect(() => {
    const today = scheduleDays[0]?.key;
    if (!today || scheduleLoading || autoSelectedDateRef.current === today) return;
    const nearest = scheduleDays.find((day) => scheduleItems.some((item) =>
      item.airingAt * 1000 > clockNow && getLocalDateKey(new Date(item.airingAt * 1000)) === day.key
    ));
    autoSelectedDateRef.current = today;
    setSelectedScheduleDay((previous) => !previous || previous === today ? (nearest?.key ?? today) : previous);
  }, [clockNow, scheduleDays, scheduleItems, scheduleLoading]);

  const personalScheduleItems = useMemo(() => {
    if (
      !personalizedHome ||
      personalAnimeIds.size === 0
    ) {
      return [];
    }

    return selectPersonalHomeSchedule(
      scheduleWindowItems, personalAnimeIds, Math.floor(clockNow / 1000),
    );
  }, [
    clockNow,
    personalAnimeIds,
    personalizedHome,
    scheduleWindowItems,
  ]);

  const retentionEpisodeSignal =
    useMemo<HomeRetentionEpisodeSignal | null>(() => {
      if (
        personalAnimeIds.size === 0 ||
        scheduleWindowItems.length === 0
      ) {
        return null;
      }

      const nowSeconds = Math.floor(clockNow / 1000);
      const windowStart =
        nowSeconds - 6 * 60 * 60;
      const windowEnd =
        nowSeconds + 24 * 60 * 60;

      const candidates = scheduleWindowItems.filter(
        (item) =>
          item.episode != null && !item.timingKind &&
          item.media.id!=null && personalAnimeIds.has(item.media.id) &&
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
        animeId: item.media.id!,
        slug: item.media.slug ?? null,
        title: getScheduleTitle(item),
        episode: Math.max(1, item.episode!),
        airingAt: item.airingAt,
        coverImage: item.media.coverImage,
        released: Boolean(released),
      };
    }, [
      clockNow,
      personalAnimeIds,
      scheduleWindowItems,
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

  const visibleScheduleItems = useMemo(() => {
    if (!selectedScheduleDay) return [];

    return scheduleItems.filter((item) => {
      const date = new Date(item.airingAt * 1000);

      return getLocalDateKey(date) === selectedScheduleDay && item.airingAt * 1000 > clockNow;
    });
  }, [
    scheduleItems,
    selectedScheduleDay,
    clockNow,
  ]);

  const upcomingScheduleItems = useMemo(() => {
    const nowSeconds = Math.floor(clockNow / 1000);

    return scheduleWindowItems
      .filter((item) => item.airingAt >= nowSeconds)
      .slice(0, 5);
  }, [
    clockNow,
    scheduleWindowItems,
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
        upcomingScheduleLoading,
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
        upcomingScheduleLoading,
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
