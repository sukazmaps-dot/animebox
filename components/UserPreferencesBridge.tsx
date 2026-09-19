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
    applyUserPreferences(readUserPreferences());

    const onChange = (event: Event) => {
      const detail = (event as CustomEvent<UserPreferences>).detail;
      applyUserPreferences(detail ?? readUserPreferences());
    };

    window.addEventListener(USER_PREFERENCES_EVENT, onChange);
    return () => window.removeEventListener(USER_PREFERENCES_EVENT, onChange);
  }, []);

  return null;
}
