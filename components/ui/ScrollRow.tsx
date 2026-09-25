'use client';

import {
  Children,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import styles from './ScrollRow.module.css';

export type ScrollRowVirtualMetrics = {
  totalItems: number;
  renderedItems: number;
  startIndex: number;
  endIndex: number;
};

type ScrollRowProps = {
  children: ReactNode;
  className?: string;
  ariaLabel?: string;
  stepRatio?: number;
  hasMore?: boolean;
  loading?: boolean;
  onEndReached?: () => void;
  endReachedRootMargin?: string;
  endReachedRequiresInteraction?: boolean;
  virtualize?: boolean;
  virtualMaxItems?: number;
  virtualOverscan?: number;
  onVirtualRangeChange?: (metrics: ScrollRowVirtualMetrics) => void;
};

const EDGE_EPSILON = 4;
const END_PREFETCH_RATIO = 0.55;
const END_PREFETCH_MIN_PX = 180;
const DEFAULT_VIRTUAL_MAX_ITEMS = 36;
const DEFAULT_VIRTUAL_OVERSCAN = 6;

type VirtualRange = {
  start: number;
  end: number;
};

type VirtualGeometry = {
  itemWidth: number;
  gap: number;
};

function clampVirtualRange(
  range: VirtualRange,
  itemCount: number,
  maxItems: number,
): VirtualRange {
  if (itemCount <= 0) return { start: 0, end: 0 };

  const safeMax = Math.max(1, Math.min(itemCount, maxItems));
  let start = Math.max(0, Math.min(range.start, itemCount - 1));
  let end = Math.max(start + 1, Math.min(itemCount, range.end));

  if (end - start > safeMax) {
    end = start + safeMax;
  }

  if (end > itemCount) {
    end = itemCount;
    start = Math.max(0, end - safeMax);
  }

  return { start, end };
}

export default function ScrollRow({
  children,
  className,
  ariaLabel = 'Горизонтальная лента',
  stepRatio = 0.8,
  hasMore = false,
  loading = false,
  onEndReached,
  endReachedRootMargin = '0px 55% 0px 0px',
  endReachedRequiresInteraction = false,
  virtualize = false,
  virtualMaxItems = DEFAULT_VIRTUAL_MAX_ITEMS,
  virtualOverscan = DEFAULT_VIRTUAL_OVERSCAN,
  onVirtualRangeChange,
}: ScrollRowProps) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const scrollFrameRef = useRef<number | null>(null);
  const endRequestLatchRef = useRef(false);
  const endInteractionUnlockedRef = useRef(
    !endReachedRequiresInteraction,
  );
  const virtualMetricsRef = useRef<ScrollRowVirtualMetrics | null>(null);
  const strideRef = useRef(0);

  const childArray = useMemo(() => Children.toArray(children), [children]);
  const childCount = childArray.length;
  const maxVirtualItems = Math.max(8, Math.trunc(virtualMaxItems));
  const overscan = Math.max(2, Math.trunc(virtualOverscan));
  const virtualActive = virtualize && childCount > maxVirtualItems;

  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [virtualRange, setVirtualRange] = useState<VirtualRange>(() => ({
    start: 0,
    end: Math.min(childCount, maxVirtualItems),
  }));
  const [virtualGeometry, setVirtualGeometry] = useState<VirtualGeometry>({
    itemWidth: 0,
    gap: 0,
  });

  const reportVirtualMetrics = useCallback(
    (range: VirtualRange) => {
      if (!onVirtualRangeChange) return;

      const metrics: ScrollRowVirtualMetrics = {
        totalItems: childCount,
        renderedItems: Math.max(0, range.end - range.start),
        startIndex: range.start,
        endIndex: Math.max(range.start, range.end - 1),
      };
      const previous = virtualMetricsRef.current;

      if (
        previous?.totalItems === metrics.totalItems &&
        previous.renderedItems === metrics.renderedItems &&
        previous.startIndex === metrics.startIndex &&
        previous.endIndex === metrics.endIndex
      ) {
        return;
      }

      virtualMetricsRef.current = metrics;
      onVirtualRangeChange(metrics);
    },
    [childCount, onVirtualRangeChange],
  );

  const updateVirtualWindow = useCallback(
    (track: HTMLDivElement) => {
      if (!virtualActive) {
        const full = { start: 0, end: childCount };
        setVirtualRange((current) =>
          current.start === full.start && current.end === full.end
            ? current
            : full,
        );
        reportVirtualMetrics(full);
        return;
      }

      const firstRealChild = Array.from(track.children).find(
        (element) =>
          element !== sentinelRef.current &&
          !element.hasAttribute('data-scroll-row-spacer'),
      ) as HTMLElement | undefined;

      const style = window.getComputedStyle(track);
      const parsedGap = Number.parseFloat(style.columnGap || style.gap || '0');
      const gap = Number.isFinite(parsedGap) ? parsedGap : 0;
      const measuredWidth = firstRealChild?.getBoundingClientRect().width ?? 0;
      const itemWidth =
        measuredWidth > 0
          ? measuredWidth
          : virtualGeometry.itemWidth;

      if (itemWidth <= 0) {
        const initial = {
          start: 0,
          end: Math.min(childCount, maxVirtualItems),
        };
        setVirtualRange(initial);
        reportVirtualMetrics(initial);
        return;
      }

      const nextStride = itemWidth + gap;
      const previousStride = strideRef.current;

      if (
        previousStride > 0 &&
        Math.abs(previousStride - nextStride) > 1 &&
        track.scrollLeft > EDGE_EPSILON
      ) {
        const anchorIndex = track.scrollLeft / previousStride;
        track.scrollLeft = anchorIndex * nextStride;
      }

      strideRef.current = nextStride;

      setVirtualGeometry((current) =>
        Math.abs(current.itemWidth - itemWidth) < 0.5 &&
        Math.abs(current.gap - gap) < 0.5
          ? current
          : { itemWidth, gap },
      );

      const visibleStart = Math.max(
        0,
        Math.floor(track.scrollLeft / Math.max(1, nextStride)),
      );
      const visibleEnd = Math.min(
        childCount,
        Math.max(
          visibleStart + 1,
          Math.ceil(
            (track.scrollLeft + track.clientWidth + gap) /
              Math.max(1, nextStride),
          ),
        ),
      );

      let start = Math.max(0, visibleStart - overscan);
      let end = Math.min(childCount, visibleEnd + overscan);

      if (end - start > maxVirtualItems) {
        const visibleSpan = Math.max(1, visibleEnd - visibleStart);
        const spare = Math.max(0, maxVirtualItems - visibleSpan);
        const before = Math.floor(spare / 2);
        start = Math.max(0, visibleStart - before);
        end = Math.min(childCount, start + maxVirtualItems);

        if (end - start < maxVirtualItems) {
          start = Math.max(0, end - maxVirtualItems);
        }
      }

      const nextRange = clampVirtualRange(
        { start, end },
        childCount,
        maxVirtualItems,
      );

      setVirtualRange((current) =>
        current.start === nextRange.start && current.end === nextRange.end
          ? current
          : nextRange,
      );
      reportVirtualMetrics(nextRange);
    },
    [
      childCount,
      maxVirtualItems,
      overscan,
      reportVirtualMetrics,
      virtualActive,
      virtualGeometry.itemWidth,
    ],
  );

  const updateScrollState = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;

    updateVirtualWindow(track);

    const { scrollLeft, scrollWidth, clientWidth } = track;
    const remaining = Math.max(
      0,
      scrollWidth - (scrollLeft + clientWidth),
    );
    const threshold = Math.max(
      END_PREFETCH_MIN_PX,
      clientWidth * END_PREFETCH_RATIO,
    );

    setCanScrollLeft(scrollLeft > EDGE_EPSILON);
    setCanScrollRight(
      scrollLeft + clientWidth < scrollWidth - EDGE_EPSILON,
    );

    if (
      hasMore &&
      !loading &&
      onEndReached &&
      endInteractionUnlockedRef.current &&
      remaining <= threshold &&
      !endRequestLatchRef.current
    ) {
      endRequestLatchRef.current = true;
      onEndReached();
    }
  }, [
    hasMore,
    loading,
    onEndReached,
    updateVirtualWindow,
  ]);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;

    const frame = window.requestAnimationFrame(updateScrollState);
    const resizeObserver = new ResizeObserver(() => {
      if (scrollFrameRef.current !== null) return;
      scrollFrameRef.current = window.requestAnimationFrame(() => {
        scrollFrameRef.current = null;
        updateScrollState();
      });
    });
    resizeObserver.observe(track);

    const scheduleScrollState = () => {
      if (scrollFrameRef.current !== null) return;
      scrollFrameRef.current = window.requestAnimationFrame(() => {
        scrollFrameRef.current = null;
        updateScrollState();
      });
    };

    const unlockEndReached = () => {
      if (!endReachedRequiresInteraction) return;
      endInteractionUnlockedRef.current = true;
      endRequestLatchRef.current = false;
    };

    track.addEventListener('pointerdown', unlockEndReached, {
      passive: true,
    });
    track.addEventListener('wheel', unlockEndReached, {
      passive: true,
    });
    track.addEventListener('keydown', unlockEndReached);
    track.addEventListener('scroll', scheduleScrollState, { passive: true });

    return () => {
      window.cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      track.removeEventListener('pointerdown', unlockEndReached);
      track.removeEventListener('wheel', unlockEndReached);
      track.removeEventListener('keydown', unlockEndReached);
      track.removeEventListener('scroll', scheduleScrollState);

      if (scrollFrameRef.current !== null) {
        window.cancelAnimationFrame(scrollFrameRef.current);
        scrollFrameRef.current = null;
      }
    };
  }, [endReachedRequiresInteraction, updateScrollState]);

  useEffect(() => {
    if (loading || !hasMore) {
      endRequestLatchRef.current = false;
    }

    const frame = requestAnimationFrame(updateScrollState);
    return () => cancelAnimationFrame(frame);
  }, [childCount, hasMore, loading, updateScrollState]);

  useEffect(() => {
    if (!loading) {
      endRequestLatchRef.current = false;
      const frame = requestAnimationFrame(updateScrollState);
      return () => cancelAnimationFrame(frame);
    }
  }, [loading, updateScrollState]);

  useEffect(() => {
    const root = trackRef.current;
    const target = sentinelRef.current;

    if (!root || !target || !onEndReached || !hasMore || loading) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (
          entry?.isIntersecting &&
          endInteractionUnlockedRef.current &&
          !endRequestLatchRef.current
        ) {
          endRequestLatchRef.current = true;
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

      endInteractionUnlockedRef.current = true;
      endRequestLatchRef.current = false;

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

  const renderedRange = virtualActive
    ? clampVirtualRange(virtualRange, childCount, maxVirtualItems)
    : { start: 0, end: childCount };

  const renderedChildren = virtualActive
    ? childArray.slice(renderedRange.start, renderedRange.end)
    : childArray;

  const stride = virtualGeometry.itemWidth + virtualGeometry.gap;
  const leftCount = virtualActive ? renderedRange.start : 0;
  const rightCount = virtualActive ? childCount - renderedRange.end : 0;
  const leftSpacerWidth =
    leftCount > 0 && stride > 0
      ? Math.max(0, leftCount * stride - virtualGeometry.gap)
      : 0;
  const rightSpacerWidth =
    rightCount > 0 && stride > 0
      ? Math.max(0, rightCount * stride - virtualGeometry.gap)
      : 0;

  return (
    <div
      className={[styles.wrapper, className].filter(Boolean).join(' ')}
      data-scroll-row-virtualized={virtualActive ? 'true' : 'false'}
      data-scroll-row-total={childCount}
      data-scroll-row-rendered={renderedChildren.length}
    >
      <div
        ref={trackRef}
        className={styles.track}
        role="region"
        aria-label={ariaLabel}
        tabIndex={0}
      >
        {leftSpacerWidth > 0 && (
          <div
            className={styles.virtualSpacer}
            data-scroll-row-spacer="left"
            style={{ width: leftSpacerWidth }}
            aria-hidden="true"
          />
        )}

        {renderedChildren}

        {rightSpacerWidth > 0 && (
          <div
            className={styles.virtualSpacer}
            data-scroll-row-spacer="right"
            style={{ width: rightSpacerWidth }}
            aria-hidden="true"
          />
        )}

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
