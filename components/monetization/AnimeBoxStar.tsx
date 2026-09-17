import Image from 'next/image';
import type { CSSProperties } from 'react';

type Props = {
  size?: number;
  className?: string;
  title?: string;
};

export default function AnimeBoxStar({
  size = 22,
  className = '',
  title,
}: Props) {
  const decorative = !title;

  return (
    <Image
      src="/brand/monetization/animebox-star.webp"
      width={size}
      height={size}
      alt={decorative ? '' : title}
      aria-hidden={decorative ? 'true' : undefined}
      className={`animebox-star-icon ${className}`.trim()}
      style={{ '--animebox-star-size': `${size}px` } as CSSProperties}
      unoptimized
    />
  );
}
