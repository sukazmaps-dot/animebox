import { findAnimeGenre, findAnimeTag } from '@/lib/anime-taxonomy';

export type LocalizedDetailGenre = { value: string; label: string };

/**
 * AniList genres are often merged with Shikimori and theme labels.
 * Normalize the display language and identity before deduplicating.
 * Keep unknown terms as-is rather than inventing their meaning.
 */
const DETAIL_THEME_TRANSLATIONS: Record<string, LocalizedDetailGenre> = {
  military: { value: 'Military', label: 'Военное' },
  'военное': { value: 'Military', label: 'Военное' },
  'военный': { value: 'Military', label: 'Военное' },
  space: { value: 'Space', label: 'Космос' },
  'космос': { value: 'Space', label: 'Космос' },
  'космическое': { value: 'Space', label: 'Космос' },
};

function normalize(value: string) {
  return value.normalize('NFKC').toLocaleLowerCase('ru-RU')
    .replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
}

export function localizeDetailGenres(values: readonly string[]): LocalizedDetailGenre[] {
  const unique = new Map<string, LocalizedDetailGenre>();
  for (const raw of values) {
    if (typeof raw !== 'string' || !raw.trim()) continue;
    const name = raw.trim();
    const option = findAnimeGenre(name) ?? findAnimeTag(name);
    const localized = option
      ? { value: option.value, label: option.label }
      : DETAIL_THEME_TRANSLATIONS[normalize(name)] ?? { value: name, label: name };
    const key = normalize(localized.value);
    if (!unique.has(key)) unique.set(key, localized);
  }
  return [...unique.values()];
}
