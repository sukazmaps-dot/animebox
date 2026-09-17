'use client';

import type { PublicIdentityRole } from '@/lib/identity';
import type {
  SponsorFrame,
  SponsorNameStyle,
  SponsorPreferences,
  SponsorProfileTheme,
  SponsorStatus,
} from '@/lib/sponsor';

export type SponsorMeData = {
  sponsor: SponsorStatus | null;
  role: PublicIdentityRole;
  totalStars: number;
  telegramLinked: boolean;
  payments: {
    id: string;
    amount: number;
    created_at: string;
    status: 'confirmed' | 'refunded' | 'disputed' | 'reconciliation_error';
    refunded_at: string | null;
    refund_reason: string | null;
  }[];
  page: number;
  hasMore: boolean;
  preferences: SponsorPreferences;
  benefits: {
    adFree: boolean;
    frames: SponsorFrame[];
    nameStyles: SponsorNameStyle[];
    themes: SponsorProfileTheme[];
  };
};

type CacheEntry = { data: SponsorMeData; expiresAt: number };

const TTL_MS = 60_000;
const SESSION_PREFIX = 'animebox:sponsor-me:v4:';
const memory = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<SponsorMeData>>();

function key(userId: string, page: number) {
  return `${userId}:${page}`;
}

function sessionKey(userId: string, page: number) {
  return `${SESSION_PREFIX}${userId}:${page}`;
}

function readSession(userId: string, page: number): CacheEntry | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(sessionKey(userId, page));
    if (!raw) return null;
    const entry = JSON.parse(raw) as CacheEntry;
    if (!entry?.data || entry.expiresAt <= Date.now()) {
      window.sessionStorage.removeItem(sessionKey(userId, page));
      return null;
    }
    return entry;
  } catch {
    return null;
  }
}

function save(userId: string, page: number, data: SponsorMeData) {
  const entry: CacheEntry = { data, expiresAt: Date.now() + TTL_MS };
  memory.set(key(userId, page), entry);
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(sessionKey(userId, page), JSON.stringify(entry));
  } catch {
    // Restricted WebViews may deny sessionStorage.
  }
}

export function peekSponsorMe(userId: string | null | undefined, page = 1) {
  if (!userId) return null;
  const cacheKey = key(userId, page);
  const cached = memory.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.data;
  if (cached) memory.delete(cacheKey);

  const session = readSession(userId, page);
  if (session) {
    memory.set(cacheKey, session);
    return session.data;
  }
  return null;
}

export function invalidateSponsorMe(userId: string | null | undefined) {
  if (!userId) return;
  for (const cacheKey of [...memory.keys()]) {
    if (cacheKey.startsWith(`${userId}:`)) memory.delete(cacheKey);
  }
  for (const cacheKey of [...inflight.keys()]) {
    if (cacheKey.startsWith(`${userId}:`)) inflight.delete(cacheKey);
  }
  if (typeof window === 'undefined') return;
  try {
    for (let page = 1; page <= 10; page += 1) {
      window.sessionStorage.removeItem(sessionKey(userId, page));
    }
  } catch {
    // Ignore storage failures.
  }
}

export async function getSponsorMe(
  userId: string,
  page = 1,
  options: { force?: boolean } = {},
): Promise<SponsorMeData> {
  const cacheKey = key(userId, page);
  if (!options.force) {
    const cached = peekSponsorMe(userId, page);
    if (cached) return cached;
    const pending = inflight.get(cacheKey);
    if (pending) return pending;
  }

  const request = fetch(`/api/monetization/sponsor/me?page=${page}`, {
    cache: 'no-store',
  }).then(async (response) => {
    if (response.status === 401) {
      const error = new Error('AUTH_REQUIRED');
      (error as Error & { status?: number }).status = 401;
      throw error;
    }
    const data = (await response.json()) as SponsorMeData & { error?: string };
    if (!response.ok) throw new Error(data.error || 'Не удалось загрузить поддержку');
    save(userId, page, data);
    return data;
  });

  inflight.set(cacheKey, request);
  try {
    return await request;
  } finally {
    if (inflight.get(cacheKey) === request) inflight.delete(cacheKey);
  }
}
