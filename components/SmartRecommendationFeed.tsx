'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import SmartRecommendationCard from '@/components/SmartRecommendationCard';
import ScrollRow from '@/components/ui/ScrollRow';
import type { TasteMood } from '@/lib/personalization';
import {
  getPersonalizedRecommendations,
  type RankedRecommendation,
} from '@/lib/recommendations';
import type { RecommendationPage } from '@/types/recommendations';
import { buildRecommendationRails } from '@/lib/recommendation-rails';
import { readCachedTasteGraph } from '@/lib/taste-graph';

const PAGE_SIZE = 20;
const MAX_EMPTY_PAGE_HOPS = 3;
const CLIENT_PAGE_CACHE_TTL_MS = 15 * 60 * 1000;
const CLIENT_PAGE_CACHE_PREFIX = 'animebox:recommendation-page:v5:';
const MAX_SESSION_CACHE_ENTRIES = 14;
const MOOD_SWAP_FADE_OUT_MS = 135;

type CachedPage = {
  expiresAt: number;
  data: RecommendationPage;
};

type CandidateContext = {
  genre: string | null;
  mood: TasteMood;
};

/* Shared by every SmartRecommendationFeed mount in the current tab. */
const memoryPageCache = new Map<string, CachedPage>();
const inFlightPageRequests = new Map<string, Promise<RecommendationPage>>();

function createSessionId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }

  return `rec-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function stableHash(value: string): number {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }

  return hash;
}

function getSessionBucket(sessionId: string): number {
  return stableHash(sessionId) % 4;
}

function getCandidateContext(mood: TasteMood): CandidateContext {
  const graph = readCachedTasteGraph();
  const genre = graph?.topGenres[0]?.trim().slice(0, 64) || null;

  return { genre, mood };
}

function candidateContextKey(context: CandidateContext): string {
  return `${context.mood}:${stableHash(context.genre ?? 'none')}`;
}

function pageCacheKey(
  page: number,
  bucket: number,
  context: CandidateContext,
): string {
  return `${CLIENT_PAGE_CACHE_PREFIX}${bucket}:${candidateContextKey(context)}:${PAGE_SIZE}:${page}`;
}

function readSessionPage(key: string): RecommendationPage | null {
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as CachedPage;

    if (
      !parsed ||
      typeof parsed.expiresAt !== 'number' ||
      parsed.expiresAt <= Date.now() ||
      !parsed.data ||
      !Array.isArray(parsed.data.items)
    ) {
      window.sessionStorage.removeItem(key);
      return null;
    }

    return parsed.data;
  } catch {
    return null;
  }
}

function trimSessionPageCache(): void {
  if (typeof window === 'undefined') return;

  try {
    const keys: Array<{ key: string; expiresAt: number }> = [];

    for (let index = 0; index < window.sessionStorage.length; index += 1) {
      const key = window.sessionStorage.key(index);
      if (!key?.startsWith(CLIENT_PAGE_CACHE_PREFIX)) continue;

      try {
        const raw = window.sessionStorage.getItem(key);
        const parsed = raw ? (JSON.parse(raw) as CachedPage) : null;
        keys.push({
          key,
          expiresAt: parsed?.expiresAt ?? 0,
        });
      } catch {
        keys.push({ key, expiresAt: 0 });
      }
    }

    keys
      .sort((a, b) => b.expiresAt - a.expiresAt)
      .slice(MAX_SESSION_CACHE_ENTRIES)
      .forEach(({ key }) => window.sessionStorage.removeItem(key));
  } catch {
    // Safari/private mode can reject storage access. Network cache still works.
  }
}

function writeCachedPage(key: string, data: RecommendationPage): void {
  const cached: CachedPage = {
    expiresAt: Date.now() + CLIENT_PAGE_CACHE_TTL_MS,
    data,
  };

  memoryPageCache.set(key, cached);

  if (memoryPageCache.size > MAX_SESSION_CACHE_ENTRIES * 2) {
    const oldestKey = memoryPageCache.keys().next().value as string | undefined;
    if (oldestKey) memoryPageCache.delete(oldestKey);
  }

  if (typeof window === 'undefined') return;

  try {
    window.sessionStorage.setItem(key, JSON.stringify(cached));
    trimSessionPageCache();
  } catch {
    // Cache is an optimization only. Never break recommendations for storage errors.
  }
}

function readCachedPage(key: string): RecommendationPage | null {
  const memory = memoryPageCache.get(key);

  if (memory) {
    if (memory.expiresAt > Date.now()) {
      return memory.data;
    }

    memoryPageCache.delete(key);
  }

  const session = readSessionPage(key);
  if (session) {
    memoryPageCache.set(key, {
      expiresAt: Date.now() + CLIENT_PAGE_CACHE_TTL_MS,
      data: session,
    });
  }

  return session;
}

async function loadCandidatePage(
  page: number,
  bucket: number,
  context: CandidateContext,
): Promise<RecommendationPage> {
  const key = pageCacheKey(page, bucket, context);
  const cached = readCachedPage(key);

  if (cached) {
    return cached;
  }

  const existingRequest = inFlightPageRequests.get(key);
  if (existingRequest) {
    return existingRequest;
  }

  const params = new URLSearchParams({
    page: String(page),
    limit: String(PAGE_SIZE),
    bucket: String(bucket),
    mood: context.mood,
  });

  if (context.genre) {
    params.set('genre', context.genre);
  }

  const request = fetch(`/api/recommendations?${params.toString()}`, {
    method: 'GET',
    cache: 'default',
    headers: {
      Accept: 'application/json',
    },
  })
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(`Recommendation HTTP ${response.status}`);
      }

      const data = (await response.json()) as RecommendationPage;
      writeCachedPage(key, data);
      return data;
    })
    .finally(() => {
      inFlightPageRequests.delete(key);
    });

  inFlightPageRequests.set(key, request);
  return request;
}

function prefetchCandidatePage(
  page: number,
  bucket: number,
  context: CandidateContext,
): void {
  const key = pageCacheKey(page, bucket, context);
  if (readCachedPage(key) || inFlightPageRequests.has(key)) return;

  void loadCandidatePage(page, bucket, context).catch(() => {
    // Silent prefetch failure: the real fetch still has normal retry UI.
  });
}

function mergeUnique(
  previous: RankedRecommendation[],
  incoming: RankedRecommendation[],
): RankedRecommendation[] {
  const map = new Map<number, RankedRecommendation>();

  for (const item of previous) {
    map.set(item.anime.id, item);
  }

  for (const item of incoming) {
    map.set(item.anime.id, item);
  }

  return [...map.values()];
}

export default function SmartRecommendationFeed({
  items,
  mood,
  hasWatchHistory,
}: {
  items: RankedRecommendation[];
  mood: TasteMood;
  hasWatchHistory: boolean;
}) {
  const fetchLockRef = useRef(false);
  const previousMoodRef = useRef(mood);
  const pendingItemsRef = useRef(items);
  const moodTransitionRef = useRef(false);
  const transitionTokenRef = useRef(0);
  const transitionTimerRef = useRef<number | null>(null);
  const revealFrameARef = useRef<number | null>(null);
  const revealFrameBRef = useRef<number | null>(null);

  const [sessionId, setSessionId] = useState(() => createSessionId());
  const [displayedMood, setDisplayedMood] = useState<TasteMood>(mood);
  const [isMoodSwapping, setIsMoodSwapping] = useState(false);
  const [rowVersion, setRowVersion] = useState(0);
  const [recommendations, setRecommendations] =
    useState<RankedRecommendation[]>(items);
  const [locallyHidden, setLocallyHidden] =
    useState<Set<number>>(() => new Set());
  const [page, setPage] = useState(2);
  const [hasMore, setHasMore] = useState(true);
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const [error, setError] = useState('');

  const bucket = useMemo(() => getSessionBucket(sessionId), [sessionId]);

  const initialSignature = useMemo(
    () => items.map(({ anime }) => anime.id).join(','),
    [items],
  );

  /*
   * Mood changes used to replace/sort the entire row in one React render.
   * That makes every card teleport to a new position and looks like a layout
   * glitch. Keep the old row mounted for a tiny fade-out, swap while hidden,
   * remount ScrollRow at scrollLeft=0, then reveal the new ranking.
   *
   * Extra taste/history updates that arrive during the transition only update
   * pendingItemsRef; they do NOT mutate the visible old row mid-animation.
   */
  useEffect(() => {
    pendingItemsRef.current = items;

    if (previousMoodRef.current !== mood) {
      previousMoodRef.current = mood;
      moodTransitionRef.current = true;

      transitionTokenRef.current += 1;
      const token = transitionTokenRef.current;

      if (transitionTimerRef.current !== null) {
        window.clearTimeout(transitionTimerRef.current);
      }
      if (revealFrameARef.current !== null) {
        window.cancelAnimationFrame(revealFrameARef.current);
      }
      if (revealFrameBRef.current !== null) {
        window.cancelAnimationFrame(revealFrameBRef.current);
      }

      setIsMoodSwapping(true);

      const reducedMotion = window.matchMedia?.(
        '(prefers-reduced-motion: reduce)',
      ).matches;

      transitionTimerRef.current = window.setTimeout(() => {
        if (transitionTokenRef.current !== token) return;

        setSessionId(createSessionId());
        setDisplayedMood(mood);
        setRecommendations(pendingItemsRef.current);
        setLocallyHidden(new Set());
        setPage(2);
        setHasMore(true);
        setError('');

        // Remounting only the horizontal row resets scrollLeft while it is
        // invisible, so there is no visible sideways snap.
        setRowVersion((version) => version + 1);

        revealFrameARef.current = window.requestAnimationFrame(() => {
          revealFrameBRef.current = window.requestAnimationFrame(() => {
            if (transitionTokenRef.current !== token) return;

            setIsMoodSwapping(false);
            moodTransitionRef.current = false;
          });
        });
      }, reducedMotion ? 0 : MOOD_SWAP_FADE_OUT_MS);

      return;
    }

    if (moodTransitionRef.current) {
      return;
    }

    setRecommendations((current) => mergeUnique(current, items));
  }, [initialSignature, items, mood]);

  useEffect(() => {
    return () => {
      transitionTokenRef.current += 1;

      if (transitionTimerRef.current !== null) {
        window.clearTimeout(transitionTimerRef.current);
      }
      if (revealFrameARef.current !== null) {
        window.cancelAnimationFrame(revealFrameARef.current);
      }
      if (revealFrameBRef.current !== null) {
        window.cancelAnimationFrame(revealFrameBRef.current);
      }
    };
  }, []);

  /* Warm exactly one page ahead, but keep it outside the LCP window.
     The first recommendation batch is already present, so this request is
     speculative and should never compete with the hero on slow mobile data. */
  useEffect(() => {
    const timer = window.setTimeout(() => {
      prefetchCandidatePage(
        page,
        bucket,
        getCandidateContext(displayedMood),
      );
    }, 5_000);

    return () => window.clearTimeout(timer);
  }, [bucket, displayedMood, page]);

  const filtered = useMemo(
    () => recommendations.filter(({ anime }) => !locallyHidden.has(anime.id)),
    [locallyHidden, recommendations],
  );

  const rails = useMemo(
    () =>
      buildRecommendationRails(filtered, {
        mood: displayedMood,
        hasWatchHistory,
        hasMore,
      }),
    [displayedMood, filtered, hasMore, hasWatchHistory],
  );

  const fetchNextPage = useCallback(async () => {
    if (fetchLockRef.current || !hasMore || moodTransitionRef.current) return;

    fetchLockRef.current = true;
    setIsFetchingMore(true);
    setError('');

    let cursor = page;
    let moreAvailable: boolean = hasMore;
    let appended = false;
    const candidateContext = getCandidateContext(displayedMood);

    try {
      /*
       * A page can legitimately contain only already-watched/hidden titles.
       * Hop over a few such pages in one request cycle so the sentinel cannot
       * get stuck at the end of an apparently empty row.
       */
      for (
        let attempt = 0;
        attempt < MAX_EMPTY_PAGE_HOPS && moreAvailable && !appended;
        attempt += 1
      ) {
        const data = await loadCandidatePage(
          cursor,
          bucket,
          candidateContext,
        );
        const ranked = getPersonalizedRecommendations(data.items, {
          mood: displayedMood,
          limit: PAGE_SIZE,
        });

        if (ranked.length > 0) {
          setRecommendations((current) => mergeUnique(current, ranked));
          appended = true;
        }

        moreAvailable = data.hasMore;
        cursor = data.nextPage ?? cursor + 1;
      }

      setPage(cursor);
      setHasMore(moreAvailable);

      /*
       * Prefetch only ONE next page. This hides latency without allowing an
       * IntersectionObserver to accidentally download the whole catalogue.
       */
      if (moreAvailable) {
        prefetchCandidatePage(cursor, bucket, candidateContext);
      }
    } catch (fetchError) {
      console.error('Recommendation pagination:', fetchError);
      setError('Не удалось догрузить рекомендации');
    } finally {
      fetchLockRef.current = false;
      setIsFetchingMore(false);
    }
  }, [bucket, displayedMood, hasMore, page]);

  if (filtered.length === 0 && !hasMore && !isFetchingMore) {
    return (
      <div className="smart-feed__empty">
        <strong>Подходящих тайтлов в этой подборке пока не осталось</strong>
        <span>
          Смени настроение или открой каталог — скрытые рекомендации больше не будут мешать выдаче.
        </span>
      </div>
    );
  }

  return (
    <div className="smart-feed">
      <div
        className={
          isMoodSwapping
            ? 'smart-feed__stage is-mood-swapping'
            : 'smart-feed__stage'
        }
        aria-busy={isMoodSwapping}
      >
        <div className="smart-feed__rails">
          {rails.map((rail) => (
            <section
              className="smart-feed__personal-rail"
              key={`${rail.id}:${rowVersion}`}
              aria-labelledby={`smart-feed-rail-${rail.id}`}
            >
              <header className="smart-feed__rail-heading">
                <div>
                  <div className="smart-feed__rail-titleline">
                    <span className="smart-feed__rail-badge">{rail.badge}</span>
                    <h3 id={`smart-feed-rail-${rail.id}`}>{rail.title}</h3>
                  </div>
                  <p>{rail.subtitle}</p>
                </div>
              </header>

              <ScrollRow
                className="smart-feed__rail"
                ariaLabel={rail.title}
                stepRatio={0.82}
                hasMore={rail.id === 'endless' ? hasMore : false}
                onEndReached={
                  rail.id === 'endless'
                    ? () => void fetchNextPage()
                    : undefined
                }
              >
                {rail.items.map((recommendation, index) => (
                  <div
                    className="smart-feed__slide"
                    key={`${rail.id}:${recommendation.anime.id}`}
                  >
                    <SmartRecommendationCard
                      recommendation={recommendation}
                      position={index + 1}
                      mood={displayedMood}
                      rowId={rail.id}
                      source={rail.source}
                      recommendationSessionId={sessionId}
                      onHidden={(animeId) => {
                        setLocallyHidden((current) => {
                          const next = new Set(current);
                          next.add(animeId);
                          return next;
                        });
                      }}
                    />
                  </div>
                ))}

                {isFetchingMore &&
                  rail.id === 'endless' &&
                  Array.from({ length: 4 }).map((_, index) => (
                    <div
                      className="smart-feed__slide smart-feed__slide--skeleton"
                      key={`smart-feed-skeleton-${index}`}
                      aria-hidden="true"
                    >
                      <div className="smart-feed__skeleton-card" />
                    </div>
                  ))}
              </ScrollRow>
            </section>
          ))}
        </div>
      </div>

      {error && (
        <button
          type="button"
          className="smart-feed__retry"
          onClick={() => void fetchNextPage()}
        >
          Повторить загрузку
        </button>
      )}
    </div>
  );
}
