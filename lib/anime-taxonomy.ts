export type AnimeTaxonomyOption = {
  value: string;
  label: string;
  aliases: readonly string[];
  shikimoriId?: number;
};

export const ANIME_GENRES = [
  { value: 'Action', label: 'Экшен', aliases: ['action', 'экшен'], shikimoriId: 1 },
  { value: 'Adventure', label: 'Приключения', aliases: ['adventure', 'приключения'], shikimoriId: 2 },
  { value: 'Comedy', label: 'Комедия', aliases: ['comedy', 'комедия'], shikimoriId: 4 },
  { value: 'Drama', label: 'Драма', aliases: ['drama', 'драма'], shikimoriId: 8 },
  { value: 'Ecchi', label: 'Эччи', aliases: ['ecchi', 'этти', 'эччи'], shikimoriId: 9 },
  { value: 'Fantasy', label: 'Фэнтези', aliases: ['fantasy', 'фэнтези'], shikimoriId: 10 },
  { value: 'Horror', label: 'Ужасы', aliases: ['horror', 'ужасы'], shikimoriId: 14 },
  { value: 'Mahou Shoujo', label: 'Махо-сёдзё', aliases: ['mahou shoujo', 'махо сёдзё', 'махо-сёдзё'], shikimoriId: 16 },
  { value: 'Mecha', label: 'Меха', aliases: ['mecha', 'меха'], shikimoriId: 18 },
  { value: 'Music', label: 'Музыка', aliases: ['music', 'музыка'], shikimoriId: 19 },
  { value: 'Mystery', label: 'Детектив', aliases: ['mystery', 'тайна', 'детектив'], shikimoriId: 7 },
  { value: 'Psychological', label: 'Психологическое', aliases: ['psychological', 'психологическое'], shikimoriId: 40 },
  { value: 'Romance', label: 'Романтика', aliases: ['romance', 'романтика'], shikimoriId: 22 },
  { value: 'Sci-Fi', label: 'Фантастика', aliases: ['sci-fi', 'sci fi', 'фантастика'], shikimoriId: 24 },
  { value: 'Slice of Life', label: 'Повседневность', aliases: ['slice of life', 'повседневность'], shikimoriId: 36 },
  { value: 'Sports', label: 'Спорт', aliases: ['sports', 'спорт'], shikimoriId: 30 },
  { value: 'Supernatural', label: 'Сверхъестественное', aliases: ['supernatural', 'сверхъестественное'], shikimoriId: 37 },
  { value: 'Thriller', label: 'Триллер', aliases: ['thriller', 'триллер'], shikimoriId: 41 },
] as const satisfies readonly AnimeTaxonomyOption[];

export const ANIME_THEMES = [
  { value: 'Isekai', label: 'Исекай', aliases: ['isekai', 'исекай'] },
  { value: 'Cyberpunk', label: 'Киберпанк', aliases: ['cyberpunk', 'киберпанк'] },
  { value: 'Reincarnation', label: 'Реинкарнация', aliases: ['reincarnation', 'реинкарнация'] },
  { value: 'School', label: 'Школа', aliases: ['school', 'школа'] },
  { value: 'Harem', label: 'Гарем', aliases: ['harem', 'гарем'] },
  { value: 'Martial Arts', label: 'Боевые искусства', aliases: ['martial arts', 'боевые искусства'] },
  { value: 'Samurai', label: 'Самураи', aliases: ['samurai', 'самураи'] },
  { value: 'Vampire', label: 'Вампиры', aliases: ['vampire', 'vampires', 'вампир', 'вампиры'] },
  { value: 'Idol', label: 'Идолы', aliases: ['idol', 'идолы'] },
  { value: 'Historical', label: 'Историческое', aliases: ['historical', 'историческое'] },
  { value: 'Magic', label: 'Магия', aliases: ['magic', 'магия'] },
  { value: 'Demons', label: 'Демоны', aliases: ['demons', 'demon', 'демоны'] },
  { value: 'Iyashikei', label: 'Иясикэй', aliases: ['iyashikei', 'иясикэй'] },
] as const satisfies readonly AnimeTaxonomyOption[];

export const ANIME_AUDIENCES = [
  { value: 'Shounen', label: 'Сёнен', aliases: ['shounen', 'shonen', 'сёнен', 'сенен'] },
  { value: 'Seinen', label: 'Сэйнэн', aliases: ['seinen', 'сэйнэн', 'сейнен'] },
  { value: 'Shoujo', label: 'Сёдзё', aliases: ['shoujo', 'shojo', 'сёдзё', 'седзе'] },
  { value: 'Josei', label: 'Дзёсэй', aliases: ['josei', 'дзёсэй', 'дзесей'] },
] as const satisfies readonly AnimeTaxonomyOption[];

export const ANIME_TAG_FILTERS = [
  ...ANIME_THEMES,
  ...ANIME_AUDIENCES,
] as const;

function normalizeTaxonomyText(value: string): string {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase('ru-RU')
    .replace(/ё/g, 'е')
    .replace(/[‐‑–—_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function findAnimeGenre(value: number | string): AnimeTaxonomyOption | undefined {
  const raw = String(value).trim();
  const numeric = Number(raw);

  if (Number.isSafeInteger(numeric)) {
    const byId = ANIME_GENRES.find((item) => item.shikimoriId === numeric);
    if (byId) return byId;
  }

  const normalized = normalizeTaxonomyText(raw);
  return ANIME_GENRES.find((item) =>
    [item.value, item.label, ...item.aliases]
      .some((candidate) => normalizeTaxonomyText(candidate) === normalized),
  );
}

export function normalizeAniListGenre(value: number | string): string {
  return findAnimeGenre(value)?.value ?? String(value).trim();
}

export function normalizeAniListGenres(values: Array<number | string> | readonly (number | string)[]): string[] {
  return [...new Set(values.map(normalizeAniListGenre).filter(Boolean))];
}

export function toShikimoriGenreIds(values: Array<number | string> | readonly (number | string)[]): number[] {
  return [...new Set(
    values
      .map((value) => findAnimeGenre(value)?.shikimoriId)
      .filter((value): value is number => typeof value === 'number'),
  )];
}

export function animeTaxonomyValueMatches(
  actualValues: readonly string[] | null | undefined,
  option: AnimeTaxonomyOption,
): boolean {
  const actual = new Set((actualValues ?? []).map(normalizeTaxonomyText));
  return [option.value, option.label, ...option.aliases]
    .some((candidate) => actual.has(normalizeTaxonomyText(candidate)));
}

export function findAnimeTag(value: string): AnimeTaxonomyOption | undefined {
  const normalized = normalizeTaxonomyText(value);
  return ANIME_TAG_FILTERS.find((item) =>
    [item.value, item.label, ...item.aliases]
      .some((candidate) => normalizeTaxonomyText(candidate) === normalized),
  );
}
