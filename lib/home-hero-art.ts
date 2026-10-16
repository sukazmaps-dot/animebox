import type { Anime } from '@/types/anime';

/** Percent coordinates of the image's focal point; independent of viewport. */
export function mobileHeroObjectPosition(anime: Anime): string {
  const point = anime.mobileHeroPosition;
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    return '50% 20%';
  }
  const clamp = (value: number) => Math.min(100, Math.max(0, value));
  return `${clamp(point.x)}% ${clamp(point.y)}%`;
}
