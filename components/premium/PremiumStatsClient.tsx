'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import type { PremiumStatsPayload } from '@/lib/premium-stats';
import { trackProductClientEvent } from '@/lib/product-events-client';

function formatWatchTime(minutes: number) {
  const safe = Math.max(0, Math.round(minutes));
  const hours = Math.floor(safe / 60);
  const rest = safe % 60;

  if (hours > 0) return `${hours}ч ${rest}м`;
  return `${rest}м`;
}

function localDaypart(timestamps: string[]) {
  const buckets = {
    night: 0,
    morning: 0,
    day: 0,
    evening: 0,
  };

  for (const value of timestamps) {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) continue;
    const hour = date.getHours();

    if (hour < 6) buckets.night += 1;
    else if (hour < 12) buckets.morning += 1;
    else if (hour < 18) buckets.day += 1;
    else buckets.evening += 1;
  }

  return [
    { key: 'morning', label: 'Утро', value: buckets.morning },
    { key: 'day', label: 'День', value: buckets.day },
    { key: 'evening', label: 'Вечер', value: buckets.evening },
    { key: 'night', label: 'Ночь', value: buckets.night },
  ] as const;
}

export default function PremiumStatsClient() {
  const [data, setData] = useState<PremiumStatsPayload | null>(null);
  const [error, setError] = useState('');
  const [forbidden, setForbidden] = useState(false);
  const [query, setQuery] = useState('');

  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    void fetch('/api/premium/stats', {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = await response.json();

        if (!response.ok) {
          if (response.status === 403) {
            setForbidden(true);
          }
          throw new Error(payload.error || 'Не удалось загрузить статистику.');
        }

        if (active) {
          setData(payload as PremiumStatsPayload);
          trackProductClientEvent('premium_stats_view', {
            source: 'premium_stats',
            path: '/premium/stats',
            entityType: 'premium_feature',
            entityId: 'advanced_stats',
          });
        }
      })
      .catch((requestError) => {
        if (!active || controller.signal.aborted) return;
        setError(
          requestError instanceof Error
            ? requestError.message
            : 'Не удалось загрузить статистику.',
        );
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, []);

  const dayparts = useMemo(
    () => localDaypart(data?.activityTimestamps ?? []),
    [data?.activityTimestamps],
  );

  const maxDaypart = Math.max(1, ...dayparts.map((item) => item.value));
  const maxMonth = Math.max(1, ...(data?.months ?? []).map((item) => item.episodes));
  const filteredHistory = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('ru-RU');
    if (!normalized) return data?.recentHistory ?? [];

    return (data?.recentHistory ?? []).filter((item) =>
      item.title.toLocaleLowerCase('ru-RU').includes(normalized) ||
      String(item.episode).includes(normalized),
    );
  }, [data?.recentHistory, query]);

  if (!data && !error) {
    return (
      <main className="premium-stats-v2">
        <div className="premium-stats-v2__state" role="status">
          <span className="animebox-loader" aria-hidden="true" />
          <strong>Собираем твою статистику…</strong>
          <small>Берём только подтверждённые данные AnimeBox.</small>
        </div>
      </main>
    );
  }

  if (!data && error) {
    return (
      <main className="premium-stats-v2">
        <div className="premium-stats-v2__state">
          <strong>{forbidden ? 'Расширенная статистика — часть Premium' : 'Статистика временно недоступна'}</strong>
          <small>{error}</small>
          <Link href={forbidden ? '/premium' : '/profile'}>
            {forbidden ? 'Открыть Premium' : 'Вернуться в профиль'}
          </Link>
        </div>
      </main>
    );
  }

  if (!data) return null;

  return (
    <main className="premium-stats-v2">
      <header className="premium-stats-v2__hero">
        <div>
          <span>ANIMEBOX PREMIUM · СТАТИСТИКА</span>
          <h1>Твой AnimeBox в цифрах.</h1>
          <p>
            Не рейтинг и не соревнование. Просто твоя история просмотра,
            собранная из подтверждённых событий AnimeBox.
          </p>
        </div>
        <Link href="/profile/edit?tab=premium">Настроить Profile Scene →</Link>
      </header>

      <section className="premium-stats-v2__overview" aria-label="Основная статистика">
        <article>
          <span>Время просмотра</span>
          <strong>{formatWatchTime(data.overview.watchMinutes)}</strong>
          <small>подтверждённая активность</small>
        </article>
        <article>
          <span>Серий</span>
          <strong>{data.overview.episodes.toLocaleString('ru-RU')}</strong>
          <small>{data.overview.episodes30} за последние 30 дней</small>
        </article>
        <article>
          <span>Тайтлов</span>
          <strong>{data.overview.titles.toLocaleString('ru-RU')}</strong>
          <small>завершено</small>
        </article>
        <article>
          <span>Активных дней</span>
          <strong>{data.overview.activeDays30}</strong>
          <small>из последних 30</small>
        </article>
        <article>
          <span>Темп</span>
          <strong>{data.overview.weeklyAverage30}</strong>
          <small>серии в неделю</small>
        </article>
        <article>
          <span>Лучшая серия дней</span>
          <strong>{data.overview.longestStreak}</strong>
          <small>дней</small>
        </article>
      </section>

      <div className="premium-stats-v2__grid">
        <section className="premium-stats-v2__panel">
          <header>
            <div>
              <span>ПО МЕСЯЦАМ</span>
              <h2>Ритм просмотра</h2>
            </div>
            <small>последние 6 месяцев</small>
          </header>

          <div className="premium-stats-v2__months" aria-label="Серии по месяцам">
            {data.months.map((month) => (
              <div key={month.key}>
                <span className="premium-stats-v2__bar-track">
                  <i
                    style={{
                      height: `${Math.max(4, (month.episodes / maxMonth) * 100)}%`,
                    }}
                  />
                </span>
                <strong>{month.episodes}</strong>
                <small>{month.label}</small>
              </div>
            ))}
          </div>
        </section>

        <section className="premium-stats-v2__panel">
          <header>
            <div>
              <span>КОГДА СМОТРИШЬ</span>
              <h2>Твоё время</h2>
            </div>
            <small>локальное время устройства</small>
          </header>

          <div className="premium-stats-v2__dayparts">
            {dayparts.map((part) => (
              <div key={part.key}>
                <span>{part.label}</span>
                <div><i style={{ width: `${(part.value / maxDaypart) * 100}%` }} /></div>
                <strong>{part.value}</strong>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="premium-stats-v2__grid premium-stats-v2__grid--lower">
        <section className="premium-stats-v2__panel">
          <header>
            <div>
              <span>ЖАНРЫ</span>
              <h2>Что у тебя в привычке</h2>
            </div>
          </header>

          {data.topGenres.length ? (
            <div className="premium-stats-v2__rank-list">
              {data.topGenres.map((item, index) => (
                <div key={item.genre}>
                  <span>{String(index + 1).padStart(2, '0')}</span>
                  <strong>{item.genre}</strong>
                  <small>{item.episodes} сер.</small>
                </div>
              ))}
            </div>
          ) : (
            <p className="premium-stats-v2__empty">Нужно немного больше истории просмотра.</p>
          )}
        </section>

        <section className="premium-stats-v2__panel">
          <header>
            <div>
              <span>ТАЙТЛЫ</span>
              <h2>Где ты провёл больше всего времени</h2>
            </div>
          </header>

          {data.topTitles.length ? (
            <div className="premium-stats-v2__rank-list">
              {data.topTitles.map((item, index) => (
                <Link
                  key={item.animeId}
                  href={`/anime/${encodeURIComponent(item.slug || String(item.animeId))}`}
                >
                  <span>{String(index + 1).padStart(2, '0')}</span>
                  <strong>{item.title}</strong>
                  <small>{item.episodes} сер.</small>
                </Link>
              ))}
            </div>
          ) : (
            <p className="premium-stats-v2__empty">Здесь появятся твои самые просматриваемые тайтлы.</p>
          )}
        </section>
      </div>

      <section className="premium-stats-v2__history">
        <header>
          <div>
            <span>ИСТОРИЯ+</span>
            <h2>Недавние завершённые серии</h2>
            <p>Поиск работает прямо по твоей истории, без перезагрузки страницы.</p>
          </div>
          <label>
            <span className="sr-only">Поиск по истории</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Название или серия…"
              autoComplete="off"
            />
          </label>
        </header>

        <div className="premium-stats-v2__history-list">
          {filteredHistory.slice(0, 60).map((item) => (
            <Link
              key={`${item.animeId}:${item.episode}:${item.completedAt}`}
              href={`/anime/${encodeURIComponent(item.slug || String(item.animeId))}/episode/${item.episode}`}
            >
              <span className="premium-stats-v2__history-mark" aria-hidden="true">✦</span>
              <span>
                <strong>{item.title}</strong>
                <small>{item.episode} серия</small>
              </span>
              <time dateTime={item.completedAt}>
                {new Intl.DateTimeFormat('ru-RU', {
                  day: '2-digit',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                }).format(new Date(item.completedAt))}
              </time>
            </Link>
          ))}

          {!filteredHistory.length && (
            <p className="premium-stats-v2__empty">
              {query ? 'По этому запросу ничего не найдено.' : 'История пока пустая.'}
            </p>
          )}
        </div>
      </section>

      <footer className="premium-stats-v2__footer">
        <span>
          Обновлено {new Intl.DateTimeFormat('ru-RU', {
            hour: '2-digit',
            minute: '2-digit',
          }).format(new Date(data.generatedAt))}
        </span>
        <span className="premium-stats-v2__footer-links">
          <Link href="/premium/year">Итоги года →</Link>
          <Link href="/profile">Вернуться в профиль →</Link>
        </span>
      </footer>
    </main>
  );
}
