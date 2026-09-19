export const USER_PREFERENCES_KEY = 'animebox:user-preferences:v1';
export const USER_PREFERENCES_EVENT = 'animebox:user-preferences-changed';

export type UserPreferences = {
  autoNextEpisode: boolean;
  reduceMotion: boolean;
};

export const DEFAULT_USER_PREFERENCES: UserPreferences = {
  autoNextEpisode: true,
  reduceMotion: false,
};

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

export function applyUserPreferences(preferences: UserPreferences) {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.animeboxReduceMotion = preferences.reduceMotion
    ? 'true'
    : 'false';
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
