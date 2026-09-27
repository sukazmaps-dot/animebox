import type { CSSProperties } from 'react';

import type { PremiumParticleEffect } from '@/lib/premium-studio';

import styles from './PremiumParticleLayer.module.css';

const PARTICLES = [
  [9, 18, 0.0, 8.4, 0.72],
  [18, 68, 1.1, 9.2, 0.52],
  [27, 34, 2.4, 7.8, 0.84],
  [38, 82, 0.7, 10.4, 0.62],
  [47, 16, 3.0, 8.8, 0.56],
  [57, 55, 1.7, 9.8, 0.92],
  [66, 29, 0.3, 7.6, 0.68],
  [75, 74, 2.8, 10.8, 0.58],
  [84, 42, 1.4, 8.1, 0.78],
  [92, 21, 3.5, 9.4, 0.48],
  [13, 91, 2.0, 11.2, 0.64],
  [34, 10, 4.0, 8.6, 0.46],
  [63, 91, 2.2, 10.0, 0.72],
  [89, 88, 0.9, 9.0, 0.54],
] as const;

export default function PremiumParticleLayer({
  effect,
  className = '',
}: {
  effect: PremiumParticleEffect | null | undefined;
  className?: string;
}) {
  if (!effect || effect === 'none') return null;

  return (
    <span
      className={`${styles.root} ${styles[effect]} ${className}`.trim()}
      data-premium-particles={effect}
      aria-hidden="true"
    >
      {PARTICLES.map(([x, y, delay, duration, scale], index) => (
        <i
          key={index}
          className={styles.item}
          style={{
            '--pp-x': `${x}%`,
            '--pp-y': `${y}%`,
            '--pp-delay': `${delay}s`,
            '--pp-duration': `${duration}s`,
            '--pp-scale': String(scale),
          } as CSSProperties}
        />
      ))}
    </span>
  );
}
