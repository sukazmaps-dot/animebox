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
import homeSocialStyles from '@/components/HomeHeroSocialLink.module.css';
import factStyles from '@/components/HomeHeroFacts.module.css';
import HomeHeroPagination from '@/components/HomeHeroPagination';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import type {
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
} from 'react';

import type { Anime } from '@/types/anime';

import Icon from '@/components/Icon';

import {
  normalizeImageUrl,
} from '@/lib/image-service';
import {
  buildAnimeBoxMediaCandidates,
  buildAnimeBoxMediaDefaultVariant,
  buildAnimeBoxMediaSrcSet,
  type MediaImagePreset,
} from '@/lib/media-delivery';

import { getAnimeTitle } from '@/lib/anime-display';
import { cleanSeoText, truncateSeoText } from '@/lib/seo-text';
import { normalizedAnimeScore } from '@/lib/anime-score';
import { localizeDetailGenres } from '@/lib/anime-detail-genres';
import { mobileHeroObjectPosition } from '@/lib/home-hero-art';


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

type HeroImageAttempt = {
  src: string;
  /** Browser may choose a smaller Cloudflare/R2 variant before the source URL. */
  srcSet?: string;
  /** Large desktops can use the native source above R2's 1440px variant cap. */
  ultraWideSrc?: string;
  fallback: boolean;
};

function uniqueImageSources(values: Array<string | null | undefined>) {
  const seen = new Set<string>();
  const sources: string[] = [];

  for (const value of values) {
    const normalized = normalizeImageUrl(value);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    sources.push(normalized);
  }

  return sources;
}

function buildHeroImageAttempts(
  sources: string[],
  preset: MediaImagePreset,
): HeroImageAttempt[] {
  const first = sources[0];
  if (!first) return [];

  const variant = buildAnimeBoxMediaDefaultVariant(first, preset, 80, 'webp');
  const edge = buildAnimeBoxMediaCandidates(first, variant);
  const responsive = buildAnimeBoxMediaSrcSet(first, preset, 80, 'webp');

  // The original URLs remain in the chain. On an edge 403/timeout, the
  // picture onError moves on to a direct origin before changing the artwork.
  return [
    ...edge.map((src, index) => ({
      src,
      srcSet: index === 0 ? responsive : undefined,
      ultraWideSrc: index === 0 ? first : undefined,
      fallback: index > 0,
    })),
    ...sources.map((src) => ({ src, fallback: true })),
  ];
}

function getHeroBackdropAttempts(anime: Anime): HeroImageAttempt[] {
  return buildHeroImageAttempts(
    uniqueImageSources([
      anime.bannerImage,
      anime.mobileHeroImage,
      anime.coverImage?.extraLarge,
      anime.image?.original,
      anime.coverImage?.large,
      anime.image?.large,
      anime.image?.medium,
    ]),
    'hero',
  );
}

function getMobileHeroAttempts(anime: Anime): HeroImageAttempt[] {
  return buildHeroImageAttempts(
    uniqueImageSources([
      // Dedicated phone artwork takes precedence over catalogue posters.
      anime.mobileHeroImage,
      anime.coverImage?.extraLarge,
      anime.coverImage?.large,
      anime.image?.original,
      anime.image?.large,
      anime.image?.medium,
      anime.bannerImage,
    ]),
    'large',
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
  const router = useRouter();
  const heroRef = useRef<HTMLElement | null>(null);
  const suppressHeroClickUntil = useRef(0);
  const parallaxFrameRef = useRef<number | null>(null);
  const parallaxRectRef = useRef<DOMRect | null>(null);
  const parallaxPointRef = useRef({ x: 0, y: 0 });
  const [heroInView, setHeroInView] = useState(true);
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

  const [personalizedCandidates, setPersonalizedCandidates] =
    useState<Anime[]>([]);

  useEffect(() => {
    if (!personalizationReady || source.length === 0) return;

    let cancelled = false;
    let timer: number | null = null;
    let idleHandle: number | null = null;

    const idleWindow = window as Window & {
      requestIdleCallback?: (
        callback: IdleRequestCallback,
        options?: IdleRequestOptions,
      ) => number;
      cancelIdleCallback?: (handle: number) => void;
    };

    const loadRecommendations = () => {
      void import('@/lib/recommendations')
        .then(({ getRecommendedAnime }) => {
          if (cancelled) return;

          const sourceIds = new Set(source.map((item) => item.id));
          const next = getRecommendedAnime(source, 5)
            .filter(isValidAnime)
            .filter((item) => sourceIds.has(item.id));

          setPersonalizedCandidates(next);
        })
        .catch((error) => {
          console.debug('[HomeHero] personalization chunk unavailable', error);
        });
    };

    if (idleWindow.requestIdleCallback) {
      idleHandle = idleWindow.requestIdleCallback(
        loadRecommendations,
        { timeout: 1_200 },
      );
    } else {
      timer = window.setTimeout(loadRecommendations, 220);
    }

    return () => {
      cancelled = true;

      if (timer !== null) {
        window.clearTimeout(timer);
      }

      if (idleHandle !== null) {
        idleWindow.cancelIdleCallback?.(idleHandle);
      }
    };
  }, [personalizationReady, source]);

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
      if (unique.length >= 5) break;
    }

    return unique;
  }, [personalizationReady, personalizedCandidates, source]);

  const [
    activeIndex,
    setActiveIndex,
  ] = useState(0);

  const [paused, setPaused] =
    useState(false);

  const [backdropAttemptIndex, setBackdropAttemptIndex] = useState(0);
  const [mobileAttemptIndex, setMobileAttemptIndex] = useState(0);
  const [ultraWideOriginFailed, setUltraWideOriginFailed] = useState(false);

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

  // URLSearchParams/srcset generation is unnecessary during hover and
  // pagination focus updates; only recalculate when the selected anime changes.
  const imageAttempts = useMemo(() => ({
    backdrop: anime ? getHeroBackdropAttempts(anime) : [],
    mobile: anime ? getMobileHeroAttempts(anime) : [],
  }), [anime]);

  useEffect(() => {
    queueMicrotask(() => {
      setBackdropAttemptIndex(0);
      setMobileAttemptIndex(0);
      setUltraWideOriginFailed(false);
    });
  }, [anime?.id]);

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
    const element = heroRef.current;
    if (!element || typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setHeroInView(entry.isIntersecting && entry.intersectionRatio >= 0.22);
      },
      { threshold: [0, 0.22, 0.5] },
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    return () => {
      if (parallaxFrameRef.current !== null) {
        window.cancelAnimationFrame(parallaxFrameRef.current);
        parallaxFrameRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (
      !autoplayUnlocked ||
      paused ||
      !heroInView ||
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
    heroInView,
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
  const heroSummary = truncateSeoText(cleanSeoText(anime.description), 160);
  const score = normalizedAnimeScore(anime);
  const year = anime.startDate?.year;
  const validYear = typeof year === 'number' && Number.isInteger(year) && year >= 1900 && year <= 2100;
  const genre = localizeDetailGenres(anime.genres ?? [])[0]?.label;

  const backdropAttempts = imageAttempts.backdrop;
  const mobileAttempts = imageAttempts.mobile;

  const backdropAttempt =
    backdropAttempts[backdropAttemptIndex] ??
    null;

  const mobileAttempt =
    mobileAttempts[mobileAttemptIndex] ??
    null;

  const bannerImage = backdropAttempt?.src ?? null;
  const mobileKeyArt = mobileAttempt?.src ?? null;

  const [ambientR, ambientG, ambientB] = getAmbientRgb(anime);

  const handlePointerEnter = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.pointerType !== 'touch') {
      parallaxRectRef.current = event.currentTarget.getBoundingClientRect();
    }

    setPaused(true);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.pointerType === 'touch') return;

    parallaxPointRef.current = {
      x: event.clientX,
      y: event.clientY,
    };

    if (parallaxFrameRef.current !== null) return;

    const element = event.currentTarget;

    parallaxFrameRef.current = window.requestAnimationFrame(() => {
      parallaxFrameRef.current = null;

      const rect =
        parallaxRectRef.current ??
        element.getBoundingClientRect();

      parallaxRectRef.current = rect;

      if (rect.width <= 0 || rect.height <= 0) return;

      const point = parallaxPointRef.current;
      const x = (point.x - rect.left) / rect.width - 0.5;
      const y = (point.y - rect.top) / rect.height - 0.5;

      element.style.setProperty(
        '--hero-parallax-x',
        `${x * -10}px`,
      );
      element.style.setProperty(
        '--hero-parallax-y',
        `${y * -7}px`,
      );
    });
  };

  const resetParallax = (element: HTMLElement) => {
    if (parallaxFrameRef.current !== null) {
      window.cancelAnimationFrame(parallaxFrameRef.current);
      parallaxFrameRef.current = null;
    }

    parallaxRectRef.current = null;
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

    suppressHeroClickUntil.current = performance.now() + 450;

    if (deltaX > 0) {
      showPreviousSlide();
    } else {
      showNextSlide();
    }
  };

  const openHeroDetails = (event: ReactMouseEvent<HTMLElement>) => {
    if (performance.now() < suppressHeroClickUntil.current) return;

    const target = event.target as Element | null;
    if (target?.closest('a, button, input, textarea, select')) return;

    router.push(animeHref(anime));
  };

  return (
    <section
      ref={heroRef}
      className={[
        'page-hero',
        'home-hero-carousel',
        bannerImage ? 'has-banner' : 'no-banner',
        backdropAttempt?.fallback ? 'is-backdrop-fallback' : '',
        autoplayUnlocked ? 'is-motion-ready' : '',
        autoplayUnlocked && safeActiveIndex !== 0 ? 'is-slide-transition' : '',
      ].filter(Boolean).join(' ')}
      aria-label="Рекомендации аниме"
      onClick={openHeroDetails}
      onPointerEnter={handlePointerEnter}
      style={{
        ['--hero-ambient-rgb' as string]: `${ambientR}, ${ambientG}, ${ambientB}`,
        ['--hero-mobile-position' as string]: mobileHeroObjectPosition(anime),
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
      {(bannerImage || mobileKeyArt) && (
        // One responsive <picture>, not two separate <img> downloads on phones.
        // Desktop keeps cinematic scenery; portrait screens get the mobile art.
        <picture>
          {/* R2 currently tops out at 1440px: keep original detail on 2K/4K screens. */}
          {!ultraWideOriginFailed && backdropAttempt?.ultraWideSrc && (
            <source
              media="(min-width: 2400px)"
              srcSet={backdropAttempt.ultraWideSrc}
              sizes="(min-width: 3400px) 2100px, (min-width: 3000px) 1950px, (min-width: 2400px) 1750px"
            />
          )}
          {mobileKeyArt && (
            <source
              media="(max-width: 768px)"
              srcSet={mobileAttempt?.srcSet ?? mobileKeyArt}
              sizes="(max-width: 768px) calc(100vw - 32px), 1px"
            />
          )}
          {backdropAttempt?.srcSet && (
            <source
              media="(min-width: 769px)"
              srcSet={backdropAttempt.srcSet}
              sizes="(min-width: 3400px) 2100px, (min-width: 3000px) 1950px, (min-width: 2400px) 1750px, (min-width: 1920px) 1500px, (max-width: 1200px) calc(100vw - 100px), 1380px"
            />
          )}
          <Image
            key={`${anime.id}-art-${backdropAttemptIndex}-${mobileAttemptIndex}-${ultraWideOriginFailed}`}
            src={bannerImage ?? mobileKeyArt ?? '/anime-placeholder.svg'}
            alt=""
            fill
            // React responsive image source selection handles media-specific
            // fetch priority; an unconditional preload would waste a request.
            priority={false}
            fetchPriority={safeActiveIndex === 0 ? 'high' : 'auto'}
            loading={safeActiveIndex === 0 ? 'eager' : 'lazy'}
            decoding="async"
            unoptimized
            sizes="(min-width: 1920px) 1500px, (max-width: 768px) calc(100vw - 32px), (max-width: 1200px) calc(100vw - 100px), 1380px"
            className="page-hero__backdrop home-hero-carousel__backdrop is-visible"
            aria-hidden="true"
            onError={(event) => {
              // The ultra-wide source bypasses the first CDN attempt. Retry
              // that unused attempt before advancing to alternate artwork.
              if (
                !ultraWideOriginFailed &&
                window.matchMedia('(min-width: 2400px)').matches &&
                event.currentTarget.currentSrc === backdropAttempt?.ultraWideSrc
              ) {
                setUltraWideOriginFailed(true);
                return;
              }
              if (window.matchMedia('(max-width: 768px)').matches && mobileKeyArt) {
                setMobileAttemptIndex((current) => current + 1);
              } else {
                setBackdropAttemptIndex((current) => current + 1);
              }
            }}
          />
        </picture>
      )}

      <div className="page-hero__overlay" />

      <div
        className="page-hero__content home-hero-carousel__content"
        key={`content-${anime.id}`}
      >
        <span className="home-hero-scene__eyebrow"><span aria-hidden="true" /> Открой для себя</span>
        <h1 title={title} className={title.length > 55 ? 'is-long-title' : undefined}>
          {title}
        </h1>

        {(validYear || genre || score != null) && (
          <div className={factStyles.facts}>
            {validYear && <span>{year}</span>}
            {genre && <span>{genre}</span>}
            {score != null && <span className={factStyles.score} aria-label={`Рейтинг: ${score.toFixed(1)} из 10`}>★ {score.toFixed(1)}</span>}
          </div>
        )}
        {heroSummary && <p className="home-hero-scene__summary">{heroSummary}</p>}

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
        <Link href="/watch-together" className={homeSocialStyles.link}>
          <span aria-hidden="true">✦</span> Смотреть вместе с друзьями →
        </Link>
      </div>

      <HomeHeroPagination
        slides={slides.map((slide) => ({ id: slide.id, title: getAnimeTitle(slide) }))}
        activeIndex={safeActiveIndex}
        onSelect={setActiveIndex}
      />
    </section>
  );
}
