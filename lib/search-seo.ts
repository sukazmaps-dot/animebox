import { CATALOG_STUDIOS } from '@/lib/catalog-filter-state';
import {
  CATALOG_SEASON_LABELS,
  type CatalogSeason,
} from '@/lib/catalog-season';

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


export type SeoStudioLanding = {
  slug: string;
  providerName: string;
  label: string;
  description: string;
};

const STUDIO_DESCRIPTIONS: Record<string, string> = {
  mappa: 'Аниме студии MAPPA: заметные сериалы, экшен и современные хиты.',
  'studio-ghibli': 'Полнометражные аниме Studio Ghibli и известные работы студии.',
  madhouse: 'Популярные и классические аниме студии Madhouse.',
  'wit-studio': 'Аниме Wit Studio: сериалы и проекты студии в каталоге AnimeBox.',
  bones: 'Аниме студии Bones: экшен, фантастика и известные телевизионные проекты.',
  'kyoto-animation': 'Аниме Kyoto Animation: сериалы и фильмы студии в каталоге AnimeBox.',
  ufotable: 'Аниме ufotable: сериалы и фильмы студии с узнаваемой визуальной подачей.',
  'toei-animation': 'Аниме Toei Animation: классические и современные сериалы студии.',
  cloverworks: 'Аниме CloverWorks: популярные сериалы и новые проекты студии.',
  'a-1-pictures': 'Аниме A-1 Pictures: сериалы, фильмы и популярные франшизы студии.',
};

export const SEO_STUDIO_LANDINGS: readonly SeoStudioLanding[] =
  CATALOG_STUDIOS.map((studio) => ({
    slug: studio.id,
    providerName: studio.providerName,
    label: studio.label,
    description:
      STUDIO_DESCRIPTIONS[studio.id] ??
      `Аниме студии ${studio.label} в каталоге AnimeBox.`,
  }));

export function getSeoStudio(slug: string) {
  return SEO_STUDIO_LANDINGS.find((item) => item.slug === slug) ?? null;
}

const SEO_SEASON_BY_SLUG = {
  winter: 'WINTER',
  spring: 'SPRING',
  summer: 'SUMMER',
  fall: 'FALL',
} as const satisfies Record<string, CatalogSeason>;

export type SeoSeasonSlug = keyof typeof SEO_SEASON_BY_SLUG;

export type SeoSeasonLanding = {
  slug: SeoSeasonSlug;
  season: CatalogSeason;
  year: number;
  label: string;
  path: string;
};

export function getSeoSeason(slug: string): CatalogSeason | null {
  return SEO_SEASON_BY_SLUG[slug as SeoSeasonSlug] ?? null;
}

export function seoSeasonSlug(season: CatalogSeason): SeoSeasonSlug {
  const found = Object.entries(SEO_SEASON_BY_SLUG).find(
    ([, value]) => value === season,
  );

  return (found?.[0] as SeoSeasonSlug | undefined) ?? 'winter';
}

export function seoSeasonYears(now = new Date()) {
  const current = now.getFullYear();
  return Array.from({ length: 5 }, (_, index) => current - index);
}

export function isSeoSeasonYear(value: number, now = new Date()) {
  const years = seoSeasonYears(now);
  const current = now.getFullYear();

  return (
    Number.isSafeInteger(value) &&
    (years.includes(value) ||
      (now.getMonth() >= 9 && value === current + 1))
  );
}

export function seoSeasonLandings(now = new Date()): SeoSeasonLanding[] {
  const seasons = Object.entries(SEO_SEASON_BY_SLUG) as Array<
    [SeoSeasonSlug, CatalogSeason]
  >;

  const base = seoSeasonYears(now).flatMap((year) =>
    seasons.map(([slug, season]) => ({
      slug,
      season,
      year,
      label: `${CATALOG_SEASON_LABELS[season]} ${year}`,
      path: `/anime/season/${slug}/${year}`,
    })),
  );

  if (now.getMonth() >= 9) {
    const nextYear = now.getFullYear() + 1;
    base.unshift({
      slug: 'winter',
      season: 'WINTER',
      year: nextYear,
      label: `${CATALOG_SEASON_LABELS.WINTER} ${nextYear}`,
      path: `/anime/season/winter/${nextYear}`,
    });
  }

  return base;
}

export function seoSeasonLabel(season: CatalogSeason, year: number) {
  return `${CATALOG_SEASON_LABELS[season]} ${year}`;
}
