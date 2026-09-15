import type { Anime } from '@/types/anime';

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
}

export function normalizeReleaseTitle(value: string): string {
  // Keep season numbers/subtitles. Only spelling punctuation is ignored.
  return value.normalize('NFKC').toLowerCase().replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

export function animeSearchTitles(anime: Anime): string[] {
  return [...new Set([
    anime.title.english, anime.title.romaji, anime.title.russian, anime.title.native,
  ].filter((value): value is string => typeof value === 'string' && Boolean(value.trim())))];
}

export function matchesRelease(value: unknown, anime: Anime): boolean {
  const release = record(value);
  const name = record(release.name);
  const names = record(release.names);
  const titles = [name.main, name.english, names.ru, names.en, names.jp]
    .filter((title): title is string => typeof title === 'string' && Boolean(title.trim()))
    .map(normalizeReleaseTitle);
  const expected = animeSearchTitles(anime).map(normalizeReleaseTitle);
  if (!titles.some((title) => expected.includes(title))) return false;

  const year = Number(release.year ?? record(release.season).year);
  if (anime.startDate?.year && year > 0 && year !== anime.startDate.year) return false;
  const formats: Record<string, string> = {
    'ТВ': 'TV', 'ТВ (Короткое)': 'TV', 'TV_SHORT': 'TV', 'Фильм': 'MOVIE',
    'Спешл': 'SPECIAL', 'WEB': 'ONA', 'OAD': 'OVA',
  };
  const rawFormat = record(release.type).value ?? record(release.type).string;
  const expectedFormat = anime.format ? formats[anime.format] || anime.format : null;
  const actualFormat = typeof rawFormat === 'string' ? formats[rawFormat] || rawFormat : null;
  if (expectedFormat && actualFormat && expectedFormat !== actualFormat) return false;
  return true;
}

export function selectRelease(candidates: unknown[], anime: Anime): unknown | null {
  const matches = candidates.filter((candidate) => matchesRelease(candidate, anime));
  const unique = new Map<string, unknown>();
  for (const candidate of matches) {
    const value = record(candidate);
    const key = value.id ?? value.alias ?? value.code;
    if (key != null) unique.set(String(key), candidate);
  }
  // Ambiguous matches require an explicit mapping, not a popularity guess.
  return unique.size === 1 ? [...unique.values()][0] : null;
}
