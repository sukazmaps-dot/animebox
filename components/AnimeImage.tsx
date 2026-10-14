'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
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
import {
  getMediaEdgeRetryAfterMs,
  getMediaEdgeHealthRevision,
  getMediaEdgeHealthServerRevision,
  isMediaEdgeBlocked,
  isAnimeBoxMediaRequest,
  reportMediaEdgeFailure,
  reportMediaEdgeSuccess,
  subscribeMediaEdgeHealth,
} from '@/lib/media-edge-health-client';

const FALLBACK = '/brand/brand-mark.webp';
const PRIMARY_MEDIA_TIMEOUT_MS = 6_500;
const FALLBACK_SOURCE_TIMEOUT_MS = 7_500;
const PROXY_SOURCE_TIMEOUT_MS = 9_500;
const TRANSIENT_RETRY_MIN_DELAY_MS = 20_000;
const TRANSIENT_RETRY_MAX_DELAY_MS = 45_000;
const TRANSIENT_RETRY_LIMIT = 2;

export type AnimeImageLoadState = 'loading' | 'loaded' | 'fallback';

type Props = {
  image?: ImageData | null;
  alt?: string | null;
  englishName?: string | null;
  className?: string;
  containerClassName?: string;
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

function stableRetryDelayMs(key: string) {
  let hash = 2166136261;

  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  const span =
    TRANSIENT_RETRY_MAX_DELAY_MS -
    TRANSIENT_RETRY_MIN_DELAY_MS;

  return (
    TRANSIENT_RETRY_MIN_DELAY_MS +
    (Math.abs(hash) % Math.max(1, span + 1))
  );
}

function firstUsableSourceIndex(
  sources: string[],
  startIndex: number,
) {
  for (let index = Math.max(0, startIndex); index < sources.length; index += 1) {
    const source = sources[index];
    if (!source || !isMediaEdgeBlocked(source)) {
      return index;
    }
  }

  return Math.max(0, sources.length - 1);
}

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
  containerClassName = '',
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

  const avifMediaSrcSet = useMemo(
    () =>
      format === 'auto'
        ? getImageMediaSrcSet(
            image,
            sourcePreference,
            effectivePreset,
            quality,
            'avif',
          )
        : undefined,
    [
      effectivePreset,
      format,
      image,
      quality,
      sourcePreference,
    ],
  );

  const webpMediaSrcSet = useMemo(
    () =>
      format === 'auto'
        ? getImageMediaSrcSet(
            image,
            sourcePreference,
            effectivePreset,
            quality,
            'webp',
          )
        : undefined,
    [
      effectivePreset,
      format,
      image,
      quality,
      sourcePreference,
    ],
  );

  const sourcesKey = sources.join('|');

  useSyncExternalStore(
    subscribeMediaEdgeHealth,
    getMediaEdgeHealthRevision,
    getMediaEdgeHealthServerRevision,
  );

  const [imageState, setImageState] = useState(() => ({
    key: sourcesKey,
    sourceIndex: 0,
    loaded: false,
  }));
  const [lastFailure, setLastFailure] = useState<{
    key: string;
    stage: 'media' | 'proxy' | 'origin' | 'local';
    reason: 'network-or-decode' | 'timeout';
  } | null>(null);
  const [retryInfo, setRetryInfo] = useState({ key: sourcesKey, count: 0 });
  // Remember every source transition, including A -> B -> A. Otherwise an
  // old terminal fallback for A can reappear when that card is reused.
  if (imageState.key !== sourcesKey) {
    setImageState({ key: sourcesKey, sourceIndex: 0, loaded: false });
  }
  if (retryInfo.key !== sourcesKey) {
    setRetryInfo({ key: sourcesKey, count: 0 });
  }

  const storedSourceIndex =
    imageState.key === sourcesKey
      ? imageState.sourceIndex
      : 0;

  const storedLoaded =
    imageState.key === sourcesKey
      ? imageState.loaded
      : false;

  const sourceIndex = storedLoaded
    ? storedSourceIndex
    : firstUsableSourceIndex(sources, storedSourceIndex);

  const loaded =
    storedLoaded && sourceIndex === storedSourceIndex;

  const current = sources[sourceIndex] ?? FALLBACK;
  const isFallback = current === FALLBACK;
  const recordFailure = useCallback((reason: 'network-or-decode' | 'timeout') => {
    setLastFailure({
      key: sourcesKey,
      stage: isAnimeBoxMediaRequest(current) ? 'media'
        : current.startsWith('/api/image?') ? 'proxy'
          : current.startsWith('/') ? 'local' : 'origin',
      reason,
    });
  }, [current, sourcesKey]);

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
    onStateChange?.(publicState);
  }, [onStateChange, publicState]);

  const goToNextSource = useCallback(() => {
    setImageState((previous) => {
      const previousIndex =
        previous.key === sourcesKey
          ? previous.sourceIndex
          : 0;

      const previousResolvedIndex =
        firstUsableSourceIndex(sources, previousIndex);

      if (
        previous.key === sourcesKey &&
        previousResolvedIndex !== sourceIndex
      ) {
        return previous;
      }

      const nextIndex = firstUsableSourceIndex(
        sources,
        sourceIndex + 1,
      );

      if (nextIndex >= sources.length || nextIndex === sourceIndex) {
        return previous;
      }

      return {
        key: sourcesKey,
        sourceIndex: nextIndex,
        loaded: false,
      };
    });
  }, [sourceIndex, sources, sourcesKey]);

  const handleLoad = useCallback(
    (event: React.SyntheticEvent<HTMLImageElement>) => {
      const element = event.currentTarget;

      if (
        element.naturalWidth > 0 &&
        element.naturalHeight > 0
      ) {
        reportMediaEdgeSuccess(current);
        setImageState((previous) => {
          const previousIndex =
            previous.key === sourcesKey
              ? firstUsableSourceIndex(
                  sources,
                  previous.sourceIndex,
                )
              : sourceIndex;

          return previous.key === sourcesKey &&
            previousIndex !== sourceIndex
            ? previous
            : {
                key: sourcesKey,
                sourceIndex,
                loaded: true,
              };
        });
      }
    },
    [current, sourceIndex, sources, sourcesKey],
  );

  const handleError = useCallback(() => {
    if (!isFallback) {
      recordFailure('network-or-decode');
      reportMediaEdgeFailure(current);
      goToNextSource();
      return;
    }

    setImageState({
      key: sourcesKey,
      sourceIndex,
      loaded: true,
    });
  }, [current, goToNextSource, isFallback, recordFailure, sourceIndex, sourcesKey]);

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
      recordFailure('timeout');
      reportMediaEdgeFailure(current);
      goToNextSource();
    }, sourceTimeoutMs(current, sourceIndex));

    return () => window.clearTimeout(timeout);
  }, [
    current,
    goToNextSource,
    isFallback,
    loaded,
    nativeLoading,
    recordFailure,
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
      transientRetryCountRef.current >= TRANSIENT_RETRY_LIMIT ||
      !sources.some((source) => source.startsWith('/api/image?') || /^https?:/.test(source))
    ) {
      return;
    }

    let timer: number | null = null;
    const baseDelay = stableRetryDelayMs(sourcesKey);

    const retry = () => {
      if (transientRetryCountRef.current >= TRANSIENT_RETRY_LIMIT) return;

      // Do not consume a retry while the browser still knows it is
      // offline. The online event will schedule a jittered recovery instead.
      if (navigator.onLine === false) return;

      // Do not spend the bounded recovery budget on hidden cards.
      const bounds = hostRef.current?.getBoundingClientRect();
      if (document.visibilityState === 'hidden' || !bounds ||
        bounds.bottom <= 0 || bounds.top >= window.innerHeight ||
        bounds.right <= 0 || bounds.left >= window.innerWidth) {
        schedule(30_000);
        return;
      }

      // First recovery uses the independent server path, not a failing Worker.
      const proxyIndex = sources.findIndex((source) => source.startsWith('/api/image?'));
      const recoverViaProxy = transientRetryCountRef.current === 0 && proxyIndex >= 0;

      // The second pass can use media again after its cooldown. The first
      // proxy pass is independent and must not wait for that circuit.
      const retryAfter = recoverViaProxy ? 0 : getMediaEdgeRetryAfterMs(sources);
      if (retryAfter > 0) {
        schedule(retryAfter + 1_000 + (baseDelay % 5_001));
        return;
      }

      transientRetryCountRef.current += 1;
      setRetryInfo({ key: sourcesKey, count: transientRetryCountRef.current });
      setImageState({
        key: sourcesKey,
        sourceIndex: recoverViaProxy ? proxyIndex : firstUsableSourceIndex(sources, 0),
        loaded: false,
      });
    };

    const schedule = (delayMs: number) => {
      if (timer !== null) {
        window.clearTimeout(timer);
      }

      timer = window.setTimeout(() => {
        timer = null;
        retry();
      }, delayMs);
    };

    const independentRecovery = transientRetryCountRef.current === 0 &&
      sources.some((source) => source.startsWith('/api/image?'));
    schedule(Math.max(baseDelay, independentRecovery ? 0 :
      getMediaEdgeRetryAfterMs(sources) + 1_000 + (baseDelay % 5_001)));

    const onOnline = () => {
      if (transientRetryCountRef.current >= TRANSIENT_RETRY_LIMIT) return;

      // Avoid a reconnect thundering herd when dozens of posters failed while
      // offline. Every source gets a deterministic 1–6 second reconnect jitter.
      schedule(1_000 + (baseDelay % 5_001));
    };

    window.addEventListener('online', onOnline);

    return () => {
      if (timer !== null) {
        window.clearTimeout(timer);
      }
      window.removeEventListener('online', onOnline);
    };
  }, [
    isFallback,
    sources,
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
        reportMediaEdgeSuccess(current);
        setImageState((previous) => {
          const previousIndex =
            previous.key === sourcesKey
              ? firstUsableSourceIndex(
                  sources,
                  previous.sourceIndex,
                )
              : sourceIndex;

          return previous.key === sourcesKey &&
            previousIndex !== sourceIndex
            ? previous
            : {
                key: sourcesKey,
                sourceIndex,
                loaded: true,
              };
        });
        return;
      }

      recordFailure('network-or-decode');
      reportMediaEdgeFailure(current);
      goToNextSource();
    });

    return () => window.cancelAnimationFrame(frame);
  }, [
    current,
    goToNextSource,
    isFallback,
    shouldRequestSource,
    recordFailure,
    sourceIndex,
    sources,
    sourcesKey,
  ]);

  return (
    <div
      ref={hostRef}
      className={[
        'relative h-full w-full min-h-0 overflow-hidden bg-slate-950',
        containerClassName,
      ].join(' ')}
      data-image-delivery="animebox-media"
      data-image-state={publicState}
      data-image-source-index={sourceIndex}
      data-image-loading={loading}
      data-image-warmup={warmupActivation}
      data-image-preference={sourcePreference}
      data-image-preset={effectivePreset}
      data-image-format={format}
      data-image-retry-count={retryInfo.key === sourcesKey ? retryInfo.count : 0}
      data-image-last-failure-stage={lastFailure?.key === sourcesKey ? lastFailure.stage : undefined}
      data-image-last-failure-reason={lastFailure?.key === sourcesKey ? lastFailure.reason : undefined}
    >
      {!loaded && !isFallback && (
        <div
          aria-hidden="true"
          className="absolute inset-0 z-0 bg-[var(--ab-ui-surface)]"
        />
      )}

      {isFallback ? (
        <div
          aria-hidden="true"
          className="absolute inset-0 z-10 flex items-center justify-center bg-[radial-gradient(circle_at_50%_35%,color-mix(in_srgb,_var(--ab-ui-accent)_20%,_transparent),transparent_48%),linear-gradient(145deg,var(--ab-ui-surface),var(--ab-ui-surface))]"
        >
          {/* Local fallback intentionally bypasses Next Image. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={FALLBACK}
            alt=""
            width={40}
            height={40}
            decoding="async"
            className="h-10 w-10 max-h-full max-w-full object-contain opacity-55"
          />
        </div>
      ) : (
        <>
          {/* Mass poster grids intentionally bypass /_next/image. */}
          {/* Near mode is released by one shared adaptive observer. */}
          {shouldRequestSource && (
            <picture className="contents">
              {sourceIndex === 0 &&
                !isMediaEdgeBlocked(current) &&
                avifMediaSrcSet && (
                  <source
                    type="image/avif"
                    srcSet={avifMediaSrcSet}
                    sizes={sizes}
                  />
                )}
              {sourceIndex === 0 &&
                !isMediaEdgeBlocked(current) &&
                webpMediaSrcSet && (
                  <source
                    type="image/webp"
                    srcSet={webpMediaSrcSet}
                    sizes={sizes}
                  />
                )}
              <img
                key={current}
                ref={imageRef}
                width={400}
                height={600}
                src={current}
                srcSet={
                  sourceIndex === 0 && !isMediaEdgeBlocked(current)
                    ? mediaSrcSet
                    : undefined
                }
                alt={resolvedAlt}
                loading={nativeLoading}
                fetchPriority={nativeFetchPriority}
                decoding="async"
                referrerPolicy="no-referrer"
                sizes={sizes}
                onLoad={handleLoad}
                onError={handleError}
                className={[
                  'relative z-10 block h-full w-full object-cover transition-opacity duration-[180ms]',
                  loaded ? 'opacity-100' : 'opacity-0',
                  className,
                ].join(' ')}
              />
            </picture>
          )}
        </>
      )}
    </div>
  );
}
