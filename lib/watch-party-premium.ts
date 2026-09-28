export const WATCH_PARTY_THEMES = [
  'default',
  'midnight',
  'aurora',
  'sakura',
  'embers',
  'cinema',
] as const;

export type WatchPartyTheme = (typeof WATCH_PARTY_THEMES)[number];

export const WATCH_PARTY_THEME_META: Record<
  WatchPartyTheme,
  {
    label: string;
    description: string;
    premium: boolean;
    accent: string;
  }
> = {
  default: {
    label: 'AnimeBox',
    description: 'Стандартное оформление комнаты.',
    premium: false,
    accent: '#8B5CF6',
  },
  midnight: {
    label: 'Midnight',
    description: 'Строгая тёмная сцена без лишних эффектов.',
    premium: true,
    accent: '#7890B8',
  },
  aurora: {
    label: 'Aurora',
    description: 'Холодное фиолетово-синее свечение комнаты.',
    premium: true,
    accent: '#8B7CFF',
  },
  sakura: {
    label: 'Sakura',
    description: 'Мягкий розовый акцент и спокойная атмосфера.',
    premium: true,
    accent: '#FF6FAF',
  },
  embers: {
    label: 'Embers',
    description: 'Глубокий тёплый свет и красный акцент.',
    premium: true,
    accent: '#FF654F',
  },
  cinema: {
    label: 'Cinema',
    description: 'Минимальный кинозальный стиль вокруг комнаты.',
    premium: true,
    accent: '#D2B48C',
  },
};

export function isWatchPartyTheme(value: unknown): value is WatchPartyTheme {
  return (
    typeof value === 'string' &&
    (WATCH_PARTY_THEMES as readonly string[]).includes(value)
  );
}

export function readWatchPartyTheme(
  value: unknown,
  fallback: WatchPartyTheme = 'default',
): WatchPartyTheme {
  return isWatchPartyTheme(value) ? value : fallback;
}


export const PREMIUM_WATCH_PARTY_REACTIONS = [
  'sparkle',
  'clap',
  'cinema',
] as const;

export type PremiumWatchPartyReaction =
  (typeof PREMIUM_WATCH_PARTY_REACTIONS)[number];

export function isPremiumWatchPartyReaction(
  value: string,
): value is PremiumWatchPartyReaction {
  return (PREMIUM_WATCH_PARTY_REACTIONS as readonly string[]).includes(value);
}
