import type { CSSProperties } from 'react';
import type {
  PremiumAtmosphereEffect,
  PremiumMotionMode,
} from '@/lib/premium-studio';

export type PremiumAtmosphereVariant = 'full' | 'preview' | 'compact';

type ParticleStyle = CSSProperties & {
  '--particle-left': string;
  '--particle-static-top': string;
  '--particle-duration-soft': string;
  '--particle-duration-live': string;
  '--particle-delay': string;
  '--particle-drift-x': string;
  '--particle-rise-y': string;
  '--particle-fall-y': string;
  '--particle-scale': string;
  '--particle-rotation': string;
};

const PARTICLE_COUNT: Record<PremiumAtmosphereVariant, number> = {
  full: 14,
  preview: 11,
  compact: 10,
};

/*
 * Deterministic particle geometry.
 *
 * Do not calculate positions/timing with CSS multiplication such as
 * calc(var(--particle-index) * 6%). That form is still inconsistent between
 * browser engines and was the reason particles could silently lose their
 * left/duration/delay values in social mini-profiles.
 *
 * These values are generated from the stable particle index. No runtime
 * randomness is used, so server/client markup is identical and screenshots
 * and tests remain reproducible.
 */
function particleStyle(
  index: number,
  variant: PremiumAtmosphereVariant,
): ParticleStyle {
  const left = 5 + ((index * 23 + 11) % 90);
  const staticTop = 7 + ((index * 31 + 17) % 82);
  const durationSoft = 9.2 + ((index * 7) % 6) * 0.86;
  const durationLive = Math.max(5.8, durationSoft * 0.68);
  const delay = -(0.62 + ((index * 13) % 17) * 0.47);
  const driftX = -24 + ((index * 19 + 7) % 49);
  const riseDistance =
    variant === 'full'
      ? 780 + ((index * 41) % 320)
      : variant === 'preview'
        ? 520 + ((index * 41) % 220)
        : 300 + ((index * 41) % 150);
  const fallDistance =
    variant === 'full'
      ? 860 + ((index * 29) % 300)
      : variant === 'preview'
        ? 560 + ((index * 29) % 220)
        : 330 + ((index * 29) % 150);
  const scale = 0.68 + ((index * 11) % 7) * 0.09;
  const rotation = -70 + ((index * 37) % 141);

  return {
    '--particle-left': `${left}%`,
    '--particle-static-top': `${staticTop}%`,
    '--particle-duration-soft': `${durationSoft.toFixed(2)}s`,
    '--particle-duration-live': `${durationLive.toFixed(2)}s`,
    '--particle-delay': `${delay.toFixed(2)}s`,
    '--particle-drift-x': `${driftX}px`,
    '--particle-rise-y': `-${riseDistance}px`,
    '--particle-fall-y': `${fallDistance}px`,
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
      <span className="premium-profile-v21__ambient-layer">
        <span className="premium-profile-v21__ambient premium-profile-v21__ambient--a" />
        <span className="premium-profile-v21__ambient premium-profile-v21__ambient--b" />
        <span className="premium-profile-v21__ambient premium-profile-v21__ambient--c" />
      </span>

      <span className="premium-profile-v21__particle-layer">
        <span className="premium-profile-v21__particles">
          {Array.from({ length: particleCount }, (_, index) => (
            <i
              key={index}
              data-particle={index}
              style={particleStyle(index, variant)}
            />
          ))}
        </span>
      </span>
    </div>
  );
}
