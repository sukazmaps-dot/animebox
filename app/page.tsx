'use client';

import { animeHref } from '@/lib/anime-url';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { Anime, AnimeImage as AnimeImageType } from '@/types/anime';

import AnimeCard from '@/components/AnimeCard';
import Icon from '@/components/Icon';
import AnimeImage from '@/components/AnimeImage';
import HomeHeroCarousel from '@/components/HomeHeroCarousel';
import { getAnimeTitle } from '@/lib/anime-display';
import { getAnimes } from '@/lib/anime-client';
import {
  getRecommendedAnime,
  getRecommendationFallback,
} from '@/lib/recommendations';
import { readWatchHistory } from '@/lib/anime-storage';
import { TELEGRAM_MINI_APP_URL } from '@/lib/telegram-links';

type HomeScheduleItem = {
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

type HomeScheduleResponse = {
  items?: HomeScheduleItem[];
};

type ScheduleDay = {
  key: string;
  label: string;
};

function getEpisodeCount(anime: Anime): number | null {
  return anime.episodes && anime.episodes > 0 ? anime.episodes : null;
}

function getLocalDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function capitalize(value: string): string {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}

function createScheduleDays(): ScheduleDay[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() + index);

    let label: string;

    if (index === 0) {
      label = 'Сегодня';
    } else if (index === 1) {
      label = 'Завтра';
    } else {
      label = capitalize(
        date.toLocaleDateString('ru-RU', {
          weekday: 'long',
        }),
      );
    }

    return {
      key: getLocalDateKey(date),
      label,
    };
  });
}

function getScheduleTitle(item: HomeScheduleItem): string {
  return (
    item.media.title.russian ||
    item.media.title.english ||
    item.media.title.romaji ||
    item.media.title.native ||
    'Без названия'
  );
}

function formatScheduleTime(airingAt: number): string {
  return new Date(airingAt * 1000).toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatUpcomingDate(airingAt: number): string {
  const date = new Date(airingAt * 1000);
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);

  const dateKey = getLocalDateKey(date);
  const todayKey = getLocalDateKey(now);
  const tomorrowKey = getLocalDateKey(tomorrow);

  const prefix =
    dateKey === todayKey
      ? 'Сегодня'
      : dateKey === tomorrowKey
        ? 'Завтра'
        : capitalize(
            date.toLocaleDateString('ru-RU', {
              weekday: 'short',
            }),
          );

  return `${prefix} · ${formatScheduleTime(airingAt)}`;
}

function EpisodeCountdown({ airingAt }: { airingAt: number }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const remaining = Math.max(0, airingAt * 1000 - now);

  if (remaining <= 0) {
    return <span className="episode-countdown is-live">Уже вышла</span>;
  }

  const totalSeconds = Math.floor(remaining / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const value =
    days > 0
      ? `${days}д ${String(hours).padStart(2, '0')}ч`
      : `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  return (
    <span className="episode-countdown" aria-label={`До выхода серии ${value}`}>
      <span className="episode-countdown__dot" aria-hidden="true" />
      {value}
    </span>
  );
}

export default function HomePage() {
  const [popular, setPopular] = useState<Anime[]>([]);
  const [ongoing, setOngoing] = useState<Anime[]>([]);
  const [popularLoading, setPopularLoading] = useState(true);
  const [ongoingLoading, setOngoingLoading] = useState(true);
  const [popularError, setPopularError] = useState('');
  const [ongoingError, setOngoingError] = useState('');

  const [historyRevision, setHistoryRevision] = useState('');
  const [hasWatchHistory, setHasWatchHistory] = useState(false);

  const [scheduleItems, setScheduleItems] = useState<HomeScheduleItem[]>([]);
  const [scheduleDays, setScheduleDays] = useState<ScheduleDay[]>([]);
  const [selectedScheduleDay, setSelectedScheduleDay] = useState('');
  const [scheduleLoading, setScheduleLoading] = useState(true);
  const [scheduleError, setScheduleError] = useState('');

  /*
   * Главная лента.
   * Здесь больше не блокируем первый экран десятками проверок источников.
   * Наличие видео проверяется уже при открытии тайтла/серии.
   */
  useEffect(() => {
    const popularController = new AbortController();
    const ongoingController = new AbortController();

    /*
     * Два блока загружаются независимо.
     * Раньше Promise.all держал весь первый экран, пока не завершатся ОБА
     * запроса. Теперь быстрый блок появляется сразу, не ожидая медленный.
     */
    getAnimes(
      {
        limit: 20,
        page: 1,
        order: 'ranked',
      },
      { signal: popularController.signal },
    )
      .then((data) => {
        if (!popularController.signal.aborted) {
          setPopular(data);
        }
      })
      .catch((err: unknown) => {
        if (!(err instanceof Error && err.name === 'AbortError')) {
          console.error(err);
          setPopularError('Не удалось загрузить популярное.');
        }
      })
      .finally(() => {
        if (!popularController.signal.aborted) {
          setPopularLoading(false);
        }
      });

    getAnimes(
      {
        limit: 20,
        page: 1,
        order: 'popularity',
        status: 'ongoing',
      },
      { signal: ongoingController.signal },
    )
      .then((data) => {
        if (!ongoingController.signal.aborted) {
          setOngoing(data);
        }
      })
      .catch((err: unknown) => {
        if (!(err instanceof Error && err.name === 'AbortError')) {
          console.error(err);
          setOngoingError('Не удалось загрузить онгоинги.');
        }
      })
      .finally(() => {
        if (!ongoingController.signal.aborted) {
          setOngoingLoading(false);
        }
      });

    return () => {
      popularController.abort();
      ongoingController.abort();
    };
  }, []);

  /*
   * История просмотра хранится в localStorage.
   * Отдельная ревизия нужна, чтобы рекомендации обновлялись после
   * возврата с плеера, в том числе через back/forward cache браузера.
   */
  useEffect(() => {
    const refreshHistory = () => {
      const history = readWatchHistory();

      setHasWatchHistory(history.length > 0);
      setHistoryRevision(
        history
          .map((item) => `${item.id}:${item.viewCount}:${item.lastViewedAt}`)
          .join('|'),
      );
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refreshHistory();
      }
    };

    refreshHistory();

    window.addEventListener('focus', refreshHistory);
    window.addEventListener('pageshow', refreshHistory);
    window.addEventListener('storage', refreshHistory);
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      window.removeEventListener('focus', refreshHistory);
      window.removeEventListener('pageshow', refreshHistory);
      window.removeEventListener('storage', refreshHistory);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  /*
   * Реальное расписание с уже существующего /api/schedule.
   * Загружается независимо и не тормозит hero/основную ленту.
   */
  useEffect(() => {
    const days = createScheduleDays();
    setScheduleDays(days);
    setSelectedScheduleDay(days[0]?.key ?? '');

    const controller = new AbortController();

    async function loadSchedule() {
      try {
        setScheduleLoading(true);
        setScheduleError('');

        const response = await fetch('/api/schedule', {
          signal: controller.signal,
          cache: 'default',
        });

        if (!response.ok) {
          throw new Error(`Schedule HTTP ${response.status}`);
        }

        const data = (await response.json()) as HomeScheduleResponse;

        if (!Array.isArray(data.items)) {
          throw new Error('Некорректный ответ расписания');
        }

        setScheduleItems(
          [...data.items].sort((a, b) => a.airingAt - b.airingAt),
        );
      } catch (err: unknown) {
        if (!(err instanceof Error && err.name === 'AbortError')) {
          console.error('Home schedule error:', err);
          setScheduleError('Не удалось загрузить расписание.');
        }
      } finally {
        if (!controller.signal.aborted) {
          setScheduleLoading(false);
        }
      }
    }

    void loadSchedule();

    return () => controller.abort();
  }, []);

  const rawRecommendations = useMemo(
    () =>
      getRecommendedAnime(
        [...popular, ...ongoing],
        10,
      ),
    [popular, ongoing, historyRevision],
  );

  const recommendations = useMemo(() => {
    if (!hasWatchHistory) {
      return [];
    }

    if (rawRecommendations.length > 0) {
      return rawRecommendations;
    }

    return getRecommendationFallback(popular, ongoing, 10);
  }, [
    hasWatchHistory,
    rawRecommendations,
    popular,
    ongoing,
  ]);

  const fallbackItems = ongoing.length > 0 ? ongoing : popular;
  const heroLoading =
    popularLoading &&
    ongoingLoading &&
    popular.length === 0 &&
    ongoing.length === 0;

  const visibleScheduleItems = useMemo(() => {
    if (!selectedScheduleDay) {
      return [];
    }

    return scheduleItems.filter((item) => {
      const date = new Date(item.airingAt * 1000);
      return getLocalDateKey(date) === selectedScheduleDay;
    });
  }, [scheduleItems, selectedScheduleDay]);

  const upcomingScheduleItems = useMemo(() => {
    const nowSeconds = Math.floor(Date.now() / 1000);

    return scheduleItems
      .filter((item) => item.airingAt >= nowSeconds)
      .slice(0, 5);
  }, [scheduleItems]);

  return (
    <div className="home-grid">
      <div className="main-column">
        {heroLoading ? (
          <section className="page-hero page-hero--empty">
            <div className="page-hero__content">
              <span className="pill pill--accent">ANIMEBOX</span>

              <h1>Подбираем аниме для тебя…</h1>

              <p>Загружаем популярное и персональные рекомендации.</p>
            </div>
          </section>
        ) : (
          <HomeHeroCarousel popular={popular} ongoing={ongoing} />
        )}

        <section className="section">
          <div className="section-head">
            <h2 className="section-title">
              <span className="section-title__icon section-title__icon--asset" aria-hidden="true">
                <img src="/brand/icons/sections/popular.svg" alt="" />
              </span>
              Популярные аниме
            </h2>

            <Link className="section-link" href="/search">
              Смотреть все →
            </Link>
          </div>

          {popularLoading ? (
            <div className="loading-grid">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="skeleton skeleton--card" />
              ))}
            </div>
          ) : popularError ? (
            <div className="empty-state">
              <strong>Не удалось загрузить популярное</strong>
              <span>{popularError}</span>
            </div>
          ) : (
            <div className="anime-grid">
              {popular.slice(0, 5).map((anime) => (
                <AnimeCard key={anime.id} anime={anime} />
              ))}
            </div>
          )}
        </section>

        <section className="section">
          <div className="section-head">
            <h2 className="section-title">
              <span className="section-title__icon section-title__icon--asset" aria-hidden="true">
                <img src="/brand/icons/sections/ongoing.svg" alt="" />
              </span>
              Продолжающиеся
            </h2>

            <Link className="section-link" href="/schedule">
              Расписание →
            </Link>
          </div>

          {ongoingLoading && fallbackItems.length === 0 ? (
            <div className="loading-grid">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="skeleton skeleton--card" />
              ))}
            </div>
          ) : ongoingError && fallbackItems.length === 0 ? (
            <div className="empty-state">
              <strong>Не удалось загрузить онгоинги</strong>
              <span>{ongoingError}</span>
            </div>
          ) : (
            <div className="anime-grid">
              {fallbackItems.slice(0, 5).map((anime) => (
                <AnimeCard key={anime.id} anime={anime} />
              ))}
            </div>
          )}
        </section>

        <section className="section">
          <div className="section-head">
            <h2 className="section-title">
              <span className="section-title__icon section-title__icon--asset" aria-hidden="true">
                <img src="/brand/icons/sections/recommendations.svg" alt="" />
              </span>
              Рекомендации для тебя
            </h2>

            <span className="section-link">На основе просмотров</span>
          </div>

          {recommendations.length > 0 ? (
            <div className="anime-grid">
              {recommendations.slice(0, 5).map((anime) => (
                <AnimeCard key={anime.id} anime={anime} />
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <strong>Начни смотреть аниме</strong>

              <span>
                После первого просмотра рекомендации начнут подстраиваться
                под твои жанры.
              </span>

              <Link
                className="btn btn--primary"
                href="/search"
                style={{ marginTop: 14 }}
              >
                Найти первое аниме
              </Link>
            </div>
          )}
        </section>

        <section className="section schedule">
          <div className="section-head">
            <h2 className="section-title">
              <span className="section-title__icon section-title__icon--ui" aria-hidden="true">
                <Icon name="calendar" />
              </span>
              Расписание выхода серий
            </h2>

            <Link className="section-link" href="/schedule">
              Полное расписание →
            </Link>
          </div>

          <div className="schedule__tabs">
            {scheduleDays.map((day) => (
              <button
                key={day.key}
                type="button"
                className={`schedule__tab ${
                  selectedScheduleDay === day.key ? 'is-active' : ''
                }`}
                onClick={() => setSelectedScheduleDay(day.key)}
                style={{ border: 0, cursor: 'pointer' }}
              >
                {day.label}
              </button>
            ))}
          </div>

          {scheduleLoading ? (
            <div className="schedule__cards">
              {Array.from({ length: 4 }).map((_, index) => (
                <div
                  key={index}
                  className="schedule__card skeleton"
                  style={{ minHeight: 64 }}
                />
              ))}
            </div>
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
              {visibleScheduleItems.slice(0, 4).map((item) => {
                const title = getScheduleTitle(item);
                const released = item.airingAt * 1000 <= Date.now();

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
                        item.media.title.english || item.media.title.romaji
                      }
                      className="anime-schedule-image"
                    />

                    <div style={{ minWidth: 0, overflow: 'hidden' }}>
                      <strong title={title}>{title}</strong>
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
      </div>

      <aside className="right-rail">
        <div className="panel home-library-panel">
          <span className="home-library-panel__symbol home-library-panel__symbol--brand" aria-hidden="true">
            <img src="/brand/brand-mark.png" alt="" />
          </span>
          <span className="home-library-panel__eyebrow">ТВОЯ КОЛЛЕКЦИЯ</span>
          <h2>
            Хорошие истории
            <br />
            остаются с тобой.
          </h2>
          <p>Сохраняй тайтлы и возвращайся к любимым аниме.</p>
          <Link className="btn btn--primary" href="/list">
            Открыть трекер <span aria-hidden="true">↗</span>
          </Link>

          <img
            className="home-library-panel__mascot"
            src="/brand/animebox-mascot.png"
            alt=""
            aria-hidden="true"
          />
        </div>

        <div className="panel">
          <div className="panel__head panel__head--branded">
            <span className="panel__title-with-icon">
              <img src="/brand/brand-mark.png" alt="" aria-hidden="true" />
              Топ аниме
            </span>
            <span className="section-link">Сегодня</span>
          </div>

          <div className="panel__body rank-list rank-list--premium">
            {popular.slice(0, 5).map((anime, index) => {
              const title = getAnimeTitle(anime);

              return (
                <Link
                  href={animeHref(anime)}
                  key={anime.id}
                  className={`rank-item ${index < 3 ? 'rank-item--spotlight' : ''}`}
                >
                  {index < 3 ? (
                    <span className="rank-item__badge" aria-hidden="true">
                      <img
                        src={`/ui/animebox-rank-${index + 1}.webp`}
                        alt=""
                      />
                    </span>
                  ) : (
                    <span className="rank-item__num">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                  )}

                  <AnimeImage
                    image={anime.coverImage}
                    alt={title}
                    englishName={anime.title.english || anime.title.romaji}
                  />

                  <div>
                    <strong>{title}</strong>
                    <span>★ {anime.score ?? '—'}</span>
                  </div>

                  <span className="rank-item__score">›</span>
                </Link>
              );
            })}
          </div>
        </div>

        <div className="panel">
          <div className="panel__head">Ближайшие серии</div>

          <div className="panel__body rank-list">
            {scheduleLoading ? (
              Array.from({ length: 5 }).map((_, index) => (
                <div key={index} className="rank-item skeleton" />
              ))
            ) : upcomingScheduleItems.length > 0 ? (
              upcomingScheduleItems.map((item) => {
                const title = getScheduleTitle(item);

                return (
                  <Link
                    href={animeHref(item.media)}
                    key={item.id}
                    className="rank-item rank-item--upcoming"
                  >
                    <AnimeImage
                      image={item.media.coverImage}
                      alt={title}
                      englishName={
                        item.media.title.english || item.media.title.romaji
                      }
                    />

                    <div>
                      <strong>{title}</strong>
                      <span>
                        Эпизод {item.episode} · {formatUpcomingDate(item.airingAt)}
                      </span>
                      <EpisodeCountdown airingAt={item.airingAt} />
                    </div>

                    <span className="rank-item__score">→</span>
                  </Link>
                );
              })
            ) : (
              <div className="empty-state">
                <span>Ближайших серий пока нет.</span>
              </div>
            )}
          </div>
        </div>

        <div className="panel telegram-panel telegram-panel--brand">
          <img
            className="telegram-panel__art"
            src="/brand/telegram-cta.png"
            alt=""
            aria-hidden="true"
          />

          <div className="telegram-panel__content">
            <span className="telegram-panel__eyebrow">ANIMEBOX × TELEGRAM</span>

            <strong>
              Новые серии — прямо в Telegram
            </strong>

            <span>
              Следи за любимыми тайтлами и получай уведомления без лишнего шума.
            </span>

            <a href={TELEGRAM_MINI_APP_URL} target="_blank" rel="noreferrer">
              <Icon name="telegram" />
              Открыть Mini App
            </a>
          </div>
        </div>
      </aside>
    </div>
  );
}
