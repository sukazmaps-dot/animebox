'use client';

import type { RecommendationFeedbackSignal } from '@/lib/recommendation-feedback-policy';

export type { RecommendationFeedbackSignal } from '@/lib/recommendation-feedback-policy';

export async function persistRecommendationFeedback(input: {
  animeId: number;
  signal: RecommendationFeedbackSignal;
  source: string;
  reason?: string | null;
  modelVersion?: string | null;
  recommendationId?: string | null;
  recommendationSessionId?: string | null;
  algorithmVersion?: string | null;
  rowId?: string | null;
  position?: number | null;
  mood?: string | null;
}): Promise<boolean> {
  try {
    const response = await fetch('/api/recommendations/feedback', {
      method: 'POST',
      cache: 'no-store',
      keepalive: true,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(input),
    });

    if (response.status === 401) return false;
    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      throw new Error(payload.error || 'Не удалось сохранить предпочтение.');
    }

    return true;
  } catch (error) {
    console.debug('[Recommendations] feedback sync skipped', error);
    return false;
  }
}


export async function clearRecommendationFeedback(
  animeId: number,
): Promise<boolean> {
  try {
    const response = await fetch(
      `/api/recommendations/feedback?animeId=${encodeURIComponent(String(animeId))}`,
      {
        method: 'DELETE',
        cache: 'no-store',
        keepalive: true,
        headers: { Accept: 'application/json' },
      },
    );

    if (response.status === 401) return false;
    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      throw new Error(payload.error || 'Не удалось отменить предпочтение.');
    }

    return true;
  } catch (error) {
    console.debug('[Recommendations] feedback undo skipped', error);
    return false;
  }
}
