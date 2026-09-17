export const MONETIZATION_ENABLED =
  process.env.NEXT_PUBLIC_MONETIZATION_ENABLED !== 'false';

export const ADS_ENABLED =
  MONETIZATION_ENABLED &&
  process.env.NEXT_PUBLIC_ADS_ENABLED === 'true';

export const AD_PROVIDER =
  process.env.NEXT_PUBLIC_AD_PROVIDER?.trim() || 'none';

export const SUPPORT_URL =
  process.env.NEXT_PUBLIC_SUPPORT_URL?.trim() ||
  'https://donatepay.ru/don/Armlet';

export const TELEGRAM_STARS_ENABLED =
  MONETIZATION_ENABLED &&
  process.env.NEXT_PUBLIC_TELEGRAM_STARS_ENABLED !== 'false';

export const SUPPORT_STAR_PACKS = [
  {
    amount: 25,
    title: 'Спасибо',
    description: 'Небольшая поддержка AnimeBox',
  },
  {
    amount: 100,
    title: 'Большая поддержка',
    description: 'Помочь развитию проекта заметнее',
  },
  {
    amount: 250,
    title: 'Легенда AnimeBox',
    description: 'Сильно поддержать разработку AnimeBox',
  },
] as const;

export type SupportStarAmount =
  (typeof SUPPORT_STAR_PACKS)[number]['amount'];

export function isSupportStarAmount(
  value: number,
): value is SupportStarAmount {
  return SUPPORT_STAR_PACKS.some(
    (pack) => pack.amount === value,
  );
}
