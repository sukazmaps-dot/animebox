'use client';

import SectionHeader from '@/components/home/SectionHeader';
import { getAnimeTitle } from '@/lib/anime-display';
import type { Anime } from '@/types/anime';

import HomeAnimeRail from '@/components/HomeAnimeRail';
import { useHomeFeedRuntime } from '@/components/home/HomeFeedRuntimeProvider';

function distinctVisibleTitles(items: Anime[]): ReadonlyMap<number, string> {
  const result = new Map<number, string>();
  const used = new Set<string>();
  for (const anime of items) {
    const original = getAnimeTitle(anime);
    const prefix = original.slice(0, 34).toLocaleLowerCase('ru-RU');
    const alternative = anime.title?.romaji || anime.title?.english || anime.title?.native;
    const display = used.has(prefix)
      ? (alternative && alternative.toLocaleLowerCase('ru-RU') !== original.toLocaleLowerCase('ru-RU')
          ? alternative : `№${anime.id} · ${original}`)
      : original;
    used.add(prefix);
    result.set(anime.id, display);
  }
  return result;
}

export default function HomeCatalogSections() {
  const {
    popular,
    fallbackItems,
    popularLoading,
    ongoingLoading,
    popularError,
    ongoingError,
    personalEpisodeByAnime,
    smartRecommendations,
  } = useHomeFeedRuntime();

  // Personal recommendations take precedence. Public groups retain their
  // server order and never issue per-card requests to fill exclusions.
  const reserved = new Set(smartRecommendations.map(item => item.anime.id));
  const popularItems = popular.filter(item => !reserved.has(item.id)).slice(0, 10);
  for (const item of popularItems) reserved.add(item.id);
  const ongoingItems = fallbackItems.filter(item => !reserved.has(item.id)).slice(0, 10);
  const popularTitles = distinctVisibleTitles(popularItems);
  const ongoingTitles = distinctVisibleTitles(ongoingItems);

  return (
    <>
      {(popularLoading || popularError || popularItems.length >= 4) && <section className="section home-catalog-section home-catalog-section--popular">
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
            items={popularItems}
            displayTitles={popularTitles}
            ariaLabel="Популярные аниме"
            watchedEpisodes={personalEpisodeByAnime}
          />
        )}
      </section>}

      {(ongoingLoading || ongoingError || ongoingItems.length >= 4) && <section className="section home-catalog-section home-catalog-section--ongoing">
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
            items={ongoingItems}
            displayTitles={ongoingTitles}
            ariaLabel="Продолжающиеся аниме"
            watchedEpisodes={personalEpisodeByAnime}
          />
        )}
      </section>}
    </>
  );
}
