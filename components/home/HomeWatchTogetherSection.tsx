import Link from 'next/link';

import HomeWatchTogetherDeferred from '@/components/home/HomeWatchTogetherDeferred';
import styles from './HomeWatchTogetherSection.module.css';

/** Server-owned copy and links are visible even before the client lobby hydrates. */
export default function HomeWatchTogetherSection() {
  return (
    <section className={styles.section} aria-labelledby="home-watch-together-title" id="animebox-watch-together">
      <div className={styles.heading}>
        <div className={styles.headingCopy}>
          <h2 id="home-watch-together-title">Смотреть вместе</h2>
          <p>Открытые комнаты и синхронный просмотр с друзьями.</p>
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
