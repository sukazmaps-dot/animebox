'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

import {
  communityRequest,
  statusLabels,
  type CommunityProfile,
  type LibraryStatus,
} from '@/lib/community-client';
import LibraryStatusControl from '@/components/LibraryStatusControl';

type Filter = LibraryStatus | 'all';

const filterIcons: Record<Filter, string> = {
  all: '/brand/brand-mark.png',
  watching: '/brand/icons/watching.svg',
  planned: '/brand/icons/planned.svg',
  completed: '/brand/icons/completed.svg',
  dropped: '/brand/icons/dropped.svg',
};

export default function MyListPage() {
  const [data, setData] = useState<CommunityProfile | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [error, setError] = useState('');

  async function load() {
    try {
      setError('');
      setData(await communityRequest<CommunityProfile>('profile'));
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : 'Не удалось загрузить библиотеку.',
      );
    }
  }

  useEffect(() => {
    void load();
    window.addEventListener('library-updated', load);

    return () => {
      window.removeEventListener('library-updated', load);
    };
  }, []);

  const filteredLibrary = useMemo(() => {
    if (!data) return [];
    if (filter === 'all') return data.library;
    return data.library.filter((item) => item.status === filter);
  }, [data, filter]);

  function filterCount(value: Filter) {
    if (!data) return 0;
    if (value === 'all') return data.library.length;
    return data.stats[value];
  }

  return (
    <main className="detail tracker-page">
      <header className="tracker-hero">
        <div className="tracker-hero__brand">
          <div className="tracker-hero__mark" aria-hidden="true">
            <img src="/brand/brand-mark.png" alt="" />
          </div>

          <div>
            <span className="tracker-eyebrow">ANIMEBOX LIBRARY</span>
            <h1>Мой трекер</h1>
            <p>Твоя коллекция, статусы и прогресс — в одном месте.</p>
          </div>
        </div>

        {data && (
          <div className="tracker-summary" aria-label="Статистика библиотеки">
            <div>
              <strong>{data.library.length}</strong>
              <span>В закладках</span>
            </div>
            <div>
              <strong>{data.stats.watching}</strong>
              <span>Смотрю</span>
            </div>
            <div>
              <strong>{data.stats.completed}</strong>
              <span>Завершено</span>
            </div>
          </div>
        )}
      </header>

      {error && (
        <section className="tracker-error" role="alert">
          <span>{error}</span>
          <div>
            <Link href="/login">Войти</Link>
            <button type="button" onClick={() => void load()}>
              Повторить
            </button>
          </div>
        </section>
      )}

      {!data && !error && (
        <div className="tracker-loading" role="status">
          <span className="tracker-loading__dot" />
          Загружаем библиотеку…
        </div>
      )}

      {data && (
        <>
          <nav className="tracker-filters" aria-label="Фильтр библиотеки">
            {(
              ['all', 'watching', 'planned', 'completed', 'dropped'] as Filter[]
            ).map((value) => {
              const active = filter === value;
              const label = value === 'all' ? 'Все' : statusLabels[value];

              return (
                <button
                  key={value}
                  type="button"
                  aria-pressed={active}
                  data-status={value}
                  className={active ? 'tracker-filter is-active' : 'tracker-filter'}
                  onClick={() => setFilter(value)}
                >
                  <span className="tracker-filter__icon" aria-hidden="true">
                    <img src={filterIcons[value]} alt="" />
                  </span>
                  <span className="tracker-filter__label">{label}</span>
                  <span className="tracker-filter__count">
                    {filterCount(value)}
                  </span>
                </button>
              );
            })}
          </nav>

          {filteredLibrary.length > 0 ? (
            <div className="tracker-list">
              {filteredLibrary.map((item) => (
                <article
                  className="tracker-card"
                  data-status={item.status}
                  key={item.anime_id}
                >
                  <div className="tracker-card__top">
                    <div className="tracker-card__identity">
                      <div className="tracker-card__mark" aria-hidden="true">
                        <img src="/brand/brand-mark.png" alt="" />
                      </div>

                      <div className="tracker-card__title">
                        <span className="tracker-card__label">
                          ЛИЧНАЯ БИБЛИОТЕКА
                        </span>
                        <Link href={`/anime/${item.anime_id}`} title={item.title}>
                          {item.title}
                        </Link>
                      </div>
                    </div>

                    <div className="tracker-card__right">
                      <span
                        className={`tracker-status tracker-status--${item.status}`}
                      >
                        {statusLabels[item.status]}
                      </span>

                      <Link
                        href={`/anime/${item.anime_id}`}
                        className="tracker-card__open"
                      >
                        Открыть <span aria-hidden="true">→</span>
                      </Link>
                    </div>
                  </div>

                  <div className="tracker-card__controls">
                    <LibraryStatusControl
                      animeId={item.anime_id}
                      initialStatus={item.status}
                    />
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <section className="tracker-empty">
              <img src="/brand/empty-library.png" alt="" aria-hidden="true" />
              <span className="tracker-eyebrow">БИБЛИОТЕКА</span>
              <h2>Здесь пока пусто</h2>
              <p>
                Добавь аниме в эту категорию — и оно появится здесь вместе со
                статусом и прогрессом.
              </p>
              <Link href="/search">
                Найти аниме <span aria-hidden="true">→</span>
              </Link>
            </section>
          )}
        </>
      )}
    </main>
  );
}
