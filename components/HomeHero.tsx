'use client';

import { animeHref } from '@/lib/anime-url';

import Link from 'next/link';
import {
  useEffect,
  useMemo,
  useState,
} from 'react';

import type { Anime } from '@/types/anime';

import AnimeImage from '@/components/AnimeImage';
import Icon from '@/components/Icon';

import {
  normalizeImageUrl,
} from '@/lib/image-service';

import {
  getAnimeTitle,
  getAnimeOriginalTitle,
  isAnimeOngoing,
} from '@/lib/anime-display';

function uniqueById(
  items: Anime[],
): Anime[] {
  const map =
    new Map<number, Anime>();

  for (const item of items) {
    if (
      item &&
      !map.has(item.id)
    ) {
      map.set(
        item.id,
        item,
      );
    }
  }

  return [
    ...map.values(),
  ];
}

export default function HomeHero({
  items,
}: {
  items: Anime[];
}) {
  const slides = useMemo(
    () =>
      uniqueById(
        Array.isArray(items)
          ? items
          : [],
      ).slice(0, 6),
    [items],
  );

  const [
    active,
    setActive,
  ] = useState(0);

  const [
    paused,
    setPaused,
  ] = useState(false);

  useEffect(() => {
    if (
      slides.length < 2 ||
      paused
    ) {
      return;
    }

    const timer =
      window.setInterval(() => {
        setActive(
          (current) =>
            (current + 1) %
            slides.length,
        );
      }, 6500);

    return () => {
      window.clearInterval(
        timer,
      );
    };
  }, [
    slides.length,
    paused,
  ]);

  useEffect(() => {
    if (
      active >= slides.length
    ) {
      setActive(0);
    }
  }, [
    active,
    slides.length,
  ]);

  const anime =
    slides[active];

  if (!anime) {
    return (
      <section className="rounded-[28px] border border-white/10 bg-[#0a1422] p-8 shadow-2xl">
        <div className="animate-pulse space-y-5">
          <div className="h-5 w-40 rounded-full bg-white/5" />

          <div className="h-14 w-3/4 rounded-2xl bg-white/5" />

          <div className="h-4 w-2/3 rounded-full bg-white/5" />

          <div className="h-10 w-56 rounded-xl bg-white/5" />
        </div>
      </section>
    );
  }

  const title =
    getAnimeTitle(anime);

  const originalTitle =
    getAnimeOriginalTitle(
      anime,
    );

  const isOngoing =
    isAnimeOngoing(anime);

  /*
   * Большой широкий фон:
   * ТОЛЬКО bannerImage.
   *
   * Вертикальный coverImage
   * сюда не подставляем.
   */
  const background =
    normalizeImageUrl(
      anime.bannerImage,
    );

  /*
   * Вертикальный постер:
   * сначала coverImage,
   * затем старое поле image.
   */
  const poster =
    anime.coverImage ??
    anime.image ??
    null;

  return (
    <section
      className="group relative min-h-[400px] overflow-hidden rounded-[28px] border border-white/10 bg-[#091320] shadow-[0_28px_70px_rgba(0,0,0,.28)]"
      onMouseEnter={() =>
        setPaused(true)
      }
      onMouseLeave={() =>
        setPaused(false)
      }
      onFocusCapture={() =>
        setPaused(true)
      }
      onBlurCapture={() =>
        setPaused(false)
      }
    >
      {background && (
        <div
          aria-hidden="true"
          className="absolute inset-0 scale-105 bg-cover bg-center opacity-35 blur-[1px] transition-transform duration-700 group-hover:scale-110"
          style={{
            backgroundImage:
              `url("${background}")`,
          }}
        />
      )}

      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(5,10,18,.98)_0%,rgba(5,10,18,.9)_38%,rgba(5,10,18,.54)_66%,rgba(5,10,18,.72)_100%)]" />

      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(5,10,18,.12),#08111d_94%)]" />

      <div className="relative z-10 grid min-h-[400px] grid-cols-1 items-center gap-8 px-6 py-8 sm:px-8 lg:grid-cols-[minmax(0,1fr)_230px] lg:px-10">
        <div className="max-w-2xl">
          <div className="mb-4 flex flex-wrap gap-2">
            <span className="rounded-full border border-violet-400/20 bg-violet-500/15 px-3 py-1 text-[10px] font-semibold text-violet-200">
              Рекомендация
            </span>

            <span className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-[10px] text-slate-200">
              {isOngoing
                ? 'Онгоинг'
                : 'Завершено'}
            </span>

            <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-[10px] text-slate-200">
              <Icon
                name="star"
                width={11}
                height={11}
              />

              {anime.score ?? '—'}
            </span>
          </div>

          {originalTitle && (
            <p className="mb-2 text-[10px] uppercase tracking-[0.18em] text-slate-400/80">
              {originalTitle}
            </p>
          )}

          <h1 className="max-w-[760px] text-4xl font-semibold leading-[0.98] tracking-[-0.045em] text-white sm:text-5xl lg:text-[3.45rem]">
            {title}
          </h1>

          <p className="mt-5 line-clamp-3 max-w-2xl text-sm leading-7 text-slate-300/80">
            {anime.description?.trim() ||
              'Подборка для продолжения просмотра и знакомства с новым тайтлом.'}
          </p>

          <div className="mt-7 flex flex-wrap gap-3">
            <Link
              href={animeHref(anime)}
              className="btn btn--primary"
            >
              <Icon
                name="play"
                width={15}
                height={15}
              />

              Смотреть
            </Link>

            <Link
              href={animeHref(anime)}
              className="btn btn--ghost"
            >
              Подробнее

              <Icon
                name="chevron"
                width={14}
                height={14}
              />
            </Link>
          </div>
        </div>

        {poster && (
          <Link
            href={animeHref(anime)}
            className="justify-self-center lg:justify-self-end"
          >
            <div className="relative w-[170px] sm:w-[190px] lg:w-[205px]">
              <div className="absolute -inset-4 rounded-[30px] bg-violet-500/15 blur-2xl transition duration-500 group-hover:bg-violet-500/25" />

              <div className="relative overflow-hidden rounded-[22px] border border-white/10 bg-white/[0.04] p-1 shadow-2xl transition duration-500 group-hover:-translate-y-2 group-hover:rotate-[1deg]">
                <AnimeImage
                  image={poster}
                  alt={title}
                  englishName={
                    anime.title?.english ||
                    anime.title?.romaji
                  }
                  className="aspect-[2/3] w-full rounded-[18px] object-cover"
                  loading="eager"
                />
              </div>
            </div>
          </Link>
        )}
      </div>

      {slides.length > 1 && (
        <div className="absolute bottom-5 left-6 z-20 flex items-center gap-1.5 sm:left-8 lg:left-10">
          {slides.map(
            (
              slide,
              index,
            ) => (
              <button
                key={slide.id}
                type="button"
                aria-label={`Открыть слайд ${
                  index + 1
                }`}
                onClick={() =>
                  setActive(index)
                }
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  index === active
                    ? 'w-8 bg-violet-400'
                    : 'w-1.5 bg-white/30 hover:bg-white/55'
                }`}
              />
            ),
          )}
        </div>
      )}

      {slides.length > 1 && (
        <button
          type="button"
          aria-label="Следующий слайд"
          onClick={() =>
            setActive(
              (current) =>
                (current + 1) %
                slides.length,
            )
          }
          className="absolute bottom-4 right-4 z-20 grid h-10 w-10 place-items-center rounded-xl border border-white/10 bg-black/20 text-white/75 backdrop-blur transition hover:bg-white/10 hover:text-white sm:right-6"
        >
          <Icon
            name="chevron"
            width={16}
            height={16}
          />
        </button>
      )}
    </section>
  );
}