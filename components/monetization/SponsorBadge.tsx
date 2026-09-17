import Image from 'next/image';

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

const ICONS: Record<SponsorTier, string> = {
  supporter: '/brand/identity/role-supporter.webp',
  premium: '/brand/identity/role-premium.webp',
  patron: '/brand/identity/role-patron.webp',
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
      <Image
        src={ICONS[tier]}
        width={34}
        height={34}
        alt=""
        className={styles.icon}
        aria-hidden="true"
        unoptimized
      />
      <span className={styles.label}>
        {compact ? meta.shortLabel : meta.label}
      </span>
    </span>
  );
}
