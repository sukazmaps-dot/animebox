'use client';

import styles from './FilterChip.module.css';

export default function FilterChip({
  label,
  onRemove,
}: {
  label: string;
  onRemove: () => void;
}) {
  return (
    <button
      type="button"
      className={styles.chip}
      aria-label={`Убрать фильтр ${label}`}
      onClick={onRemove}
    >
      <span>{label}</span>
      <span aria-hidden="true">×</span>
    </button>
  );
}
