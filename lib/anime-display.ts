import type { Anime } from '@/types/anime';

function getCyrillicAlias(anime: Anime): string | null {
  const candidates = [
    anime.name,
    ...(Array.isArray(anime.synonyms) ? anime.synonyms : []),
  ];

  for (const candidate of candidates) {
    const value =
      typeof candidate === 'string'
        ? candidate.trim()
        : '';

    if (value && /[А-Яа-яЁё]/.test(value)) {
      return value;
    }
  }

  return null;
}

export function getAnimeTitle(
  anime: Anime | null | undefined,
): string {
  if (!anime) {
    return 'Без названия';
  }

  const cyrillicAlias =
    getCyrillicAlias(anime);

  return (
    anime.title?.russian?.trim() ||
    anime.russian?.trim() ||
    cyrillicAlias ||
    anime.title?.romaji?.trim() ||
    anime.title?.english?.trim() ||
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