'use client';

import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import SmartRecommendationCard from '@/components/SmartRecommendationCard';
import ScrollRow, {
  type ScrollRowVirtualMetrics,
} from '@/components/ui/ScrollRow';
import type { TasteMood } from '@/lib/personalization';
import {
  getPersonalizedRecommendations,
  type RankedRecommendation,
} from '@/lib/recommendations';
import type { RecommendationPage } from '@/types/recommendations';
import {
  buildRecommendationRailLayout,
  DEFAULT_RECOMMENDATION_RAIL_LIMIT,
  recommendationMatchesRail,
  recommendationMatchesRailRelaxed,
  RECOMMENDATION_RAIL_BATCH_SIZE,
  type RecommendationRail,
  type RecommendationRailId,
  type RecommendationRailLimits,
} from '@/lib/recommendation-rails';
import {
  readCachedTasteGraph,
  type TasteGraph,
} from '@/lib/taste-graph';
import { trackProductClientEvent } from '@/lib/product-events-client';

const PAGE_SIZE = 20;
const MAX_EMPTY_PAGE_HOPS = 6;
const STRICT_EMPTY_PAGE_HOPS = 3;
const CLIENT_PAGE_CACHE_TTL_MS = 15 * 60 * 1000;
const CLIENT_PAGE_CACHE_PREFIX = 'animebox:recommendation-page:v6:';
const MAX_SESSION_CACHE_ENTRIES = 14;
const MOOD_SWAP_FADE_OUT_MS = 135;
const RAIL_SKELETON_COUNT = 3;
const MAX_RAIL_DOM_ITEMS = 36;
const RAIL_VIRTUAL_OVERSCAN = 6;

type CachedPage = {
  expiresAt: number;
  data: RecommendationPage;
};

type CandidateContext = {
  genre: string | null;
  mood: TasteMood;
};

type CandidatePointer = {
  page: number;
  cursor: string | null;
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
  pointer: CandidatePointer,
  bucket: number,
  context: CandidateContext,
): string {
  const cursorKey = pointer.cursor
    ? `cursor-${stableHash(pointer.cursor)}`
    : `page-${pointer.page}`;

  return `${CLIENT_PAGE_CACHE_PREFIX}${bucket}:${candidateContextKey(context)}:${PAGE_SIZE}:${cursorKey}`;
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
  pointer: CandidatePointer,
  bucket: number,
  context: CandidateContext,
  signal?: AbortSignal,
): Promise<RecommendationPage> {
  const key = pageCacheKey(pointer, bucket, context);
  const cached = readCachedPage(key);

  if (cached) {
    return cached;
  }

  const existingRequest = inFlightPageRequests.get(key);
  if (existingRequest) {
    return existingRequest;
  }

  const params = new URLSearchParams({
    limit: String(PAGE_SIZE),
    bucket: String(bucket),
    mood: context.mood,
  });

  if (pointer.cursor) {
    params.set('cursor', pointer.cursor);
  } else {
    params.set('page', String(pointer.page));
  }

  if (context.genre) {
    params.set('genre', context.genre);
  }

  const request = fetch(`/api/recommendations?${params.toString()}`, {
    method: 'GET',
    cache: 'default',
    headers: {
      Accept: 'application/json',
    },
    signal,
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
  pointer: CandidatePointer,
  bucket: number,
  context: CandidateContext,
): void {
  const key = pageCacheKey(pointer, bucket, context);
  if (readCachedPage(key) || inFlightPageRequests.has(key)) return;

  void loadCandidatePage(pointer, bucket, context).catch(() => {
    // Silent prefetch failure: the real fetch still has normal retry UI.
  });
}

function mapsEqual<K, V>(
  left: ReadonlyMap<K, V>,
  right: ReadonlyMap<K, V>,
) {
  if (left.size !== right.size) return false;

  for (const [key, value] of left) {
    if (right.get(key) !== value) return false;
  }

  return true;
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
  const previousMoodRef = useRef(mood);
  const pendingItemsRef = useRef(items);
  const moodTransitionRef = useRef(false);
  const transitionTokenRef = useRef(0);
  const transitionTimerRef = useRef<number | null>(null);
  const revealFrameARef = useRef<number | null>(null);
  const revealFrameBRef = useRef<number | null>(null);
  const requestControllerRef = useRef<AbortController | null>(null);
  const requestGenerationRef = useRef(0);
  const sharedBatchPromiseRef = useRef<Promise<RankedRecommendation[]> | null>(null);
  const railLoadingRef = useRef<Set<RecommendationRailId>>(new Set());
  const railOwnershipRef = useRef<Map<number, RecommendationRailId>>(new Map());
  const [railOwnership, setRailOwnership] = useState<
    Map<number, RecommendationRailId>
  >(() => new Map());
  const railVirtualMetricsRef = useRef<Map<RecommendationRailId, ScrollRowVirtualMetrics>>(new Map());
  const consumedPointerKeysRef = useRef<Set<string>>(new Set());

  const [sessionId, setSessionId] = useState(() => createSessionId());
  const [displayedMood, setDisplayedMood] = useState<TasteMood>(mood);
  const [isMoodSwapping, setIsMoodSwapping] = useState(false);
  const [rowVersion, setRowVersion] = useState(0);
  const [recommendations, setRecommendations] =
    useState<RankedRecommendation[]>(items);
  const seenRecommendationIdsRef = useRef<Set<number>>(
    new Set(items.map(({ anime }) => anime.id)),
  );
  const [locallyHidden, setLocallyHidden] =
    useState<Set<number>>(() => new Set());
  const [pointer, setPointer] = useState<CandidatePointer>({
    page: 2,
    cursor: null,
  });
  const pointerRef = useRef<CandidatePointer>(pointer);
  const [hasMore, setHasMore] = useState(true);
  const hasMoreRef = useRef(true);
  const [railLimits, setRailLimits] =
    useState<RecommendationRailLimits>({});
  const [loadingRails, setLoadingRails] =
    useState<Set<RecommendationRailId>>(() => new Set());
  const [exhaustedRails, setExhaustedRails] =
    useState<Set<RecommendationRailId>>(() => new Set());
  const [railErrors, setRailErrors] =
    useState<Set<RecommendationRailId>>(() => new Set());
  const [tasteGraph, setTasteGraph] = useState<TasteGraph | null>(
    () => readCachedTasteGraph(),
  );

  const bucket = useMemo(() => getSessionBucket(sessionId), [sessionId]);

  const initialSignature = useMemo(
    () => items.map(({ anime }) => anime.id).join(','),
    [items],
  );

  const replacePointer = useCallback((next: CandidatePointer) => {
    pointerRef.current = next;
    setPointer(next);
  }, []);

  const replaceHasMore = useCallback((next: boolean) => {
    hasMoreRef.current = next;
    setHasMore(next);
  }, []);

  const resetRequestController = useCallback(() => {
    requestControllerRef.current?.abort();
    requestControllerRef.current = new AbortController();
    requestGenerationRef.current += 1;
    sharedBatchPromiseRef.current = null;
  }, []);

  useEffect(() => {
    pendingItemsRef.current = items;

    if (previousMoodRef.current !== mood) {
      previousMoodRef.current = mood;
      moodTransitionRef.current = true;
      resetRequestController();

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

        const nextItems = pendingItemsRef.current;
        setSessionId(createSessionId());
        setDisplayedMood(mood);
        setRecommendations(nextItems);
        seenRecommendationIdsRef.current = new Set(
          nextItems.map(({ anime }) => anime.id),
        );
        railOwnershipRef.current = new Map();
        setRailOwnership(new Map());
        railVirtualMetricsRef.current = new Map();
        consumedPointerKeysRef.current = new Set();
        railLoadingRef.current = new Set();
        setLocallyHidden(new Set());
        setRailLimits({});
        setLoadingRails(new Set());
        setExhaustedRails(new Set());
        setRailErrors(new Set());
        replacePointer({ page: 2, cursor: null });
        replaceHasMore(true);

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

    if (moodTransitionRef.current) return;

    const unseen = items.filter(
      ({ anime }) => !seenRecommendationIdsRef.current.has(anime.id),
    );
    if (unseen.length) {
      unseen.forEach(({ anime }) =>
        seenRecommendationIdsRef.current.add(anime.id),
      );
      setRecommendations((current) => mergeUnique(current, unseen));
    }
  }, [
    initialSignature,
    items,
    mood,
    replaceHasMore,
    replacePointer,
    resetRequestController,
  ]);

  useEffect(() => {
    const onTasteGraphUpdated = (event: Event) => {
      const next =
        (event as CustomEvent<TasteGraph>).detail ??
        readCachedTasteGraph();

      if (next) setTasteGraph(next);
    };

    window.addEventListener(
      'animebox-taste-graph-updated',
      onTasteGraphUpdated,
    );

    return () => {
      window.removeEventListener(
        'animebox-taste-graph-updated',
        onTasteGraphUpdated,
      );
    };
  }, []);

  useEffect(() => {
    if (!requestControllerRef.current) {
      requestControllerRef.current = new AbortController();
    }

    return () => {
      requestGenerationRef.current += 1;
      requestControllerRef.current?.abort();
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

  useEffect(() => {
    const timer = window.setTimeout(() => {
      prefetchCandidatePage(
        pointer,
        bucket,
        getCandidateContext(displayedMood),
      );
    }, 5_000);

    return () => window.clearTimeout(timer);
  }, [bucket, displayedMood, pointer]);

  const filtered = useMemo(
    () => recommendations.filter(({ anime }) => !locallyHidden.has(anime.id)),
    [locallyHidden, recommendations],
  );

  const railLayout = useMemo(
    () =>
      buildRecommendationRailLayout(filtered, {
        mood: displayedMood,
        hasWatchHistory,
        hasMore,
        limits: railLimits,
        ownership: railOwnership,
        tasteGraph,
      }),
    [
      displayedMood,
      filtered,
      hasMore,
      hasWatchHistory,
      railLimits,
      railOwnership,
      tasteGraph,
    ],
  );

  useEffect(() => {
    railOwnershipRef.current = railLayout.ownership;

    setRailOwnership((current) =>
      mapsEqual(current, railLayout.ownership)
        ? current
        : new Map(railLayout.ownership),
    );
  }, [railLayout.ownership]);

  const rails = railLayout.rails;

  const fetchNextCandidateBatch = useCallback(async () => {
    if (!hasMoreRef.current || moodTransitionRef.current) return [];

    const existing = sharedBatchPromiseRef.current;
    if (existing) return existing;

    if (!requestControllerRef.current || requestControllerRef.current.signal.aborted) {
      requestControllerRef.current = new AbortController();
    }

    const generation = requestGenerationRef.current;
    const candidateContext = getCandidateContext(displayedMood);
    const currentPointer = pointerRef.current;
    const signal = requestControllerRef.current.signal;
    const currentPointerKey = currentPointer.cursor
      ? `cursor:${currentPointer.cursor}`
      : `page:${currentPointer.page}`;

    if (consumedPointerKeysRef.current.has(currentPointerKey)) {
      replaceHasMore(false);
      return [];
    }

    const request: Promise<RankedRecommendation[]> = loadCandidatePage(
      currentPointer,
      bucket,
      candidateContext,
      signal,
    )
      .then((data) => {
        if (generation !== requestGenerationRef.current || signal.aborted) {
          return [];
        }

        const ranked = getPersonalizedRecommendations(data.items, {
          mood: displayedMood,
          limit: PAGE_SIZE,
          tasteGraph,
        });
        const fresh = ranked.filter(
          ({ anime }) => !seenRecommendationIdsRef.current.has(anime.id),
        );

        fresh.forEach(({ anime }) =>
          seenRecommendationIdsRef.current.add(anime.id),
        );

        if (fresh.length) {
          startTransition(() => {
            setRecommendations((current) => mergeUnique(current, fresh));
          });

          // A rail can be temporarily sparse for one cursor window. When
          // another page yields fresh candidates, let paused rails try again
          // instead of treating a temporary miss as a permanent end.
          setExhaustedRails((current) =>
            current.size > 0 ? new Set() : current,
          );
        }

        consumedPointerKeysRef.current.add(currentPointerKey);

        const nextPointer = {
          page: data.nextPage ?? currentPointer.page + 1,
          cursor: data.nextCursor ?? null,
        };
        const nextPointerKey = nextPointer.cursor
          ? `cursor:${nextPointer.cursor}`
          : `page:${nextPointer.page}`;
        const pointerAdvanced =
          nextPointerKey !== currentPointerKey &&
          !consumedPointerKeysRef.current.has(nextPointerKey);
        const nextHasMore = Boolean(data.hasMore && pointerAdvanced);

        replacePointer(nextPointer);
        replaceHasMore(nextHasMore);

        if (nextHasMore) {
          prefetchCandidatePage(nextPointer, bucket, candidateContext);
        }

        return fresh;
      })
      .finally(() => {
        if (sharedBatchPromiseRef.current === request) {
          sharedBatchPromiseRef.current = null;
        }
      });

    sharedBatchPromiseRef.current = request;
    return request;
  }, [bucket, displayedMood, replaceHasMore, replacePointer, tasteGraph]);

  const recordRailVirtualMetrics = useCallback(
    (railId: RecommendationRailId, metrics: ScrollRowVirtualMetrics) => {
      railVirtualMetricsRef.current.set(railId, metrics);
    },
    [],
  );

  const handleHiddenRecommendation = useCallback(
    (animeId: number) => {
      setLocallyHidden((current) => {
        const next = new Set(current);
        next.add(animeId);
        return next;
      });

      // hideRecommendation()/markRecommendationWatched() updates local taste
      // synchronously before this callback. Re-rank the already loaded pool so
      // "Не интересно" affects similar genres in the same session instead of
      // waiting for the next server Taste Graph refresh.
      startTransition(() => {
        setRecommendations((current) =>
          getPersonalizedRecommendations(
            current.map(({ anime }) => anime),
            {
              mood: displayedMood,
              limit: Math.max(PAGE_SIZE, current.length),
              tasteGraph,
            },
          ),
        );
      });
    },
    [displayedMood, tasteGraph],
  );

  const ensureRailDepth = useCallback(
    async (rail: RecommendationRail) => {
      if (
        moodTransitionRef.current ||
        !hasMoreRef.current ||
        railLoadingRef.current.has(rail.id) ||
        exhaustedRails.has(rail.id)
      ) {
        return;
      }

      railLoadingRef.current.add(rail.id);
      setLoadingRails((current) => {
        const next = new Set(current);
        next.add(rail.id);
        return next;
      });
      setRailErrors((current) => {
        if (!current.has(rail.id)) return current;
        const next = new Set(current);
        next.delete(rail.id);
        return next;
      });

      const currentLimit =
        railLimits[rail.id] ?? DEFAULT_RECOMMENDATION_RAIL_LIMIT;
      const itemsBefore = rail.items.length;
      const startPointer = pointerRef.current;

      const virtualMetrics = railVirtualMetricsRef.current.get(rail.id);

      trackProductClientEvent('recommendation_rail_end_reached', {
        source: rail.source,
        path: '/',
        entityType: 'recommendation_rail',
        entityId: rail.id,
        metadata: {
          row_id: rail.id,
          current_items: itemsBefore,
          page: startPointer.page,
          has_cursor: Boolean(startPointer.cursor),
          taste_confidence: tasteGraph?.confidence ?? null,
          exploration_rate: tasteGraph?.explorationRate ?? null,
          pool_size: filtered.length,
          rail_items: rail.items.length,
          rendered_items: virtualMetrics?.renderedItems ?? rail.items.length,
          virtualized: rail.items.length > MAX_RAIL_DOM_ITEMS,
        },
      });
      const targetLimit =
        Math.max(currentLimit, rail.items.length) +
        RECOMMENDATION_RAIL_BATCH_SIZE;

      setRailLimits((current) => ({
        ...current,
        [rail.id]: targetLimit,
      }));

      let remaining = Math.max(0, targetLimit - rail.items.length);
      let claimedForRail = 0;
      let pagesScanned = 0;

      const claimCandidates = (
        candidates: RankedRecommendation[],
        relaxed: boolean,
      ) => {
        if (remaining <= 0) return 0;

        let claimed = 0;

        for (const item of candidates) {
          if (remaining <= 0) break;
          if (railOwnershipRef.current.has(item.anime.id)) continue;

          const matches = relaxed
            ? recommendationMatchesRailRelaxed(item, rail)
            : recommendationMatchesRail(item, rail);

          if (!matches) continue;

          // Reserve candidates for the rail that actually requested more.
          // Without this, earlier rails in buildRecommendationRailLayout()
          // can steal the freshly fetched cards before the triggering rail
          // gets a chance to render them.
          railOwnershipRef.current.set(item.anime.id, rail.id);
          remaining -= 1;
          claimed += 1;
        }

        claimedForRail += claimed;
        return claimed;
      };

      // First use already-loaded candidates that are not owned by any rail.
      // This avoids a network request when a previous shared page already
      // brought in suitable titles.
      claimCandidates(filtered, false);

      try {
        for (
          let attempt = 0;
          attempt < MAX_EMPTY_PAGE_HOPS &&
          hasMoreRef.current &&
          remaining > 0;
          attempt += 1
        ) {
          const fresh = await fetchNextCandidateBatch();
          pagesScanned += 1;
          const relaxed = attempt >= STRICT_EMPTY_PAGE_HOPS;
          claimCandidates(fresh, relaxed);
        }

        if (
          claimedForRail === 0 &&
          hasMoreRef.current
        ) {
          // Pause only this rail for the current candidate window. A later
          // successful page fetched by another rail clears this pause so the
          // row can continue instead of becoming permanently exhausted.
          setExhaustedRails((current) => {
            const next = new Set(current);
            next.add(rail.id);
            return next;
          });
        }

        if (!hasMoreRef.current) {
          setExhaustedRails((current) => {
            const next = new Set(current);
            next.add(rail.id);
            return next;
          });
        }

        setRailOwnership(new Map(railOwnershipRef.current));

        trackProductClientEvent('recommendation_rail_load_result', {
          source: rail.source,
          path: '/',
          entityType: 'recommendation_rail',
          entityId: rail.id,
          metadata: {
            row_id: rail.id,
            items_before: itemsBefore,
            target_limit: targetLimit,
            claimed: claimedForRail,
            pages_scanned: pagesScanned,
            has_more: hasMoreRef.current,
            exhausted:
              !hasMoreRef.current ||
              (claimedForRail === 0 && hasMoreRef.current),
            pool_size: filtered.length,
            rail_items: targetLimit,
            rendered_items:
              railVirtualMetricsRef.current.get(rail.id)?.renderedItems ??
              Math.min(targetLimit, MAX_RAIL_DOM_ITEMS),
            virtual_window_max: MAX_RAIL_DOM_ITEMS,
            virtualized: targetLimit > MAX_RAIL_DOM_ITEMS,
          },
        });
      } catch (fetchError) {
        if (
          fetchError instanceof DOMException &&
          fetchError.name === 'AbortError'
        ) {
          return;
        }

        console.error('Recommendation rail pagination:', rail.id, fetchError);
        trackProductClientEvent('recommendation_rail_load_error', {
          source: rail.source,
          path: '/',
          entityType: 'recommendation_rail',
          entityId: rail.id,
          metadata: {
            row_id: rail.id,
            items_before: itemsBefore,
            target_limit: targetLimit,
            pages_scanned: pagesScanned,
            page: startPointer.page,
          },
        });
        setRailErrors((current) => {
          const next = new Set(current);
          next.add(rail.id);
          return next;
        });
      } finally {
        railLoadingRef.current.delete(rail.id);
        setLoadingRails((current) => {
          if (!current.has(rail.id)) return current;
          const next = new Set(current);
          next.delete(rail.id);
          return next;
        });
      }
    },
    [
      exhaustedRails,
      fetchNextCandidateBatch,
      filtered,
      railLimits,
      tasteGraph,
    ],
  );

  if (filtered.length === 0 && !hasMore && loadingRails.size === 0) {
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
          {rails.map((rail) => {
            const railLoading = loadingRails.has(rail.id);
            const railHasMore = hasMore && !exhaustedRails.has(rail.id);
            const railFailed = railErrors.has(rail.id);

            return (
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
                  hasMore={railHasMore}
                  loading={railLoading}
                  onEndReached={() => void ensureRailDepth(rail)}
                  virtualize
                  virtualMaxItems={MAX_RAIL_DOM_ITEMS}
                  virtualOverscan={RAIL_VIRTUAL_OVERSCAN}
                  onVirtualRangeChange={(metrics) =>
                    recordRailVirtualMetrics(rail.id, metrics)
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
                        onHidden={handleHiddenRecommendation}
                      />
                    </div>
                  ))}

                  {railLoading &&
                    Array.from({ length: RAIL_SKELETON_COUNT }).map(
                      (_, index) => (
                        <div
                          className="smart-feed__slide smart-feed__slide--skeleton"
                          key={`smart-feed-${rail.id}-skeleton-${index}`}
                          aria-hidden="true"
                        >
                          <div className="smart-feed__skeleton-card" />
                        </div>
                      ),
                    )}

                </ScrollRow>

                {railFailed && !railLoading && (
                  <button
                    type="button"
                    className="smart-feed__rail-retry"
                    onClick={() => void ensureRailDepth(rail)}
                  >
                    Не удалось загрузить ещё · Повторить
                  </button>
                )}
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
