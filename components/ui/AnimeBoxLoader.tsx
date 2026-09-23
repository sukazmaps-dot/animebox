import styles from './AnimeBoxLoader.module.css';

type Props = {
  label?: string;
  size?: number;
  compact?: boolean;
  className?: string;
};

export default function AnimeBoxLoader({
  label = 'Загрузка…',
  size = 46,
  compact = false,
  className = '',
}: Props) {
  return (
    <div
      className={`${styles.loader} ${compact ? styles.compact : ''} ${className}`.trim()}
      role="status"
      aria-live="polite"
      aria-label={compact ? label : undefined}
    >
      <span
        className={styles.orbit}
        style={{ width: size, height: size }}
        aria-hidden="true"
      >
        <span className={styles.core} />
      </span>
      {!compact && <span className={styles.label}>{label}</span>}
    </div>
  );
}
