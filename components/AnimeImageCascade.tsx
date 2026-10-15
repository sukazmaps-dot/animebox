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
  getRawImageMediaSrcSet,
} from '@/lib/image-service';
import type {
  MediaImageFormat,
  MediaImagePreset,
} from '@/lib/media-delivery';

const FALLBACK = '/anime-placeholder.svg';

type AnimeImageCascadeProps = {
  sources?: string[];
  alt?: string;
  className?: string;
  loading?: 'lazy' | 'eager';
  fetchPriority?: 'high' | 'low' | 'auto';
  sizes?: string;
  quality?: number;
  preset?: MediaImagePreset;
  format?: MediaImageFormat;
};

export default function AnimeImageCascade({
  sources = [],
  alt = 'Аниме',
  className = '',
  loading = 'eager',
  fetchPriority = 'auto',
  sizes = '(max-width: 767px) 68vw, (max-width: 1024px) 230px, 260px',
  quality,
  preset = 'large',
  format = 'webp',
}: AnimeImageCascadeProps) {
  const candidates = useMemo<string[]>(
    () =>
      Array.from(
        new Set([
          ...buildImageCandidateChain(sources, {
            preset,
            quality,
            format,
          }),
          FALLBACK,
        ]),
      ),
    [format, preset, quality, sources],
  );

  const mediaSrcSet = useMemo(
    () =>
      getRawImageMediaSrcSet(
        sources,
        preset,
        quality,
        format,
      ),
    [format, preset, quality, sources],
  );

  const [index, setIndex] =
    useState<number>(0);

  const [loaded, setLoaded] =
    useState<boolean>(false);
  const [retryCount, setRetryCount] = useState(0);

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
    setRetryCount(0);
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

  // Bounded watchdog for critical eager hero images. Lazy posters must never
  // be treated as stalled while the browser intentionally defers them.
  useEffect(() => {
    if (loaded || isFallback || loading !== 'eager') return;
    const timeout = window.setTimeout(() => {
      setLoaded(false);
      setIndex((value) => Math.min(value + 1, candidates.length - 1));
    }, 8_500);
    return () => window.clearTimeout(timeout);
  }, [current, loaded, isFallback, loading, candidates.length]);

  // A failed edge response may be cached for ~15 seconds. One delayed retry
  // recovers transient network failures without a manual page refresh.
  useEffect(() => {
    if (!isFallback || retryCount >= 1 || candidates.length <= 1) return;
    const timeout = window.setTimeout(() => {
      if (navigator.onLine === false || document.visibilityState === 'hidden') return;
      setRetryCount(1);
      setIndex(0);
      setLoaded(false);
    }, 16_000);
    return () => window.clearTimeout(timeout);
  }, [isFallback, retryCount, candidates.length]);

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
    <div className="relative h-full w-full min-w-0 overflow-hidden bg-[var(--ab-ui-surface)]">
      {!loaded &&
        !isFallback && (
          <div
            aria-hidden="true"
            className="absolute inset-0 z-0 animate-pulse bg-[var(--ab-ui-surface)]"
          />
        )}

      <img
        key={current}
        data-image-delivery="animebox-media"
        data-image-preset={preset}
        data-image-format={format}
        ref={imageRef}
        src={current}
        srcSet={index === 0 ? mediaSrcSet : undefined}
        sizes={index === 0 ? sizes : undefined}
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

    </div>
  );
}