'use client';

export type RecommendationFeedbackSignal =
  | 'like_more'
  | 'not_interested'
  | 'already_watched';

export async function persistRecommendationFeedback(input: {
  animeId: number;
  signal: RecommendationFeedbackSignal;
  source: string;
  reason?: string | null;
  modelVersion?: string | null;
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
