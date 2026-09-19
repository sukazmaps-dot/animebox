'use client';

import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

import styles from './HorizontalNavRail.module.css';

type HorizontalNavRailProps = {
  children: ReactNode;
  ariaLabel: string;
  className?: string;
  stepRatio?: number;
  autoCenterActive?: boolean;
};

const EDGE_EPSILON = 5;

export default function HorizontalNavRail({
  children,
  ariaLabel,
  className = '',
  stepRatio = 0.72,
  autoCenterActive = true,
}: HorizontalNavRailProps) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollState = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;

    const { scrollLeft, scrollWidth, clientWidth } = track;
    setCanScrollLeft(scrollLeft > EDGE_EPSILON);
    setCanScrollRight(scrollLeft + clientWidth < scrollWidth - EDGE_EPSILON);
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
    mutationObserver.observe(track, { childList: true, subtree: true });

    track.addEventListener('scroll', updateScrollState, { passive: true });

    return () => {
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      track.removeEventListener('scroll', updateScrollState);
    };
  }, [updateScrollState]);

  useEffect(() => {
    const track = trackRef.current;
    if (!track || !autoCenterActive) return;

    const frame = requestAnimationFrame(() => {
      const active = track.querySelector<HTMLElement>('[data-rail-active="true"]');
      if (!active) {
        updateScrollState();
        return;
      }

      const trackRect = track.getBoundingClientRect();
      const activeRect = active.getBoundingClientRect();
      const fullyVisible =
        activeRect.left >= trackRect.left + 8 &&
        activeRect.right <= trackRect.right - 8;

      if (!fullyVisible) {
        active.scrollIntoView({
          behavior: 'smooth',
          block: 'nearest',
          inline: 'center',
        });
      }

      window.setTimeout(updateScrollState, 220);
    });

    return () => cancelAnimationFrame(frame);
  }, [autoCenterActive, children, updateScrollState]);

  const scrollByDirection = useCallback(
    (direction: 'left' | 'right') => {
      const track = trackRef.current;
      if (!track) return;

      const amount = Math.max(220, track.clientWidth * stepRatio);
      track.scrollBy({
        left: direction === 'left' ? -amount : amount,
        behavior: 'smooth',
      });
    },
    [stepRatio],
  );

  return (
    <div
      className={`${styles.wrapper} ${canScrollLeft ? styles.hasLeft : ''} ${canScrollRight ? styles.hasRight : ''} ${className}`.trim()}
    >
      <div
        ref={trackRef}
        className={styles.track}
        role="region"
        aria-label={ariaLabel}
        tabIndex={0}
      >
        {children}
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

      {canScrollRight && (
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
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
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
