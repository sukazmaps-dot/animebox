'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import AnimeCard from '@/components/AnimeCard';
import type { Anime } from '@/types/anime';

type HomeAnimeRailProps = {
  items: Anime[];
  ariaLabel: string;
};

export default function HomeAnimeRail({
  items,
  ariaLabel,
}: HomeAnimeRailProps) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(items.length > 5);

  const updateControls = useCallback(() => {
    const viewport = viewportRef.current;

    if (!viewport) return;

    const maxScrollLeft = Math.max(
      0,
      viewport.scrollWidth - viewport.clientWidth,
    );

    setCanGoBack(viewport.scrollLeft > 4);
    setCanGoForward(maxScrollLeft > 4 && viewport.scrollLeft < maxScrollLeft - 4);
  }, []);

  useEffect(() => {
    const viewport = viewportRef.current;

    if (!viewport) return;

    /*
     * Измеряем rail не только сразу после mount. На production CSS, шрифты и
     * карточки могут окончательно получить размеры уже после первого effect.
     * Из-за этого старый вариант иногда видел scrollWidth === clientWidth и
     * навсегда скрывал правую стрелку.
     */
    let frame1 = 0;
    let frame2 = 0;
    let delayedMeasure = 0;

    const measureAfterLayout = () => {
      frame1 = window.requestAnimationFrame(() => {
        updateControls();
        frame2 = window.requestAnimationFrame(updateControls);
      });

      delayedMeasure = window.setTimeout(updateControls, 180);
    };

    measureAfterLayout();

    const onScroll = () => updateControls();
    const onResize = () => updateControls();

    viewport.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize);

    const resizeObserver =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(updateControls)
        : null;

    resizeObserver?.observe(viewport);
    viewport.querySelectorAll<HTMLElement>('.anime-card').forEach((card) => {
      resizeObserver?.observe(card);
    });

    const mutationObserver =
      typeof MutationObserver !== 'undefined'
        ? new MutationObserver(measureAfterLayout)
        : null;

    mutationObserver?.observe(viewport, {
      childList: true,
      subtree: false,
    });

    return () => {
      window.cancelAnimationFrame(frame1);
      window.cancelAnimationFrame(frame2);
      window.clearTimeout(delayedMeasure);
      viewport.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
      resizeObserver?.disconnect();
      mutationObserver?.disconnect();
    };
  }, [items.length, updateControls]);

  const move = (direction: -1 | 1) => {
    const viewport = viewportRef.current;

    if (!viewport) return;

    const firstCard = viewport.querySelector<HTMLElement>('.anime-card');
    const cardWidth = firstCard?.getBoundingClientRect().width ?? 220;
    const gap = Number.parseFloat(getComputedStyle(viewport).columnGap || '0') || 0;

    /* Листаем почти экраном, но привязываемся к целому числу карточек. */
    const visibleCards = Math.max(
      1,
      Math.floor((viewport.clientWidth + gap) / (cardWidth + gap)),
    );

    viewport.scrollBy({
      left: direction * visibleCards * (cardWidth + gap),
      behavior: 'smooth',
    });
  };

  return (
    <div className="home-anime-rail">
      <button
        type="button"
        className="home-anime-rail__arrow home-anime-rail__arrow--prev"
        onClick={() => move(-1)}
        disabled={!canGoBack}
        aria-label={`Предыдущие: ${ariaLabel}`}
      >
        ‹
      </button>

      <div
        ref={viewportRef}
        className="home-anime-rail__viewport"
        aria-label={ariaLabel}
      >
        {items.map((anime) => (
          <AnimeCard key={anime.id} anime={anime} />
        ))}
      </div>

      <button
        type="button"
        className="home-anime-rail__arrow home-anime-rail__arrow--next"
        onClick={() => move(1)}
        disabled={!canGoForward}
        aria-label={`Следующие: ${ariaLabel}`}
      >
        ›
      </button>
    </div>
  );
}
