import Link from 'next/link';

import SectionHeader from '@/components/home/SectionHeader';

import HomeWatchTogetherDeferred from '@/components/home/HomeWatchTogetherDeferred';
import styles from './HomeWatchTogetherSection.module.css';

/** Server-owned copy and links are visible even before the client lobby hydrates. */
export default function HomeWatchTogetherSection() {
  return (
    <section className={styles.section} aria-labelledby="home-watch-together-title" id="animebox-watch-together">
      <SectionHeader
        title="Смотреть вместе"
        id="home-watch-together-title"
        subtitle="Открытые комнаты и синхронный просмотр с друзьями."
        href="/watch-together"
        linkLabel="Все комнаты"
        actions={<Link className={styles.primaryAction} href="/watch-together">Создать комнату ↗</Link>}
      />
      <HomeWatchTogetherDeferred />
    </section>
  );
}
