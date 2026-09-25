'use client';

import {
  useCallback,
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
  getImageMediaSrcSet,
  type ImageCandidatePreference,
} from '@/lib/image-service';
import type {
  MediaImageFormat,
  MediaImagePreset,
} from '@/lib/media-delivery';
import {
  observeNearViewportMedia,
  type MediaWarmupActivation,
} from '@/lib/media-warmup-client';

const FALLBACK = '/brand/brand-mark.webp';
const PRIMARY_MEDIA_TIMEOUT_MS = 6_500;
const FALLBACK_SOURCE_TIMEOUT_MS = 7_500;
const PROXY_SOURCE_TIMEOUT_MS = 9_500;
const TRANSIENT_RETRY_DELAY_MS = 12_000;

export type AnimeImageLoadState = 'loading' | 'loaded' | 'fallback';

type Props = {
  image?: ImageData | null;
  alt?: string | null;
  englishName?: string | null;
  className?: string;
  loading?: 'lazy' | 'eager' | 'near';
  fetchPriority?: 'high' | 'low' | 'auto';
  preferOriginal?: boolean;
  sizes?: string;
  quality?: number;
  sourcePreference?: ImageCandidatePreference;
  preset?: MediaImagePreset;
  format?: MediaImageFormat;
  onStateChange?: (state: AnimeImageLoadState) => void;
};

const DEFAULT_SIZES =
  '(orientation: landscape) and (max-height: 600px) 18vw, (max-width: 480px) 42vw, (max-width: 760px) 31vw, (max-width: 1024px) 22vw, (max-width: 1280px) 18vw, 190px';

function sourceTimeoutMs(source: string, sourceIndex: number) {
  if (source.startsWith('/api/image?')) {
    // /api/image can legitimately wait up to 8 seconds for its upstream.
    return PROXY_SOURCE_TIMEOUT_MS;
  }

  return sourceIndex === 0
    ? PRIMARY_MEDIA_TIMEOUT_MS
    : FALLBACK_SOURCE_TIMEOUT_MS;
}

export default function AnimeImage({
  image,
  alt,
  englishName,
  className = '',
  loading = 'lazy',
  fetchPriority = 'auto',
  sizes = DEFAULT_SIZES,
  quality,
  sourcePreference = 'quality',
  preset,
  format = 'webp',
  onStateChange,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const transientRetryCountRef = useRef(0);
  const [warmupActivation, setWarmupActivation] =
    useState<MediaWarmupActivation | 'waiting'>(
      loading === 'near' ? 'waiting' : 'warm',
    );

  const effectivePreset: MediaImagePreset =
    preset ?? (sourcePreference === 'compact' ? 'card' : 'large');

  const sources = useMemo(
    () =>
      Array.from(
        new Set([
          ...getImageCandidates(image, sourcePreference, {
            preset: effectivePreset,
            quality,
            format,
          }),
          FALLBACK,
        ]),
      ),
    [
      effectivePreset,
      format,
      image,
      quality,
      sourcePreference,
    ],
  );

  const mediaSrcSet = useMemo(
    () =>
      getImageMediaSrcSet(
        image,
        sourcePreference,
        effectivePreset,
        quality,
        format,
      ),
    [
      effectivePreset,
      format,
      image,
      quality,
      sourcePreference,
    ],
  );

  const sourcesKey = sources.join('|');

  const [imageState, setImageState] = useState(() => ({
    key: sourcesKey,
    sourceIndex: 0,
    loaded: false,
  }));

  const sourceIndex =
    imageState.key === sourcesKey
      ? imageState.sourceIndex
      : 0;

  const loaded =
    imageState.key === sourcesKey
      ? imageState.loaded
      : false;

  const current = sources[sourceIndex] ?? FALLBACK;
  const isFallback = current === FALLBACK;

  const resolvedAlt =
    alt?.trim() ||
    englishName?.trim() ||
    'Аниме';

  const publicState: AnimeImageLoadState =
    isFallback ? 'fallback' : loaded ? 'loaded' : 'loading';

  const shouldRequestSource =
    loading !== 'near' || warmupActivation !== 'waiting';

  const nativeLoading: 'lazy' | 'eager' =
    loading === 'near'
      ? warmupActivation === 'native-lazy'
        ? 'lazy'
        : 'eager'
      : loading;

  const nativeFetchPriority =
    loading === 'near' ? 'low' : fetchPriority;

  useEffect(() => {
    if (loading !== 'near' || warmupActivation !== 'waiting') return;

    const host = hostRef.current;
    if (!host) return;

    return observeNearViewportMedia(host, (activation) => {
      setWarmupActivation(activation);
    });
  }, [loading, warmupActivation]);

  useEffect(() => {
    if (loading === 'near') return;
    setWarmupActivation('warm');
  }, [loading]);

  useEffect(() => {
    onStateChange?.(publicState);
  }, [onStateChange, publicState]);

  const goToNextSource = useCallback(() => {
    setImageState((previous) => {
      const previousIndex =
        previous.key === sourcesKey
          ? previous.sourceIndex
          : 0;

      if (
        previous.key === sourcesKey &&
        previousIndex !== sourceIndex
      ) {
        return previous;
      }

      const nextIndex = sourceIndex + 1;

      if (nextIndex >= sources.length) {
        return previous;
      }

      return {
        key: sourcesKey,
        sourceIndex: nextIndex,
        loaded: false,
      };
    });
  }, [sourceIndex, sources.length, sourcesKey]);

  const handleLoad = useCallback(
    (event: React.SyntheticEvent<HTMLImageElement>) => {
      const element = event.currentTarget;

      if (
        element.naturalWidth > 0 &&
        element.naturalHeight > 0
      ) {
        setImageState((previous) =>
          previous.key === sourcesKey &&
          previous.sourceIndex !== sourceIndex
            ? previous
            : {
                key: sourcesKey,
                sourceIndex,
                loaded: true,
              },
        );
      }
    },
    [sourceIndex, sourcesKey],
  );

  const handleError = useCallback(() => {
    if (!isFallback) {
      goToNextSource();
      return;
    }

    setImageState({
      key: sourcesKey,
      sourceIndex,
      loaded: true,
    });
  }, [goToNextSource, isFallback, sourceIndex, sourcesKey]);

  /*
   * Native lazy scheduling and the shared near-viewport scheduler own the
   * off-screen request window. The watchdog starts only after an eager request
   * has actually been released, so it never races an intentionally deferred
   * poster.
   */
  useEffect(() => {
    if (
      !shouldRequestSource ||
      nativeLoading !== 'eager' ||
      loaded ||
      isFallback
    ) {
      return;
    }

    const timeout = window.setTimeout(() => {
      goToNextSource();
    }, sourceTimeoutMs(current, sourceIndex));

    return () => window.clearTimeout(timeout);
  }, [
    current,
    goToNextSource,
    isFallback,
    loaded,
    nativeLoading,
    shouldRequestSource,
    sourceIndex,
  ]);

  useEffect(() => {
    transientRetryCountRef.current = 0;
  }, [sourcesKey]);

  useEffect(() => {
    if (
      !isFallback ||
      sources.length <= 1 ||
      transientRetryCountRef.current >= 1
    ) {
      return;
    }

    const retry = () => {
      if (transientRetryCountRef.current >= 1) return;
      transientRetryCountRef.current += 1;
      setImageState({
        key: sourcesKey,
        sourceIndex: 0,
        loaded: false,
      });
    };

    const timer = window.setTimeout(retry, TRANSIENT_RETRY_DELAY_MS);
    const onOnline = () => retry();
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') retry();
    };

    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [
    isFallback,
    sources.length,
    sourcesKey,
  ]);

  // Covers images fulfilled synchronously from the browser cache.
  useEffect(() => {
    if (isFallback || !shouldRequestSource) return;

    const element = imageRef.current;
    if (!element || !element.complete) return;

    const frame = window.requestAnimationFrame(() => {
      if (
        element.naturalWidth > 0 &&
        element.naturalHeight > 0
      ) {
        setImageState((previous) =>
          previous.key === sourcesKey &&
          previous.sourceIndex !== sourceIndex
            ? previous
            : {
                key: sourcesKey,
                sourceIndex,
                loaded: true,
              },
        );
        return;
      }

      goToNextSource();
    });

    return () => window.cancelAnimationFrame(frame);
  }, [
    current,
    goToNextSource,
    isFallback,
    shouldRequestSource,
    sourceIndex,
    sourcesKey,
  ]);

  return (
    <div
      ref={hostRef}
      className="relative h-full w-full min-h-0 overflow-hidden bg-slate-950"
      data-image-delivery="animebox-media"
      data-image-state={publicState}
      data-image-source-index={sourceIndex}
      data-image-loading={loading}
      data-image-warmup={warmupActivation}
      data-image-preference={sourcePreference}
      data-image-preset={effectivePreset}
      data-image-format={format}
    >
      {!loaded && !isFallback && (
        <div
          aria-hidden="true"
          className="absolute inset-0 z-0 animate-pulse bg-slate-900"
        />
      )}

      {isFallback ? (
        <div
          aria-hidden="true"
          className="absolute inset-0 z-10 flex items-center justify-center bg-[radial-gradient(circle_at_50%_35%,rgba(124,58,237,0.20),transparent_48%),linear-gradient(145deg,#11162a,#080b16)]"
        >
          {/* Local fallback intentionally bypasses Next Image. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={FALLBACK}
            alt=""
            width={40}
            height={40}
            decoding="async"
            className="h-10 w-10 object-contain opacity-55"
          />
        </div>
      ) : (
        <>
          {/* Mass poster grids intentionally bypass /_next/image. Native lazy */}
          {/* loading keeps off-screen scheduling in the browser, not React. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {shouldRequestSource && (
            <img
              key={current}
              ref={imageRef}
              src={current}
              srcSet={sourceIndex === 0 ? mediaSrcSet : undefined}
              alt={resolvedAlt}
              loading={nativeLoading}
              fetchPriority={nativeFetchPriority}
              decoding="async"
              sizes={sizes}
              onLoad={handleLoad}
              onError={handleError}
              className={[
                'relative z-10 block h-full w-full object-cover transition-opacity duration-[180ms]',
                loaded ? 'opacity-100' : 'opacity-0',
                className,
              ].join(' ')}
            />
          )}
        </>
      )}
    </div>
  );
}
