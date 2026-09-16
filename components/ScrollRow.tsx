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
};

const EDGE_EPSILON = 4;

export default function ScrollRow({
  children,
  className,
  ariaLabel = 'Горизонтальная лента',
  stepRatio = 0.8,
}: ScrollRowProps) {
  const trackRef = useRef<HTMLDivElement | null>(null);

  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollState = useCallback(() => {
    const track = trackRef.current;

    if (!track) {
      return;
    }

    const { scrollLeft, scrollWidth, clientWidth } = track;

    setCanScrollLeft(scrollLeft > EDGE_EPSILON);

    setCanScrollRight(
      scrollLeft + clientWidth < scrollWidth - EDGE_EPSILON,
    );
  }, []);

  useEffect(() => {
    const track = trackRef.current;

    if (!track) {
      return;
    }

    updateScrollState();

    const resizeObserver = new ResizeObserver(() => {
      updateScrollState();
    });

    resizeObserver.observe(track);

    track.addEventListener('scroll', updateScrollState, {
      passive: true,
    });

    return () => {
      resizeObserver.disconnect();
      track.removeEventListener('scroll', updateScrollState);
    };
  }, [updateScrollState]);

  const scrollByDirection = useCallback(
    (direction: 'left' | 'right') => {
      const track = trackRef.current;

      if (!track) {
        return;
      }

      const scrollAmount = track.clientWidth * stepRatio;

      track.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth',
      });
    },
    [stepRatio],
  );

  return (
    <div
      className={[
        styles.wrapper,
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div
        ref={trackRef}
        className={styles.track}
        aria-label={ariaLabel}
        role="region"
      >
        {children}
      </div>

      {canScrollLeft && (
        <button
          type="button"
          className={`${styles.arrow} ${styles.arrowLeft}`}
          onClick={() => scrollByDirection('left')}
          aria-label="Прокрутить рекомендации назад"
        >
          <ChevronLeftIcon />
        </button>
      )}

      {canScrollRight && (
        <button
          type="button"
          className={`${styles.arrow} ${styles.arrowRight}`}
          onClick={() => scrollByDirection('right')}
          aria-label="Прокрутить рекомендации вперёд"
        >
          <ChevronRightIcon />
        </button>
      )}
    </div>
  );
}

function ChevronLeftIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M15 18L9 12L15 6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M9 6L15 12L9 18"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}