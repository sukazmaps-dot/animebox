'use client';

import Image from 'next/image';
import Link from 'next/link';

import AnimeCard from '@/components/AnimeCard';
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
        <div className="section-head">
          <h2 className="section-title">
            <span
              className="section-title__icon section-title__icon--asset"
              aria-hidden="true"
            >
              <Image
                src="/brand/icons/sections/popular.svg"
                alt=""
                width={16}
                height={16}
                sizes="16px"
              />
            </span>
            Популярные аниме
          </h2>

          <Link
            className="section-link"
            href="/search"
          >
            Смотреть все →
          </Link>
        </div>

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
          <div className="anime-grid home-anime-grid">
            {popular.slice(0, 10).map((anime) => (
              <AnimeCard
                key={anime.id}
                anime={anime}
                watchedEpisode={
                  personalEpisodeByAnime.get(anime.id) ?? null
                }
              />
            ))}
          </div>
        )}
      </section>

      <section className="section home-catalog-section home-catalog-section--ongoing">
        <div className="section-head">
          <h2 className="section-title">
            <span
              className="section-title__icon section-title__icon--asset"
              aria-hidden="true"
            >
              <Image
                src="/brand/icons/sections/ongoing.svg"
                alt=""
                width={16}
                height={16}
                sizes="16px"
              />
            </span>
            Продолжающиеся
          </h2>

          <Link
            className="section-link"
            href="/schedule"
          >
            Расписание →
          </Link>
        </div>

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
          <div className="anime-grid home-anime-grid">
            {fallbackItems.slice(0, 10).map((anime) => (
              <AnimeCard
                key={anime.id}
                anime={anime}
                watchedEpisode={
                  personalEpisodeByAnime.get(anime.id) ?? null
                }
              />
            ))}
          </div>
        )}
      </section>
    </>
  );
}
