'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import AnimeCard from '@/components/AnimeCard';
import AnimeImage from '@/components/AnimeImage';
import AnimeBoxLoader from '@/components/ui/AnimeBoxLoader';
import PlaceholderIcon from '@/components/ui/PlaceholderIcon';
import Icon from '@/components/Icon';
import MoodFilter from '@/components/catalog/MoodFilter';
import CatalogFilterPanel from '@/components/catalog/CatalogFilterPanel';
import CatalogMobileFilters from '@/components/catalog/CatalogMobileFilters';
import ActiveCatalogFilters, { catalogActiveFilterLabels } from '@/components/catalog/ActiveCatalogFilters';
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
import {
  animeTaxonomyValueMatches,
  findAnimeGenre,
  findAnimeTag,
} from '@/lib/anime-taxonomy';
import {
  CATALOG_DEMOGRAPHICS,
  CATALOG_DISCOVERY_FILTERS,
  CATALOG_STUDIOS,
  DEFAULT_CATALOG_FILTERS,
  catalogFilterCount,
  catalogFiltersAreDefault,
  catalogFiltersEqual,
  catalogFiltersToProviderOptions,
  parseCatalogFiltersFromSearchParams,
  writeCatalogFiltersToUrl,
  type CatalogFiltersState,
} from '@/lib/catalog-filter-state';
import { formatCatalogSeason, monthToCatalogSeason } from '@/lib/catalog-season';
import styles from './SearchCatalogClient.module.css';

const SEARCH_DEBOUNCE_MS = 120;

type DiscoveryMeta = Pick<SmartDiscoveryResponse, 'seed' | 'meta'>;
type CatalogView = 'catalog' | 'saved';

function seedTitle(seed: SmartDiscoveryResponse['seed']) {
  if (!seed) return '';
  return seed.russian || seed.title?.russian || seed.title?.english || seed.title?.romaji || 'Аниме';
}
function normalizedText(value: string) {
  return value.toLocaleLowerCase('ru-RU').replace(/ё/g, 'е').trim();
}
function favoriteMatchesGenre(anime: Anime, genreValue: string) {
  const genre = findAnimeGenre(genreValue);
  return genre ? animeTaxonomyValueMatches(anime.genres, genre) : true;
}
function favoriteMatchesTag(anime: Anime, tagValue: string) {
  const tag = findAnimeTag(tagValue);
  return tag ? animeTaxonomyValueMatches(anime.tags, tag) : true;
}
function favoriteMatchesStudio(anime: Anime, studioName: string) {
  const expected = normalizedText(studioName);
  const studios = Array.isArray(anime.studios) ? anime.studios : [];
  return studios.some((studio: { name?: unknown }) =>
    typeof studio?.name === 'string' && normalizedText(studio.name) === expected,
  );
}

export default function SearchCatalogClient({
  initialResults,
  initialQuery = '',
  initialView = 'catalog',
  initialFilters = DEFAULT_CATALOG_FILTERS,
}: {
  initialResults: Anime[];
  initialQuery?: string;
  initialView?: CatalogView;
  initialFilters?: CatalogFiltersState;
}) {
  const normalizedInitialQuery = initialQuery.trim();
  const [view, setView] = useState<CatalogView>(initialView);
  const [liveQuery, setLiveQuery] = useState(normalizedInitialQuery);
  const [query, setQuery] = useState(normalizedInitialQuery);
  const liveQueryRef = useRef(liveQuery);
  const requestSequenceRef = useRef(0);
  const filterHistoryModeRef = useRef<'replace' | 'push' | 'restore' | 'none'>('replace');
  const emptyResultSignatureRef = useRef('');
  const searchIntent = useMemo(() => (query ? parseAnimeSearchIntent(query) : null), [query]);
  const discoveryIntent = useMemo(() => (query ? parseSmartDiscoveryQuery(query) : null), [query]);
  const discoveryDescription = useMemo(() => (discoveryIntent?.isDiscovery ? describeSmartDiscoveryIntent(discoveryIntent) : []), [discoveryIntent]);
  const discoveryChips = useMemo(() => (discoveryIntent?.isDiscovery ? discoveryConstraintChips(discoveryIntent) : []), [discoveryIntent]);

  const [filters, setFilters] = useState<CatalogFiltersState>(initialFilters);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selectedMood, setSelectedMood] = useState<CatalogMood>('any');
  const [favorites, setFavorites] = useState<Anime[]>([]);
  const [tasteGraph, setTasteGraph] = useState<TasteGraph | null>(() => readCachedTasteGraph());
  const [results, setResults] = useState<Anime[]>(initialResults);
  const [loading, setLoading] = useState(initialView === 'catalog' && (Boolean(normalizedInitialQuery) || initialResults.length === 0));
  const [error, setError] = useState('');
  const [retryNonce, setRetryNonce] = useState(0);
  const [discoveryMeta, setDiscoveryMeta] = useState<DiscoveryMeta | null>(null);
  const [pageState, setPageState] = useState({ query, page: 1 });
  const page = pageState.query === query ? pageState.page : 1;
  const initialRenderRef = useRef(true);
  const [hasNextPage, setHasNextPage] = useState(initialResults.length >= CATALOG_PAGE_SIZE);

  useEffect(() => { liveQueryRef.current = liveQuery; }, [liveQuery]);


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
      if (!query && catalogFiltersAreDefault(filters) && selectedMood === 'any' && page === 1 && initialResults.length > 0) {
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
        if (query && discoveryIntent?.isDiscovery && page === 1 && catalogFiltersAreDefault(filters)) {
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
          const providerFilters = catalogFiltersToProviderOptions(filters);
          const data = await getAnimes({
            search: query || undefined,
            page,
            limit: CATALOG_PAGE_SIZE,
            order: providerFilters.order,
            genres: providerFilters.genres.length > 0 ? providerFilters.genres : undefined,
            tags: providerFilters.tags.length > 0 ? providerFilters.tags : undefined,
            year: providerFilters.year,
            status: providerFilters.status,
            format: providerFilters.format,
            season: providerFilters.season,
            studioNames: providerFilters.studioNames.length > 0 ? providerFilters.studioNames : undefined,
            mood: selectedMood,
          }, { signal: controller.signal });
          if (controller.signal.aborted || requestId !== requestSequenceRef.current) return;
          setResults(data);
          setDiscoveryMeta(null);
          setHasNextPage(data.length === CATALOG_PAGE_SIZE);
        }
      } catch (loadError: unknown) {
        if (isAbortError(loadError) || controller.signal.aborted || requestId !== requestSequenceRef.current) return;
        setDiscoveryMeta(null);
        setError('Не удалось обновить каталог. Показываем последние доступные результаты.');
      } finally {
        if (!controller.signal.aborted && requestId === requestSequenceRef.current) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [discoveryIntent, filters, initialResults, page, query, retryNonce, selectedMood, tasteGraph, view]);

  useEffect(() => {
    const mode = filterHistoryModeRef.current;

    if (mode === 'restore') {
      filterHistoryModeRef.current = 'none';
      return;
    }

    const url = writeCatalogFiltersToUrl(new URL(window.location.href), filters);
    const nextUrl = `${url.pathname}${url.search}${url.hash}`;
    const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;

    if (nextUrl !== currentUrl) {
      if (mode === 'push') {
        window.history.pushState(window.history.state, '', nextUrl);
      } else {
        window.history.replaceState(window.history.state, '', nextUrl);
      }
    }

    filterHistoryModeRef.current = 'none';
  }, [filters]);

  useEffect(() => {
    const onPopState = () => {
      filterHistoryModeRef.current = 'restore';
      setFilters(parseCatalogFiltersFromSearchParams(new URL(window.location.href).searchParams));
      setPageState({ query: liveQueryRef.current.trim(), page: 1 });
    };

    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

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
  function commitFilters(next: CatalogFiltersState) {
    if (catalogFiltersEqual(filters, next)) return;
    filterHistoryModeRef.current = 'push';
    setFilters(next);
    setPageState({ query, page: 1 });
  }

  function clearStructuredFilters() {
    if (catalogFiltersAreDefault(filters)) return;
    trackProductClientEvent('catalog_filters_cleared', {
      source: 'catalog',
      path: '/search',
      entityType: 'catalog_filters',
      entityId: 'all',
      metadata: { active_filter_count: catalogFilterCount(filters) },
    });
    commitFilters(DEFAULT_CATALOG_FILTERS);
  }

  function trackCatalogFilterChange(filter: string, value: string) {
    trackProductClientEvent(
      filter === 'sort' ? 'catalog_sort_changed' : 'catalog_filter_changed',
      {
        source: 'catalog',
        path: '/search',
        entityType: 'catalog_filter',
        entityId: filter,
        metadata: {
          filter,
          value,
          active_filter_count: catalogFilterCount(filters),
        },
      },
    );
  }

  function toggleFiltersPanel() {
    const next = !filtersOpen;
    setFiltersOpen(next);
    if (next) {
      trackProductClientEvent('catalog_filter_panel_opened', {
        source: 'catalog',
        path: '/search',
        entityType: 'surface',
        entityId: 'catalog_filters',
        metadata: { active_filter_count: catalogFilterCount(filters) },
      });
    }
  }

  const savedResults = useMemo(() => {
    const normalizedQuery = normalizedText(query);
    return favorites.filter((anime) => {
      if (normalizedQuery) {
        const title = normalizedText([getAnimeTitle(anime), anime.title?.romaji, anime.title?.english, anime.title?.native].filter(Boolean).join(' '));
        if (!title.includes(normalizedQuery)) return false;
      }
      const demographicTags = filters.demographics.flatMap<string>((id) => {
        const option = CATALOG_DEMOGRAPHICS.find((item) => item.id === id);
        return option ? [option.providerTag] : [];
      });
      if (demographicTags.length > 0 && !demographicTags.some((tag) => favoriteMatchesTag(anime, tag))) return false;

      for (const id of filters.discovery) {
        const option = CATALOG_DISCOVERY_FILTERS.find((item) => item.id === id);
        if (!option) continue;
        if (option.provider === 'genre' && !favoriteMatchesGenre(anime, option.value)) return false;
        if (option.provider === 'tag' && !favoriteMatchesTag(anime, option.value)) return false;
      }

      const studioNames = filters.studios.flatMap<string>((id) => {
        const studio = CATALOG_STUDIOS.find((item) => item.id === id);
        return studio ? [studio.providerName] : [];
      });
      if (studioNames.length > 0 && !studioNames.every((studio) => favoriteMatchesStudio(anime, studio))) return false;

      if (filters.season && Number(anime.startDate?.year ?? 0) !== filters.season.year) return false;
      if (filters.status === 'ongoing' && !isAnimeOngoing(anime)) return false;
      if (filters.status === 'finished' && isAnimeOngoing(anime)) return false;
      if (filters.status === 'upcoming' && normalizedText(String(anime.status ?? '')) !== 'анонс') return false;

      if (filters.format) {
        const expectedFormat = ({
          TV: ['тв', 'tv'],
          MOVIE: ['фильм', 'movie'],
          OVA: ['ova'],
          ONA: ['ona'],
          SPECIAL: ['спешл', 'special'],
        } as const)[filters.format];
        const actualFormat = normalizedText(String(anime.format ?? ''));
        if (!expectedFormat.some((value) => actualFormat === value)) return false;
      }

      if (filters.season) {
        const actualSeason = monthToCatalogSeason(Number(anime.startDate?.month ?? 0));
        if (actualSeason !== filters.season.season) return false;
      }

      return true;
    });
  }, [favorites, filters, query]);

  const hasStructuredFilters = !catalogFiltersAreDefault(filters);
  const hasFilters = hasStructuredFilters || (view === 'catalog' && selectedMood !== 'any');
  const filterCount = catalogFilterCount(filters);
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
  const activeFilterLabels = useMemo(() => catalogActiveFilterLabels(filters), [filters]);
  const relaxationActions = useMemo(() => {
    const actions: Array<{ label: string; next: CatalogFiltersState }> = [];

    const lastStudio = filters.studios.at(-1);
    if (lastStudio) {
      const studio = CATALOG_STUDIOS.find((item) => item.id === lastStudio);
      actions.push({
        label: `Убрать ${studio?.label ?? 'студию'}`,
        next: { ...filters, studios: filters.studios.filter((id) => id !== lastStudio) },
      });
    }

    if (filters.season) {
      actions.push({
        label: `Убрать ${formatCatalogSeason(filters.season)}`,
        next: { ...filters, season: null },
      });
    }

    const lastDiscovery = filters.discovery.at(-1);
    if (lastDiscovery) {
      const option = CATALOG_DISCOVERY_FILTERS.find((item) => item.id === lastDiscovery);
      actions.push({
        label: `Убрать ${option?.label ?? 'тему'}`,
        next: { ...filters, discovery: filters.discovery.filter((id) => id !== lastDiscovery) },
      });
    }

    const lastDemographic = filters.demographics.at(-1);
    if (lastDemographic) {
      const option = CATALOG_DEMOGRAPHICS.find((item) => item.id === lastDemographic);
      actions.push({
        label: `Убрать ${option?.label ?? 'демографию'}`,
        next: { ...filters, demographics: filters.demographics.filter((id) => id !== lastDemographic) },
      });
    }

    if (filters.format) actions.push({ label: 'Убрать формат', next: { ...filters, format: null } });
    if (filters.status) actions.push({ label: 'Убрать статус', next: { ...filters, status: null } });

    return actions.slice(0, 2);
  }, [filters]);

  useEffect(() => {
    if (
      view !== 'catalog' ||
      loading ||
      error ||
      results.length > 0 ||
      (!query && !hasFilters)
    ) {
      if (results.length > 0) emptyResultSignatureRef.current = '';
      return;
    }

    const signature = JSON.stringify({
      query,
      filters,
      mood: selectedMood,
    });
    if (emptyResultSignatureRef.current === signature) return;
    emptyResultSignatureRef.current = signature;

    trackProductClientEvent('catalog_empty_result', {
      source: 'catalog',
      path: '/search',
      entityType: 'catalog_filters',
      entityId: query || 'filters',
      metadata: {
        query: query || null,
        active_filters: activeFilterLabels,
        mood: selectedMood,
      },
    });
  }, [activeFilterLabels, error, filters, hasFilters, loading, query, results.length, selectedMood, view]);

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
        <button type="button" className={`${styles.filterToggle} ${filtersOpen || filterCount > 0 ? styles.filterToggleActive : ''}`} aria-expanded={filtersOpen} onClick={toggleFiltersPanel}>
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="2" fill="currentColor" stroke="none"/><circle cx="16" cy="17" r="2" fill="currentColor" stroke="none"/></svg>Фильтры{filterCount > 0 ? <b>{filterCount}</b> : null}
        </button>
      </div>

      {filtersOpen && (
        <>
          <CatalogFilterPanel
            filters={filters}
            onChange={commitFilters}
            onClear={clearStructuredFilters}
            onFilterChange={trackCatalogFilterChange}
          />
          <CatalogMobileFilters
            filters={filters}
            onChange={commitFilters}
            onClear={clearStructuredFilters}
            onDone={() => setFiltersOpen(false)}
            onFilterChange={trackCatalogFilterChange}
          />
        </>
      )}

      <ActiveCatalogFilters
        filters={filters}
        onChange={commitFilters}
        onClear={clearStructuredFilters}
        onRemoved={(filter, value) => {
          trackProductClientEvent('catalog_filter_removed', {
            source: 'catalog',
            path: '/search',
            entityType: 'catalog_filter',
            entityId: filter,
            metadata: { filter, value, active_filter_count: filterCount },
          });
        }}
      />

      <section className={`section ${styles.catalogResults}`} aria-busy={displayLoading}>
        <div className="section-head">
          <h2 className="section-title">{view === 'saved' ? 'Сохранённые' : liveQuery.trim() || hasFilters ? 'Результаты' : 'Популярное'}</h2>
          <span className="section-link">{view === 'saved' ? `${displayResults.length} сохранено` : refreshing ? 'Ищем…' : `Страница ${page}`}</span>
        </div>

        {view === 'catalog' && error && results.length > 0 && (
          <div className={styles.staleNotice} role="status">
            <span>{error}</span>
            <button type="button" onClick={() => setRetryNonce((current) => current + 1)}>Повторить</button>
          </div>
        )}

        {displayLoading && results.length === 0 ? (
          <div><AnimeBoxLoader label="Подбираем аниме…" size={46} /><div className="loading-grid" aria-hidden="true">{Array.from({ length: 10 }).map((_, index) => <div key={index} className="skeleton skeleton--card" />)}</div></div>
        ) : view === 'catalog' && error && results.length === 0 ? (
          <div className={`empty-state ${styles.assetEmpty}`}>
            <span className={styles.emptyMascot} aria-hidden="true"><Icon name="search" size={42} /></span>
            <strong>Не удалось загрузить результаты</strong>
            <span>{error}</span>
            <div className={styles.emptyActions}>
              <button type="button" onClick={() => setRetryNonce((current) => current + 1)}>Повторить</button>
            </div>
          </div>
        ) : displayResults.length ? (
          <div className={refreshing ? styles.resultsRefreshing : styles.resultsStable}>
            {view === 'saved' ? (
              <div className="anime-grid">{savedResults.map((anime) => <AnimeCard key={anime.id} anime={anime} />)}</div>
            ) : (
              <>
                {refreshing && <div className={styles.refreshLine} aria-hidden="true" />}
                <div className="anime-grid">{catalogLead.map((anime) => <AnimeCard key={anime.id} anime={anime} discoveryMatch={discoveryIntent?.isDiscovery ? smartDiscoveryMatch(anime, discoveryIntent, { seed: discoverySeedForMatch, tasteGraph }) : null} />)}</div>
                {showCatalogAd && <div className="catalog-ad-break" aria-label="Рекламная пауза"><AdSlot placement="catalog-after-results" format="horizontal" className="monetization-ad--catalog" /></div>}
                {catalogTail.length > 0 && <div className="anime-grid anime-grid--after-ad">{catalogTail.map((anime) => <AnimeCard key={anime.id} anime={anime} discoveryMatch={discoveryIntent?.isDiscovery ? smartDiscoveryMatch(anime, discoveryIntent, { seed: discoverySeedForMatch, tasteGraph }) : null} />)}</div>}
              </>
            )}
          </div>
        ) : (
          <div className={`empty-state ${styles.assetEmpty}`}>
            <PlaceholderIcon className={styles.emptyMascot} variant={view === 'saved' ? 'saved' : 'search'} />
            <strong>{view === 'saved' ? favorites.length === 0 ? 'Сохранённых пока нет' : 'Ничего не подходит под фильтры' : discoveryIntent?.isDiscovery ? 'Точных совпадений не нашли' : hasStructuredFilters ? 'Под такую подборку ничего не нашли' : 'Ничего не найдено'}</strong>
            <span>
              {view === 'saved'
                ? favorites.length === 0
                  ? 'Добавляй тайтлы в избранное — они появятся здесь.'
                  : 'Попробуй убрать часть тегов, студию, сезон или статус.'
                : discoveryIntent?.similarTo && discoveryMeta?.meta?.seedResolved === false
                  ? `Не удалось уверенно распознать «${discoveryIntent.similarTo}». Попробуй другое написание.`
                  : activeFilterLabels.length > 0
                    ? `${activeFilterLabels.join(' · ')}. Попробуй немного расширить условия.`
                    : 'Попробуй изменить запрос, фильтры или настроение.'}
            </span>
            <div className={styles.emptyActions}>
              {view === 'catalog' && relaxationActions.map((action) => (
                <button
                  key={action.label}
                  type="button"
                  onClick={() => {
                    trackProductClientEvent('catalog_filter_removed', {
                      source: 'catalog',
                      path: '/search',
                      entityType: 'catalog_filter',
                      entityId: 'empty_state_relax',
                      metadata: { label: action.label },
                    });
                    commitFilters(action.next);
                  }}
                >
                  {action.label}
                </button>
              ))}
              {view === 'catalog' && discoveryIntent?.isDiscovery && closestQuery && closestQuery !== query && <button type="button" onClick={() => applySearchQuery(closestQuery)}>Показать ближайшие</button>}
              {(query || hasFilters) && <button type="button" className={styles.secondaryAction} onClick={() => { clearStructuredFilters(); setSelectedMood('any'); applySearchQuery(''); }}>Сбросить всё</button>}
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
