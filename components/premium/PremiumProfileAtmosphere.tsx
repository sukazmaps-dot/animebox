import type { CSSProperties } from 'react';
import type {
  PremiumAtmosphereEffect,
  PremiumMotionMode,
} from '@/lib/premium-studio';

export type PremiumAtmosphereVariant = 'full' | 'preview' | 'compact';

type ParticleStyle = CSSProperties & {
  '--particle-left': string;
  '--particle-static-top': string;
  '--particle-duration': string;
  '--particle-delay': string;
  '--particle-drift-x': string;
  '--particle-drift-y': string;
  '--particle-scale': string;
  '--particle-rotation': string;
};

const PARTICLE_COUNT: Record<PremiumAtmosphereVariant, number> = {
  full: 14,
  preview: 11,
  compact: 8,
};

/*
 * Deterministic particle geometry.
 *
 * Do not calculate positions/timing with CSS multiplication such as
 * calc(var(--particle-index) * 6%). That form is still inconsistent between
 * browser engines and was the reason particles could silently lose their
 * left/duration/delay values in social mini-profiles.
 *
 * These values are generated from the stable particle index. There is no
 * Math.random(), so server/client markup is identical and screenshots/tests
 * remain reproducible.
 */
function particleStyle(index: number): ParticleStyle {
  const left = 5 + ((index * 23 + 11) % 90);
  const staticTop = 7 + ((index * 31 + 17) % 82);
  const duration = 8.6 + ((index * 7) % 6) * 0.82;
  const delay = -(0.62 + ((index * 13) % 17) * 0.47);
  const driftX = -24 + ((index * 19 + 7) % 49);
  const driftY = -(360 + ((index * 41) % 250));
  const scale = 0.68 + ((index * 11) % 7) * 0.09;
  const rotation = -70 + ((index * 37) % 141);

  return {
    '--particle-left': `${left}%`,
    '--particle-static-top': `${staticTop}%`,
    '--particle-duration': `${duration.toFixed(2)}s`,
    '--particle-delay': `${delay.toFixed(2)}s`,
    '--particle-drift-x': `${driftX}px`,
    '--particle-drift-y': `${driftY}px`,
    '--particle-scale': scale.toFixed(2),
    '--particle-rotation': `${rotation}deg`,
  };
}

export default function PremiumProfileAtmosphere({
  effect,
  motion,
  variant = 'full',
  className = '',
}: {
  effect: PremiumAtmosphereEffect;
  motion: PremiumMotionMode;
  variant?: PremiumAtmosphereVariant;
  className?: string;
}) {
  if (effect === 'none') return null;

  const particleCount = PARTICLE_COUNT[variant];

  return (
    <div
      className={`premium-profile-v21__atmosphere ${className}`.trim()}
      data-effect={effect}
      data-motion={motion}
      data-variant={variant}
      aria-hidden="true"
    >
      <span className="premium-profile-v21__ambient premium-profile-v21__ambient--a" />
      <span className="premium-profile-v21__ambient premium-profile-v21__ambient--b" />
      <span className="premium-profile-v21__ambient premium-profile-v21__ambient--c" />

      <span className="premium-profile-v21__particles">
        {Array.from({ length: particleCount }, (_, index) => (
          <i
            key={index}
            data-particle={index}
            style={particleStyle(index)}
          />
        ))}
      </span>
    </div>
  );
}
