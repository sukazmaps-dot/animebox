'use client';

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type SyntheticEvent,
} from 'react';

import {
  buildImageCandidateChain,
} from '@/lib/image-service';

const FALLBACK = '/anime-placeholder.svg';

type AnimeImageCascadeProps = {
  sources?: string[];
  alt?: string;
  className?: string;
  loading?: 'lazy' | 'eager';
  fetchPriority?: 'high' | 'low' | 'auto';
};

export default function AnimeImageCascade({
  sources = [],
  alt = 'Аниме',
  className = '',
  loading = 'eager',
  fetchPriority = 'auto',
}: AnimeImageCascadeProps) {
  const candidates = useMemo<string[]>(
    () =>
      Array.from(
        new Set([
          ...buildImageCandidateChain(sources),
          FALLBACK,
        ]),
      ),
    [sources],
  );

  const [index, setIndex] =
    useState<number>(0);

  const [loaded, setLoaded] =
    useState<boolean>(false);

  const imageRef =
    useRef<HTMLImageElement | null>(
      null,
    );

  const current =
    candidates[index] ??
    FALLBACK;

  const isFallback =
    current === FALLBACK;

  const candidatesKey =
    candidates.join('|');

  useEffect(() => {
    setIndex(0);
    setLoaded(false);
  }, [candidatesKey]);

  const goToNextSource = () => {
    setLoaded(false);

    setIndex((currentIndex) => {
      const nextIndex =
        currentIndex + 1;

      if (
        nextIndex >=
        candidates.length
      ) {
        return currentIndex;
      }

      return nextIndex;
    });
  };

  const handleLoad = (
    event: SyntheticEvent<HTMLImageElement>,
  ) => {
    const image =
      event.currentTarget;

    if (
      image.naturalWidth > 0 &&
      image.naturalHeight > 0
    ) {
      setLoaded(true);
    }
  };

  const handleError = () => {
    if (isFallback) {
      setLoaded(true);
      return;
    }

    goToNextSource();
  };

  // Нужен для изображений,
  // которые браузер уже взял из cache.
  useEffect(() => {
    const image =
      imageRef.current;

    if (!image) {
      return;
    }

    if (!image.complete) {
      return;
    }

    if (
      image.naturalWidth > 0 &&
      image.naturalHeight > 0
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
    candidates.length,
  ]);

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#0b0b10]">
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
        alt={alt}
        loading={loading}
        fetchPriority={fetchPriority}
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
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-gradient-to-t from-black/80 via-black/30 to-black/20">
          <span className="rounded-md border border-white/10 bg-black/50 px-3 py-1.5 text-[10px] font-bold tracking-[0.18em] text-white/65 backdrop-blur">
            NO IMAGE
          </span>
        </div>
      )}
    </div>
  );
}