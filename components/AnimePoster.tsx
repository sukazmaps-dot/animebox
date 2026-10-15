'use client';

import { useState, type ComponentProps } from 'react';
import AnimeImage, { type AnimeImageLoadState } from '@/components/AnimeImage';

type Props = Omit<ComponentProps<typeof AnimeImage>, 'containerClassName' | 'onStateChange'>;

/**
 * Shared 2:3 portrait surface. AnimeImage owns CDN/source selection, native
 * lazy/near loading, two bounded recovery attempts, and the local fallback.
 * This component owns geometry and the lightweight blur-up color skeleton.
 */
export default function AnimePoster({
  image,
  alt,
  className = '',
  ...props
}: Props) {
  const [state, setState] = useState<AnimeImageLoadState>('loading');
  const coverColor = /^#[\da-f]{6}$/i.test(image?.color ?? '')
    ? image?.color
    : '#292530';

  return (
    <div
      className={`relative isolate h-full w-full min-w-0 overflow-hidden rounded-[8px] ${className}`}
      style={{ aspectRatio: '2 / 3' }}
      data-anime-poster-state={state}
    >
      <div
        aria-hidden="true"
        className={`absolute inset-0 z-0 scale-110 blur-xl transition-opacity duration-200 ease-out ${state === 'loading' ? 'opacity-100 motion-safe:animate-pulse' : 'opacity-0'}`}
        style={{
          background: `radial-gradient(ellipse at 45% 25%, ${coverColor}, #141418 78%)`,
        }}
      />
      <AnimeImage
        {...props}
        image={image}
        alt={alt}
        onStateChange={setState}
        containerClassName="absolute inset-0 z-10"
        className="block h-full w-full object-cover transition-opacity duration-200 ease-out"
      />
    </div>
  );
}
