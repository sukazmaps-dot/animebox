'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type SyntheticEvent,
} from 'react';

import {
  buildImageCandidateChain,
  getRawImageMediaSrcSet,
  getImageCandidateMediaSrcSet,
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

  const candidatesKey = candidates.join('|');
  const [imageState, setImageState] = useState(() => ({
    key: candidatesKey, index: 0, loaded: false, retryCount: 0,
  }));
  // Reset before committing a different title, rather than showing the old
  // fallback for one frame and resetting it from an effect afterwards.
  if (imageState.key !== candidatesKey) {
    setImageState({ key: candidatesKey, index: 0, loaded: false, retryCount: 0 });
  }
  const index = imageState.key === candidatesKey ? imageState.index : 0;
  const loaded = imageState.key === candidatesKey && imageState.loaded;
  const retryCount = imageState.key === candidatesKey ? imageState.retryCount : 0;
  const imageRef = useRef<HTMLImageElement | null>(null);
  const current = candidates[index] ?? FALLBACK;
  const isFallback = current === FALLBACK;
  const activeMediaSrcSet = index === 0 ? mediaSrcSet
    : getImageCandidateMediaSrcSet(current, preset, quality, format);

  const goToNextSource = useCallback(() => {
    setImageState((previous) => previous.key !== candidatesKey || previous.index !== index
      ? previous
      : { ...previous, index: Math.min(index + 1, candidates.length - 1), loaded: false });
  }, [candidatesKey, index, candidates.length]);

  const markLoaded = useCallback(() => {
    setImageState((previous) => previous.key !== candidatesKey || previous.index !== index
      ? previous : { ...previous, loaded: true });
  }, [candidatesKey, index]);

  // Bounded watchdog for critical eager hero images. Lazy posters must never
  // be treated as stalled while the browser intentionally defers them.
  useEffect(() => {
    if (loaded || isFallback || loading !== 'eager') return;
    const timeout = window.setTimeout(() => {
      goToNextSource();
    }, 8_500);
    return () => window.clearTimeout(timeout);
  }, [current, loaded, isFallback, loading, goToNextSource]);

  // A failed edge response may be cached for ~15 seconds. One delayed retry
  // recovers transient network failures without a manual page refresh.
  useEffect(() => {
    if (!isFallback || retryCount >= 1 || candidates.length <= 1) return;
    const timeout = window.setTimeout(() => {
      if (navigator.onLine === false || document.visibilityState === 'hidden') return;
      setImageState(previous => previous.key !== candidatesKey ? previous
        : { key: candidatesKey, index: 0, loaded: false, retryCount: 1 });
    }, 16_000);
    return () => window.clearTimeout(timeout);
  }, [candidatesKey, isFallback, retryCount, candidates.length]);

  const handleLoad = (
    event: SyntheticEvent<HTMLImageElement>,
  ) => {
    const image =
      event.currentTarget;

    if (
      image.naturalWidth > 0 &&
      image.naturalHeight > 0
    ) {
      markLoaded();
    }
  };

  const handleError = () => {
    if (isFallback) {
      markLoaded();
      return;
    }

    goToNextSource();
  };

  // Cached load/decode results are asynchronous and tied to this candidate.
  useEffect(() => {
    const image = imageRef.current;
    if (!image || !image.complete) return;
    const frame = window.requestAnimationFrame(() => {
      if (image.naturalWidth > 0 && image.naturalHeight > 0) markLoaded();
      else if (!isFallback) goToNextSource();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [current, isFallback, markLoaded, goToNextSource]);

  return (
    <div className="relative h-full w-full min-w-0 overflow-hidden bg-[var(--ab-ui-surface)]">
      {!loaded &&
        !isFallback && (
          <div
            aria-hidden="true"
            className="absolute inset-0 z-0 animate-pulse bg-[var(--ab-ui-surface)]"
          />
        )}

      {/* Responsive media and its recovery chain intentionally bypass Next Image. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        key={current}
        data-image-delivery="animebox-media"
        data-image-preset={preset}
        data-image-format={format}
        ref={imageRef}
        src={current}
        srcSet={activeMediaSrcSet}
        sizes={activeMediaSrcSet ? sizes : undefined}
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