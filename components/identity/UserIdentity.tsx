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

function IdentityIcon({ kind }: { kind: IdentityKind }) {
  if (kind === 'owner') {
    return (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M4.2 8.1 8.3 11l3.7-6.3 3.7 6.3 4.1-2.9-1.5 9.2H5.7L4.2 8.1Z" fill="currentColor" fillOpacity=".2" stroke="currentColor" strokeWidth="1.35" strokeLinejoin="round" />
        <path d="M7 19.2h10M8.1 14.8h7.8" stroke="currentColor" strokeWidth="1.45" strokeLinecap="round" />
        <circle cx="4" cy="6.5" r="1.35" fill="currentColor" />
        <circle cx="12" cy="3.6" r="1.35" fill="currentColor" />
        <circle cx="20" cy="6.5" r="1.35" fill="currentColor" />
      </svg>
    );
  }

  if (kind === 'admin') {
    return (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M12 3.2 19 6v5.1c0 4.5-2.9 7.8-7 9.7-4.1-1.9-7-5.2-7-9.7V6l7-2.8Z" fill="currentColor" fillOpacity=".16" stroke="currentColor" strokeWidth="1.4" />
        <path d="m8.8 12 2 2 4.5-4.7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  if (kind === 'moderator') {
    return (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M12 3.5 20 12l-8 8.5L4 12l8-8.5Z" fill="currentColor" fillOpacity=".14" stroke="currentColor" strokeWidth="1.4" />
        <circle cx="12" cy="12" r="2.5" fill="currentColor" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 3.1 14.4 8l5.4.8-3.9 3.8.9 5.3-4.8-2.5-4.8 2.5.9-5.3-3.9-3.8L9.6 8 12 3.1Z" fill="currentColor" fillOpacity=".18" stroke="currentColor" strokeWidth="1.35" strokeLinejoin="round" />
      <circle cx="18.4" cy="5.1" r="1.2" fill="currentColor" />
    </svg>
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
