export type CatalogSeason = 'WINTER' | 'SPRING' | 'SUMMER' | 'FALL';

export const CATALOG_SEASON_LABELS: Record<CatalogSeason, string> = {
  WINTER: 'Зима',
  SPRING: 'Весна',
  SUMMER: 'Лето',
  FALL: 'Осень',
};

export type CatalogSeasonValue = {
  season: CatalogSeason;
  year: number;
};

export function monthToCatalogSeason(month: number): CatalogSeason | null {
  if (month >= 1 && month <= 3) return 'WINTER';
  if (month >= 4 && month <= 6) return 'SPRING';
  if (month >= 7 && month <= 9) return 'SUMMER';
  if (month >= 10 && month <= 12) return 'FALL';
  return null;
}

export function formatCatalogSeason(value: CatalogSeasonValue): string {
  return `${CATALOG_SEASON_LABELS[value.season]} ${value.year}`;
}

export function getCurrentAnimeSeason(date = new Date()): CatalogSeasonValue {
  return {
    season: monthToCatalogSeason(date.getMonth() + 1) ?? 'WINTER',
    year: date.getFullYear(),
  };
}

export function createCatalogSeasonOptions(
  minYear = 1980,
  maxYear = new Date().getFullYear() + 1,
): CatalogSeasonValue[] {
  const result: CatalogSeasonValue[] = [];
  const seasons: CatalogSeason[] = ['WINTER', 'SPRING', 'SUMMER', 'FALL'];

  for (let year = maxYear; year >= minYear; year -= 1) {
    for (const season of seasons) {
      result.push({ year, season });
    }
  }

  return result;
}
