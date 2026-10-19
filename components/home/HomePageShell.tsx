import type { Anime } from '@/types/anime';
import HomeFeedRuntimeProvider from '@/components/home/HomeFeedRuntimeProvider';
import HomeScheduleRuntimeProvider from '@/components/home/HomeScheduleRuntimeProvider';
import HomeHeroSection from '@/components/home/HomeHeroSection';
import HomeGuestPrompt from '@/components/home/HomeGuestPrompt';
import HomeContinueSection from '@/components/home/HomeContinueSection';
import HomeWatchTogetherSection from '@/components/home/HomeWatchTogetherSection';
import HomeDiscoverySection, { HomeRecommendationSection } from '@/components/home/HomeDiscoverySection';
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
            <HomeWatchTogetherSection />
            <HomeScheduleSection />
            <HomeRecommendationSection />
            <HomeCatalogSections />
            <HomeGuestPrompt />
            <HomeDeferredChat />
            <HomeRetentionSections />
            <div className={styles.support}>
              <HomeDeferredSupport />
            </div>
          </div>
        </div>
      </HomeScheduleRuntimeProvider>
    </HomeFeedRuntimeProvider>
  );
}
