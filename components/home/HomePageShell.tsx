import Link from 'next/link';

import type { Anime } from '@/types/anime';
import HomeFeedRuntimeProvider from '@/components/home/HomeFeedRuntimeProvider';
import HomeScheduleRuntimeProvider from '@/components/home/HomeScheduleRuntimeProvider';
import HomeHeroSection from '@/components/home/HomeHeroSection';
import HomeContinueSection from '@/components/home/HomeContinueSection';
import HomeWatchTogetherSection from '@/components/home/HomeWatchTogetherSection';
import HomeDiscoverySection from '@/components/home/HomeDiscoverySection';
import HomeCatalogSections from '@/components/home/HomeCatalogSections';
import HomeScheduleSection from '@/components/home/HomeScheduleSection';
import {
  HomeRetentionSections,
} from '@/components/home/HomePersonalRetentionSections';
import {
  HomeDeferredChat,
  HomeDeferredSupport,
} from '@/components/home/HomeDeferredCommunity';
import styles from './HomePageShell.module.css';

export default function HomePageShell({
  initialPopular,
  initialOngoing,
}: {
  initialPopular: Anime[];
  initialOngoing: Anime[];
}) {
  return (
    <HomeFeedRuntimeProvider
      initialPopular={initialPopular}
      initialOngoing={initialOngoing}
    >
      <HomeScheduleRuntimeProvider>
        <div className={styles.page} data-home-layout="cinematic">
          <HomeHeroSection />
          <div className={styles.shelves}>
            <HomeContinueSection />
            <HomeDiscoverySection />
            <HomeCatalogSections />
            <HomeScheduleSection />
            <HomeWatchTogetherSection />
            <HomeRetentionSections />
            <HomeDeferredChat />
            <nav className={styles.links} aria-label="Разделы AnimeBox">
              <Link href="/search">Каталог</Link>
              <Link href="/schedule">Расписание</Link>
              <Link href="/list">Мой список</Link>
              <Link href="/watch-together">Смотреть вместе</Link>
            </nav>
            <div className={styles.support}>
              <HomeDeferredSupport />
            </div>
          </div>
        </div>
      </HomeScheduleRuntimeProvider>
    </HomeFeedRuntimeProvider>
  );
}
