'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

import type {
  RecommendedAnime,
  RecommendationPage,
} from '@/types/recommendations';

import AnimeCard from '@/components/AnimeCard';

import styles from './InfiniteRecommendationRow.module.css';

type Props = {
  initialItems?: RecommendedAnime[];
  initialSessionId?: string | null;
};

const PAGE_SIZE = 20;

function animeKey(
  anime: RecommendedAnime,
): string {
  if (anime.idMal) {
    return `mal:${anime.idMal}`;
  }

  if (anime.mal_id) {
    return `mal:${anime.mal_id}`;
  }

  return `anime:${anime.id}`;
}

function mergeUnique(
  previous: RecommendedAnime[],
  incoming: RecommendedAnime[],
): RecommendedAnime[] {
  const map = new Map<string, RecommendedAnime>();

  for (const anime of previous) {
    map.set(animeKey(anime), anime);
  }

  for (const anime of incoming) {
    map.set(animeKey(anime), anime);
  }

  return [...map.values()];
}

export default function InfiniteRecommendationRow({
  initialItems = [],
  initialSessionId = null,
}: Props) {
  const scrollRef =
    useRef<HTMLDivElement | null>(null);

  const sentinelRef =
    useRef<HTMLDivElement | null>(null);

  /**
   * useState одного недостаточно:
   * IntersectionObserver способен сработать несколько
   * раз до следующего React render.
   */
  const fetchLockRef = useRef(false);

  const [items, setItems] =
    useState<RecommendedAnime[]>(initialItems);

  const [page, setPage] = useState(
    initialItems.length > 0 ? 2 : 1,
  );

  const [sessionId, setSessionId] =
    useState<string | null>(
      initialSessionId,
    );

  const [hasMore, setHasMore] =
    useState(true);

  const [isFetching, setIsFetching] =
    useState(false);

  const [error, setError] =
    useState<string | null>(null);

  const [canScrollLeft, setCanScrollLeft] =
    useState(false);

  const [canScrollRight, setCanScrollRight] =
    useState(false);

  const updateArrowState = useCallback(() => {
    const element = scrollRef.current;

    if (!element) {
      return;
    }

    const {
      scrollLeft,
      clientWidth,
      scrollWidth,
    } = element;

    setCanScrollLeft(scrollLeft > 4);

    setCanScrollRight(
      scrollLeft + clientWidth <
        scrollWidth - 4,
    );
  }, []);

  const fetchNextPage =
    useCallback(async () => {
      if (
        fetchLockRef.current ||
        !hasMore
      ) {
        return;
      }

      fetchLockRef.current = true;

      setIsFetching(true);
      setError(null);

      try {
        const params =
          new URLSearchParams({
            page: String(page),
            limit: String(PAGE_SIZE),
          });

        if (sessionId) {
          params.set(
            'session',
            sessionId,
          );
        }

        const response = await fetch(
          `/api/recommendations?${params.toString()}`,
          {
            method: 'GET',
            cache: 'no-store',
          },
        );

        if (!response.ok) {
          throw new Error(
            `Recommendation HTTP ${response.status}`,
          );
        }

        const data =
          (await response.json()) as RecommendationPage;

        setItems((current) =>
          mergeUnique(
            current,
            data.items,
          ),
        );

        setSessionId(
          data.sessionId,
        );

        setHasMore(
          data.hasMore,
        );

        if (data.nextPage !== null) {
          setPage(data.nextPage);
        }
      } catch (error) {
        console.error(
          'Recommendation pagination:',
          error,
        );

        setError(
          'Не удалось загрузить рекомендации',
        );
      } finally {
        fetchLockRef.current = false;
        setIsFetching(false);

        requestAnimationFrame(
          updateArrowState,
        );
      }
    }, [
      page,
      sessionId,
      hasMore,
      updateArrowState,
    ]);

  /**
   * Первая страница.
   */
  useEffect(() => {
    if (initialItems.length === 0) {
      void fetchNextPage();
    }
  }, [
    fetchNextPage,
    initialItems.length,
  ]);

  /**
   * Sentinel стоит ПОСЛЕ последней карточки.
   *
   * root = именно горизонтальный контейнер,
   * а не viewport страницы.
   *
   * rootMargin 600px означает:
   * сервер начинаем дергать ДО того,
   * как пользователь фактически увидит конец.
   */
  useEffect(() => {
    const root =
      scrollRef.current;

    const target =
      sentinelRef.current;

    if (!root || !target) {
      return;
    }

    const observer =
      new IntersectionObserver(
        ([entry]) => {
          if (
            entry.isIntersecting &&
            hasMore
          ) {
            void fetchNextPage();
          }
        },
        {
          root,

          rootMargin:
            '0px 600px 0px 0px',

          threshold: 0,
        },
      );

    observer.observe(target);

    return () => {
      observer.disconnect();
    };
  }, [
    fetchNextPage,
    hasMore,
  ]);

  useEffect(() => {
    const element =
      scrollRef.current;

    if (!element) {
      return;
    }

    updateArrowState();

    const resizeObserver =
      new ResizeObserver(
        updateArrowState,
      );

    resizeObserver.observe(
      element,
    );

    element.addEventListener(
      'scroll',
      updateArrowState,
      { passive: true },
    );

    return () => {
      resizeObserver.disconnect();

      element.removeEventListener(
        'scroll',
        updateArrowState,
      );
    };
  }, [updateArrowState]);

  const scroll = (
    direction: 'left' | 'right',
  ) => {
    const element =
      scrollRef.current;

    if (!element) {
      return;
    }

    const amount =
      element.clientWidth * 0.8;

    element.scrollBy({
      left:
        direction === 'right'
          ? amount
          : -amount,

      behavior: 'smooth',
    });
  };

  return (
    <div className={styles.wrapper}>
      <div
        ref={scrollRef}
        className={styles.track}
        aria-label="Персональные рекомендации"
      >
        {items.map((anime) => (
          <article
            key={animeKey(anime)}
            className={styles.item}
          >
            <AnimeCard anime={anime} />

            <div
              className={
                styles.reason
              }
            >
              <span
                aria-hidden="true"
              >
                ✦
              </span>

              {
                anime
                  .recommendation
                  .reasonText
              }
            </div>
          </article>
        ))}

        {isFetching &&
          Array.from({
            length: 4,
          }).map((_, index) => (
            <RecommendationSkeleton
              key={`skeleton-${index}`}
            />
          ))}

        {/* Intersection Observer hook */}
        <div
          ref={sentinelRef}
          className={styles.sentinel}
          aria-hidden="true"
        />
      </div>

      {canScrollLeft && (
        <button
          type="button"
          className={`${styles.arrow} ${styles.left}`}
          aria-label="Назад"
          onClick={() =>
            scroll('left')
          }
        >
          ‹
        </button>
      )}

      {(canScrollRight ||
        hasMore) && (
        <button
          type="button"
          className={`${styles.arrow} ${styles.right}`}
          aria-label="Вперёд"
          onClick={() =>
            scroll('right')
          }
        >
          ›
        </button>
      )}

      {error && (
        <button
          type="button"
          className={
            styles.retry
          }
          onClick={() =>
            void fetchNextPage()
          }
        >
          Повторить загрузку
        </button>
      )}
    </div>
  );
}

function RecommendationSkeleton() {
  return (
    <div
      className={`${styles.item} ${styles.skeleton}`}
      aria-hidden="true"
    >
      <div
        className={
          styles.skeletonPoster
        }
      />

      <div
        className={
          styles.skeletonTitle
        }
      />

      <div
        className={
          styles.skeletonMeta
        }
      />
    </div>
  );
}