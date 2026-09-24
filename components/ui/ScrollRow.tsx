'use client';

import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

import styles from './ScrollRow.module.css';

type ScrollRowProps = {
  children: ReactNode;
  className?: string;
  ariaLabel?: string;
  stepRatio?: number;
  hasMore?: boolean;
  loading?: boolean;
  onEndReached?: () => void;
  endReachedRootMargin?: string;
};

const EDGE_EPSILON = 4;

export default function ScrollRow({
  children,
  className,
  ariaLabel = 'Горизонтальная лента',
  stepRatio = 0.8,
  hasMore = false,
  loading = false,
  onEndReached,
  endReachedRootMargin = '0px 55% 0px 0px',
}: ScrollRowProps) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const scrollFrameRef = useRef<number | null>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollState = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;

    const { scrollLeft, scrollWidth, clientWidth } = track;
    setCanScrollLeft(scrollLeft > EDGE_EPSILON);
    setCanScrollRight(
      scrollLeft + clientWidth < scrollWidth - EDGE_EPSILON,
    );
  }, []);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;

    updateScrollState();

    const resizeObserver = new ResizeObserver(updateScrollState);
    resizeObserver.observe(track);

    const mutationObserver = new MutationObserver(() => {
      requestAnimationFrame(updateScrollState);
    });
    mutationObserver.observe(track, { childList: true, subtree: false });

    const scheduleScrollState = () => {
      if (scrollFrameRef.current !== null) return;
      scrollFrameRef.current = window.requestAnimationFrame(() => {
        scrollFrameRef.current = null;
        updateScrollState();
      });
    };

    track.addEventListener('scroll', scheduleScrollState, { passive: true });

    return () => {
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      track.removeEventListener('scroll', scheduleScrollState);
      if (scrollFrameRef.current !== null) {
        window.cancelAnimationFrame(scrollFrameRef.current);
        scrollFrameRef.current = null;
      }
    };
  }, [updateScrollState]);

  useEffect(() => {
    const frame = requestAnimationFrame(updateScrollState);
    return () => cancelAnimationFrame(frame);
  }, [children, updateScrollState]);

  /*
   * Invisible hook after the final card. The horizontal row itself is the
   * IntersectionObserver root, not the page viewport. A generous right
   * rootMargin starts fetching before the user actually sees the end.
   */
  useEffect(() => {
    const root = trackRef.current;
    const target = sentinelRef.current;

    if (!root || !target || !onEndReached || !hasMore || loading) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          onEndReached();
        }
      },
      {
        root,
        rootMargin: endReachedRootMargin,
        threshold: 0,
      },
    );

    observer.observe(target);

    return () => observer.disconnect();
  }, [endReachedRootMargin, hasMore, loading, onEndReached]);

  const scrollByDirection = useCallback(
    (direction: 'left' | 'right') => {
      const track = trackRef.current;
      if (!track) return;

      if (
        direction === 'right' &&
        !canScrollRight &&
        hasMore &&
        !loading &&
        onEndReached
      ) {
        onEndReached();
        return;
      }

      const amount = Math.max(220, track.clientWidth * stepRatio);
      track.scrollBy({
        left: direction === 'left' ? -amount : amount,
        behavior: 'smooth',
      });
    },
    [canScrollRight, hasMore, loading, onEndReached, stepRatio],
  );

  return (
    <div
      className={[styles.wrapper, className].filter(Boolean).join(' ')}
    >
      <div
        ref={trackRef}
        className={styles.track}
        role="region"
        aria-label={ariaLabel}
        tabIndex={0}
      >
        {children}

        <div
          ref={sentinelRef}
          className={styles.sentinel}
          aria-hidden="true"
        />
      </div>

      {canScrollLeft && (
        <button
          type="button"
          className={`${styles.arrow} ${styles.arrowLeft}`}
          onClick={() => scrollByDirection('left')}
          aria-label="Прокрутить назад"
        >
          <Chevron direction="left" />
        </button>
      )}

      {(canScrollRight || hasMore) && (
        <button
          type="button"
          className={`${styles.arrow} ${styles.arrowRight}`}
          onClick={() => scrollByDirection('right')}
          aria-label="Прокрутить вперёд"
        >
          <Chevron direction="right" />
        </button>
      )}
    </div>
  );
}

function Chevron({ direction }: { direction: 'left' | 'right' }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d={direction === 'left' ? 'M15 18L9 12L15 6' : 'M9 6L15 12L9 18'}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
