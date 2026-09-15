import type { Anime } from '@/types/anime';

export function getAnimeTitle(
  anime: Anime | null | undefined,
): string {
  if (!anime) {
    return 'Без названия';
  }

  return (
    anime.title?.russian?.trim() ||
    anime.russian?.trim() ||
    anime.title?.english?.trim() ||
    anime.title?.romaji?.trim() ||
    anime.title?.native?.trim() ||
    anime.name?.trim() ||
    'Без названия'
  );
}

export function getAnimeOriginalTitle(
  anime: Anime | null | undefined,
): string | null {
  if (!anime) {
    return null;
  }

  const displayedTitle = getAnimeTitle(anime);

  const candidates = [
    anime.title?.romaji,
    anime.title?.english,
    anime.title?.native,
  ];

  for (const candidate of candidates) {
    const value = candidate?.trim();

    if (value && value !== displayedTitle) {
      return value;
    }
  }

  return null;
}

export function isAnimeOngoing(
  anime: Anime | null | undefined,
): boolean {
  const status = anime?.status
    ?.trim()
    .toLowerCase();

  return (
    status === 'releasing' ||
    status === 'ongoing' ||
    status === 'онгоинг'
  );
}