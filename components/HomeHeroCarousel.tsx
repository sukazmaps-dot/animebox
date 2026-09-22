'use client';

import { animeHref, animeWatchHref } from '@/lib/anime-url';

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';

import Link from 'next/link';
import Image from 'next/image';
import type { PointerEvent as ReactPointerEvent } from 'react';

import type { Anime } from '@/types/anime';

import Icon from '@/components/Icon';

import {
  getRecommendedAnime,
} from '@/lib/recommendations';

import {
  normalizeImageUrl,
} from '@/lib/image-service';

import { getAnimeTitle } from '@/lib/anime-display';


function subscribeHydrationReady() {
  return () => undefined;
}

interface HomeHeroCarouselProps {
  popular: Anime[];
  ongoing: Anime[];
}

function isValidAnime(
  value: Anime | null | undefined,
): value is Anime {
  return Boolean(
    value &&
      Number.isInteger(value.id) &&
      value.id > 0,
  );
}

const AMBIENT_FALLBACKS = [
  [112, 84, 255],
  [55, 118, 255],
  [180, 63, 126],
  [33, 156, 181],
  [193, 92, 67],
  [94, 72, 190],
] as const;

function getAmbientRgb(anime: Anime): readonly [number, number, number] {
  const color = anime.coverImage?.color || anime.image?.color;

  if (typeof color === 'string') {
    const hex = color.trim().replace('#', '');

    if (/^[0-9a-fA-F]{6}$/.test(hex)) {
      return [
        Number.parseInt(hex.slice(0, 2), 16),
        Number.parseInt(hex.slice(2, 4), 16),
        Number.parseInt(hex.slice(4, 6), 16),
      ];
    }
  }

  return AMBIENT_FALLBACKS[Math.abs(anime.id) % AMBIENT_FALLBACKS.length];
}

export default function HomeHeroCarousel({
  popular,
  ongoing,
}: HomeHeroCarouselProps) {
  const source = useMemo(
    () =>
      [
        ...(Array.isArray(popular)
          ? popular
          : []),

        ...(Array.isArray(ongoing)
          ? ongoing
          : []),
      ].filter(isValidAnime),
    [popular, ongoing],
  );

  /*
   * Keep the very first SSR/LCP slide deterministic. getRecommendedAnime()
   * reads browser-local taste/history, so calling it during the first client
   * render can produce a different order than the server HTML and swap the
   * LCP image during hydration. Personalization is enabled only after mount,
   * while source[0] stays pinned as the first slide.
   */
  const personalizationReady = useSyncExternalStore(
    subscribeHydrationReady,
    () => true,
    () => false,
  );

  const personalizedCandidates = useMemo(
    () =>
      personalizationReady
        ? getRecommendedAnime(source, 6).filter(isValidAnime)
        : [],
    [personalizationReady, source],
  );

  const slides = useMemo(() => {
    if (source.length === 0) return [];

    const first = source[0];
    const ordered = personalizationReady
      ? [first, ...personalizedCandidates, ...source]
      : source;

    const seen = new Set<number>();
    const unique: Anime[] = [];

    for (const item of ordered) {
      if (!isValidAnime(item) || seen.has(item.id)) continue;
      seen.add(item.id);
      unique.push(item);
      if (unique.length >= 6) break;
    }

    return unique;
  }, [personalizationReady, personalizedCandidates, source]);

  const [
    activeIndex,
    setActiveIndex,
  ] = useState(0);

  const [paused, setPaused] =
    useState(false);

  // Do not rotate the largest above-the-fold content before the visitor has
  // interacted with the page. A timed hero swap can become a new LCP
  // candidate several seconds after first paint (and Lighthouse/Core Web
  // Vitals will correctly report that late swap as LCP). Once the first
  // pointer/keyboard/wheel interaction happens, LCP has been finalized and
  // the carousel may safely resume its normal autoplay behaviour.
  const [autoplayUnlocked, setAutoplayUnlocked] =
    useState(false);

  const swipeGesture = useRef({
    pointerId: null as number | null,
    startX: 0,
    startY: 0,
    startedAt: 0,
    ignore: false,
  });

  const safeActiveIndex =
    slides.length > 0
      ? activeIndex % slides.length
      : 0;

  const anime =
    slides[safeActiveIndex] ??
    slides[0] ??
    null;

  useEffect(() => {
    if (!anime) return;

    const [r, g, b] = getAmbientRgb(anime);
    const root = document.documentElement;

    root.style.setProperty('--anime-ambient-rgb', `${r}, ${g}, ${b}`);

    return () => {
      root.style.removeProperty('--anime-ambient-rgb');
    };
  }, [anime]);

  useEffect(() => {
    if (autoplayUnlocked) {
      return;
    }

    const unlockAutoplay = () => {
      setAutoplayUnlocked(true);
    };

    window.addEventListener('pointerdown', unlockAutoplay, {
      once: true,
      passive: true,
    });
    window.addEventListener('wheel', unlockAutoplay, {
      once: true,
      passive: true,
    });
    window.addEventListener('keydown', unlockAutoplay, {
      once: true,
    });

    return () => {
      window.removeEventListener('pointerdown', unlockAutoplay);
      window.removeEventListener('wheel', unlockAutoplay);
      window.removeEventListener('keydown', unlockAutoplay);
    };
  }, [autoplayUnlocked]);

  useEffect(() => {
    if (
      !autoplayUnlocked ||
      paused ||
      slides.length < 2
    ) {
      return;
    }

    const timer =
      window.setInterval(() => {
        setActiveIndex(
          (current) =>
            (current + 1) %
            slides.length,
        );
      }, 6500);

    return () => {
      window.clearInterval(timer);
    };
  }, [
    autoplayUnlocked,
    paused,
    slides.length,
  ]);

  if (
    slides.length === 0 ||
    !anime
  ) {
    return (
      <section className="page-hero page-hero--empty">
        <div className="page-hero__content">
          <span className="pill pill--accent">
            ANIMEBOX
          </span>

          <h1>
            Найди следующий любимый тайтл
          </h1>

          <p>
            Пока не удалось загрузить рекомендации.
          </p>

          <Link
            className="btn btn--primary"
            href="/search"
          >
            <Icon name="search" />

            Найти аниме
          </Link>
        </div>
      </section>
    );
  }

  const title =
    getAnimeTitle(anime);

  const bannerImage =
    normalizeImageUrl(
      anime.bannerImage,
    );

  const mobileKeyArt =
    normalizeImageUrl(
      anime.coverImage?.extraLarge ||
      anime.coverImage?.large ||
      anime.image?.original ||
      anime.image?.large ||
      anime.image?.medium,
    );

  const [ambientR, ambientG, ambientB] = getAmbientRgb(anime);

  const handlePointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.pointerType === 'touch') return;

    const rect = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width - 0.5;
    const y = (event.clientY - rect.top) / rect.height - 0.5;

    event.currentTarget.style.setProperty('--hero-parallax-x', `${x * -10}px`);
    event.currentTarget.style.setProperty('--hero-parallax-y', `${y * -7}px`);
  };

  const resetParallax = (element: HTMLElement) => {
    element.style.setProperty('--hero-parallax-x', '0px');
    element.style.setProperty('--hero-parallax-y', '0px');
  };

  const showPreviousSlide = () => {
    if (slides.length < 2) return;

    setActiveIndex(
      (current) =>
        (current - 1 + slides.length) % slides.length,
    );
  };

  const showNextSlide = () => {
    if (slides.length < 2) return;

    setActiveIndex(
      (current) =>
        (current + 1) % slides.length,
    );
  };

  const handleSwipePointerDown = (
    event: ReactPointerEvent<HTMLElement>,
  ) => {
    if (
      event.pointerType !== 'touch' ||
      slides.length < 2
    ) {
      return;
    }

    const target = event.target as Element | null;
    const ignore = Boolean(
      target?.closest(
        'a, button, input, textarea, select, [data-no-hero-swipe]',
      ),
    );

    swipeGesture.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startedAt: performance.now(),
      ignore,
    };

    if (!ignore) {
      setPaused(true);

      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // Pointer capture can be unavailable in some embedded browsers.
      }
    }
  };

  const finishSwipeGesture = (
    event: ReactPointerEvent<HTMLElement>,
    cancelled = false,
  ) => {
    const gesture = swipeGesture.current;

    if (
      gesture.pointerId == null ||
      gesture.pointerId !== event.pointerId
    ) {
      return;
    }

    swipeGesture.current.pointerId = null;

    if (!gesture.ignore) {
      try {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
      } catch {
        // Safe fallback for Telegram/WebView implementations.
      }
    }

    setPaused(false);

    if (cancelled || gesture.ignore) {
      return;
    }

    const deltaX = event.clientX - gesture.startX;
    const deltaY = event.clientY - gesture.startY;
    const elapsed = performance.now() - gesture.startedAt;
    const width = event.currentTarget.getBoundingClientRect().width;
    const threshold = Math.min(90, Math.max(48, width * 0.12));

    const isHorizontalSwipe =
      Math.abs(deltaX) >= threshold &&
      Math.abs(deltaX) > Math.abs(deltaY) * 1.2 &&
      elapsed <= 1200;

    if (!isHorizontalSwipe) {
      return;
    }

    if (deltaX > 0) {
      showPreviousSlide();
    } else {
      showNextSlide();
    }
  };

  return (
    <section
      className={[
        'page-hero',
        'home-hero-carousel',
        bannerImage ? 'has-banner' : 'no-banner',
        autoplayUnlocked ? 'is-motion-ready' : '',
        autoplayUnlocked && safeActiveIndex !== 0 ? 'is-slide-transition' : '',
      ].filter(Boolean).join(' ')}
      aria-label="Рекомендации аниме"
      onMouseEnter={() =>
        setPaused(true)
      }
      style={{
        ['--hero-ambient-rgb' as string]: `${ambientR}, ${ambientG}, ${ambientB}`,
      }}
      onPointerDown={handleSwipePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={(event) => finishSwipeGesture(event)}
      onPointerCancel={(event) => finishSwipeGesture(event, true)}
      onPointerLeave={(event) => {
        resetParallax(event.currentTarget);
        setPaused(false);
      }}
      onMouseLeave={() =>
        setPaused(false)
      }
      onFocus={() =>
        setPaused(true)
      }
      onBlur={() =>
        setPaused(false)
      }
    >
      {bannerImage && (
        <Image
          key={`${anime.id}-backdrop`}
          src={bannerImage}
          alt=""
          fill
          priority={safeActiveIndex === 0}
          fetchPriority={safeActiveIndex === 0 ? 'high' : 'auto'}
          decoding="async"
          quality={82}
          sizes="(max-width: 390px) calc(100vw - 20px), (max-width: 768px) calc(100vw - 24px), (max-width: 1200px) calc(100vw - 100px), (max-width: 1700px) calc(100vw - 300px), 1380px"
          className="page-hero__backdrop home-hero-carousel__backdrop is-visible"
          aria-hidden="true"
        />
      )}

      {mobileKeyArt && (
        <div className="home-hero-carousel__mobile-keyart" aria-hidden="true">
          <Image
            key={`${anime.id}-mobile-keyart`}
            src={mobileKeyArt}
            alt=""
            fill
            priority={safeActiveIndex === 0}
            fetchPriority={safeActiveIndex === 0 ? 'high' : 'auto'}
            decoding="async"
            quality={88}
            sizes="(max-width: 390px) 54vw, (max-width: 768px) 50vw, 1px"
            className="home-hero-carousel__mobile-keyart-image"
          />
        </div>
      )}

      <div className="page-hero__overlay" />

      <div
        className="page-hero__content home-hero-carousel__content"
        key={`content-${anime.id}`}
      >
        <h1 className={title.length > 55 ? 'is-long-title' : undefined}>
          {title}
        </h1>

        <div className="hero-actions">
          <Link
            className="btn btn--primary"
            href={animeWatchHref(anime)}
          >
            <Icon name="play" />

            Смотреть
          </Link>

          <Link
            className="btn btn--ghost"
            href={animeHref(anime)}
          >
            Подробнее
          </Link>
        </div>
      </div>

      {slides.length > 1 && (
        <div className="home-hero-carousel__nav">
          <span className="home-hero-carousel__counter" aria-hidden="true">
            {String(safeActiveIndex + 1).padStart(2, '0')}
            <i>/</i>
            {String(slides.length).padStart(2, '0')}
          </span>
          <div className="home-hero-carousel__dots">
            {slides.map((item, index) => (
              <button
                key={item.id}
                type="button"
                aria-pressed={index === activeIndex}
                aria-label={`Показать: ${getAnimeTitle(item)}`}
                className={`home-hero-carousel__dot ${
                  index === activeIndex ? 'is-active' : ''
                }`}
                onClick={() => setActiveIndex(index)}
              />
            ))}
          </div>

        </div>
      )}
    </section>
  );
}
