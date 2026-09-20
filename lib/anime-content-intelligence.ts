import type { Anime } from '@/types/anime';

const FORMAT_LABELS: Record<string, string> = {
  TV: 'TV-сериал',
  TV_SHORT: 'Короткий сериал',
  MOVIE: 'Фильм',
  OVA: 'OVA',
  ONA: 'ONA',
  SPECIAL: 'Спецвыпуск',
  MUSIC: 'Музыкальное видео',
};

const STATUS_LABELS: Record<string, string> = {
  FINISHED: 'Завершено',
  RELEASING: 'Онгоинг',
  NOT_YET_RELEASED: 'Анонсировано',
  CANCELLED: 'Отменено',
  HIATUS: 'Пауза',
  released: 'Завершено',
  ongoing: 'Онгоинг',
  anons: 'Анонсировано',
};

export function animeFormatLabel(format: unknown): string | null {
  const value = typeof format === 'string' ? format.trim() : '';
  if (!value) return null;
  return FORMAT_LABELS[value.toUpperCase()] ?? value;
}

export function animeStatusLabel(status: unknown): string | null {
  const value = typeof status === 'string' ? status.trim() : '';
  if (!value) return null;
  return STATUS_LABELS[value] ?? STATUS_LABELS[value.toUpperCase()] ?? value;
}

export function animeReleaseLabel(anime: Pick<Anime, 'startDate' | 'endDate'>): string | null {
  const start = anime.startDate?.year;
  const end = anime.endDate?.year;
  if (!start) return null;
  return end && end !== start ? `${start}–${end}` : String(start);
}

export function animeEpisodeLabel(episodes: number | null | undefined): string | null {
  const value = Number(episodes);
  if (!Number.isFinite(value) || value <= 0) return null;
  return `${Math.round(value)} эп.`;
}

export function animeContentFacts(anime: Anime) {
  return {
    format: animeFormatLabel(anime.format ?? anime.kind),
    status: animeStatusLabel(anime.status),
    release: animeReleaseLabel(anime),
    episodes: animeEpisodeLabel(anime.episodes ?? anime.episodesAired),
  };
}
