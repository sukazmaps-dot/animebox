'use client';

import dynamic from 'next/dynamic';
import SectionHeader from '@/components/home/SectionHeader';

import styles from './HomePageShell.module.css';

import HomeMoodPicker from '@/components/HomeMoodPicker';
import HomeTonightLoading from '@/components/home/HomeTonightLoading';
import { useHomeFeedRuntime } from '@/components/home/HomeFeedRuntimeProvider';
import { RecommendationFeedSkeleton } from '@/components/home/HomeLoadingSkeletons';
import { HomePersonalScheduleSection } from '@/components/home/HomePersonalRetentionSections';

const HomeTonightPick = dynamic(
  () => import('@/components/home/HomeTonightPick'),
  { ssr: false, loading: () => <HomeTonightLoading /> },
);

const SmartRecommendationFeed = dynamic(
  () => import('@/components/SmartRecommendationFeed'),
  {
    ssr: false,
    loading: () => (
      <RecommendationFeedSkeleton railCount={2} cardCount={5} label="Подготавливаем персональные полки" />
    ),
  },
);

export default function HomeDiscoverySection() {
  const {
    mood,
    recommendationMood,
    moodSwitching,
    updateMood,
    hydrated,
    popularLoading,
    ongoingLoading,
    smartRecommendations,
    recommendationsReady,
    hasWatchHistory,
  } = useHomeFeedRuntime();

  const recommendationsLoading =
    !hydrated ||
    !recommendationsReady ||
    (popularLoading &&
      ongoingLoading &&
      smartRecommendations.length === 0);

  return (
    <>
      <HomePersonalScheduleSection />

      <div className={styles.discovery}>
        <section
          id="animebox-for-you"
          className="section smart-feed-section"
          aria-busy={recommendationsLoading}
        >
          <SectionHeader title="Что посмотреть сегодня?" href="/search" linkLabel="Весь каталог" />

          <HomeMoodPicker
            value={mood}
            onChange={updateMood}
            busy={moodSwitching}
            compact
          />

          {recommendationsLoading ? <HomeTonightLoading mood={mood} /> : <HomeTonightPick
            key={mood}
            mood={mood}
            items={mood === recommendationMood ? smartRecommendations : []}
            busy={moodSwitching}
            hasWatchHistory={hasWatchHistory}
          />}

          {recommendationsLoading ? (
            <RecommendationFeedSkeleton
              railCount={2}
              cardCount={5}
              label="Загружаем персональные рекомендации"
            />
          ) : (
            <div
              className="home-deferred home-deferred--recommendations"
              data-loading-policy="instant-after-ranking"
            >
              <SmartRecommendationFeed
                items={smartRecommendations}
                mood={recommendationMood}
                hasWatchHistory={hasWatchHistory}
              />
            </div>
          )}
        </section>
      </div>
    </>
  );
}
