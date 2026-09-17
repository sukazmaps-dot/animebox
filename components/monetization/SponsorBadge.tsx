import styles from './SponsorBadge.module.css';

import {
  SPONSOR_META,
  type SponsorTier,
} from '@/lib/sponsor';

type Props = {
  tier: SponsorTier;
  compact?: boolean;
  className?: string;
};

export default function SponsorBadge({
  tier,
  compact = false,
  className = '',
}: Props) {
  const meta = SPONSOR_META[tier];
  const tierClass =
    tier === 'premium'
      ? styles.premium
      : tier === 'patron'
        ? styles.patron
        : styles.supporter;

  return (
    <span
      data-sponsor-tier={tier}
      className={`${styles.badge} ${tierClass} ${compact ? styles.compact : ''} ${className}`.trim()}
      title={`${meta.label} · ${meta.description}`}
      aria-label={`${meta.label}. ${meta.description}`}
    >
      <svg
        className={styles.icon}
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M12 2.8 15.2 7l5.1 1.2-2.7 4.5.5 5.2-5 1.9L8.4 22l-3.1-4.2.4-5.2L3 8.2 8 7 12 2.8Z"
          fill="currentColor"
          fillOpacity=".16"
          stroke="currentColor"
          strokeWidth="1.45"
          strokeLinejoin="round"
        />
        <path
          d={tier === 'patron' ? 'M7 10l3 2 2-5 2 5 3-2-1 6H8l-1-6Z' : 'm12 7.2 1.15 2.45 2.65.35-1.95 1.85.5 2.6L12 13.2l-2.35 1.25.5-2.6L8.2 10l2.65-.35L12 7.2Z'}
          fill="currentColor"
        />
        <circle cx="18.7" cy="5.2" r="1.15" fill="currentColor" />
      </svg>
      <span className={styles.label}>
        {compact ? meta.shortLabel : meta.label}
      </span>
    </span>
  );
}
