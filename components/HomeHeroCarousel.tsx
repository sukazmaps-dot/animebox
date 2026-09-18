'use client';

import { animeHref } from '@/lib/anime-url';

import {
  useEffect,
  useMemo,
  useState,
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

import {
  getAnimeOriginalTitle,
  getAnimeTitle,
  isAnimeOngoing,
} from '@/lib/anime-display';

import {
  getAnimeById,
  isAbortError,
} from '@/lib/anime-client';

interface HomeHeroCarouselProps {
  popular: Anime[];
  ongoing: Anime[];
}

function getEpisodeCount(
  anime: Anime,
): number | null {
  return anime.episodes &&
    anime.episodes > 0
    ? anime.episodes
    : null;
}

function formatLabel(
  format: string | null | undefined,
): string {
  if (!format) {
    return 'ANIME';
  }

  const labels: Record<string, string> = {
    TV: 'TV',
    'ТВ': 'TV',

    TV_SHORT: 'TV SHORT',
    'ТВ (Короткое)': 'TV SHORT',

    MOVIE: 'ФИЛЬМ',
    'Фильм': 'ФИЛЬМ',

    OVA: 'OVA',
    ONA: 'ONA',

    SPECIAL: 'СПЕЦВЫПУСК',
    'Спешл': 'СПЕЦВЫПУСК',

    MUSIC: 'МУЗЫКА',
    'Клип': 'МУЗЫКА',
  };

  return labels[format] ?? format;
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

  const candidates = useMemo(
    () =>
      getRecommendedAnime(
        source,
        6,
      ).filter(isValidAnime),
    [source],
  );

  const slides =
    candidates.length > 0
      ? candidates
      : source.slice(0, 6);

  const [
    activeIndex,
    setActiveIndex,
  ] = useState(0);

  const [paused, setPaused] =
    useState(false);

  /*
   * undefined = сейчас загружается
   * null = русского описания нет
   * string = описание загружено
   */
  const [
    localizedDescription,
    setLocalizedDescription,
  ] = useState<string | null | undefined>(
    undefined,
  );

  const anime =
    slides[activeIndex] ??
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
    setActiveIndex(0);
  }, [slides.length]);

  useEffect(() => {
    if (
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
    paused,
    slides.length,
  ]);

  /*
   * Подгружаем полную карточку
   * только для активного Hero.
   *
   * Именно detail endpoint должен
   * вернуть русское описание Shikimori.
   */
  useEffect(() => {
    if (!anime?.id) {
      setLocalizedDescription(null);
      return;
    }

    const controller =
      new AbortController();

    setLocalizedDescription(
      undefined,
    );

    getAnimeById(
      anime.id,
      {
        signal:
          controller.signal,
      },
    )
      .then((fullAnime) => {
        if (
          controller.signal.aborted
        ) {
          return;
        }

        const description =
          fullAnime?.description
            ?.trim() || null;

        setLocalizedDescription(
          description,
        );
      })
      .catch((error: unknown) => {
        if (
          controller.signal.aborted ||
          isAbortError(error)
        ) {
          return;
        }

        console.error(
          `Не удалось загрузить описание anime ${anime.id}:`,
          error,
        );

        setLocalizedDescription(
          null,
        );
      });

    return () => {
      controller.abort();
    };
  }, [anime?.id]);

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

  const originalTitle =
    getAnimeOriginalTitle(anime);

  const bannerImage =
    normalizeImageUrl(
      anime.bannerImage,
    );

  const episodeCount =
    getEpisodeCount(anime);

  const isOngoing =
    isAnimeOngoing(anime);

  const genres =
    Array.isArray(anime.genres)
      ? anime.genres
      : [];

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

  return (
    <section
      className={`page-hero home-hero-carousel ${bannerImage ? 'has-banner' : 'no-banner'}`}
      aria-label="Рекомендации аниме"
      onMouseEnter={() =>
        setPaused(true)
      }
      style={{
        ['--hero-ambient-rgb' as string]: `${ambientR}, ${ambientG}, ${ambientB}`,
      }}
      onPointerMove={handlePointerMove}
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
          priority={activeIndex === 0}
          sizes="(max-width: 760px) 100vw, (max-width: 1280px) 75vw, 980px"
          className="page-hero__backdrop home-hero-carousel__backdrop is-visible"
          aria-hidden="true"
        />
      )}

      <div className="page-hero__overlay" />

      <div
        className="page-hero__content home-hero-carousel__content"
        key={`content-${anime.id}`}
      >
        <div className="page-hero__eyebrow">
          <span className="pill pill--accent">
            {activeIndex === 0
              ? 'Для тебя'
              : 'Рекомендация'}
          </span>

          {isOngoing && (
            <span className="pill">
              Онгоинг
            </span>
          )}

          {anime.score != null && (
            <span className="pill">
              ★ {anime.score}
            </span>
          )}
        </div>

        {originalTitle && (
          <span className="home-hero-carousel__kicker">
            {originalTitle}
          </span>
        )}

        <h1>
          {title}
        </h1>

        <p>
          {localizedDescription ===
          undefined
            ? 'Загружаем описание…'
            : localizedDescription ||
              'Русское описание для этого аниме пока отсутствует.'}
        </p>

        <div className="home-hero-carousel__facts">
          <span>
            {formatLabel(
              anime.format,
            )}
          </span>

          {episodeCount != null && (
            <span>
              {isOngoing
                ? `Вышло ${episodeCount}`
                : `${episodeCount} эп.`}
            </span>
          )}

          {genres
            .slice(0, 2)
            .map((genre) => (
              <span key={genre}>
                {genre}
              </span>
            ))}
        </div>

        <div className="hero-actions">
          <Link
            className="btn btn--primary"
            href={animeHref(anime)}
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
          <button
            type="button"
            aria-label="Предыдущая рекомендация"
            className="home-hero-carousel__arrow"
            onClick={() =>
              setActiveIndex(
                (current) =>
                  (
                    current -
                    1 +
                    slides.length
                  ) %
                  slides.length,
              )
            }
          >
            ‹
          </button>

          <div className="home-hero-carousel__dots">
            {slides.map(
              (item, index) => (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={index === activeIndex}
                  aria-label={`Открыть рекомендацию ${
                    index + 1
                  }`}
                  className={`home-hero-carousel__dot ${
                    index ===
                    activeIndex
                      ? 'is-active'
                      : ''
                  }`}
                  onClick={() =>
                    setActiveIndex(
                      index,
                    )
                  }
                />
              ),
            )}
          </div>

          <button
            type="button"
            aria-label="Следующая рекомендация"
            className="home-hero-carousel__arrow"
            onClick={() =>
              setActiveIndex(
                (current) =>
                  (current + 1) %
                  slides.length,
              )
            }
          >
            ›
          </button>
        </div>
      )}
    </section>
  );
}