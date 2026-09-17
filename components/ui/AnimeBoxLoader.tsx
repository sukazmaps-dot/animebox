import Image from 'next/image';

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
    >
      <span
        className={styles.orbit}
        style={{ width: size, height: size }}
        aria-hidden="true"
      >
        <Image
          src="/brand/ui/animebox-loader.webp"
          width={size}
          height={size}
          alt=""
          className={styles.image}
          unoptimized
          priority={false}
        />
      </span>
      {!compact && <span className={styles.label}>{label}</span>}
    </div>
  );
}
