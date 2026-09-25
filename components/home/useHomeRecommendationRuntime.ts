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

export function useHomeRecommendationRuntime({
  authLoading,
  userId,
  hydrated,
  popular,
  ongoing,
  historyRevision,
}: Args): Result {
  const [mood, setMood] = useState<TasteMood>('any');
  const [tasteRevision, setTasteRevision] = useState(0);
  const [smartRecommendations, setSmartRecommendations] =
    useState<RankedRecommendation[]>([]);
  const [recommendationsReady, setRecommendationsReady] =
    useState(false);
  const recommendationRequestRef = useRef(0);

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

          setMood(readTasteProfile().mood);
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

    const requestId = ++recommendationRequestRef.current;
    let cancelled = false;
    let timer: number | null = null;
    let idleHandle: number | null = null;
    const idleWindow = window as IdleWindow;

    const rank = () => {
      void import('@/lib/recommendations')
        .then(({ getPersonalizedRecommendations }) => {
          if (
            cancelled ||
            requestId !== recommendationRequestRef.current
          ) {
            return;
          }

          const next = getPersonalizedRecommendations(
            [...popular, ...ongoing],
            {
              mood,
              limit: 24,
            },
          );

          startTransition(() => {
            if (
              cancelled ||
              requestId !== recommendationRequestRef.current
            ) {
              return;
            }

            setSmartRecommendations(next);
            setRecommendationsReady(true);
          });
        })
        .catch((error) => {
          console.debug(
            '[Home] recommendation chunk unavailable',
            error,
          );

          if (
            !cancelled &&
            requestId === recommendationRequestRef.current
          ) {
            setRecommendationsReady(true);
          }
        });
    };

    if (idleWindow.requestIdleCallback) {
      idleHandle = idleWindow.requestIdleCallback(
        rank,
        { timeout: 1_200 },
      );
    } else {
      timer = window.setTimeout(rank, 220);
    }

    return () => {
      cancelled = true;

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
  ]);

  const updateMood = useCallback(
    (nextMood: TasteMood) => {
      if (nextMood === mood) return;

      setMood(nextMood);

      void import('@/lib/personalization')
        .then(({ setTasteMood }) => {
          startTransition(() => {
            setTasteMood(nextMood);
          });
        })
        .catch((error) => {
          console.debug(
            '[Home] taste persistence chunk unavailable',
            error,
          );
        });
    },
    [mood],
  );

  return {
    mood,
    updateMood,
    smartRecommendations,
    recommendationsReady,
  };
}
