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
} from '@/lib/image-service';

const FALLBACK = '/brand/brand-mark.webp';
const LOAD_WINDOW_ROOT_MARGIN = '720px 0px';
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
  loading?: 'lazy' | 'eager';
  preferOriginal?: boolean;
  sizes?: string;
  quality?: number;
  onStateChange?: (state: AnimeImageLoadState) => void;
};

const DEFAULT_SIZES =
  '(orientation: landscape) and (max-height: 600px) 18vw, (max-width: 480px) 42vw, (max-width: 760px) 31vw, (max-width: 1024px) 22vw, (max-width: 1280px) 18vw, 190px';

function sourceTimeoutMs(source: string, sourceIndex: number) {
  if (source.startsWith('/api/image?')) {
    // /api/image can legitimately wait up to 8 seconds for its upstream.
    // The browser watchdog must not abandon it before the server can answer.
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
  sizes = DEFAULT_SIZES,
  onStateChange,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const transientRetryCountRef = useRef(0);

  const sources = useMemo(
    () =>
      Array.from(
        new Set([
          ...getImageCandidates(image),
          FALLBACK,
        ]),
      ),
    [image],
  );

  const sourcesKey = sources.join('|');

  const [imageState, setImageState] = useState(() => ({
    key: sourcesKey,
    sourceIndex: 0,
    loaded: false,
  }));
  const [nearViewport, setNearViewport] = useState(
    () => loading === 'eager',
  );

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
  const hasRealSource = sources.some((source) => source !== FALLBACK);
  const shouldRequestSource =
    loading === 'eager' || nearViewport;

  const resolvedAlt =
    alt?.trim() ||
    englishName?.trim() ||
    'Аниме';

  const publicState: AnimeImageLoadState =
    isFallback ? 'fallback' : loaded ? 'loaded' : 'loading';

  useEffect(() => {
    onStateChange?.(publicState);
  }, [onStateChange, publicState]);

  useEffect(() => {
    if (
      loading === 'eager' ||
      nearViewport ||
      !hasRealSource
    ) {
      return;
    }

    const host = hostRef.current;
    if (!host) return;

    if (typeof IntersectionObserver === 'undefined') {
      const frame = window.requestAnimationFrame(() => {
        setNearViewport(true);
      });
      return () => window.cancelAnimationFrame(frame);
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        setNearViewport(true);
      },
      {
        rootMargin: LOAD_WINDOW_ROOT_MARGIN,
        threshold: 0.01,
      },
    );

    observer.observe(host);

    return () => observer.disconnect();
  }, [hasRealSource, loading, nearViewport]);

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
        return {
          key: sourcesKey,
          sourceIndex: previousIndex,
          loaded:
            previous.key === sourcesKey
              ? previous.loaded
              : false,
        };
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
   * The old implementation started this timer at React mount time while the
   * browser was still allowed to defer loading="lazy" images. Off-screen rail
   * cards could therefore exhaust every source before Chrome had even started
   * their request. The watchdog now exists only after the card enters a broad
   * prefetch window and its <img> is actually mounted.
   */
  useEffect(() => {
    if (
      !shouldRequestSource ||
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
    shouldRequestSource,
    sourceIndex,
  ]);

  useEffect(() => {
    transientRetryCountRef.current = 0;
  }, [sourcesKey]);

  useEffect(() => {
    if (
      !isFallback ||
      !shouldRequestSource ||
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

    // A visible fallback deserves one reasonably quick second chance. This is
    // still bounded, so a permanently broken upstream cannot create a retry loop.
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
    shouldRequestSource,
    sources.length,
    sourcesKey,
  ]);

  useEffect(() => {
    if (!shouldRequestSource || isFallback) return;

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
          {/* Local fallback intentionally bypasses Next Image as well. */}
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
      ) : shouldRequestSource ? (
        <>
          {/* Massive poster grids intentionally bypass /_next/image. */}
          {/* Manual viewport gating replaces native lazy loading here so the */}
          {/* failover watchdog starts only after a real request can begin. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            key={current}
            ref={imageRef}
            src={current}
            alt={resolvedAlt}
            loading="eager"
            decoding="async"
            sizes={sizes}
            onLoad={handleLoad}
            onError={handleError}
            className={[
              'relative z-10 block h-full w-full object-cover transition-opacity duration-300',
              loaded ? 'opacity-100' : 'opacity-0',
              className,
            ].join(' ')}
          />
        </>
      ) : null}
    </div>
  );
}
