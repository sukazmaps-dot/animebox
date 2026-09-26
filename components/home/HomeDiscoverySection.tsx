'use client';

import dynamic from 'next/dynamic';
import Image from 'next/image';
import Link from 'next/link';

import DeferredMount from '@/components/DeferredMount';
import HomeContinueWatching from '@/components/HomeContinueWatching';
import HomeMoodPicker from '@/components/HomeMoodPicker';
import { useHomeFeedRuntime } from '@/components/home/HomeFeedRuntimeProvider';
import { RecommendationFeedSkeleton } from '@/components/home/HomeLoadingSkeletons';

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
    continueWatchingItems,
    mood,
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
      <HomeContinueWatching items={continueWatchingItems} />

      <div className="home-discovery-flow">
        <HomeMoodPicker
          value={mood}
          onChange={updateMood}
        />

        <section
          id="animebox-for-you"
          className="section smart-feed-section"
          aria-busy={recommendationsLoading}
        >
          <div className="section-head">
            <div className="smart-feed-heading">
              <span className="smart-section-eyebrow">
                Для тебя
              </span>

              <div className="smart-feed-heading__line">
                <span
                  className="section-title__icon section-title__icon--asset smart-feed-heading__asset"
                  aria-hidden="true"
                >
                  <Image
                    src="/brand/icons/sections/recommendations.svg"
                    alt=""
                    width={16}
                    height={16}
                    sizes="16px"
                  />
                </span>

                <h2 className="section-title">
                  Что смотреть дальше
                </h2>
              </div>

              <p>
                Подборка меняется вместе с твоим настроением
                и историей просмотра.
              </p>
            </div>

            <Link
              className="section-link"
              href="/search"
            >
              Весь каталог →
            </Link>
          </div>

          {recommendationsLoading ? (
            <RecommendationFeedSkeleton
              railCount={2}
              cardCount={5}
              label="Загружаем персональные рекомендации"
            />
          ) : (
            <DeferredMount
              className="home-deferred home-deferred--recommendations"
              minHeight={300}
              rootMargin="520px 0px"
              ariaLabel="Персональные рекомендации"
            >
              <SmartRecommendationFeed
                items={smartRecommendations}
                mood={mood}
                hasWatchHistory={hasWatchHistory}
              />
            </DeferredMount>
          )}
        </section>
      </div>
    </>
  );
}
