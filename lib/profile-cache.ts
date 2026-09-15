'use client';

const KEY = 'animebox:profile:v1';
const TTL = 5 * 60 * 1000;

type CachedProfile<T> = {
  userId: string;
  data: T;
  expiresAt: number;
};

export function saveProfileCache<T>(userId: string, data: T) {
  try {
    const value: CachedProfile<T> = {
      userId,
      data,
      expiresAt: Date.now() + TTL,
    };
    localStorage.setItem(KEY, JSON.stringify(value));
  } catch {
    // localStorage may be unavailable in restricted/private environments.
  }
}

export function readProfileCache<T>(userId: string): T | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;

    const cached = JSON.parse(raw) as CachedProfile<T>;
    if (cached.userId !== userId || cached.expiresAt < Date.now()) {
      localStorage.removeItem(KEY);
      return null;
    }

    return cached.data;
  } catch {
    return null;
  }
}

export function clearProfileCache() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Ignore storage failures.
  }
}
