'use client';

import {
  startTransition,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

import type { TasteMood } from '@/lib/personalization';
import type { RankedRecommendation } from '@/lib/recommendations';
import type { Anime } from '@/types/anime';
import type { RecommendationPage } from '@/types/recommendations';

type Args = {
  authLoading: boolean;
  userId: string | null;
  hydrated: boolean;
  popular: Anime[];
  ongoing: Anime[];
  historyRevision: string;
};

type Result = {
  mood: TasteMood;
  recommendationMood: TasteMood;
  moodSwitching: boolean;
  updateMood: (mood: TasteMood) => void;
  smartRecommendations: RankedRecommendation[];
  recommendationsReady: boolean;
};

type IdleWindow = Window & {
  requestIdleCallback?: (
    callback: IdleRequestCallback,
    options?: IdleRequestOptions,
  ) => number;
  cancelIdleCallback?: (handle: number) => void;
};

function mergeAnimeCandidates(...groups: Anime[][]): Anime[] {
  const byId = new Map<number, Anime>();

  for (const group of groups) {
    for (const anime of group) {
      if (!anime || !Number.isSafeInteger(anime.id) || anime.id <= 0) {
        continue;
      }

      if (!byId.has(anime.id)) {
        byId.set(anime.id, anime);
      }
    }
  }

  return [...byId.values()];
}

async function loadMoodBootstrapCandidates(
  mood: TasteMood,
  signal: AbortSignal,
): Promise<Anime[]> {
  if (mood === 'any') return [];

  const params = new URLSearchParams({
    limit: '30',
    bucket: '0',
    mood,
    intent: 'mood',
    page: '1',
  });

  const response = await fetch(
    `/api/recommendations?${params.toString()}`,
    {
      method: 'GET',
      cache: 'default',
      headers: {
        Accept: 'application/json',
      },
      signal,
    },
  );

  if (!response.ok) {
    throw new Error(`Mood bootstrap HTTP ${response.status}`);
  }

  const payload = (await response.json()) as RecommendationPage;

  return Array.isArray(payload.items) ? payload.items : [];
}

export function useHomeRecommendationRuntime({
  authLoading,
  userId,
  hydrated,
  popular,
  ongoing,
  historyRevision,
}: Args): Result {
  const [mood, setMood] = useState<TasteMood>('any');
  const [recommendationMood, setRecommendationMood] =
    useState<TasteMood>('any');
  const [moodSwitching, setMoodSwitching] = useState(false);
  const [tasteRevision, setTasteRevision] = useState(0);
  const [smartRecommendations, setSmartRecommendations] =
    useState<RankedRecommendation[]>([]);
  const [recommendationsReady, setRecommendationsReady] =
    useState(false);

  const recommendationRequestRef = useRef(0);
  const recommendationControllerRef =
    useRef<AbortController | null>(null);
  const lastRankedMoodRef = useRef<TasteMood | null>(null);
  const lastRankSignatureRef = useRef('');
  const moodRef = useRef<TasteMood>('any');
  const moodPersistenceSequenceRef = useRef(0);
  const pendingMoodRef = useRef<{
    mood: TasteMood;
    sequence: number;
  } | null>(null);

  useEffect(() => {
    if (authLoading || !userId) return;

    const controller = new AbortController();

    void import('@/lib/taste-graph')
      .then(({ fetchTasteGraph }) =>
        fetchTasteGraph(controller.signal),
      )
      .catch((error) => {
        if (
          error instanceof Error &&
          error.name === 'AbortError'
        ) {
          return;
        }

        console.warn('Taste Graph refresh failed:', error);
      });

    return () => controller.abort();
  }, [authLoading, userId]);

  useEffect(() => {
    let active = true;

    const refreshTaste = () => {
      void import('@/lib/personalization')
        .then(({ readTasteProfile }) => {
          if (!active) return;

          const persistedMood = readTasteProfile().mood;
          const pendingMood = pendingMoodRef.current;

          // A taste-graph/event refresh can land while the personalization
          // chunk is still persisting a just-clicked mood. Do not let the
          // older localStorage value visually revert the user's selection.
          if (
            pendingMood &&
            persistedMood !== pendingMood.mood
          ) {
            setTasteRevision((revision) => revision + 1);
            return;
          }

          if (
            pendingMood &&
            persistedMood === pendingMood.mood
          ) {
            pendingMoodRef.current = null;
          }

          moodRef.current = persistedMood;
          setMood(persistedMood);
          setTasteRevision((revision) => revision + 1);
        })
        .catch((error) => {
          console.debug(
            '[Home] taste profile chunk unavailable',
            error,
          );
        });
    };

    refreshTaste();
    window.addEventListener(
      'animebox-taste-changed',
      refreshTaste,
    );
    window.addEventListener(
      'animebox-taste-graph-updated',
      refreshTaste,
    );

    return () => {
      active = false;
      window.removeEventListener(
        'animebox-taste-changed',
        refreshTaste,
      );
      window.removeEventListener(
        'animebox-taste-graph-updated',
        refreshTaste,
      );
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;

    const candidateSignature = [
      mood,
      historyRevision,
      tasteRevision,
      popular.map((anime) => anime.id).join(','),
      ongoing.map((anime) => anime.id).join(','),
    ].join('|');

    if (
      recommendationsReady &&
      lastRankSignatureRef.current === candidateSignature
    ) {
      return;
    }

    const requestId = ++recommendationRequestRef.current;
    recommendationControllerRef.current?.abort();

    const controller = new AbortController();
    recommendationControllerRef.current = controller;

    let cancelled = false;
    let timer: number | null = null;
    let idleHandle: number | null = null;
    const idleWindow = window as IdleWindow;

    const isCurrent = () =>
      !cancelled &&
      !controller.signal.aborted &&
      requestId === recommendationRequestRef.current;

    const rank = async () => {
      try {
        const [{ getPersonalizedRecommendations }, moodCandidates] =
          await Promise.all([
            import('@/lib/recommendations'),
            mood === 'any'
              ? Promise.resolve<Anime[]>([])
              : loadMoodBootstrapCandidates(
                  mood,
                  controller.signal,
                ).catch((error) => {
                  if (
                    error instanceof Error &&
                    error.name === 'AbortError'
                  ) {
                    throw error;
                  }

                  console.debug(
                    '[Home] mood candidate bootstrap unavailable',
                    error,
                  );
                  return [];
                }),
          ]);

        if (!isCurrent()) return;

        const candidates = mergeAnimeCandidates(
          moodCandidates,
          popular,
          ongoing,
        );

        const next = getPersonalizedRecommendations(
          candidates,
          {
            mood,
            limit: mood === 'any' ? 24 : 30,
          },
        );

        startTransition(() => {
          if (!isCurrent()) return;

          setSmartRecommendations(next);
          setRecommendationMood(mood);
          lastRankedMoodRef.current = mood;
          lastRankSignatureRef.current = candidateSignature;
          setRecommendationsReady(true);
          setMoodSwitching(false);
        });
      } catch (error) {
        if (
          error instanceof Error &&
          error.name === 'AbortError'
        ) {
          return;
        }

        console.debug(
          '[Home] recommendation chunk unavailable',
          error,
        );

        if (isCurrent()) {
          setRecommendationsReady(true);
          setMoodSwitching(false);
        }
      }
    };

    const isExplicitMoodTransition =
      lastRankedMoodRef.current !== null &&
      lastRankedMoodRef.current !== mood;

    if (isExplicitMoodTransition || moodSwitching) {
      void rank();
    } else if (idleWindow.requestIdleCallback) {
      idleHandle = idleWindow.requestIdleCallback(
        () => {
          void rank();
        },
        { timeout: 650 },
      );
    } else {
      timer = window.setTimeout(() => {
        void rank();
      }, 80);
    }

    return () => {
      cancelled = true;
      controller.abort();

      if (timer !== null) {
        window.clearTimeout(timer);
      }

      if (idleHandle !== null) {
        idleWindow.cancelIdleCallback?.(idleHandle);
      }
    };
  }, [
    hydrated,
    popular,
    ongoing,
    mood,
    historyRevision,
    tasteRevision,
    recommendationsReady,
    moodSwitching,
  ]);

  useEffect(
    () => () => {
      recommendationRequestRef.current += 1;
      moodPersistenceSequenceRef.current += 1;
      pendingMoodRef.current = null;
      recommendationControllerRef.current?.abort();
    },
    [],
  );

  const updateMood = useCallback(
    (nextMood: TasteMood) => {
      if (nextMood === moodRef.current) return;

      const persistenceSequence =
        ++moodPersistenceSequenceRef.current;

      pendingMoodRef.current = {
        mood: nextMood,
        sequence: persistenceSequence,
      };
      moodRef.current = nextMood;

      recommendationRequestRef.current += 1;
      recommendationControllerRef.current?.abort();
      setMoodSwitching(true);
      setMood(nextMood);

      void import('@/lib/personalization')
        .then(({ setTasteMood }) => {
          const pendingMood = pendingMoodRef.current;
          if (
            !pendingMood ||
            pendingMood.sequence !== persistenceSequence ||
            pendingMood.mood !== nextMood
          ) {
            return;
          }

          setTasteMood(nextMood);
        })
        .catch((error) => {
          const pendingMood = pendingMoodRef.current;
          if (
            pendingMood?.sequence === persistenceSequence
          ) {
            pendingMoodRef.current = null;
          }

          console.debug(
            '[Home] taste persistence chunk unavailable',
            error,
          );
        });
    },
    [],
  );

  return {
    mood,
    recommendationMood,
    moodSwitching,
    updateMood,
    smartRecommendations,
    recommendationsReady,
  };
}
