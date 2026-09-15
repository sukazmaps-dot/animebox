'use client';

import { animeHref } from '@/lib/anime-url';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

import AnimeImage from '@/components/AnimeImage';
import type { AnimeImage as AnimeImageType } from '@/types/anime';

type ScheduleItem = {
  id: number;
  airingAt: number;
  episode: number;

  media: {
    id: number;
    idMal: number | null;

    format: string | null;
    status: string | null;

    title: {
      russian: string | null;
      romaji: string | null;
      english: string | null;
      native: string | null;
    };

    coverImage: AnimeImageType | null;
    bannerImage: string | null;
  };
};

type ScheduleResponse = {
  generatedAt: number;

  range: {
    from: number;
    to: number;
  };

  count: number;
  items: ScheduleItem[];
};

type DayTab = {
  key: string;
  label: string;
  date: Date;
};

function getLocalDateKey(date: Date): string {
  const year = date.getFullYear();

  const month = String(
    date.getMonth() + 1,
  ).padStart(2, '0');

  const day = String(
    date.getDate(),
  ).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function capitalize(value: string): string {
  if (!value) {
    return value;
  }

  return (
    value.charAt(0).toUpperCase() +
    value.slice(1)
  );
}

function createDays(): DayTab[] {
  const today = new Date();

  today.setHours(0, 0, 0, 0);

  return Array.from(
    { length: 7 },
    (_, index) => {
      const date = new Date(today);

      date.setDate(
        today.getDate() + index,
      );

      let label: string;

      if (index === 0) {
        label = 'Сегодня';
      } else if (index === 1) {
        label = 'Завтра';
      } else {
        label = capitalize(
          date.toLocaleDateString(
            'ru-RU',
            {
              weekday: 'long',
            },
          ),
        );
      }

      return {
        key: getLocalDateKey(date),
        label,
        date,
      };
    },
  );
}

function getAnimeTitle(
  item: ScheduleItem,
): string {
  return (
    item.media.title.russian ||
    item.media.title.english ||
    item.media.title.romaji ||
    item.media.title.native ||
    'Без названия'
  );
}

function formatTime(
  airingAt: number,
): string {
  return new Date(
    airingAt * 1000,
  ).toLocaleTimeString(
    'ru-RU',
    {
      hour: '2-digit',
      minute: '2-digit',
    },
  );
}

function getAiringStatus(
  airingAt: number,
  now: number | null,
): string | null {
  if (now === null) {
    return null;
  }

  const airingTime =
    airingAt * 1000;

  const difference =
    airingTime - now;

  if (difference <= 0) {
    return 'Вышел';
  }

  const minutes =
    Math.ceil(
      difference / 60_000,
    );

  if (minutes < 60) {
    return `Через ${minutes} мин`;
  }

  return null;
}

export default function SchedulePage() {
  const [items, setItems] =
    useState<ScheduleItem[]>([]);

  const [days, setDays] =
    useState<DayTab[]>([]);

  const [
    selectedDay,
    setSelectedDay,
  ] = useState('');

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    error,
    setError,
  ] = useState<string | null>(
    null,
  );

  const [now, setNow] =
    useState<number | null>(
      null,
    );

  useEffect(() => {
    const createdDays =
      createDays();

    setDays(createdDays);

    setSelectedDay(
      createdDays[0]?.key ?? '',
    );

    setNow(Date.now());

    const timer =
      window.setInterval(() => {
        setNow(Date.now());
      }, 60_000);

    return () => {
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    const controller =
      new AbortController();

    async function loadSchedule() {
      try {
        setLoading(true);
        setError(null);

        const response =
          await fetch(
            '/api/schedule',
            {
              signal:
                controller.signal,
            },
          );

        if (!response.ok) {
          throw new Error(
            `Schedule HTTP ${response.status}`,
          );
        }

        const data =
          (await response.json()) as
            ScheduleResponse;

        if (
          !Array.isArray(
            data.items,
          )
        ) {
          throw new Error(
            'Некорректный ответ расписания',
          );
        }

        setItems(data.items);
      } catch (error) {
        if (
          error instanceof Error &&
          error.name ===
            'AbortError'
        ) {
          return;
        }

        console.error(
          'Schedule load error:',
          error,
        );

        setError(
          'Не удалось загрузить расписание.',
        );
      } finally {
        if (
          !controller.signal.aborted
        ) {
          setLoading(false);
        }
      }
    }

    loadSchedule();

    return () => {
      controller.abort();
    };
  }, []);

  const visibleItems =
    useMemo(() => {
      if (!selectedDay) {
        return [];
      }

      return items
        .filter((item) => {
          const date =
            new Date(
              item.airingAt *
                1000,
            );

          return (
            getLocalDateKey(
              date,
            ) === selectedDay
          );
        })
        .sort(
          (a, b) =>
            a.airingAt -
            b.airingAt,
        );
    }, [
      items,
      selectedDay,
    ]);

  return (
    <div className="search-page">
      <div className="page-heading">
        <h1>
          Расписание
        </h1>

        <p>
          График выхода новых эпизодов аниме.
        </p>
      </div>

      <div className="schedule__tabs">
        {days.map((day) => (
          <button
            key={day.key}
            type="button"
            className={[
              'schedule__tab',
              selectedDay ===
              day.key
                ? 'is-active'
                : '',
            ]
              .filter(Boolean)
              .join(' ')}
            onClick={() =>
              setSelectedDay(
                day.key,
              )
            }
            style={{
              border: 0,
              cursor: 'pointer',
            }}
          >
            {day.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div
          className="loading-grid"
          style={{
            marginTop: 15,
          }}
        >
          {Array.from({
            length: 8,
          }).map(
            (_, index) => (
              <div
                key={index}
                className="skeleton skeleton--card"
              />
            ),
          )}
        </div>
      ) : error ? (
        <div
          style={{
            marginTop: 20,
            color: '#8d9cb0',
          }}
        >
          {error}
        </div>
      ) : visibleItems.length ===
        0 ? (
        <div
          style={{
            marginTop: 20,
            padding:
              '30px 20px',
            textAlign: 'center',
            color: '#718198',
            background:
              '#0c192a',
            border:
              '1px solid rgba(148,163,184,.08)',
            borderRadius: 11,
          }}
        >
          На этот день запланированных эпизодов нет.
        </div>
      ) : (
        <div
          className="schedule__cards"
          style={{ marginTop: 15 }}
        >
          {visibleItems.map(
            (item) => {
              const title =
                getAnimeTitle(
                  item,
                );

              const airingStatus =
                getAiringStatus(
                  item.airingAt,
                  now,
                );

              return (
                <Link
                  key={item.id}
                  href={animeHref(item.media)}
                  className="schedule__card"
                  style={{
                    minHeight: 70,
                    minWidth: 0,
                    overflow: 'hidden',
                  }}
                >
                  <AnimeImage
                    image={
                      item.media
                        .coverImage
                    }
                    alt={title}
                    englishName={
                      item.media
                        .title
                        .english ||
                      item.media
                        .title
                        .romaji
                    }
                    className="anime-schedule-image"
                  />

                  <div
                    style={{
                      flex: 1,
                      minWidth: 0,
                      overflow: 'hidden',
                    }}
                  >
                    <strong
                      title={title}
                      style={{
                        display: 'block',
                        width: '100%',
                        overflow: 'hidden',
                        textOverflow:
                          'ellipsis',
                        whiteSpace:
                          'nowrap',
                      }}
                    >
                      {title}
                    </strong>

                    <span
                      style={{
                        display: 'block',
                      }}
                    >
                      Эпизод{' '}
                      {item.episode}
                    </span>
                  </div>

                  <div
                    className="schedule__time"
                    style={{
                      display: 'flex',
                      flexDirection:
                        'column',
                      alignItems:
                        'flex-end',
                      gap: 3,
                      flexShrink: 0,
                    }}
                  >
                    <strong>
                      {formatTime(
                        item.airingAt,
                      )}
                    </strong>

                    {airingStatus && (
                      <span
                        style={{
                          fontSize: 10,
                          opacity: 0.65,
                          whiteSpace:
                            'nowrap',
                        }}
                      >
                        {airingStatus}
                      </span>
                    )}
                  </div>
                </Link>
              );
            },
          )}
        </div>
      )}
    </div>
  );
}