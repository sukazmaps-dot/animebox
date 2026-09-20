'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import AnimeCard from '@/components/AnimeCard';
import AnimeImage from '@/components/AnimeImage';
import AnimeBoxLoader from '@/components/ui/AnimeBoxLoader';
import HorizontalNavRail from '@/components/ui/HorizontalNavRail';
import MoodFilter from '@/components/catalog/MoodFilter';
import { getAnimes, isAbortError } from '@/lib/anime-client';
import type { CatalogMood } from '@/lib/catalog-moods';
import type { Anime } from '@/types/anime';
import AdSlot from '@/components/monetization/AdSlot';
import { parseAnimeSearchIntent } from '@/lib/search-intent';
import {
  describeSmartDiscoveryIntent,
  discoveryConstraintChips,
  parseSmartDiscoveryQuery,
  rankSmartDiscoveryCandidates,
  removeDiscoveryConstraint,
  smartDiscoveryMatch,
} from '@/lib/smart-discovery';
import { getSmartDiscovery, type SmartDiscoveryResponse } from '@/lib/discovery-client';
import { fetchTasteGraph, readCachedTasteGraph, type TasteGraph } from '@/lib/taste-graph';
import { trackProductClientEvent } from '@/lib/product-events-client';
import { CATALOG_AD_BREAK_INDEX, CATALOG_PAGE_SIZE } from '@/lib/catalog-pagination';

import styles from './SearchCatalogClient.module.css';

const SEARCH_DEBOUNCE_MS = 120;

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
] as const;

type DiscoveryMeta = Pick<SmartDiscoveryResponse, 'seed' | 'meta'>;

function seedTitle(seed: SmartDiscoveryResponse['seed']) {
  if (!seed) return '';
  return seed.russian || seed.title?.russian || seed.title?.english || seed.title?.romaji || 'Аниме';
}

export default function SearchCatalogClient({
  initialResults,
  initialQuery = '',
}: {
  initialResults: Anime[];
  initialQuery?: string;
}) {
  const normalizedInitialQuery = initialQuery.trim();
  const [liveQuery, setLiveQuery] = useState(normalizedInitialQuery);
  const [query, setQuery] = useState(normalizedInitialQuery);
  const liveQueryRef = useRef(liveQuery);
  const requestSequenceRef = useRef(0);

  const searchIntent = useMemo(
    () => (query ? parseAnimeSearchIntent(query) : null),
    [query],
  );
  const discoveryIntent = useMemo(
    () => (query ? parseSmartDiscoveryQuery(query) : null),
    [query],
  );
  const discoveryDescription = useMemo(
    () => (discoveryIntent?.isDiscovery ? describeSmartDiscoveryIntent(discoveryIntent) : []),
    [discoveryIntent],
  );
  const discoveryChips = useMemo(
    () => (discoveryIntent?.isDiscovery ? discoveryConstraintChips(discoveryIntent) : []),
    [discoveryIntent],
  );

  const [selectedGenre, setSelectedGenre] = useState<number | null>(null);
  const [selectedMood, setSelectedMood] = useState<CatalogMood>('any');
  const [tasteGraph, setTasteGraph] = useState<TasteGraph | null>(() => readCachedTasteGraph());
  const [results, setResults] = useState<Anime[]>(initialResults);
  const [loading, setLoading] = useState(Boolean(normalizedInitialQuery) || initialResults.length === 0);
  const [error, setError] = useState('');
  const [discoveryMeta, setDiscoveryMeta] = useState<DiscoveryMeta | null>(null);
  const [pageState, setPageState] = useState({ query, page: 1 });
  const page = pageState.query === query ? pageState.page : 1;
  const initialRenderRef = useRef(true);
  const [hasNextPage, setHasNextPage] = useState(initialResults.length >= CATALOG_PAGE_SIZE);

  useEffect(() => {
    liveQueryRef.current = liveQuery;
  }, [liveQuery]);

  useEffect(() => {
    const onLiveSearch = (event: Event) => {
      const detail = (event as CustomEvent<{ query?: unknown }>).detail;
      const next = typeof detail?.query === 'string' ? detail.query : '';
      liveQueryRef.current = next;
      setLiveQuery(next);
    };
    window.addEventListener('animebox-search-input', onLiveSearch);
    return () => window.removeEventListener('animebox-search-input', onLiveSearch);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const next = liveQuery.trim();
      setQuery((current) => current === next ? current : next);
      setPageState({ query: next, page: 1 });
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [liveQuery]);

  useEffect(() => {
    const controller = new AbortController();
    void fetchTasteGraph(controller.signal)
      .then((graph) => {
        if (graph) setTasteGraph(graph);
      })
      .catch((tasteError) => {
        if (tasteError instanceof Error && tasteError.name === 'AbortError') return;
      });

    const onTasteGraph = (event: Event) => {
      const graph = (event as CustomEvent<TasteGraph>).detail ?? readCachedTasteGraph();
      if (graph) setTasteGraph(graph);
    };
    window.addEventListener('animebox-taste-graph-updated', onTasteGraph);
    return () => {
      controller.abort();
      window.removeEventListener('animebox-taste-graph-updated', onTasteGraph);
    };
  }, []);

  useEffect(() => {
    // Skip only the initial unfiltered browser request: SSR already supplied it.
    if (initialRenderRef.current) {
      initialRenderRef.current = false;
      if (
        !query &&
        selectedGenre === null &&
        selectedMood === 'any' &&
        page === 1 &&
        initialResults.length > 0
      ) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setLoading(false);
        return;
      }
    }

    const controller = new AbortController();
    const requestId = ++requestSequenceRef.current;

    async function load() {
      setLoading(true);
      setError('');

      try {
        if (query && discoveryIntent?.isDiscovery && page === 1) {
          const payload = await getSmartDiscovery(
            query,
            Math.max(CATALOG_PAGE_SIZE, 30),
            controller.signal,
          );
          const personalized = rankSmartDiscoveryCandidates(payload.items, discoveryIntent, {
            tasteGraph,
            strict: false,
          });

          if (controller.signal.aborted || requestId !== requestSequenceRef.current) return;
          setResults(personalized.slice(0, Math.max(CATALOG_PAGE_SIZE, 30)));
          setDiscoveryMeta({ seed: payload.seed, meta: payload.meta });
          setHasNextPage(false);
          trackProductClientEvent('smart_discovery_search', {
            source: 'search',
            path: '/search',
            entityType: 'search_query',
            entityId: query.slice(0, 255),
            metadata: {
              similar_to: discoveryIntent.similarTo,
              include_genres: discoveryIntent.includeGenres,
              exclude_terms: discoveryIntent.excludeTerms,
              max_episodes: discoveryIntent.maxEpisodes,
              min_episodes: discoveryIntent.minEpisodes,
              min_year: discoveryIntent.minYear,
              relaxed: Boolean(payload.meta?.relaxed),
              seed_resolved: Boolean(payload.meta?.seedResolved),
              results: personalized.length,
            },
          });
        } else {
          const data = await getAnimes(
            {
              search: query || undefined,
              page,
              limit: CATALOG_PAGE_SIZE,
              order: 'ranked',
              genre: selectedGenre ?? undefined,
              mood: selectedMood,
            },
            { signal: controller.signal },
          );

          if (controller.signal.aborted || requestId !== requestSequenceRef.current) return;
          setResults(data);
          setDiscoveryMeta(null);
          setHasNextPage(data.length === CATALOG_PAGE_SIZE);
        }
      } catch (loadError: unknown) {
        if (isAbortError(loadError) || controller.signal.aborted) return;
        if (requestId !== requestSequenceRef.current) return;
        setResults([]);
        setDiscoveryMeta(null);
        setError('Не удалось загрузить аниме. Попробуйте ещё раз.');
      } finally {
        if (!controller.signal.aborted && requestId === requestSequenceRef.current) {
          setLoading(false);
        }
      }
    }

    void load();
    return () => controller.abort();
  }, [discoveryIntent, initialResults, page, query, selectedGenre, selectedMood, tasteGraph]);

  function applySearchQuery(nextValue: string) {
    const next = nextValue.replace(/\s+/g, ' ').trim();
    liveQueryRef.current = next;
    setLiveQuery(next);
    window.dispatchEvent(new CustomEvent('animebox-search-input', { detail: { query: next } }));

    const url = new URL(window.location.href);
    if (next) url.searchParams.set('search', next);
    else url.searchParams.delete('search');
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
  }

  const hasFilters = selectedGenre !== null || selectedMood !== 'any';
  const showCatalogAd = !loading && results.length >= 8;
  const catalogAdBreakIndex = results.length > CATALOG_AD_BREAK_INDEX
    ? CATALOG_AD_BREAK_INDEX
    : results.length;
  const catalogLead = showCatalogAd ? results.slice(0, catalogAdBreakIndex) : results;
  const catalogTail = showCatalogAd ? results.slice(catalogAdBreakIndex) : [];
  const refreshing = loading && results.length > 0;
  const recognizedSeed = discoveryMeta?.seed ?? null;
  const discoverySeedForMatch = recognizedSeed
    ? { genres: recognizedSeed.genres ?? [], episodes: recognizedSeed.episodes ?? null }
    : null;
  const closestQuery = discoveryIntent?.similarTo
    ? `похожее на ${discoveryIntent.similarTo}`
    : discoveryIntent?.includeGenres[0] ?? '';

  return (
    <div className="search-page">
      <div className="page-heading">
        <h1>Каталог аниме</h1>
        <p>Ищи тайтлы по названию, жанру и атмосфере — и добавляй их в свой трекер</p>

        {discoveryIntent?.isDiscovery && discoveryDescription.length > 0 && (
          <div className={styles.smartDiscoveryHint}>
            <span className={styles.smartDiscoveryBadge}>Smart Search</span>
            <span>{discoveryDescription.join(' · ')}</span>
          </div>
        )}

        {discoveryIntent?.isDiscovery && discoveryChips.length > 0 && (
          <div className={styles.discoveryChips} aria-label="Понятые условия поиска">
            {discoveryChips.map((chip) => {
              const removable = chip.id !== 'similar';
              return (
                <button
                  key={chip.id}
                  type="button"
                  className={styles.discoveryChip}
                  disabled={!removable}
                  title={removable ? 'Убрать это условие' : 'Распознанный референс'}
                  onClick={() => {
                    if (!removable) return;
                    applySearchQuery(removeDiscoveryConstraint(query, chip.id));
                  }}
                >
                  {chip.label}
                  {removable ? <span aria-hidden="true">×</span> : null}
                </button>
              );
            })}
          </div>
        )}

        {recognizedSeed && (
          <div className={styles.seedCard}>
            <div className={styles.seedPoster}>
              <AnimeImage
                image={recognizedSeed.coverImage}
                alt={seedTitle(recognizedSeed)}
                englishName={recognizedSeed.title?.english || recognizedSeed.title?.romaji}
                sizes="48px"
                quality={60}
              />
            </div>
            <div>
              <span>Ищем похожее на</span>
              <strong>{seedTitle(recognizedSeed)}</strong>
              <small>
                {recognizedSeed.startDate?.year ? `${recognizedSeed.startDate.year} · ` : ''}
                {recognizedSeed.episodes ? `${recognizedSeed.episodes} серий` : 'длительность уточняется'}
              </small>
            </div>
          </div>
        )}

        {discoveryMeta?.meta?.relaxed && (
          <p className={styles.relaxedHint}>
            Точных совпадений по всем условиям мало — показываем ближайшие варианты.
          </p>
        )}

        {!discoveryIntent?.isDiscovery && searchIntent &&
          searchIntent.titleQuery !== searchIntent.normalized && (
            <p className="mt-2 text-xs text-violet-200/70">
              Понял запрос: <strong className="text-violet-100">{searchIntent.titleQuery}</strong>
              {searchIntent.seasonNumber ? ` · сезон ${searchIntent.seasonNumber}` : ''}
              {searchIntent.partNumber ? ` · часть ${searchIntent.partNumber}` : ''}
              {searchIntent.episodeNumber ? ` · серия ${searchIntent.episodeNumber}` : ''}
            </p>
          )}
      </div>

      <div className={styles.filterBar}>
        <button
          type="button"
          className={`genre-btn ${styles.allGenres} ${selectedGenre === null ? 'is-active' : ''}`}
          onClick={() => {
            setSelectedGenre(null);
            setPageState({ query, page: 1 });
          }}
        >
          Все жанры
        </button>

        <MoodFilter
          value={selectedMood}
          onChange={(mood) => {
            setSelectedMood(mood);
            setPageState({ query, page: 1 });
          }}
        />

        <HorizontalNavRail
          className={styles.genreRail}
          ariaLabel="Жанры аниме"
          stepRatio={0.62}
        >
          {GENRES.map((genre) => (
            <button
              key={genre.id}
              type="button"
              data-rail-active={selectedGenre === genre.id ? 'true' : undefined}
              className={`genre-btn ${styles.genreRailButton} ${selectedGenre === genre.id ? 'is-active' : ''}`}
              onClick={() => {
                setSelectedGenre(genre.id);
                setPageState({ query, page: 1 });
              }}
            >
              {genre.russian}
            </button>
          ))}
        </HorizontalNavRail>

        <span className={styles.moodHint}>жанр + настроение работают вместе</span>
      </div>

      <section className="section" aria-busy={loading}>
        <div className="section-head">
          <h2 className="section-title">
            {liveQuery.trim() || hasFilters ? 'Результаты поиска' : 'Популярное аниме'}
          </h2>
          <span className="section-link">
            {refreshing ? 'Ищем…' : `Страница ${page}`}
          </span>
        </div>

        {loading && results.length === 0 ? (
          <div>
            <AnimeBoxLoader label="Подбираем аниме…" size={46} />
            <div className="loading-grid" aria-hidden="true">
              {Array.from({ length: 10 }).map((_, index) => (
                <div key={index} className="skeleton skeleton--card" />
              ))}
            </div>
          </div>
        ) : error ? (
          <div className={`empty-state ${styles.assetEmpty}`}>
            <img className={styles.emptyMascot} src="/ui/animebox-mascot.webp" alt="" aria-hidden="true" />
            <strong>Не удалось загрузить результаты</strong>
            <span>{error}</span>
          </div>
        ) : results.length ? (
          <>
            {refreshing && <div className={styles.refreshLine} aria-hidden="true" />}
            <div className="anime-grid">
              {catalogLead.map((anime) => (
                <AnimeCard
                  key={anime.id}
                  anime={anime}
                  discoveryMatch={discoveryIntent?.isDiscovery
                    ? smartDiscoveryMatch(anime, discoveryIntent, { seed: discoverySeedForMatch, tasteGraph })
                    : null}
                />
              ))}
            </div>

            {showCatalogAd && (
              <div className="catalog-ad-break" aria-label="Рекламная пауза">
                <AdSlot
                  placement="catalog-after-results"
                  format="horizontal"
                  className="monetization-ad--catalog"
                />
              </div>
            )}

            {catalogTail.length > 0 && (
              <div className="anime-grid anime-grid--after-ad">
                {catalogTail.map((anime) => (
                  <AnimeCard
                    key={anime.id}
                    anime={anime}
                    discoveryMatch={discoveryIntent?.isDiscovery
                      ? smartDiscoveryMatch(anime, discoveryIntent, { seed: discoverySeedForMatch, tasteGraph })
                      : null}
                  />
                ))}
              </div>
            )}
          </>
        ) : (
          <div className={`empty-state ${styles.assetEmpty}`}>
            <img className={styles.emptyMascot} src="/brand/illustrations/empty-search.webp" alt="" aria-hidden="true" />
            <strong>{discoveryIntent?.isDiscovery ? 'Точных совпадений не нашли' : 'Ничего не найдено'}</strong>
            <span>
              {discoveryIntent?.similarTo && discoveryMeta?.meta?.seedResolved === false
                ? `Не удалось уверенно распознать «${discoveryIntent.similarTo}». Попробуй другое написание.`
                : 'Попробуй изменить запрос, жанр или настроение.'}
            </span>
            <div className={styles.emptyActions}>
              {discoveryIntent?.isDiscovery && closestQuery && closestQuery !== query && (
                <button type="button" onClick={() => applySearchQuery(closestQuery)}>
                  Показать ближайшие
                </button>
              )}
              {(query || hasFilters) && (
                <button
                  type="button"
                  className={styles.secondaryAction}
                  onClick={() => {
                    setSelectedGenre(null);
                    setSelectedMood('any');
                    applySearchQuery('');
                  }}
                >
                  Очистить поиск
                </button>
              )}
            </div>
          </div>
        )}

        {!loading && results.length > 0 && !discoveryIntent?.isDiscovery && (
          <div className="pagination">
            <button
              type="button"
              disabled={page === 1}
              onClick={() => setPageState({ query, page: Math.max(1, page - 1) })}
            >
              ← Назад
            </button>
            <span>Страница {page}</span>
            <button
              type="button"
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
