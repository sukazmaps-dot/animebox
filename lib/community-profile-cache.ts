'use client';

import { communityRequest, type CommunityProfile } from '@/lib/community-client';

const TTL_MS = 45_000;
const PREFIX = 'animebox:community-profile:v4:';
type CacheEntry = { data: CommunityProfile; expiresAt: number };
const memory = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<CommunityProfile>>();

function readSession(userId: string): CacheEntry | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(`${PREFIX}${userId}`);
    if (!raw) return null;
    const value = JSON.parse(raw) as CacheEntry;
    if (!value?.data || value.expiresAt <= Date.now()) {
      window.sessionStorage.removeItem(`${PREFIX}${userId}`);
      return null;
    }
    return value;
  } catch {
    return null;
  }
}

function save(userId: string, data: CommunityProfile) {
  const entry = { data, expiresAt: Date.now() + TTL_MS };
  memory.set(userId, entry);
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(`${PREFIX}${userId}`, JSON.stringify(entry));
  } catch {
    // Restricted/private WebViews may deny storage.
  }
}

export function peekCommunityProfile(userId: string | null | undefined) {
  if (!userId) return null;
  const cached = memory.get(userId);
  if (cached && cached.expiresAt > Date.now()) return cached.data;
  if (cached) memory.delete(userId);
  const session = readSession(userId);
  if (session) {
    memory.set(userId, session);
    return session.data;
  }
  return null;
}

export function invalidateCommunityProfile(userId: string | null | undefined) {
  if (!userId) return;
  memory.delete(userId);
  inflight.delete(userId);
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(`${PREFIX}${userId}`);
  } catch {
    // Ignore storage failures.
  }
}

export async function getCommunityProfileCached(userId: string, force = false) {
  if (!force) {
    const cached = peekCommunityProfile(userId);
    if (cached) return cached;
    const pending = inflight.get(userId);
    if (pending) return pending;
  }

  const request = communityRequest<CommunityProfile>('profile');
  inflight.set(userId, request);
  try {
    const data = await request;
    save(userId, data);
    return data;
  } finally {
    if (inflight.get(userId) === request) inflight.delete(userId);
  }
}
