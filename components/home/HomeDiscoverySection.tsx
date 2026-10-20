'use client';

import dynamic from 'next/dynamic';
import { useMemo } from 'react';
import HomeTonightPick from '@/components/home/HomeTonightPick';
import { isHomePublicSafe } from '@/lib/home-public-filter';
import type { HomeTonightCandidate } from '@/lib/home-tonight-pick';
import SectionHeader from '@/components/home/SectionHeader';
import Link from 'next/link';
import heroStyles from './HomeTonightPick.module.css';

import styles from './HomePageShell.module.css';

import HomeMoodPicker from '@/components/HomeMoodPicker';
import HomeTonightLoading from '@/components/home/HomeTonightLoading';
import { useHomeFeedRuntime } from '@/components/home/HomeFeedRuntimeProvider';
import { RecommendationFeedSkeleton } from '@/components/home/HomeLoadingSkeletons';
import { HomePersonalScheduleSection } from '@/components/home/HomePersonalRetentionSections';

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
    popular,
    ongoing,
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

  // The server already provides verified, playable popular/ongoing titles.
  // Render one on SSR rather than waiting for a client-only component,
  // hydration, the recommendation chunk and the idle callback. Never claim
  // that this provisional choice is personalized or emit a recommendation
  // impression for it.
  const publicPreview = useMemo<HomeTonightCandidate[]>(() => {
    const seen = new Set<number>();
    const result: HomeTonightCandidate[] = [];
    for (const anime of [...popular, ...ongoing]) {
      if (!anime || !Number.isSafeInteger(anime.id) || anime.id <= 0 ||
          !isHomePublicSafe(anime) || seen.has(anime.id) ||
          !(anime.title?.russian || anime.title?.romaji || anime.title?.english)) continue;
      seen.add(anime.id);
      result.push({
        anime,
        moodTier: 'good',
        franchiseRequiresPrevious: false,
        franchiseContinuation: false,
        explanations: [],
        reason: '',
      });
      if (result.length >= 8) break;
    }
    return result;
  }, [popular, ongoing]);
  const showingPublicPreview =
    recommendationsLoading &&
    !moodSwitching &&
    mood === 'any' &&
    publicPreview.length > 0;
  const rankedForCurrentMood = mood === recommendationMood ? smartRecommendations : [];

  return (
    <div className={styles.discovery}>
      <section
        id="animebox-for-you"
        aria-labelledby="home-tonight-title"
        className="section smart-feed-section"
        aria-busy={recommendationsLoading}
      >
        <header className={heroStyles.heading}>
          <h1 id="home-tonight-title">Что посмотреть сегодня?</h1>
          <Link href="/search">Весь каталог →</Link>
        </header>

        <HomeMoodPicker
          value={mood}
          onChange={updateMood}
          busy={moodSwitching}
          compact
        />

        {recommendationsLoading && !showingPublicPreview ? <HomeTonightLoading mood={mood} /> : <HomeTonightPick
          key={mood}
          mood={mood}
          items={showingPublicPreview ? publicPreview : rankedForCurrentMood}
          busy={moodSwitching}
          hasWatchHistory={hasWatchHistory}
          preview={showingPublicPreview}
        />}
      </section>
    </div>
  );
}

/** Reuses the same ranked runtime; separation lets the decision precede long rails. */
export function HomeRecommendationSection() {
  const {
    hydrated,
    recommendationsReady,
    popularLoading,
    ongoingLoading,
    smartRecommendations,
    recommendationMood,
    hasWatchHistory,
  } = useHomeFeedRuntime();
  const recommendationsLoading = !hydrated || !recommendationsReady ||
    (popularLoading && ongoingLoading && smartRecommendations.length === 0);

  return (
    <>
      <HomePersonalScheduleSection />
      <section id="animebox-recommendations" aria-labelledby="home-recommendations-title" className="section smart-feed-section" aria-busy={recommendationsLoading}>
        <SectionHeader id="home-recommendations-title" title={hasWatchHistory ? 'Подборки для тебя' : 'Подборки по настроению'} />
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
    </>
  );
}
