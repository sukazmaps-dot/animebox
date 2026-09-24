export const USER_PREFERENCES_KEY = 'animebox:user-preferences:v1';
export const USER_PREFERENCES_EVENT = 'animebox:user-preferences-changed';

export type UserThemePreference = 'dark' | 'light' | 'system';

export type UserPreferences = {
  autoNextEpisode: boolean;
  reduceMotion: boolean;
  theme: UserThemePreference;
};

export const DEFAULT_USER_PREFERENCES: UserPreferences = {
  autoNextEpisode: true,
  reduceMotion: false,
  theme: 'dark',
};

function normalizeTheme(value: unknown): UserThemePreference {
  return value === 'light' || value === 'system' || value === 'dark'
    ? value
    : DEFAULT_USER_PREFERENCES.theme;
}

function normalize(value: Partial<UserPreferences> | null | undefined): UserPreferences {
  return {
    autoNextEpisode:
      typeof value?.autoNextEpisode === 'boolean'
        ? value.autoNextEpisode
        : DEFAULT_USER_PREFERENCES.autoNextEpisode,
    reduceMotion:
      typeof value?.reduceMotion === 'boolean'
        ? value.reduceMotion
        : DEFAULT_USER_PREFERENCES.reduceMotion,
    theme: normalizeTheme(value?.theme),
  };
}

export function readUserPreferences(): UserPreferences {
  if (typeof window === 'undefined') return DEFAULT_USER_PREFERENCES;

  try {
    const raw = window.localStorage.getItem(USER_PREFERENCES_KEY);
    if (!raw) return DEFAULT_USER_PREFERENCES;
    return normalize(JSON.parse(raw) as Partial<UserPreferences>);
  } catch {
    return DEFAULT_USER_PREFERENCES;
  }
}

export function resolveUserTheme(
  preference: UserThemePreference,
): 'dark' | 'light' {
  if (preference !== 'system') return preference;

  if (typeof window === 'undefined') {
    return 'dark';
  }

  return window.matchMedia('(prefers-color-scheme: light)').matches
    ? 'light'
    : 'dark';
}

export function applyUserPreferences(preferences: UserPreferences) {
  if (typeof document === 'undefined') return;

  const theme = resolveUserTheme(preferences.theme);

  document.documentElement.dataset.animeboxReduceMotion = preferences.reduceMotion
    ? 'true'
    : 'false';
  document.documentElement.dataset.animeboxThemePreference = preferences.theme;
  document.documentElement.dataset.animeboxTheme = theme;
  document.documentElement.style.colorScheme = theme;
}

export function writeUserPreferences(next: UserPreferences) {
  const normalized = normalize(next);

  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(USER_PREFERENCES_KEY, JSON.stringify(normalized));
    } catch {
      // Restricted/private browser storage should not break settings.
    }

    applyUserPreferences(normalized);
    window.dispatchEvent(
      new CustomEvent<UserPreferences>(USER_PREFERENCES_EVENT, {
        detail: normalized,
      }),
    );
  }

  return normalized;
}

export function resetUserPreferences() {
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.removeItem(USER_PREFERENCES_KEY);
    } catch {
      // Ignore storage failures.
    }
  }

  return writeUserPreferences(DEFAULT_USER_PREFERENCES);
}
