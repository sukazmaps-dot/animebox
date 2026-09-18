'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

import AnimeImage from '@/components/AnimeImage';
import { animeHref } from '@/lib/anime-url';
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
    slug?: string | null;
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
  range: { from: number; to: number };
  count: number;
  items: ScheduleItem[];
};

type DayColumn = {
  key: string;
  weekday: string;
  dateLabel: string;
  fullLabel: string;
  isToday: boolean;
};

function getLocalDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function capitalize(value: string): string {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}

function createWeek(): DayColumn[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() + index);

    return {
      key: getLocalDateKey(date),
      weekday:
        index === 0
          ? 'Сегодня'
          : index === 1
            ? 'Завтра'
            : capitalize(date.toLocaleDateString('ru-RU', { weekday: 'short' })),
      dateLabel: date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' }),
      fullLabel: capitalize(
        date.toLocaleDateString('ru-RU', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
        }),
      ),
      isToday: index === 0,
    };
  });
}

function getAnimeTitle(item: ScheduleItem): string {
  return (
    item.media.title.russian ||
    item.media.title.english ||
    item.media.title.romaji ||
    item.media.title.native ||
    'Без названия'
  );
}

function formatTime(airingAt: number): string {
  return new Date(airingAt * 1000).toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getAiringStatus(airingAt: number, now: number): string | null {
  const difference = airingAt * 1000 - now;

  if (difference <= 0 && difference > -3 * 60 * 60 * 1000) return 'Вышел';
  if (difference <= 0) return null;

  const minutes = Math.ceil(difference / 60_000);
  if (minutes < 60) return `Через ${minutes} мин`;

  return null;
}

export default function SchedulePage() {
  const [week] = useState<DayColumn[]>(createWeek);
  const [items, setItems] = useState<ScheduleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    async function loadSchedule() {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch('/api/schedule', {
          cache: 'default',
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`Schedule HTTP ${response.status}`);
        }

        const data = (await response.json()) as ScheduleResponse;
        if (!Array.isArray(data.items)) {
          throw new Error('Некорректный ответ расписания');
        }

        setItems([...data.items].sort((a, b) => a.airingAt - b.airingAt));
      } catch (loadError) {
        if (loadError instanceof Error && loadError.name === 'AbortError') return;
        console.error('Schedule load error:', loadError);
        setError('Не удалось загрузить расписание. Попробуй обновить страницу.');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void loadSchedule();
    return () => controller.abort();
  }, []);

  const itemsByDay = useMemo(() => {
    const grouped = new Map<string, ScheduleItem[]>();

    for (const day of week) grouped.set(day.key, []);

    for (const item of items) {
      const key = getLocalDateKey(new Date(item.airingAt * 1000));
      const bucket = grouped.get(key);
      if (bucket) bucket.push(item);
    }

    return grouped;
  }, [items, week]);

  const weekCount = useMemo(
    () => week.reduce((sum, day) => sum + (itemsByDay.get(day.key)?.length ?? 0), 0),
    [itemsByDay, week],
  );

  return (
    <div className="schedule-page-v2">
      <header className="schedule-page-v2__heading">
        <div>
          <span className="schedule-page-v2__eyebrow">НЕДЕЛЯ В ANIMEBOX</span>
          <h1>Расписание выхода серий</h1>
          <p>Вся неделя перед глазами: день, время и следующая серия без переключения вкладок.</p>
        </div>

        {!loading && !error && (
          <div className="schedule-page-v2__counter">
            <strong>{weekCount}</strong>
            <span>эпизодов на неделе</span>
          </div>
        )}
      </header>

      {loading ? (
        <div className="weekly-calendar weekly-calendar--loading" aria-busy="true">
          {Array.from({ length: 7 }).map((_, index) => (
            <div key={index} className="weekly-calendar__column">
              <div className="weekly-calendar__day-skeleton" />
              {Array.from({ length: 3 }).map((__, cardIndex) => (
                <div key={cardIndex} className="weekly-calendar__event-skeleton" />
              ))}
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="schedule-page-v2__empty">
          <strong>Расписание временно недоступно</strong>
          <span>{error}</span>
        </div>
      ) : (
        <div className="weekly-calendar-wrap" aria-label="Недельное расписание аниме">
          <div className="weekly-calendar">
            {week.map((day) => {
              const dayItems = itemsByDay.get(day.key) ?? [];

              return (
                <section
                  key={day.key}
                  className={`weekly-calendar__column ${day.isToday ? 'is-today' : ''}`}
                  aria-label={day.fullLabel}
                >
                  <header className="weekly-calendar__day">
                    <span>{day.weekday}</span>
                    <strong>{day.dateLabel}</strong>
                  </header>

                  <div className="weekly-calendar__events">
                    {dayItems.length === 0 ? (
                      <div className="weekly-calendar__empty-day">
                        <span>—</span>
                        <small>Нет релизов</small>
                      </div>
                    ) : (
                      dayItems.map((item) => {
                        const title = getAnimeTitle(item);
                        const status = getAiringStatus(item.airingAt, now);

                        return (
                          <Link
                            key={item.id}
                            href={animeHref(item.media)}
                            className="weekly-calendar__event"
                            title={`${title} — эпизод ${item.episode}`}
                          >
                            <div className="weekly-calendar__event-time">
                              <strong>{formatTime(item.airingAt)}</strong>
                              {status && <span>{status}</span>}
                            </div>

                            <div className="weekly-calendar__event-main">
                              <AnimeImage
                                image={item.media.coverImage}
                                alt={title}
                                englishName={
                                  item.media.title.english || item.media.title.romaji || undefined
                                }
                                className="weekly-calendar__poster"
                              />

                              <div>
                                <strong>{title}</strong>
                                <span>Эпизод {item.episode}</span>
                              </div>
                            </div>
                          </Link>
                        );
                      })
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
