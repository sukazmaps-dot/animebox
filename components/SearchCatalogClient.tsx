'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import AnimeCard from '@/components/AnimeCard';
import AnimeImage from '@/components/AnimeImage';
import AnimeBoxLoader from '@/components/ui/AnimeBoxLoader';
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
import { ANIME_FAVORITES_STORAGE_KEY, readAnimeFavorites } from '@/lib/anime-storage';
import { getAnimeTitle, isAnimeOngoing } from '@/lib/anime-display';
import styles from './SearchCatalogClient.module.css';

const SEARCH_DEBOUNCE_MS = 120;
const GENRES = [
  { id: 1, russian: 'Экшен', aliases: ['action', 'экшен'] },
  { id: 2, russian: 'Приключения', aliases: ['adventure', 'приключения'] },
  { id: 4, russian: 'Комедия', aliases: ['comedy', 'комедия'] },
  { id: 8, russian: 'Драма', aliases: ['drama', 'драма'] },
  { id: 10, russian: 'Фэнтези', aliases: ['fantasy', 'фэнтези'] },
  { id: 14, russian: 'Ужасы', aliases: ['horror', 'ужасы'] },
  { id: 22, russian: 'Романтика', aliases: ['romance', 'романтика'] },
  { id: 24, russian: 'Фантастика', aliases: ['sci-fi', 'sci fi', 'фантастика'] },
  { id: 7, russian: 'Детектив', aliases: ['mystery', 'тайна', 'детектив'] },
  { id: 36, russian: 'Повседневность', aliases: ['slice of life', 'повседневность'] },
  { id: 30, russian: 'Спорт', aliases: ['sports', 'спорт'] },
  { id: 37, russian: 'Сверхъестественное', aliases: ['supernatural', 'сверхъестественное'] },
] as const;
const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: Math.max(1, CURRENT_YEAR - 1979) }, (_, index) => CURRENT_YEAR - index);

type DiscoveryMeta = Pick<SmartDiscoveryResponse, 'seed' | 'meta'>;
type CatalogView = 'catalog' | 'saved';
type CatalogStatus = 'any' | 'ongoing' | 'finished' | 'upcoming';
type CatalogFormat = 'any' | 'TV' | 'MOVIE' | 'OVA' | 'ONA' | 'SPECIAL';
type CatalogSeason = 'any' | 'WINTER' | 'SPRING' | 'SUMMER' | 'FALL';

const FORMAT_OPTIONS: Array<{ value: CatalogFormat; label: string }> = [
  { value: 'any', label: 'Все форматы' },
  { value: 'TV', label: 'TV-сериал' },
  { value: 'MOVIE', label: 'Фильм' },
  { value: 'OVA', label: 'OVA' },
  { value: 'ONA', label: 'ONA' },
  { value: 'SPECIAL', label: 'Спешл' },
];

const SEASON_OPTIONS: Array<{ value: CatalogSeason; label: string }> = [
  { value: 'any', label: 'Любой сезон' },
  { value: 'WINTER', label: 'Зима' },
  { value: 'SPRING', label: 'Весна' },
  { value: 'SUMMER', label: 'Лето' },
  { value: 'FALL', label: 'Осень' },
];

function seedTitle(seed: SmartDiscoveryResponse['seed']) {
  if (!seed) return '';
  return seed.russian || seed.title?.russian || seed.title?.english || seed.title?.romaji || 'Аниме';
}
function normalizedText(value: string) {
  return value.toLocaleLowerCase('ru-RU').replace(/ё/g, 'е').trim();
}
function favoriteMatchesGenre(anime: Anime, genreId: number) {
  const genre = GENRES.find((item) => item.id === genreId);
  if (!genre) return true;
  const values = (anime.genres ?? []).map((value) => normalizedText(String(value)));
  return genre.aliases.some((alias) => values.includes(normalizedText(alias)));
}

export default function SearchCatalogClient({
  initialResults,
  initialQuery = '',
  initialView = 'catalog',
}: {
  initialResults: Anime[];
  initialQuery?: string;
  initialView?: CatalogView;
}) {
  const normalizedInitialQuery = initialQuery.trim();
  const [view, setView] = useState<CatalogView>(initialView);
  const [liveQuery, setLiveQuery] = useState(normalizedInitialQuery);
  const [query, setQuery] = useState(normalizedInitialQuery);
  const liveQueryRef = useRef(liveQuery);
  const requestSequenceRef = useRef(0);
  const searchIntent = useMemo(() => (query ? parseAnimeSearchIntent(query) : null), [query]);
  const discoveryIntent = useMemo(() => (query ? parseSmartDiscoveryQuery(query) : null), [query]);
  const discoveryDescription = useMemo(() => (discoveryIntent?.isDiscovery ? describeSmartDiscoveryIntent(discoveryIntent) : []), [discoveryIntent]);
  const discoveryChips = useMemo(() => (discoveryIntent?.isDiscovery ? discoveryConstraintChips(discoveryIntent) : []), [discoveryIntent]);

  const [selectedGenres, setSelectedGenres] = useState<number[]>([]);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [selectedStatus, setSelectedStatus] = useState<CatalogStatus>('any');
  const [selectedFormat, setSelectedFormat] = useState<CatalogFormat>('any');
  const [selectedSeason, setSelectedSeason] = useState<CatalogSeason>('any');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [openPicker, setOpenPicker] = useState<'year' | 'status' | null>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const [selectedMood, setSelectedMood] = useState<CatalogMood>('any');
  const [favorites, setFavorites] = useState<Anime[]>([]);
  const [tasteGraph, setTasteGraph] = useState<TasteGraph | null>(() => readCachedTasteGraph());
  const [results, setResults] = useState<Anime[]>(initialResults);
  const [loading, setLoading] = useState(initialView === 'catalog' && (Boolean(normalizedInitialQuery) || initialResults.length === 0));
  const [error, setError] = useState('');
  const [discoveryMeta, setDiscoveryMeta] = useState<DiscoveryMeta | null>(null);
  const [pageState, setPageState] = useState({ query, page: 1 });
  const page = pageState.query === query ? pageState.page : 1;
  const initialRenderRef = useRef(true);
  const [hasNextPage, setHasNextPage] = useState(initialResults.length >= CATALOG_PAGE_SIZE);

  useEffect(() => { liveQueryRef.current = liveQuery; }, [liveQuery]);

  useEffect(() => {
    if (!openPicker) return;
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && !pickerRef.current?.contains(event.target)) setOpenPicker(null);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenPicker(null);
    };
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', dismiss);
      document.removeEventListener('keydown', escape);
    };
  }, [openPicker]);

  useEffect(() => {
    const syncFavorites = () => setFavorites(readAnimeFavorites());
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === ANIME_FAVORITES_STORAGE_KEY) syncFavorites();
    };
    syncFavorites();
    window.addEventListener('storage', onStorage);
    window.addEventListener('anime-favorites-changed', syncFavorites);
    window.addEventListener('pageshow', syncFavorites);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('anime-favorites-changed', syncFavorites);
      window.removeEventListener('pageshow', syncFavorites);
    };
  }, []);

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
    void fetchTasteGraph(controller.signal).then((graph) => { if (graph) setTasteGraph(graph); }).catch((tasteError) => {
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
    if (view === 'saved') {
      queueMicrotask(() => { setLoading(false); setError(''); });
      return;
    }
    if (initialRenderRef.current) {
      initialRenderRef.current = false;
      if (!query && selectedGenres.length === 0 && selectedYear === null && selectedStatus === 'any' && selectedFormat === 'any' && selectedSeason === 'any' && selectedMood === 'any' && page === 1 && initialResults.length > 0) {
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
        if (query && discoveryIntent?.isDiscovery && page === 1 && selectedGenres.length === 0 && selectedYear === null && selectedStatus === 'any' && selectedFormat === 'any' && selectedSeason === 'any') {
          const payload = await getSmartDiscovery(query, Math.max(CATALOG_PAGE_SIZE, 30), controller.signal);
          const personalized = rankSmartDiscoveryCandidates(payload.items, discoveryIntent, { tasteGraph, strict: false });
          if (controller.signal.aborted || requestId !== requestSequenceRef.current) return;
          setResults(personalized.slice(0, Math.max(CATALOG_PAGE_SIZE, 30)));
          setDiscoveryMeta({ seed: payload.seed, meta: payload.meta });
          setHasNextPage(false);
          trackProductClientEvent('smart_discovery_search', {
            source: 'search', path: '/search', entityType: 'search_query', entityId: query.slice(0, 255),
            metadata: {
              similar_to: discoveryIntent.similarTo, include_genres: discoveryIntent.includeGenres,
              exclude_terms: discoveryIntent.excludeTerms, max_episodes: discoveryIntent.maxEpisodes,
              min_episodes: discoveryIntent.minEpisodes, min_year: discoveryIntent.minYear,
              relaxed: Boolean(payload.meta?.relaxed), seed_resolved: Boolean(payload.meta?.seedResolved),
              results: personalized.length,
            },
          });
        } else {
          const data = await getAnimes({
            search: query || undefined,
            page,
            limit: CATALOG_PAGE_SIZE,
            order: 'ranked',
            genres: selectedGenres.length > 0 ? selectedGenres : undefined,
            year: selectedYear ?? undefined,
            status: selectedStatus === 'any' ? undefined : selectedStatus,
            format: selectedFormat === 'any' ? undefined : selectedFormat,
            season: selectedSeason === 'any' ? undefined : selectedSeason,
            mood: selectedMood,
          }, { signal: controller.signal });
          if (controller.signal.aborted || requestId !== requestSequenceRef.current) return;
          setResults(data);
          setDiscoveryMeta(null);
          setHasNextPage(data.length === CATALOG_PAGE_SIZE);
        }
      } catch (loadError: unknown) {
        if (isAbortError(loadError) || controller.signal.aborted || requestId !== requestSequenceRef.current) return;
        setResults([]);
        setDiscoveryMeta(null);
        setError('Не удалось загрузить аниме. Попробуйте ещё раз.');
      } finally {
        if (!controller.signal.aborted && requestId === requestSequenceRef.current) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [discoveryIntent, initialResults, page, query, selectedFormat, selectedGenres, selectedMood, selectedSeason, selectedStatus, selectedYear, tasteGraph, view]);

  function applySearchQuery(nextValue: string) {
    const next = nextValue.replace(/\s+/g, ' ').trim();
    liveQueryRef.current = next;
    setLiveQuery(next);
    window.dispatchEvent(new CustomEvent('animebox-search-input', { detail: { query: next } }));
    const url = new URL(window.location.href);
    if (next) url.searchParams.set('search', next); else url.searchParams.delete('search');
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
  }
  function applyView(nextView: CatalogView) {
    setView(nextView);
    const url = new URL(window.location.href);
    if (nextView === 'saved') url.searchParams.set('view', 'saved'); else url.searchParams.delete('view');
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
  }
  function toggleGenre(id: number) {
    setSelectedGenres((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
    setPageState({ query, page: 1 });
  }
  function clearStructuredFilters() {
    setOpenPicker(null);
    setSelectedGenres([]);
    setSelectedYear(null);
    setSelectedStatus('any');
    setSelectedFormat('any');
    setSelectedSeason('any');
    setPageState({ query, page: 1 });
  }

  const savedResults = useMemo(() => {
    const normalizedQuery = normalizedText(query);
    return favorites.filter((anime) => {
      if (normalizedQuery) {
        const title = normalizedText([getAnimeTitle(anime), anime.title?.romaji, anime.title?.english, anime.title?.native].filter(Boolean).join(' '));
        if (!title.includes(normalizedQuery)) return false;
      }
      if (selectedGenres.length > 0 && !selectedGenres.every((genreId) => favoriteMatchesGenre(anime, genreId))) return false;
      if (selectedYear != null && Number(anime.startDate?.year ?? 0) !== selectedYear) return false;
      if (selectedStatus === 'ongoing' && !isAnimeOngoing(anime)) return false;
      if (selectedStatus === 'finished' && isAnimeOngoing(anime)) return false;
      if (selectedStatus === 'upcoming' && normalizedText(String(anime.status ?? '')) !== 'анонс') return false;

      if (selectedFormat !== 'any') {
        const expectedFormat = ({
          TV: ['тв', 'tv'],
          MOVIE: ['фильм', 'movie'],
          OVA: ['ova'],
          ONA: ['ona'],
          SPECIAL: ['спешл', 'special'],
        } as const)[selectedFormat];
        const actualFormat = normalizedText(String(anime.format ?? ''));
        if (!expectedFormat.some((value) => actualFormat === value)) return false;
      }

      if (selectedSeason !== 'any') {
        const month = Number(anime.startDate?.month ?? 0);
        const actualSeason =
          month >= 1 && month <= 3
            ? 'WINTER'
            : month >= 4 && month <= 6
              ? 'SPRING'
              : month >= 7 && month <= 9
                ? 'SUMMER'
                : month >= 10 && month <= 12
                  ? 'FALL'
                  : null;
        if (actualSeason !== selectedSeason) return false;
      }

      return true;
    });
  }, [favorites, query, selectedFormat, selectedGenres, selectedSeason, selectedStatus, selectedYear]);

  const hasStructuredFilters =
    selectedGenres.length > 0 ||
    selectedYear !== null ||
    selectedStatus !== 'any' ||
    selectedFormat !== 'any' ||
    selectedSeason !== 'any';
  const hasFilters = hasStructuredFilters || (view === 'catalog' && selectedMood !== 'any');
  const filterCount =
    selectedGenres.length +
    (selectedYear == null ? 0 : 1) +
    (selectedStatus === 'any' ? 0 : 1) +
    (selectedFormat === 'any' ? 0 : 1) +
    (selectedSeason === 'any' ? 0 : 1);
  const displayResults = view === 'saved' ? savedResults : results;
  const displayLoading = view === 'catalog' && loading;
  const showCatalogAd = view === 'catalog' && !loading && results.length >= 8;
  const catalogAdBreakIndex = results.length > CATALOG_AD_BREAK_INDEX ? CATALOG_AD_BREAK_INDEX : results.length;
  const catalogLead = showCatalogAd ? results.slice(0, catalogAdBreakIndex) : results;
  const catalogTail = showCatalogAd ? results.slice(catalogAdBreakIndex) : [];
  const refreshing = view === 'catalog' && loading && results.length > 0;
  const recognizedSeed = view === 'catalog' ? discoveryMeta?.seed ?? null : null;
  const discoverySeedForMatch = recognizedSeed ? { genres: recognizedSeed.genres ?? [], episodes: recognizedSeed.episodes ?? null } : null;
  const closestQuery = discoveryIntent?.similarTo ? `похожее на ${discoveryIntent.similarTo}` : discoveryIntent?.includeGenres[0] ?? '';

  return (
    <div className="search-page">
      <div className="page-heading">
        <h1>Каталог</h1>
        <p>Найди историю под своё настроение.</p>
        <div className={styles.catalogTabs} aria-label="Раздел каталога">
          <button type="button" className={view === 'catalog' ? styles.catalogTabActive : styles.catalogTab} onClick={() => applyView('catalog')}>Каталог</button>
          <button type="button" className={view === 'saved' ? styles.catalogTabActive : styles.catalogTab} onClick={() => applyView('saved')}>
            Сохранённые{favorites.length > 0 ? <span>{favorites.length}</span> : null}
          </button>
        </div>

        {view === 'catalog' && discoveryIntent?.isDiscovery && discoveryDescription.length > 0 && (
          <div className={styles.smartDiscoveryHint}><span className={styles.smartDiscoveryBadge}>Smart Search</span><span>{discoveryDescription.join(' · ')}</span></div>
        )}
        {view === 'catalog' && discoveryIntent?.isDiscovery && discoveryChips.length > 0 && (
          <div className={styles.discoveryChips} aria-label="Понятые условия поиска">
            {discoveryChips.map((chip) => {
              const removable = chip.id !== 'similar';
              return (
                <button key={chip.id} type="button" className={styles.discoveryChip} disabled={!removable} title={removable ? 'Убрать это условие' : 'Распознанный референс'} onClick={() => { if (removable) applySearchQuery(removeDiscoveryConstraint(query, chip.id)); }}>
                  {chip.label}{removable ? <span aria-hidden="true">×</span> : null}
                </button>
              );
            })}
          </div>
        )}
        {recognizedSeed && (
          <div className={styles.seedCard}>
            <div className={styles.seedPoster}><AnimeImage image={recognizedSeed.coverImage} alt={seedTitle(recognizedSeed)} englishName={recognizedSeed.title?.english || recognizedSeed.title?.romaji} sizes="48px" quality={60} /></div>
            <div><span>Ищем похожее на</span><strong>{seedTitle(recognizedSeed)}</strong><small>{recognizedSeed.startDate?.year ? `${recognizedSeed.startDate.year} · ` : ''}{recognizedSeed.episodes ? `${recognizedSeed.episodes} серий` : 'длительность уточняется'}</small></div>
          </div>
        )}
        {view === 'catalog' && discoveryMeta?.meta?.relaxed && <p className={styles.relaxedHint}>Точных совпадений по всем условиям мало — показываем ближайшие варианты.</p>}
        {view === 'catalog' && !discoveryIntent?.isDiscovery && searchIntent && searchIntent.titleQuery !== searchIntent.normalized && (
          <p className="mt-2 text-xs text-violet-200/70">Понял запрос: <strong className="text-violet-100">{searchIntent.titleQuery}</strong>{searchIntent.seasonNumber ? ` · сезон ${searchIntent.seasonNumber}` : ''}{searchIntent.partNumber ? ` · часть ${searchIntent.partNumber}` : ''}{searchIntent.episodeNumber ? ` · серия ${searchIntent.episodeNumber}` : ''}</p>
        )}
      </div>

      <div className={styles.filterBar}>
        {view === 'catalog' && <MoodFilter value={selectedMood} onChange={(mood) => { setSelectedMood(mood); setPageState({ query, page: 1 }); }} />}
        <button type="button" className={`${styles.filterToggle} ${filtersOpen || filterCount > 0 ? styles.filterToggleActive : ''}`} aria-expanded={filtersOpen} onClick={() => { setOpenPicker(null); setFiltersOpen((current) => !current); }}>
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="2" fill="currentColor" stroke="none"/><circle cx="16" cy="17" r="2" fill="currentColor" stroke="none"/></svg>Фильтры{filterCount > 0 ? <b>{filterCount}</b> : null}
        </button>
      </div>

      {filtersOpen && (
        <div className={styles.filterPanel}>
          <div className={styles.filterPanelHead}>
            <div>
              <strong>Аниме-фильтры</strong>
              <span>Жанр, формат, сезон выхода и статус — без киношной формы поиска.</span>
            </div>
            {hasStructuredFilters && <button type="button" onClick={clearStructuredFilters}>Сбросить всё</button>}
          </div>

          <div className={styles.filterGroup}>
            <span className={styles.filterLabel}>Жанры</span>
            <div className={styles.genreGrid}>
              {GENRES.map((genre) => {
                const active = selectedGenres.includes(genre.id);
                return (
                  <button
                    key={genre.id}
                    type="button"
                    aria-pressed={active}
                    className={active ? styles.genreSelected : styles.genreOption}
                    onClick={() => toggleGenre(genre.id)}
                  >
                    {genre.russian}
                    {active ? <span aria-hidden="true">✓</span> : null}
                  </button>
                );
              })}
            </div>
          </div>

          <div className={styles.animeFilterSide}>
            <div className={styles.filterGroup}>
              <span className={styles.filterLabel}>Формат</span>
              <div className={styles.compactChoiceGrid}>
                {FORMAT_OPTIONS.map((option) => {
                  const active = selectedFormat === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      aria-pressed={active}
                      className={active ? styles.compactChoiceActive : styles.compactChoice}
                      onClick={() => {
                        setSelectedFormat(option.value);
                        setPageState({ query, page: 1 });
                      }}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className={styles.filterGroup}>
              <span className={styles.filterLabel}>Сезон выхода</span>
              <div className={styles.compactChoiceGrid}>
                {SEASON_OPTIONS.map((option) => {
                  const active = selectedSeason === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      aria-pressed={active}
                      className={active ? styles.compactChoiceActive : styles.compactChoice}
                      onClick={() => {
                        setSelectedSeason(option.value);
                        setPageState({ query, page: 1 });
                      }}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className={styles.filterGroup}>
              <span className={styles.filterLabel}>Статус</span>
              <div className={styles.statusChoices}>
                {([
                  ['any', 'Любой'],
                  ['ongoing', 'Онгоинг'],
                  ['finished', 'Завершено'],
                  ['upcoming', 'Анонс'],
                ] as const).map(([status, label]) => {
                  const active = selectedStatus === status;
                  return (
                    <button
                      key={status}
                      type="button"
                      aria-pressed={active}
                      className={active ? styles.compactChoiceActive : styles.compactChoice}
                      onClick={() => {
                        setSelectedStatus(status);
                        setPageState({ query, page: 1 });
                      }}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div ref={pickerRef} className={styles.filterPicker}>
              <span className={styles.filterLabel}>Год</span>
              <button
                type="button"
                className={styles.filterPickerTrigger}
                aria-expanded={openPicker === 'year'}
                aria-controls="catalog-year-options"
                onClick={() => setOpenPicker((current) => current === 'year' ? null : 'year')}
              >
                {selectedYear ?? 'Любой год'}
                <span aria-hidden="true">⌄</span>
              </button>
              {openPicker === 'year' && (
                <div id="catalog-year-options" className={styles.filterPickerMenu} aria-label="Выбрать год выхода аниме">
                  <button type="button" aria-pressed={selectedYear === null} onClick={() => { setSelectedYear(null); setPageState({ query, page: 1 }); setOpenPicker(null); }}>Любой год</button>
                  {YEARS.map((year) => (
                    <button key={year} type="button" aria-pressed={selectedYear === year} onClick={() => { setSelectedYear(year); setPageState({ query, page: 1 }); setOpenPicker(null); }}>
                      {year}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <section className={`section ${styles.catalogResults}`} aria-busy={displayLoading}>
        <div className="section-head">
          <h2 className="section-title">{view === 'saved' ? 'Сохранённые' : liveQuery.trim() || hasFilters ? 'Результаты' : 'Популярное'}</h2>
          <span className="section-link">{view === 'saved' ? `${displayResults.length} сохранено` : refreshing ? 'Ищем…' : `Страница ${page}`}</span>
        </div>

        {displayLoading && results.length === 0 ? (
          <div><AnimeBoxLoader label="Подбираем аниме…" size={46} /><div className="loading-grid" aria-hidden="true">{Array.from({ length: 10 }).map((_, index) => <div key={index} className="skeleton skeleton--card" />)}</div></div>
        ) : view === 'catalog' && error ? (
          <div className={`empty-state ${styles.assetEmpty}`}><img className={styles.emptyMascot} src="/ui/animebox-mascot.webp" alt="" aria-hidden="true" /><strong>Не удалось загрузить результаты</strong><span>{error}</span></div>
        ) : displayResults.length ? (
          view === 'saved' ? (
            <div className="anime-grid">{savedResults.map((anime) => <AnimeCard key={anime.id} anime={anime} />)}</div>
          ) : (
            <>
              {refreshing && <div className={styles.refreshLine} aria-hidden="true" />}
              <div className="anime-grid">{catalogLead.map((anime) => <AnimeCard key={anime.id} anime={anime} discoveryMatch={discoveryIntent?.isDiscovery ? smartDiscoveryMatch(anime, discoveryIntent, { seed: discoverySeedForMatch, tasteGraph }) : null} />)}</div>
              {showCatalogAd && <div className="catalog-ad-break" aria-label="Рекламная пауза"><AdSlot placement="catalog-after-results" format="horizontal" className="monetization-ad--catalog" /></div>}
              {catalogTail.length > 0 && <div className="anime-grid anime-grid--after-ad">{catalogTail.map((anime) => <AnimeCard key={anime.id} anime={anime} discoveryMatch={discoveryIntent?.isDiscovery ? smartDiscoveryMatch(anime, discoveryIntent, { seed: discoverySeedForMatch, tasteGraph }) : null} />)}</div>}
            </>
          )
        ) : (
          <div className={`empty-state ${styles.assetEmpty}`}>
            <img className={styles.emptyMascot} src={view === 'saved' ? '/brand/illustrations/empty-favorites.webp' : '/brand/illustrations/empty-search.webp'} alt="" aria-hidden="true" />
            <strong>{view === 'saved' ? favorites.length === 0 ? 'Сохранённых пока нет' : 'Ничего не подходит под фильтры' : discoveryIntent?.isDiscovery ? 'Точных совпадений не нашли' : 'Ничего не найдено'}</strong>
            <span>{view === 'saved' ? favorites.length === 0 ? 'Добавляй тайтлы в избранное — они появятся здесь.' : 'Попробуй убрать часть жанров, год или статус.' : discoveryIntent?.similarTo && discoveryMeta?.meta?.seedResolved === false ? `Не удалось уверенно распознать «${discoveryIntent.similarTo}». Попробуй другое написание.` : 'Попробуй изменить запрос, фильтры или настроение.'}</span>
            <div className={styles.emptyActions}>
              {view === 'catalog' && discoveryIntent?.isDiscovery && closestQuery && closestQuery !== query && <button type="button" onClick={() => applySearchQuery(closestQuery)}>Показать ближайшие</button>}
              {(query || hasFilters) && <button type="button" className={styles.secondaryAction} onClick={() => { clearStructuredFilters(); setSelectedMood('any'); applySearchQuery(''); }}>Очистить</button>}
            </div>
          </div>
        )}

        {view === 'catalog' && !loading && results.length > 0 && !discoveryIntent?.isDiscovery && (
          <div className="pagination"><button type="button" disabled={page === 1} onClick={() => setPageState({ query, page: Math.max(1, page - 1) })}>← Назад</button><span>Страница {page}</span><button type="button" disabled={!hasNextPage} onClick={() => setPageState({ query, page: page + 1 })}>Вперёд →</button></div>
        )}
      </section>
    </div>
  );
}
