import Link from 'next/link';

import HomeWatchTogetherDeferred from '@/components/home/HomeWatchTogetherDeferred';
import styles from './HomeWatchTogetherSection.module.css';

/** Server-owned copy and links are visible even before the client lobby hydrates. */
export default function HomeWatchTogetherSection() {
  return (
    <section className={styles.section} aria-labelledby="home-watch-together-title" id="animebox-watch-together">
      <div className={styles.heading}>
        <div className={styles.headingCopy}>
          <span className={styles.eyebrow}>WATCH TOGETHER · ANIMEBOX</span>
          <h2 id="home-watch-together-title">Аниме лучше смотреть вместе</h2>
          <p>Загляни в открытую комнату или создай свою. Смотреть синхронно и общаться можно даже на расстоянии.</p>
        </div>
        <div className={styles.headingActions}>
          <Link className={styles.primaryAction} href="/watch-together">
            Создать комнату <span aria-hidden="true">↗</span>
          </Link>
          <Link className={styles.secondaryAction} href="/watch-together">
            Все комнаты →
          </Link>
        </div>
      </div>
      <HomeWatchTogetherDeferred />
    </section>
  );
}
