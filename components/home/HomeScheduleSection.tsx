'use client';
import {scheduleAnimeHref} from '@/lib/schedule-url';

import Link from 'next/link';

import HomeSchedulePoster from '@/components/home/HomeSchedulePoster';
import SectionHeader from '@/components/home/SectionHeader';
import { formatHomeScheduleCountdown } from '@/lib/home-schedule-time';
import styles from './HomeScheduleSection.module.css';
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
      className={`section schedule ${styles.root}`}
      aria-busy={scheduleLoading}
    >
      <SectionHeader
        title={selectedScheduleDay === scheduleDays[0]?.key && visibleScheduleItems.length > 0 ? 'Сегодня выходит' : 'Скоро выходит'}
        href="/schedule"
        linkLabel="Полное расписание"
      />
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
        <p className={styles.empty}>{selectedScheduleDay === scheduleDays[0]?.key ? 'Сегодня выпусков больше нет' : 'На этот день выпусков нет'}</p>
      ) : (
        <div className="schedule__cards">
          {visibleScheduleItems
            .slice(0, 6)
            .map((item) => {
              const title = getScheduleTitle(item);
              return (
                <Link
                  key={item.id}
                  href={scheduleAnimeHref(item.media)}
                  className="schedule__card"
                >
                  <HomeSchedulePoster
                    image={item.media.coverImage}
                    title={title}
                    englishName={item.media.title.english || item.media.title.romaji}
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

                  <span className={styles.time}>
                    {formatScheduleTime(item.airingAt)}
                    <small>{item.timingKind ? 'План' : formatHomeScheduleCountdown(item.airingAt, clockNow)}</small>
                  </span>
                </Link>
              );
            })}
        </div>
      )}
      {!scheduleLoading && !scheduleError && visibleScheduleItems.length > 6 && (
        <Link className={styles.more} href="/schedule">
          Все выпуски за день · {visibleScheduleItems.length} →
        </Link>
      )}
    </section>
  );
}
