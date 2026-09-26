import type { CSSProperties } from 'react';
import type {
  PremiumAtmosphereEffect,
  PremiumMotionMode,
} from '@/lib/premium-studio';

export default function PremiumProfileAtmosphere({
  effect,
  motion,
  className = '',
}: {
  effect: PremiumAtmosphereEffect;
  motion: PremiumMotionMode;
  className?: string;
}) {
  if (effect === 'none') return null;

  return (
    <div
      className={`premium-profile-v21__atmosphere ${className}`.trim()}
      data-effect={effect}
      data-motion={motion}
      aria-hidden="true"
    >
      <span className="premium-profile-v21__ambient premium-profile-v21__ambient--a" />
      <span className="premium-profile-v21__ambient premium-profile-v21__ambient--b" />
      <span className="premium-profile-v21__ambient premium-profile-v21__ambient--c" />
      <span className="premium-profile-v21__particles">
        {Array.from({ length: 14 }, (_, index) => (
          <i key={index} style={{ '--particle-index': index } as CSSProperties} />
        ))}
      </span>
    </div>
  );
}
