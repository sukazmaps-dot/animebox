'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import type { Anime } from '@/types/anime';
import AnimeCard from '@/components/AnimeCard';
import {
  getAnimes,
  isAbortError,
} from '@/lib/anime-client';

const GENRES = [
  { id: 1, russian: 'Экшен' },
  { id: 2, russian: 'Приключения' },
  { id: 4, russian: 'Комедия' },
  { id: 8, russian: 'Драма' },
  { id: 10, russian: 'Фэнтези' },
  { id: 14, russian: 'Ужасы' },
  { id: 22, russian: 'Романтика' },
  { id: 24, russian: 'Фантастика' },
  { id: 7, russian: 'Тайна' },
  { id: 36, russian: 'Повседневность' },
  { id: 30, russian: 'Спорт' },
  { id: 37, russian: 'Сверхъестественное' },
];

function SearchPageContent() {
  const searchParams = useSearchParams();
  const query = searchParams.get('search')?.trim() ?? '';

  const [selectedGenre, setSelectedGenre] = useState<number | null>(null);
  const [results, setResults] = useState<Anime[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [hasNextPage, setHasNextPage] = useState(true);

  useEffect(() => {
    setPage(1);
  }, [query]);

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      setLoading(true);
      setError('');

      try {
        const data = await getAnimes(
          {
            search: query || undefined,
            page,
            limit: 15,
            order: 'ranked',
            genre: selectedGenre ?? undefined,
          },
          {
            signal: controller.signal,
          },
        );

        if (controller.signal.aborted) {
          return;
        }

        setResults(data);
        setHasNextPage(data.length === 15);
      } catch (err: unknown) {
        if (isAbortError(err)) {
          return;
        }

        setResults([]);
        setError('Не удалось загрузить аниме. Попробуйте ещё раз.');
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    /*
     * Navbar уже делает debounce ввода до изменения ?search=.
     * Второй setTimeout здесь раньше добавлял ещё 250 мс к каждому запросу.
     */
    void load();

    return () => {
      controller.abort();
    };
  }, [query, selectedGenre, page]);

  return (
    <div className="search-page">
      <div className="page-heading">
        <h1>Поиск аниме</h1>
        <p>Ищи тайтлы по названию или жанру</p>
      </div>

      <div className="genre-row">
        <button
          className={`genre-btn ${selectedGenre === null ? 'is-active' : ''}`}
          onClick={() => {
            setSelectedGenre(null);
            setPage(1);
          }}
        >
          Все жанры
        </button>

        {GENRES.map((genre) => (
          <button
            key={genre.id}
            className={`genre-btn ${
              selectedGenre === genre.id ? 'is-active' : ''
            }`}
            onClick={() => {
              setSelectedGenre(genre.id);
              setPage(1);
            }}
          >
            {genre.russian}
          </button>
        ))}
      </div>

      <section className="section">
        <div className="section-head">
          <h2 className="section-title">
            {query || selectedGenre !== null
              ? 'Результаты поиска'
              : 'Популярное аниме'}
          </h2>

          <span className="section-link">
            Страница {page}
          </span>
        </div>

        {loading ? (
          <div className="loading-grid">
            {Array.from({ length: 15 }).map((_, index) => (
              <div
                key={index}
                className="skeleton skeleton--card"
              />
            ))}
          </div>
        ) : error ? (
          <div className="empty-state">
            <strong>Не удалось загрузить результаты</strong>
            <span>{error}</span>
          </div>
        ) : results.length ? (
          <div className="anime-grid">
            {results.map((anime) => (
              <AnimeCard
                key={anime.id}
                anime={anime}
              />
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <strong>Ничего не найдено</strong>
            <span>
              Попробуй изменить запрос или выбрать другой жанр.
            </span>
          </div>
        )}

        {!loading && results.length > 0 && (
          <div className="pagination">
            <button
              disabled={page === 1}
              onClick={() =>
                setPage((current) => Math.max(1, current - 1))
              }
            >
              ← Назад
            </button>

            <span>Страница {page}</span>

            <button
              disabled={!hasNextPage}
              onClick={() =>
                setPage((current) => current + 1)
              }
            >
              Вперёд →
            </button>
          </div>
        )}
      </section>
    </div>
  );
}

function SearchPageFallback() {
  return (
    <div className="search-page">
      <div className="page-heading">
        <h1>Поиск аниме</h1>
        <p>Ищи тайтлы по названию или жанру</p>
      </div>

      <section className="section">
        <div className="loading-grid">
          {Array.from({ length: 15 }).map((_, index) => (
            <div
              key={index}
              className="skeleton skeleton--card"
            />
          ))}
        </div>
      </section>
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={<SearchPageFallback />}>
      <SearchPageContent />
    </Suspense>
  );
}
