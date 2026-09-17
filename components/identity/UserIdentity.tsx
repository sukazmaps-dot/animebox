import Image from 'next/image';

import styles from './UserIdentity.module.css';

import { resolveIdentityKind, type IdentityKind, type PublicIdentityRole } from '@/lib/identity';
import type { SponsorStatus } from '@/lib/sponsor';

type Props = {
  username: string;
  role?: PublicIdentityRole;
  sponsor?: SponsorStatus | null;
  compact?: boolean;
  showLabel?: boolean;
  className?: string;
  nameClassName?: string;
};

const LABELS: Record<IdentityKind, string> = {
  owner: 'Владелец AnimeBox',
  admin: 'Администратор',
  moderator: 'Модератор',
  patron: 'Меценат AnimeBox',
  premium: 'Премиум-спонсор',
  supporter: 'Спонсор',
  none: '',
};

const ICONS: Record<Exclude<IdentityKind, 'none'>, string> = {
  owner: '/brand/identity/role-owner.webp',
  admin: '/brand/identity/role-admin.webp',
  moderator: '/brand/identity/role-moderator.webp',
  patron: '/brand/identity/role-patron.webp',
  premium: '/brand/identity/role-premium.webp',
  supporter: '/brand/identity/role-supporter.webp',
};

function IdentityIcon({ kind }: { kind: Exclude<IdentityKind, 'none'> }) {
  return (
    <Image
      src={ICONS[kind]}
      alt=""
      width={40}
      height={40}
      className={styles.iconImage}
      aria-hidden="true"
      unoptimized
    />
  );
}

export default function UserIdentity({
  username,
  role = null,
  sponsor = null,
  compact = false,
  showLabel = false,
  className = '',
  nameClassName = '',
}: Props) {
  const kind = resolveIdentityKind(role, sponsor);
  const label = LABELS[kind];
  const kindClass = kind === 'none' ? '' : styles[kind];

  return (
    <span
      className={`${styles.identity} ${kindClass} ${compact ? styles.compact : ''} ${className}`.trim()}
      data-identity-kind={kind}
      data-sponsor-tier={role ? undefined : sponsor?.tier}
    >
      <strong className={`${styles.name} ${nameClassName}`.trim()}>{username}</strong>

      {kind !== 'none' && (
        <span
          className={styles.mark}
          title={label}
          aria-label={label}
          role="img"
        >
          <IdentityIcon kind={kind} />
        </span>
      )}

      {showLabel && kind !== 'none' && (
        <span className={styles.label}>{label}</span>
      )}
    </span>
  );
}
