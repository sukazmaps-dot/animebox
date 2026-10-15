'use client';

import styles from './HomeHeroPagination.module.css';

type Slide = { id: number; title: string };

export default function HomeHeroPagination({
  slides,
  activeIndex,
  onSelect,
}: {
  slides: Slide[];
  activeIndex: number;
  onSelect: (index: number) => void;
}) {
  if (slides.length < 2) return null;

  return (
    <div className={styles.pagination} role="group" aria-label="Выбор рекомендации">
      <span className={styles.counter} aria-hidden="true">
        {String(activeIndex + 1).padStart(2, '0')} / {String(slides.length).padStart(2, '0')}
      </span>
      <div className={styles.positions}>
        {slides.map((slide, index) => (
          <button
            key={slide.id}
            type="button"
            className={styles.position}
            aria-pressed={index === activeIndex}
            aria-label={`Показать: ${slide.title}`}
            onClick={() => onSelect(index)}
          >
            <span className={styles.mark} aria-hidden="true" />
          </button>
        ))}
      </div>
    </div>
  );
}
