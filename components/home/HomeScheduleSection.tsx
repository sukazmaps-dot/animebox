'use client';

import Link from 'next/link';

import AnimeImage from '@/components/AnimeImage';
import Icon from '@/components/Icon';
import { ScheduleGridSkeleton } from '@/components/home/HomeLoadingSkeletons';
import {
  formatScheduleTime,
  getScheduleTitle,
  useHomeScheduleRuntime,
} from '@/components/home/HomeScheduleRuntimeProvider';
import { animeHref } from '@/lib/anime-url';

export default function HomeScheduleSection() {
  const {
    scheduleSectionRef,
    scheduleDays,
    selectedScheduleDay,
    setSelectedScheduleDay,
    scheduleLoading,
    scheduleError,
    clockNow,
    visibleScheduleItems,
  } = useHomeScheduleRuntime();

  return (
    <section
      ref={scheduleSectionRef}
      className="section schedule"
      aria-busy={scheduleLoading}
    >
      <div className="section-head">
        <h2 className="section-title">
          <span
            className="section-title__icon section-title__icon--ui"
            aria-hidden="true"
          >
            <Icon name="calendar" />
          </span>
          Расписание выхода серий
        </h2>

        <Link
          className="section-link"
          href="/schedule"
        >
          Полное расписание →
        </Link>
      </div>

      <div className="schedule__tabs">
        {scheduleDays.map((day) => (
          <button
            key={day.key}
            type="button"
            className={
              `schedule__tab ${
                selectedScheduleDay === day.key
                  ? 'is-active'
                  : ''
              }`
            }
            onClick={() => setSelectedScheduleDay(day.key)}
            style={{
              border: 0,
              cursor: 'pointer',
            }}
          >
            {day.label}
          </button>
        ))}
      </div>

      {scheduleLoading ? (
        <ScheduleGridSkeleton />
      ) : scheduleError ? (
        <div className="empty-state">
          <strong>Расписание временно недоступно</strong>
          <span>{scheduleError}</span>
        </div>
      ) : visibleScheduleItems.length === 0 ? (
        <div className="empty-state">
          <strong>На этот день серий нет</strong>
          <span>Попробуй выбрать соседний день.</span>
        </div>
      ) : (
        <div className="schedule__cards">
          {visibleScheduleItems
            .slice(0, 4)
            .map((item) => {
              const title = getScheduleTitle(item);
              const released =
                item.airingAt * 1000 <= clockNow;

              return (
                <Link
                  key={item.id}
                  href={animeHref(item.media)}
                  className="schedule__card"
                >
                  <AnimeImage
                    image={item.media.coverImage}
                    alt={title}
                    englishName={
                      item.media.title.english ||
                      item.media.title.romaji
                    }
                    className="anime-schedule-image"
                    sizes="58px"
                    quality={60}
                    sourcePreference="compact"
                    preset="tiny"
                  />

                  <div
                    style={{
                      minWidth: 0,
                      overflow: 'hidden',
                    }}
                  >
                    <strong title={title}>
                      {title}
                    </strong>
                    <span>Эпизод {item.episode}</span>
                  </div>

                  <span className="schedule__time">
                    {formatScheduleTime(item.airingAt)}
                    {released ? ' · Вышел' : ''}
                  </span>
                </Link>
              );
            })}
        </div>
      )}
    </section>
  );
}
