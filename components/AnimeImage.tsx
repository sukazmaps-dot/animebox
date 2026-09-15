'use client';

import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import type {
  AnimeImage as ImageData,
} from '@/types/anime';

import {
  getImageCandidates,
} from '@/lib/image-service';

const FALLBACK =
  '/anime-placeholder.svg';

type Props = {
  image?: ImageData | null;
  alt?: string | null;
  englishName?: string | null;
  className?: string;
  loading?: 'lazy' | 'eager';
  preferOriginal?: boolean;
};

export default function AnimeImage({
  image,
  alt,
  englishName,
  className = '',
  loading = 'lazy',
}: Props) {
  const imageRef =
    useRef<HTMLImageElement>(null);

  const [
    sourceIndex,
    setSourceIndex,
  ] = useState(0);

  const [
    loaded,
    setLoaded,
  ] = useState(false);

  const sources = useMemo(() => {
    const candidates =
      getImageCandidates(image);

    return Array.from(
      new Set([
        ...candidates,
        FALLBACK,
      ]),
    );
  }, [image]);

  const sourcesKey =
    sources.join('|');

  useEffect(() => {
    setSourceIndex(0);
    setLoaded(false);
  }, [sourcesKey]);

  const current =
    sources[sourceIndex] ??
    FALLBACK;

  const isFallback =
    current === FALLBACK;

  const resolvedAlt =
    alt?.trim() ||
    englishName?.trim() ||
    'Аниме';

  const goToNextSource = () => {
    setLoaded(false);

    setSourceIndex(
      (previousIndex) => {
        const nextIndex =
          previousIndex + 1;

        if (
          nextIndex >=
          sources.length
        ) {
          return previousIndex;
        }

        return nextIndex;
      },
    );
  };

  const handleLoad = (
    event: React.SyntheticEvent<HTMLImageElement>,
  ) => {
    const element =
      event.currentTarget;

    if (
      element.naturalWidth > 0 &&
      element.naturalHeight > 0
    ) {
      setLoaded(true);
    }
  };

  const handleError = () => {
    if (!isFallback) {
      goToNextSource();
    } else {
      setLoaded(true);
    }
  };

  /**
   * Поддержка картинок из browser cache.
   *
   * image.src всегда абсолютный URL,
   * поэтому current тоже приводим к абсолютному.
   */
  useEffect(() => {
    const element =
      imageRef.current;

    if (!element) {
      return;
    }

    const resolvedCurrent =
      new URL(
        current,
        window.location.href,
      ).href;

    if (
      element.src !==
      resolvedCurrent
    ) {
      return;
    }

    if (!element.complete) {
      return;
    }

    if (
      element.naturalWidth > 0 &&
      element.naturalHeight > 0
    ) {
      setLoaded(true);
      return;
    }

    if (!isFallback) {
      goToNextSource();
    }
  }, [
    current,
    isFallback,
    sources.length,
  ]);

  return (
    <div className="relative h-full w-full min-h-0 overflow-hidden bg-slate-950">
      {!loaded &&
        !isFallback && (
          <div
            aria-hidden="true"
            className="absolute inset-0 z-0 animate-pulse bg-slate-900"
          />
        )}

      <img
        key={current}
        ref={imageRef}
        src={current}
        alt={resolvedAlt}
        loading={loading}
        decoding="async"
        referrerPolicy="no-referrer"
        onLoad={handleLoad}
        onError={handleError}
        className={[
          'relative z-10 block h-full w-full object-cover transition-opacity duration-300',
          loaded || isFallback
            ? 'opacity-100'
            : 'opacity-0',
          className,
        ].join(' ')}
      />

      {isFallback && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-gradient-to-t from-black/80 via-black/30 to-black/20"
        >
          <span className="rounded-md border border-white/10 bg-black/50 px-3 py-1.5 text-[10px] font-bold tracking-[0.18em] text-white/65 backdrop-blur">
            NO IMAGE
          </span>
        </div>
      )}
    </div>
  );
} 