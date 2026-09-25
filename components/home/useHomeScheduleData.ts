'use client';

import {
  useEffect,
  useState,
  type RefObject,
} from 'react';

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

type IdleWindow = Window & {
  requestIdleCallback?: (
    callback: IdleRequestCallback,
    options?: IdleRequestOptions,
  ) => number;
  cancelIdleCallback?: (handle: number) => void;
};

function sortByAiringAt(items: HomeScheduleItem[]) {
  return [...items].sort(
    (a, b) => a.airingAt - b.airingAt,
  );
}

export function useHomeScheduleData(
  scheduleSectionRef: RefObject<HTMLElement | null>,
) {
  const [scheduleItems, setScheduleItems] =
    useState<HomeScheduleItem[]>([]);
  const [scheduleWindowItems, setScheduleWindowItems] =
    useState<HomeScheduleItem[]>([]);
  const [scheduleLoading, setScheduleLoading] = useState(true);
  const [scheduleError, setScheduleError] = useState('');
  const [upcomingScheduleLoading, setUpcomingScheduleLoading] =
    useState(true);

  useEffect(() => {
    const controller = new AbortController();
    let timer: number | null = null;
    let idleHandle: number | null = null;
    const idleWindow = window as IdleWindow;

    const loadUpcoming = async () => {
      try {
        const nowSeconds = Math.floor(Date.now() / 1000);
        const params = new URLSearchParams({
          from: String(nowSeconds - 6 * 60 * 60),
          to: String(nowSeconds + 72 * 60 * 60),
          limit: '60',
        });

        const response = await fetch(
          `/api/schedule?${params.toString()}`,
          {
            signal: controller.signal,
            cache: 'default',
          },
        );

        if (!response.ok) {
          throw new Error(
            `Upcoming schedule HTTP ${response.status}`,
          );
        }

        const data =
          (await response.json()) as HomeScheduleResponse;

        if (!Array.isArray(data.items)) {
          throw new Error('Некорректный ответ ближайших серий');
        }

        setScheduleWindowItems(sortByAiringAt(data.items));
      } catch (error: unknown) {
        if (
          !(error instanceof Error && error.name === 'AbortError')
        ) {
          console.debug('[Home] upcoming schedule unavailable');
        }
      } finally {
        if (!controller.signal.aborted) {
          setUpcomingScheduleLoading(false);
        }
      }
    };

    const start = () => {
      if (controller.signal.aborted) return;
      void loadUpcoming();
    };

    if (idleWindow.requestIdleCallback) {
      idleHandle = idleWindow.requestIdleCallback(
        start,
        { timeout: 1_800 },
      );
    } else {
      timer = window.setTimeout(start, 900);
    }

    return () => {
      controller.abort();
      if (timer !== null) window.clearTimeout(timer);
      if (idleHandle !== null) {
        idleWindow.cancelIdleCallback?.(idleHandle);
      }
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let observer: IntersectionObserver | null = null;
    let fallbackTimer: number | null = null;
    let started = false;

    const loadSchedule = async () => {
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

        setScheduleItems(sortByAiringAt(data.items));
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
    };

    const start = () => {
      if (started || controller.signal.aborted) return;

      started = true;
      observer?.disconnect();

      if (fallbackTimer !== null) {
        window.clearTimeout(fallbackTimer);
      }

      void loadSchedule();
    };

    if (
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
    } else {
      // Only legacy/embedded browsers without IntersectionObserver use a
      // timer. Modern desktop never wakes the full feed just because time
      // elapsed after hydration.
      fallbackTimer = window.setTimeout(start, 4_500);
    }

    return () => {
      controller.abort();
      observer?.disconnect();

      if (fallbackTimer !== null) {
        window.clearTimeout(fallbackTimer);
      }
    };
  }, [scheduleSectionRef]);

  return {
    scheduleItems,
    scheduleWindowItems,
    scheduleLoading,
    scheduleError,
    upcomingScheduleLoading,
  };
}
