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
  const [canGoForward, setCanGoForward] = useState(false);

  const updateControls = useCallback(() => {
    const viewport = viewportRef.current;

    if (!viewport) {
      return;
    }

    const maxScrollLeft = Math.max(
      0,
      viewport.scrollWidth - viewport.clientWidth,
    );

    setCanGoBack(viewport.scrollLeft > 4);
    setCanGoForward(viewport.scrollLeft < maxScrollLeft - 4);
  }, []);

  useEffect(() => {
    const viewport = viewportRef.current;

    if (!viewport) {
      return;
    }

    updateControls();

    const onScroll = () => updateControls();
    const onResize = () => updateControls();

    viewport.addEventListener('scroll', onScroll, {
      passive: true,
    });
    window.addEventListener('resize', onResize);

    const observer =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(updateControls)
        : null;

    observer?.observe(viewport);

    return () => {
      viewport.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
      observer?.disconnect();
    };
  }, [items.length, updateControls]);

  const move = (direction: -1 | 1) => {
    const viewport = viewportRef.current;

    if (!viewport) {
      return;
    }

    viewport.scrollBy({
      left: direction * Math.max(240, viewport.clientWidth * 0.88),
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
          <AnimeCard
            key={anime.id}
            anime={anime}
          />
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
