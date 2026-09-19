'use client';

import { animeHref } from '@/lib/anime-url';

import { startTransition, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import type { Anime, AnimeImage as AnimeImageType } from '@/types/anime';

import AnimeCard from '@/components/AnimeCard';
import HomeContinueWatching from '@/components/HomeContinueWatching';
import HomeMoodPicker from '@/components/HomeMoodPicker';
import SmartRecommendationFeed from '@/components/SmartRecommendationFeed';
import Icon from '@/components/Icon';
import AnimeImage from '@/components/AnimeImage';
import HomeHeroCarousel from '@/components/HomeHeroCarousel';
import { getAnimes } from '@/lib/anime-client';
import { getPersonalizedRecommendations } from '@/lib/recommendations';
import { readAnimeProgressMap, readWatchHistory, type AnimeHistoryEntry } from '@/lib/anime-storage';
import TelegramPromoCard from '@/components/TelegramPromoCard';
import TopAnimeItem from '@/components/TopAnimeItem';
import ScheduleItem from '@/components/ScheduleItem';
import { readTasteProfile, setTasteMood, type TasteMood } from '@/lib/personalization';
import AdSlot from '@/components/monetization/AdSlot';
import { SupportAnimeBoxCard } from '@/components/monetization/SupportAnimeBox';

const subscribeHydration = () => () => {};

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

type HomeTopAnimePanelProps = {
  popular: Anime[];
  mobile?: boolean;
};

function HomeTopAnimePanel({
  popular,
  mobile = false,
}: HomeTopAnimePanelProps) {
  const items = popular.slice(0, mobile ? 3 : 5);

  return (
    <div
      className={`panel right-rail__primary home-top-anime-panel ${
        mobile
          ? 'home-top-anime-panel--mobile'
          : 'home-top-anime-panel--desktop'
      }`}
    >
      <div className="panel__head panel__head--branded">
        <span className="panel__title-with-icon">
          <img src="/brand/brand-mark.webp" alt="" aria-hidden="true" />
          Топ аниме
        </span>
        <span className="section-link">Сегодня</span>
      </div>

      <div className="panel__body">
        {items.map((anime, index) => (
          <TopAnimeItem key={anime.id} anime={anime} rank={index + 1} />
        ))}
      </div>
    </div>
  );
}

export default function HomePage({
  initialPopular = [],
  initialOngoing = [],
}: {
  initialPopular?: Anime[];
  initialOngoing?: Anime[];
}) {
  const hasInitialPopular = initialPopular.length > 0;
  const hasInitialOngoing = initialOngoing.length > 0;

  const [popular, setPopular] = useState<Anime[]>(initialPopular);
  const [ongoing, setOngoing] = useState<Anime[]>(initialOngoing);
  const [popularLoading, setPopularLoading] = useState(!hasInitialPopular);
  const [ongoingLoading, setOngoingLoading] = useState(!hasInitialOngoing);
  const [popularError, setPopularError] = useState('');
  const [ongoingError, setOngoingError] = useState('');

  const [historyRevision, setHistoryRevision] = useState('');
  const [hasWatchHistory, setHasWatchHistory] = useState(false);
  const [watchHistory, setWatchHistory] = useState<AnimeHistoryEntry[]>([]);
  const [mood, setMood] = useState<TasteMood>('any');
  const [tasteRevision, setTasteRevision] = useState(0);
  const hydrated = useSyncExternalStore(subscribeHydration, () => true, () => false);

  const [scheduleItems, setScheduleItems] = useState<HomeScheduleItem[]>([]);
  const [scheduleDays] = useState<ScheduleDay[]>(createScheduleDays);
  const [selectedScheduleDay, setSelectedScheduleDay] = useState(
    () => scheduleDays[0]?.key ?? '',
  );
  const [scheduleLoading, setScheduleLoading] = useState(true);
  const [scheduleError, setScheduleError] = useState('');
  const [clockNow, setClockNow] = useState(() => Date.now());

  /*
   * Главная лента.
   * Здесь больше не блокируем первый экран десятками проверок источников.
   * Наличие видео проверяется уже при открытии тайтла/серии.
   */
  useEffect(() => {
    const popularController = hasInitialPopular ? null : new AbortController();
    const ongoingController = hasInitialOngoing ? null : new AbortController();

    /*
     * SSR normally supplies both lists, so the real hero is already present in
     * the first HTML and its LCP image can start immediately. These requests
     * are only a resilience fallback for an upstream/cache miss on the server.
     */
    if (popularController) {
      getAnimes(
        {
          limit: 20,
          page: 1,
          order: 'ranked',
        },
        { signal: popularController.signal },
      )
        .then((data) => {
          if (!popularController.signal.aborted) setPopular(data);
        })
        .catch((err: unknown) => {
          if (!(err instanceof Error && err.name === 'AbortError')) {
            console.error(err);
            setPopularError('Не удалось загрузить популярное.');
          }
        })
        .finally(() => {
          if (!popularController.signal.aborted) setPopularLoading(false);
        });
    }

    if (ongoingController) {
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
          if (!ongoingController.signal.aborted) setOngoing(data);
        })
        .catch((err: unknown) => {
          if (!(err instanceof Error && err.name === 'AbortError')) {
            console.error(err);
            setOngoingError('Не удалось загрузить онгоинги.');
          }
        })
        .finally(() => {
          if (!ongoingController.signal.aborted) setOngoingLoading(false);
        });
    }

    return () => {
      popularController?.abort();
      ongoingController?.abort();
    };
  }, [hasInitialOngoing, hasInitialPopular]);

  /*
   * История просмотра хранится в localStorage.
   * Отдельная ревизия нужна, чтобы рекомендации обновлялись после
   * возврата с плеера, в том числе через back/forward cache браузера.
   */
  useEffect(() => {
    const refreshHistory = () => {
      const history = readWatchHistory();

      setHasWatchHistory(history.length > 0);
      setWatchHistory(history);
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

  useEffect(() => {
    const refreshTaste = () => {
      setMood(readTasteProfile().mood);
      setTasteRevision((revision) => revision + 1);
    };

    refreshTaste();
    window.addEventListener('animebox-taste-changed', refreshTaste);

    return () => {
      window.removeEventListener('animebox-taste-changed', refreshTaste);
    };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setClockNow(Date.now());
    }, 60_000);

    return () => window.clearInterval(timer);
  }, []);

  /*
   * Реальное расписание с уже существующего /api/schedule.
   * Загружается независимо и не тормозит hero/основную ленту.
   */
  useEffect(() => {
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

  /*
   * Ranking used to run on every unrelated HomePage render (including the
   * one-minute schedule clock). Keep it hot only when catalogue/taste/history
   * actually changes.
   */
  const smartRecommendations = useMemo(() => {
    // localStorage-backed ranking cannot be deterministic during SSR.
    // Defer it until after hydration so React sees the exact same first tree
    // on the server and in the browser.
    if (!hydrated) return [];

    // Re-read local-first signals when their revision changes.
    void historyRevision;
    void tasteRevision;

    return getPersonalizedRecommendations([...popular, ...ongoing], {
      mood,
      limit: 30,
    });
  }, [hydrated, popular, ongoing, mood, historyRevision, tasteRevision]);

  const progress = useMemo(() => {
    void historyRevision;
    return readAnimeProgressMap();
  }, [historyRevision]);

  const continueWatchingItems = useMemo(
    () =>
      watchHistory.slice(0, 4).map((anime) => ({
        anime,
        episode: Math.max(1, progress[String(anime.id)] ?? 1),
      })),
    [progress, watchHistory],
  );

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
    const nowSeconds = Math.floor(clockNow / 1000);

    return scheduleItems
      .filter((item) => item.airingAt >= nowSeconds)
      .slice(0, 5);
  }, [scheduleItems, clockNow]);

  return (
    <div className="home-page">
      <div className="home-grid home-grid--main">
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

        <HomeTopAnimePanel popular={popular} mobile />

        <HomeContinueWatching items={continueWatchingItems} />

        <HomeMoodPicker
          value={mood}
          onChange={(nextMood) => {
            if (nextMood === mood) return;

            // Active chip responds immediately. The localStorage/event refresh
            // is lower priority so it cannot compete with the feed animation.
            setMood(nextMood);
            startTransition(() => {
              setTasteMood(nextMood);
            });
          }}
        />

        <section className="section smart-feed-section">
          <div className="section-head">
            <div className="smart-feed-heading">
              <span className="smart-section-eyebrow">ПЕРСОНАЛЬНАЯ ЛЕНТА</span>
              <div className="smart-feed-heading__line">
                <span
                  className="section-title__icon section-title__icon--asset smart-feed-heading__asset"
                  aria-hidden="true"
                >
                  <img src="/brand/icons/sections/recommendations.svg" alt="" />
                </span>
                <h2 className="section-title">Подобрано для тебя</h2>
              </div>
              <p>Лента догружается сама, а причина рекомендации остаётся видна на каждой карточке.</p>
            </div>

            <Link className="section-link" href="/search">
              Весь каталог →
            </Link>
          </div>

          {!hydrated || (popularLoading && ongoingLoading && smartRecommendations.length === 0) ? (
            <div className="loading-grid" aria-label="Загружаем персональные рекомендации">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="skeleton skeleton--card" />
              ))}
            </div>
          ) : (
            <SmartRecommendationFeed
              items={smartRecommendations}
              mood={mood}
              hasWatchHistory={hasWatchHistory}
            />
          )}
        </section>

        <AdSlot
          placement="home-after-smart-feed"
          format="horizontal"
        />

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
                const released = item.airingAt * 1000 <= clockNow;

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
        <HomeTopAnimePanel popular={popular} />

        <div className="panel home-library-panel right-rail__secondary">
          <span className="home-library-panel__symbol home-library-panel__symbol--brand" aria-hidden="true">
            <img src="/brand/brand-mark.webp" alt="" />
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
            src="/brand/animebox-mascot.webp"
            alt=""
            loading="lazy"
            decoding="async"
            fetchPriority="low"
            aria-hidden="true"
          />
        </div>

        <div className="panel right-rail__secondary">
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
                  <ScheduleItem
                    key={item.id}
                    href={animeHref(item.media)}
                    title={title}
                    image={item.media.coverImage}
                    episode={item.episode}
                    dateLabel={formatUpcomingDate(item.airingAt)}
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

        <SupportAnimeBoxCard />

        <TelegramPromoCard />
      </aside>
      </div>
    </div>
  );
}
