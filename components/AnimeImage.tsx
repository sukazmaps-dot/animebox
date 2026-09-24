'use client';

import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import Image from 'next/image';

import type {
  AnimeImage as ImageData,
} from '@/types/anime';

import {
  getImageCandidates,
} from '@/lib/image-service';

const FALLBACK =
  '/brand/brand-mark.webp';
const IMAGE_LOAD_TIMEOUT_MS = 12_000;

type Props = {
  image?: ImageData | null;
  alt?: string | null;
  englishName?: string | null;
  className?: string;
  loading?: 'lazy' | 'eager';
  preferOriginal?: boolean;
  sizes?: string;
  quality?: number;
};

const DEFAULT_SIZES =
  '(orientation: landscape) and (max-height: 600px) 18vw, (max-width: 480px) 42vw, (max-width: 760px) 31vw, (max-width: 1024px) 22vw, (max-width: 1280px) 18vw, 190px';

function canUseNextImage(source: string): boolean {
  if (!source || source.startsWith('/')) {
    return false;
  }

  try {
    const { hostname } = new URL(source);

    return (
      hostname === 'cdn.anilist.co' ||
      /^s[1-4]\.anilist\.co$/.test(hostname) ||
      hostname === 'cdn.myanimelist.net' ||
      hostname === 'api.jikan.moe' ||
      hostname.endsWith('.jikan.moe') ||
      hostname.endsWith('.shikimori.one') ||
      hostname.endsWith('.shikimori.me')
    );
  } catch {
    return false;
  }
}

export default function AnimeImage({
  image,
  alt,
  englishName,
  className = '',
  loading = 'lazy',
  sizes = DEFAULT_SIZES,
  quality = 70,
}: Props) {
  const imageRef =
    useRef<HTMLImageElement>(null);

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

  const [imageState, setImageState] = useState(() => ({
    key: sourcesKey,
    sourceIndex: 0,
    loaded: false,
  }));

  // Reset synchronously as derived render state when the anime/source list
  // changes. This avoids a second render caused by setState inside an effect.
  const sourceIndex =
    imageState.key === sourcesKey
      ? imageState.sourceIndex
      : 0;

  const loaded =
    imageState.key === sourcesKey
      ? imageState.loaded
      : false;

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
    setImageState((previous) => {
      const previousIndex =
        previous.key === sourcesKey
          ? previous.sourceIndex
          : 0;

      // onError and the cached-image check can report the same failure.
      // Advance only the candidate belonging to this render.
      if (previous.key === sourcesKey && previousIndex !== sourceIndex) return previous;
      const nextIndex = sourceIndex + 1;

      if (nextIndex >= sources.length) {
        return {
          key: sourcesKey,
          sourceIndex: previousIndex,
          loaded: previous.key === sourcesKey ? previous.loaded : false,
        };
      }

      return {
        key: sourcesKey,
        sourceIndex: nextIndex,
        loaded: false,
      };
    });
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
      setImageState((previous) =>
        previous.key === sourcesKey && previous.sourceIndex !== sourceIndex
          ? previous
          : { key: sourcesKey, sourceIndex, loaded: true },
      );
    }
  };

  const handleError = () => {
    if (!isFallback) {
      goToNextSource();
    } else {
      setImageState({
        key: sourcesKey,
        sourceIndex,
        loaded: true,
      });
    }
  };

  /**
   * Поддержка изображений, которые браузер/Next Image уже взял из cache.
   * State update выполняем в animation frame, а не синхронно внутри effect.
   */
  useEffect(() => {
    if (loaded || isFallback) return;

    const timeout = window.setTimeout(() => {
      setImageState((previous) => {
        const previousIndex =
          previous.key === sourcesKey ? previous.sourceIndex : sourceIndex;

        if (
          previous.key === sourcesKey &&
          previousIndex !== sourceIndex
        ) {
          return previous;
        }

        const nextIndex = Math.min(sourceIndex + 1, sources.length - 1);
        if (nextIndex === sourceIndex) return previous;

        return {
          key: sourcesKey,
          sourceIndex: nextIndex,
          loaded: false,
        };
      });
    }, IMAGE_LOAD_TIMEOUT_MS);

    return () => window.clearTimeout(timeout);
  }, [
    isFallback,
    loaded,
    sourceIndex,
    sources.length,
    sourcesKey,
  ]);

  useEffect(() => {
    const element = imageRef.current;

    if (!element || !element.complete) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      if (
        element.naturalWidth > 0 &&
        element.naturalHeight > 0
      ) {
        setImageState((previous) =>
          previous.key === sourcesKey && previous.sourceIndex !== sourceIndex
            ? previous
            : { key: sourcesKey, sourceIndex, loaded: true },
        );
        return;
      }

      if (!isFallback) {
        setImageState((previous) => {
          const previousIndex =
            previous.key === sourcesKey
              ? previous.sourceIndex
              : sourceIndex;
          if (previous.key === sourcesKey && previousIndex !== sourceIndex) return previous;
          const nextIndex = Math.min(
            sourceIndex + 1,
            sources.length - 1,
          );

          return {
            key: sourcesKey,
            sourceIndex: nextIndex,
            loaded: false,
          };
        });
      }
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [
    current,
    isFallback,
    sourceIndex,
    sources.length,
    sourcesKey,
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

      {isFallback ? (
        <div
          aria-hidden="true"
          className="absolute inset-0 z-10 flex items-center justify-center bg-[radial-gradient(circle_at_50%_35%,rgba(124,58,237,0.20),transparent_48%),linear-gradient(145deg,#11162a,#080b16)]"
        >
          <Image
            src="/brand/brand-mark.webp"
            alt=""
            width={40}
            height={40}
            sizes="40px"
            className="h-10 w-10 object-contain opacity-55"
          />
        </div>
      ) : canUseNextImage(current) ? (
        <Image
          key={current}
          ref={imageRef}
          src={current}
          alt={resolvedAlt}
          fill
          sizes={sizes}
          quality={quality}
          loading={loading}
          decoding="async"
          referrerPolicy="no-referrer"
          onLoad={handleLoad}
          onError={handleError}
          className={[
            'relative z-10 block h-full w-full object-cover transition-opacity duration-300',
            loaded ? 'opacity-100' : 'opacity-0',
            className,
          ].join(' ')}
        />
      ) : (
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
      )}
    </div>
  );
} 