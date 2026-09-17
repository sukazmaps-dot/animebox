import type { EpisodeAvailabilityResponse } from '@/types/episode-availability';

type CacheEntry = {
  expiresAt: number;
  data: EpisodeAvailabilityResponse;
};

const cache = new Map<number, CacheEntry>();
const pending = new Map<number, Promise<EpisodeAvailabilityResponse>>();

function ttlFor(data: EpisodeAvailabilityResponse) {
  if (data.status === 'available') return 5 * 60_000;
  if (data.status === 'unavailable') return 2 * 60_000;
  return 30_000;
}

export async function getEpisodeAvailability(
  animeId: number,
  options: { signal?: AbortSignal } = {},
): Promise<EpisodeAvailabilityResponse> {
  const cached = cache.get(animeId);
  if (cached && cached.expiresAt > Date.now()) return cached.data;
  if (cached) cache.delete(animeId);

  const existing = pending.get(animeId);
  if (existing) return existing;

  const request = fetch(`/api/anime/${animeId}/episode-availability`, {
    signal: options.signal,
    cache: 'default',
  })
    .then(async (response) => {
      if (!response.ok) throw new Error(`Episode availability HTTP ${response.status}`);
      return (await response.json()) as EpisodeAvailabilityResponse;
    })
    .then((data) => {
      cache.set(animeId, {
        expiresAt: Date.now() + ttlFor(data),
        data,
      });
      return data;
    })
    .finally(() => {
      pending.delete(animeId);
    });

  pending.set(animeId, request);
  return request;
}

export function peekEpisodeAvailability(animeId: number) {
  const cached = cache.get(animeId);
  if (!cached || cached.expiresAt <= Date.now()) return null;
  return cached.data;
}
