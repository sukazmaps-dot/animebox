export const PREMIUM_PROFILE_THEMES = [
  'default',
  'violet',
  'midnight',
  'sakura',
] as const;

export type PremiumProfileTheme = (typeof PREMIUM_PROFILE_THEMES)[number];

export function isPremiumProfileTheme(value: string): value is PremiumProfileTheme {
  return (PREMIUM_PROFILE_THEMES as readonly string[]).includes(value);
}

export const PREMIUM_PROFILE_THEME_META: Record<
  PremiumProfileTheme,
  { label: string; description: string }
> = {
  default: {
    label: 'AnimeBox',
    description: 'Базовое тёмное оформление.',
  },
  violet: {
    label: 'Violet Nebula',
    description: 'Фиолетовое свечение и глубокий космический фон.',
  },
  midnight: {
    label: 'Midnight',
    description: 'Холодный ночной профиль с синим свечением.',
  },
  sakura: {
    label: 'Sakura Night',
    description: 'Тёмная сакура с мягкими розово-фиолетовыми акцентами.',
  },
};
