'use client';

import { useEffect } from 'react';

import {
  applyUserPreferences,
  readUserPreferences,
  USER_PREFERENCES_EVENT,
  type UserPreferences,
} from '@/lib/user-preferences';

export default function UserPreferencesBridge() {
  useEffect(() => {
    const applyCurrent = (value?: UserPreferences) => {
      applyUserPreferences(value ?? readUserPreferences());
    };

    applyCurrent();

    const onChange = (event: Event) => {
      const detail = (event as CustomEvent<UserPreferences>).detail;
      applyCurrent(detail);
    };

    const onStorage = () => {
      applyCurrent();
    };

    const media = window.matchMedia('(prefers-color-scheme: light)');
    const onSystemThemeChange = () => {
      const current = readUserPreferences();
      if (current.theme === 'system') {
        applyCurrent(current);
      }
    };

    window.addEventListener(USER_PREFERENCES_EVENT, onChange);
    window.addEventListener('storage', onStorage);
    media.addEventListener?.('change', onSystemThemeChange);

    return () => {
      window.removeEventListener(USER_PREFERENCES_EVENT, onChange);
      window.removeEventListener('storage', onStorage);
      media.removeEventListener?.('change', onSystemThemeChange);
    };
  }, []);

  return null;
}
