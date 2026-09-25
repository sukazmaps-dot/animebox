import type { Anime } from '@/types/anime';

export function normalizedAnimeScore(anime: Pick<Anime, 'score' | 'averageScore'>): number | null {
  for (const candidate of [anime.score, anime.averageScore]) {
    const value = Number(candidate);
    if (!Number.isFinite(value) || value <= 0) continue;

    const normalized = value > 10 && value <= 100 ? value / 10 : value;
    if (normalized <= 0 || normalized > 10) continue;

    return Math.round(normalized * 10) / 10;
  }

  return null;
}

export function formatAnimeScore(anime: Pick<Anime, 'score' | 'averageScore'>): string | null {
  const score = normalizedAnimeScore(anime);
  if (score == null) return null;
  return score.toFixed(1).replace(/\.0$/, '');
}
