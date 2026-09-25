'use client';

import Image from 'next/image';

import ScheduleItem from '@/components/ScheduleItem';
import TopAnimeItem from '@/components/TopAnimeItem';
import { useHomeFeedRuntime } from '@/components/home/HomeFeedRuntimeProvider';
import {
  formatUpcomingDate,
  getScheduleTitle,
  useHomeScheduleRuntime,
} from '@/components/home/HomeScheduleRuntimeProvider';
import { animeHref } from '@/lib/anime-url';

export default function HomeRightRail() {
  const { popular } = useHomeFeedRuntime();
  const {
    scheduleLoading,
    upcomingScheduleItems,
  } = useHomeScheduleRuntime();

  return (
    <aside className="right-rail">
      <section
        className="home-top-anime-panel"
        aria-labelledby="home-top-anime-title"
      >
        <div className="panel__head panel__head--branded">
          <h2
            id="home-top-anime-title"
            className="panel__title-with-icon"
          >
            <Image
              src="/brand/brand-mark.webp"
              alt=""
              width={20}
              height={20}
              sizes="20px"
              aria-hidden="true"
            />
            Топ аниме
          </h2>
        </div>

        <div className="panel__body">
          {popular
            .slice(0, 6)
            .map((anime, index) => (
              <TopAnimeItem
                key={anime.id}
                anime={anime}
                rank={index + 1}
              />
            ))}
        </div>
      </section>

      <div className="panel home-upcoming-panel">
        <div className="panel__head">
          Ближайшие серии
        </div>

        <div className="panel__body rank-list home-upcoming-panel__list">
          {scheduleLoading ? (
            Array.from({ length: 5 }).map((_, index) => (
              <div
                key={index}
                className="rank-item skeleton"
              />
            ))
          ) : upcomingScheduleItems.length > 0 ? (
            upcomingScheduleItems.map((item) => {
              const title = getScheduleTitle(item);

              return (
                <ScheduleItem
                  compact
                  key={item.id}
                  href={animeHref(item.media)}
                  title={title}
                  image={item.media.coverImage}
                  episode={item.episode}
                  dateLabel={formatUpcomingDate(
                    item.airingAt,
                  )}
                  airingAt={item.airingAt}
                />
              );
            })
          ) : (
            <div className="empty-state">
              <span>Ближайших серий пока нет.</span>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
