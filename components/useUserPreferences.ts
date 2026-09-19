'use client';

import { useEffect, useState } from 'react';

import {
  DEFAULT_USER_PREFERENCES,
  readUserPreferences,
  USER_PREFERENCES_EVENT,
  type UserPreferences,
} from '@/lib/user-preferences';

export function useUserPreferences() {
  const [preferences, setPreferences] = useState<UserPreferences>(DEFAULT_USER_PREFERENCES);

  useEffect(() => {
    const hydrateTimer = window.setTimeout(() => {
      setPreferences(readUserPreferences());
    }, 0);

    const onChange = (event: Event) => {
      const detail = (event as CustomEvent<UserPreferences>).detail;
      setPreferences(detail ?? readUserPreferences());
    };

    window.addEventListener(USER_PREFERENCES_EVENT, onChange);
    window.addEventListener('storage', onChange);

    return () => {
      window.clearTimeout(hydrateTimer);
      window.removeEventListener(USER_PREFERENCES_EVENT, onChange);
      window.removeEventListener('storage', onChange);
    };
  }, []);

  return preferences;
}
