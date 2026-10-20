'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
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
import { useVisibleImageRecovery, useImageHydration } from '@/lib/use-visible-image-recovery';
import { rememberImageSuccess, rememberedImageSource, forgetImageSuccess } from '@/lib/image-recovery-session';

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
  const hydrated = useImageHydration();
  const [imageState, setImageState] = useState(() => {
    const preferred = hydrated ? Math.max(0, rememberedImageSource(candidates)) : 0;
    return {
      key: candidatesKey, hintKey: hydrated ? candidatesKey : null, index: preferred,
      source: candidates[preferred] ?? FALLBACK,
      loaded: false, retryCount: 0, generation: 0,
    };
  });
  // Reset before committing a different title, rather than showing the old
  // fallback for one frame and resetting it from an effect afterwards.
  if (imageState.key !== candidatesKey) {
    const retainedIndex = imageState.loaded && imageState.source !== FALLBACK
      ? candidates.indexOf(imageState.source) : -1;
    const preferred = retainedIndex >= 0 ? retainedIndex
      : hydrated ? Math.max(0, rememberedImageSource(candidates)) : 0;
    setImageState({ key: candidatesKey, hintKey: hydrated ? candidatesKey : null, index: preferred,
      source: candidates[preferred] ?? FALLBACK,
      loaded: retainedIndex >= 0, retryCount: 0, generation: imageState.generation + 1 });
  }
  if (hydrated && imageState.key === candidatesKey && imageState.hintKey !== candidatesKey) {
    const preferred = imageState.loaded ? imageState.index
      : Math.max(0, rememberedImageSource(candidates));
    setImageState({...imageState, hintKey: candidatesKey, index: preferred,
      source: candidates[preferred] ?? FALLBACK,
      generation: imageState.generation + (preferred !== imageState.index ? 1 : 0)});
  }
  const index = imageState.key === candidatesKey ? imageState.index : 0;
  const loaded = imageState.key === candidatesKey && imageState.loaded;
  const retryCount = imageState.key === candidatesKey ? imageState.retryCount : 0;
  const imageRef = useRef<HTMLImageElement | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const generation = imageState.generation;
  const current = candidates[index] ?? FALLBACK;
  const isFallback = current === FALLBACK;
  const activeAttemptRef = useRef<{key: string; generation: number} | null>({key: candidatesKey, generation});
  useLayoutEffect(() => {
    activeAttemptRef.current = {key: candidatesKey, generation};
    return () => { activeAttemptRef.current = null; };
  }, [candidatesKey, generation]);
  const isCurrentAttempt = useCallback(() => activeAttemptRef.current?.key === candidatesKey &&
    activeAttemptRef.current.generation === generation, [candidatesKey, generation]);
  const activeMediaSrcSet = index === 0 ? mediaSrcSet
    : getImageCandidateMediaSrcSet(current, preset, quality, format);

  useEffect(() => {
    if (loaded && !isFallback) rememberImageSuccess(candidates, current);
  }, [candidates, current, isFallback, loaded]);

  const goToNextSource = useCallback(() => {
    setImageState((previous) => previous.key !== candidatesKey || previous.generation !== generation || previous.index !== index
      ? previous
      : { ...previous, index: Math.min(index + 1, candidates.length - 1),
        source: candidates[Math.min(index + 1, candidates.length - 1)], loaded: false,
        generation: previous.generation + 1 });
  }, [candidatesKey, generation, index, candidates]);

  const markLoaded = useCallback(() => {
    setImageState((previous) => previous.key !== candidatesKey || previous.generation !== generation || previous.index !== index
      ? previous : { ...previous, loaded: true });
  }, [candidatesKey, generation, index]);

  const handleTimeout = useCallback((budgetExhausted: boolean) => {
    if (!isCurrentAttempt()) return;
    forgetImageSuccess(candidates, current);
    if (!budgetExhausted) { goToNextSource(); return; }
    setImageState(previous => previous.key !== candidatesKey || previous.generation !== generation
      ? previous : {...previous, index: candidates.length - 1, source: FALLBACK,
        loaded: false, generation: previous.generation + 1});
  }, [candidatesKey, candidates, current, generation, goToNextSource, isCurrentAttempt]);
  const visibleLoading = useVisibleImageRecovery({hostRef, active: !loaded && !isFallback,
    passKey: `${candidatesKey}:${retryCount}`, attemptKey: `${current}:${generation}`,
    timeoutMs: current.startsWith('/api/image?') ? 9_500 : 8_500, onTimeout: handleTimeout});
  const nativeLoading = loading === 'lazy' && visibleLoading ? 'eager' : loading;

  // A failed edge response may be cached for ~15 seconds. One delayed retry
  // recovers transient network failures without a manual page refresh.
  useEffect(() => {
    if (!isFallback || retryCount >= 1 || candidates.length <= 1) return;
    const timeout = window.setTimeout(() => {
      if (navigator.onLine === false || document.visibilityState === 'hidden') return;
      setImageState(previous => previous.key !== candidatesKey ? previous
        : { key: candidatesKey, hintKey: candidatesKey, index: 0, source: candidates[0] ?? FALLBACK,
          loaded: false, retryCount: 1, generation: previous.generation + 1 });
    }, 16_000);
    return () => window.clearTimeout(timeout);
  }, [candidatesKey, isFallback, retryCount, candidates]);

  const handleLoad = (
    event: SyntheticEvent<HTMLImageElement>,
  ) => {
    if (!isCurrentAttempt()) return;
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
    if (!isCurrentAttempt()) return;
    if (isFallback) {
      markLoaded();
      return;
    }

    forgetImageSuccess(candidates, current);
    goToNextSource();
  };

  // Cached load/decode results are asynchronous and tied to this candidate.
  useEffect(() => {
    const image = imageRef.current;
    if (!image || !image.complete) return;
    const frame = window.requestAnimationFrame(() => {
      if (!isCurrentAttempt()) return;
      if (image.naturalWidth > 0 && image.naturalHeight > 0) markLoaded();
      else if (!isFallback) goToNextSource();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [current, isCurrentAttempt, isFallback, markLoaded, goToNextSource]);

  return (
    <div ref={hostRef} className="relative h-full w-full min-w-0 overflow-hidden bg-[var(--ab-ui-surface)]">
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
        data-image-state={isFallback ? 'fallback' : loaded ? 'loaded' : 'loading'}
        data-image-request-state={candidates.length <= 1 ? 'missing-source'
          : isFallback ? 'exhausted' : loaded ? 'loaded' : visibleLoading ? 'visible-pending' : 'offscreen-pending'}
        ref={imageRef}
        src={current}
        srcSet={activeMediaSrcSet}
        sizes={activeMediaSrcSet ? sizes : undefined}
        alt={alt}
        loading={nativeLoading}
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
