'use client';

import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';

import AnimeCard from '@/components/AnimeCard';
import { getAnimes, isAbortError } from '@/lib/anime-client';
import type { Anime } from '@/types/anime';

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

export default function SearchCatalogClient({
  initialResults,
}: {
  initialResults: Anime[];
}) {
  const searchParams = useSearchParams();
  const query = searchParams.get('search')?.trim() ?? '';

  const [selectedGenre, setSelectedGenre] = useState<number | null>(null);
  const [results, setResults] = useState<Anime[]>(initialResults);
  const [loading, setLoading] = useState(initialResults.length === 0);
  const [error, setError] = useState('');
  const [pageState, setPageState] = useState({ query, page: 1 });
  const page = pageState.query === query ? pageState.page : 1;
  const initialRenderRef = useRef(true);
  const [hasNextPage, setHasNextPage] = useState(initialResults.length >= 15);

  useEffect(() => {
    // Skip only the first browser fetch: that exact catalogue state already came from SSR.
    if (initialRenderRef.current) {
      initialRenderRef.current = false;
      if (!query && selectedGenre === null && page === 1 && initialResults.length > 0) {
        return;
      }
    }

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
          { signal: controller.signal },
        );

        if (controller.signal.aborted) return;

        setResults(data);
        setHasNextPage(data.length === 15);
      } catch (err: unknown) {
        if (isAbortError(err)) return;
        setResults([]);
        setError('Не удалось загрузить аниме. Попробуйте ещё раз.');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void load();
    return () => controller.abort();
  }, [initialResults, page, query, selectedGenre]);

  return (
    <div className="search-page">
      <div className="page-heading">
        <h1>Каталог аниме</h1>
        <p>Ищи тайтлы по названию или жанру и добавляй их в свой трекер</p>
      </div>

      <div className="genre-row">
        <button
          className={`genre-btn ${selectedGenre === null ? 'is-active' : ''}`}
          onClick={() => {
            setSelectedGenre(null);
            setPageState({ query, page: 1 });
          }}
        >
          Все жанры
        </button>

        {GENRES.map((genre) => (
          <button
            key={genre.id}
            className={`genre-btn ${selectedGenre === genre.id ? 'is-active' : ''}`}
            onClick={() => {
              setSelectedGenre(genre.id);
              setPageState({ query, page: 1 });
            }}
          >
            {genre.russian}
          </button>
        ))}
      </div>

      <section className="section">
        <div className="section-head">
          <h2 className="section-title">
            {query || selectedGenre !== null ? 'Результаты поиска' : 'Популярное аниме'}
          </h2>
          <span className="section-link">Страница {page}</span>
        </div>

        {loading ? (
          <div className="loading-grid">
            {Array.from({ length: 15 }).map((_, index) => (
              <div key={index} className="skeleton skeleton--card" />
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
              <AnimeCard key={anime.id} anime={anime} />
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <strong>Ничего не найдено</strong>
            <span>Попробуй изменить запрос или выбрать другой жанр.</span>
          </div>
        )}

        {!loading && results.length > 0 && (
          <div className="pagination">
            <button
              disabled={page === 1}
              onClick={() => setPageState({ query, page: Math.max(1, page - 1) })}
            >
              ← Назад
            </button>
            <span>Страница {page}</span>
            <button
              disabled={!hasNextPage}
              onClick={() => setPageState({ query, page: page + 1 })}
            >
              Вперёд →
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
