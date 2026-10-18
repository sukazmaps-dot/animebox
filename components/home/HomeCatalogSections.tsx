'use client';

import SectionHeader from '@/components/home/SectionHeader';

import HomeAnimeRail from '@/components/HomeAnimeRail';
import { useHomeFeedRuntime } from '@/components/home/HomeFeedRuntimeProvider';

export default function HomeCatalogSections() {
  const {
    popular,
    fallbackItems,
    popularLoading,
    ongoingLoading,
    popularError,
    ongoingError,
    personalEpisodeByAnime,
  } = useHomeFeedRuntime();

  return (
    <>
      <section className="section home-catalog-section home-catalog-section--popular">
        <SectionHeader title="Популярные аниме" href="/search" linkLabel="Смотреть все" />

        {popularLoading ? (
          <div className="loading-grid">
            {Array.from({ length: 5 }).map((_, index) => (
              <div
                key={index}
                className="skeleton skeleton--card"
              />
            ))}
          </div>
        ) : popularError ? (
          <div className="empty-state">
            <strong>Не удалось загрузить популярное</strong>
            <span>{popularError}</span>
          </div>
        ) : (
          <HomeAnimeRail
            items={popular.slice(0, 10)}
            ariaLabel="Популярные аниме"
            watchedEpisodes={personalEpisodeByAnime}
          />
        )}
      </section>

      <section className="section home-catalog-section home-catalog-section--ongoing">
        <SectionHeader title="Продолжающиеся" href="/schedule" linkLabel="Расписание" />

        {ongoingLoading && fallbackItems.length === 0 ? (
          <div className="loading-grid">
            {Array.from({ length: 5 }).map((_, index) => (
              <div
                key={index}
                className="skeleton skeleton--card"
              />
            ))}
          </div>
        ) : ongoingError && fallbackItems.length === 0 ? (
          <div className="empty-state">
            <strong>Не удалось загрузить онгоинги</strong>
            <span>{ongoingError}</span>
          </div>
        ) : (
          <HomeAnimeRail
            items={fallbackItems.slice(0, 10)}
            ariaLabel="Продолжающиеся аниме"
            watchedEpisodes={personalEpisodeByAnime}
          />
        )}
      </section>
    </>
  );
}
