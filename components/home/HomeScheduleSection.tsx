'use client';
import {scheduleAnimeHref} from '@/lib/schedule-url';

import Link from 'next/link';

import AnimeImage from '@/components/AnimeImage';
import Icon from '@/components/Icon';
import { ScheduleGridSkeleton } from '@/components/home/HomeLoadingSkeletons';
import {
  formatScheduleTime,
  getScheduleTitle,
  useHomeScheduleRuntime,
} from '@/components/home/HomeScheduleRuntimeProvider';

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
      className="section schedule home-schedule--polished"
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

      <p className="home-schedule__swipe-hint" aria-hidden="true">Листай дни →</p>
      <div
        className="schedule__tabs"
        role="group"
        aria-label="Выбор дня выхода серий. Прокручивается горизонтально"
      >
        {scheduleDays.length === 0 && Array.from({ length: 7 }, (_, index) => (
          <span key={index} className="schedule__tab" aria-hidden="true">
            {index === 0 ? 'Сегодня' : index === 1 ? 'Завтра' : '…'}
          </span>
        ))}
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
            aria-pressed={selectedScheduleDay === day.key}
            aria-label={`${day.label}, ${day.key.split('-').reverse().slice(0, 2).join('.')}`}
          >
            <span>{day.label}</span>
            <small>{day.key.split('-').reverse().slice(0, 2).join('.')}</small>
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
                  href={scheduleAnimeHref(item.media)}
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
                    containerClassName="schedule__poster"
                    sizes="36px"
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
                    <span>{item.episode == null ? 'Плановый выход' : `Эпизод ${item.episode}${item.timingKind ? ' · план' : ''}`}</span>
                  </div>

                  <span className="schedule__time">
                    {formatScheduleTime(item.airingAt)}
                    {released && !item.timingKind ? ' · Вышел' : ''}
                  </span>
                </Link>
              );
            })}
        </div>
      )}
      {!scheduleLoading && !scheduleError && visibleScheduleItems.length > 4 && (
        <Link className="section-link schedule__more" href="/schedule">
          Все выпуски за день · {visibleScheduleItems.length} →
        </Link>
      )}
    </section>
  );
}
