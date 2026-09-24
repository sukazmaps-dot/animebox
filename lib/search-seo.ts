export type SeoGenreLanding = {
  slug: string;
  value: string;
  label: string;
  description: string;
};

export const SEO_GENRE_LANDINGS: readonly SeoGenreLanding[] = [
  { slug: 'action', value: 'Action', label: 'Экшен', description: 'Динамичные аниме с боями, погонями и сильными героями.' },
  { slug: 'adventure', value: 'Adventure', label: 'Приключения', description: 'Аниме о путешествиях, открытиях и больших приключениях.' },
  { slug: 'comedy', value: 'Comedy', label: 'Комедия', description: 'Комедийные аниме для лёгкого просмотра и хорошего настроения.' },
  { slug: 'drama', value: 'Drama', label: 'Драма', description: 'Эмоциональные аниме с сильными историями и развитием персонажей.' },
  { slug: 'fantasy', value: 'Fantasy', label: 'Фэнтези', description: 'Аниме о магии, необычных мирах и фантастических приключениях.' },
  { slug: 'horror', value: 'Horror', label: 'Ужасы', description: 'Мрачные и напряжённые аниме в жанре ужасов.' },
  { slug: 'mystery', value: 'Mystery', label: 'Детектив', description: 'Аниме с тайнами, расследованиями и неожиданными разгадками.' },
  { slug: 'psychological', value: 'Psychological', label: 'Психологическое', description: 'Психологические аниме о сложных решениях, мотивах и характерах.' },
  { slug: 'romance', value: 'Romance', label: 'Романтика', description: 'Романтические аниме об отношениях, чувствах и важных встречах.' },
  { slug: 'sci-fi', value: 'Sci-Fi', label: 'Фантастика', description: 'Научно-фантастические аниме о технологиях, будущем и новых мирах.' },
  { slug: 'slice-of-life', value: 'Slice of Life', label: 'Повседневность', description: 'Спокойные аниме о повседневной жизни, дружбе и маленьких событиях.' },
  { slug: 'sports', value: 'Sports', label: 'Спорт', description: 'Спортивные аниме о соревнованиях, командах и стремлении стать лучше.' },
  { slug: 'supernatural', value: 'Supernatural', label: 'Сверхъестественное', description: 'Аниме о сверхъестественных силах, духах и необычных явлениях.' },
  { slug: 'thriller', value: 'Thriller', label: 'Триллер', description: 'Напряжённые аниме с высоким темпом, риском и непредсказуемыми событиями.' },
] as const;

export function getSeoGenre(slug: string) {
  return SEO_GENRE_LANDINGS.find((item) => item.slug === slug) ?? null;
}

export function seoCatalogYears(now = new Date()) {
  const current = now.getFullYear();
  return Array.from({ length: 13 }, (_, index) => current + 1 - index);
}

export function isSeoCatalogYear(value: number, now = new Date()) {
  const current = now.getFullYear();
  return Number.isSafeInteger(value) && value >= 1960 && value <= current + 1;
}
