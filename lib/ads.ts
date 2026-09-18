export const AD_PLACEMENTS = [
  'home-after-smart-feed',
  'catalog-after-results',
  'anime-detail-before-related',
  'watch-below-engagement',
] as const;

export type AdPlacement = (typeof AD_PLACEMENTS)[number];

export type AdFormat = 'horizontal' | 'rectangle' | 'native';

export type AdPlacementDefinition = {
  label: string;
  description: string;
  format: AdFormat;
};

export const AD_PLACEMENT_DEFINITIONS: Record<AdPlacement, AdPlacementDefinition> = {
  'home-after-smart-feed': {
    label: 'Главная · после рекомендаций',
    description: 'Один нативный блок между персональной лентой и популярным аниме.',
    format: 'horizontal',
  },
  'catalog-after-results': {
    label: 'Каталог · после 10 карточек',
    description: 'Один спокойный блок после первых 10 результатов; при короткой выдаче показывается только после 8+ карточек.',
    format: 'horizontal',
  },
  'anime-detail-before-related': {
    label: 'Страница аниме · перед похожими',
    description: 'Ненавязчивый блок после основной информации и обсуждений.',
    format: 'native',
  },
  'watch-below-engagement': {
    label: 'Просмотр · после обсуждения',
    description: 'Самый осторожный слот: после плеера, трекера, списка серий и комментариев; никогда не перекрывает просмотр.',
    format: 'horizontal',
  },
};

export type AdPlacementFlags = Record<AdPlacement, boolean>;

export type AdStoredSettings = {
  enabled: boolean;
  maxAdsPerSession: number;
  minSecondsBetweenAds: number;
  placements: AdPlacementFlags;
};

export type AdRuntimeConfig = AdStoredSettings & {
  provider: string;
};

export const DEFAULT_AD_PLACEMENTS: AdPlacementFlags = {
  'home-after-smart-feed': true,
  'catalog-after-results': true,
  'anime-detail-before-related': true,
  'watch-below-engagement': true,
};

export const DEFAULT_AD_SETTINGS: AdStoredSettings = {
  enabled: true,
  maxAdsPerSession: 2,
  minSecondsBetweenAds: 120,
  placements: DEFAULT_AD_PLACEMENTS,
};

export function isAdPlacement(value: string): value is AdPlacement {
  return (AD_PLACEMENTS as readonly string[]).includes(value);
}

export function normalizePlacementFlags(value: unknown): AdPlacementFlags {
  const source = value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

  return Object.fromEntries(
    AD_PLACEMENTS.map((placement) => [
      placement,
      typeof source[placement] === 'boolean'
        ? source[placement]
        : DEFAULT_AD_PLACEMENTS[placement],
    ]),
  ) as AdPlacementFlags;
}
