'use client';

import { SeasonFrameOverlay } from '@/components/leaderboard/SeasonFramePreview';
import { isSeasonFrameKey } from '@/lib/leaderboard-rewards';
import { isLevelFrameKey } from '@/lib/progression';

import styles from './ProfileFrameOverlay.module.css';

export default function ProfileFrameOverlay({
  frameKey,
  premium = false,
  className = '',
}: {
  frameKey?: string | null;
  premium?: boolean;
  className?: string;
}) {
  if (!frameKey) return null;

  if (isSeasonFrameKey(frameKey)) {
    return <SeasonFrameOverlay frameKey={frameKey} className={className} />;
  }

  if (!isLevelFrameKey(frameKey)) return null;

  return (
    <span
      className={`${styles.levelFrame} ${className}`.trim()}
      data-level-frame={frameKey}
      data-premium={premium ? 'true' : 'false'}
      aria-hidden="true"
    >
      <svg
        className={styles.levelFrameSvg}
        viewBox="0 0 120 120"
        focusable="false"
        role="presentation"
      >
        <circle className={styles.outer} cx="60" cy="60" r="52" />
        <circle className={styles.inner} cx="60" cy="60" r="45" />
        <path
          className={styles.arc}
          d="M20 43c8-20 29-31 50-27 13 2 24 9 31 19"
        />
        <path
          className={styles.arcSecondary}
          d="M100 77c-8 20-29 31-50 27-13-2-24-9-31-19"
        />
        <path className={styles.mark} d="M60 3l4 8 9 1-7 6 2 9-8-5-8 5 2-9-7-6 9-1z" />
      </svg>
      <span className={styles.sparkOne} />
      <span className={styles.sparkTwo} />
    </span>
  );
}
