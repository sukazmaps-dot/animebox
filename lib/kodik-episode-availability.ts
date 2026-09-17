import 'server-only';

export type KodikEpisodeAvailabilityStatus =
  | 'available'
  | 'unavailable'
  | 'unknown';

export type KodikTranslation = {
  id?: number;
  title?: string;
  type?: string;
};

export type KodikSearchResult = {
  id?: string;
  link?: string;
  type?: string;
  translation?: KodikTranslation;
  last_episode?: number | string | null;
  episodes_count?: number | string | null;
};

type KodikSearchResponse = {
  results?: KodikSearchResult[];
};

export type KodikEpisodeAvailability = {
  status: KodikEpisodeAvailabilityStatus;
  maxEpisode: number | null;
  playableResults: KodikSearchResult[];
  reason: string;
};

class KodikProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'KodikProviderError';
  }
}

function finitePositiveInteger(value: unknown): number | null {
  const number = typeof value === 'number' ? value : Number(value);

  return Number.isSafeInteger(number) && number > 0
    ? number
    : null;
}

function normalizePlayerUrl(url: string) {
  return url.startsWith('//') ? `https:${url}` : url;
}

function playableResults(results: KodikSearchResult[]) {
  return results
    .filter(
      (item): item is KodikSearchResult & { link: string } =>
        typeof item.link === 'string' && item.link.trim().length > 0,
    )
    .map((item) => ({
      ...item,
      link: normalizePlayerUrl(item.link.trim()),
    }));
}

export async function searchKodikByShikimoriId(
  shikimoriId: number,
  options: {
    signal?: AbortSignal;
    noStore?: boolean;
  } = {},
): Promise<KodikSearchResult[]> {
  if (!Number.isSafeInteger(shikimoriId) || shikimoriId <= 0) {
    throw new KodikProviderError('Invalid Shikimori ID');
  }

  const token = process.env.KODIK_TOKEN?.trim();

  if (!token) {
    throw new KodikProviderError('KODIK_TOKEN is not configured');
  }

  const params = new URLSearchParams({
    token,
    shikimori_id: String(shikimoriId),
    limit: '50',
  });

  const response = await fetch(
    `https://kodik-api.com/search?${params.toString()}`,
    options.noStore
      ? {
          cache: 'no-store',
          signal: options.signal,
        }
      : {
          next: { revalidate: 60 * 30 },
          signal: options.signal,
        },
  );

  if (!response.ok) {
    throw new KodikProviderError(
      `Kodik API HTTP ${response.status}`,
    );
  }

  let data: KodikSearchResponse;

  try {
    data = (await response.json()) as KodikSearchResponse;
  } catch {
    throw new KodikProviderError('Kodik returned invalid JSON');
  }

  return playableResults(data.results ?? []);
}

export function filterKodikResultsForEpisode(
  results: KodikSearchResult[],
  episode: number,
): {
  status: KodikEpisodeAvailabilityStatus;
  maxEpisode: number | null;
  results: KodikSearchResult[];
} {
  if (!Number.isSafeInteger(episode) || episode <= 0) {
    return {
      status: 'unknown',
      maxEpisode: null,
      results: [],
    };
  }

  const playable = playableResults(results);

  if (playable.length === 0) {
    return {
      status: 'unavailable',
      maxEpisode: null,
      results: [],
    };
  }

  const withKnownEpisode = playable
    .map((item) => ({
      item,
      lastEpisode: finitePositiveInteger(item.last_episode),
    }));

  const confirmed = withKnownEpisode
    .filter(
      (entry) =>
        entry.lastEpisode !== null && entry.lastEpisode >= episode,
    )
    .map((entry) => entry.item);

  const knownEpisodes = withKnownEpisode
    .map((entry) => entry.lastEpisode)
    .filter((value): value is number => value !== null);

  const maxEpisode = knownEpisodes.length
    ? Math.max(...knownEpisodes)
    : null;

  if (confirmed.length > 0) {
    return {
      status: 'available',
      maxEpisode,
      results: confirmed,
    };
  }

  // If at least one player result does not expose last_episode, we cannot
  // safely prove the requested episode is missing. Treat that as unknown so
  // the notification cron retries instead of producing a false negative.
  if (withKnownEpisode.some((entry) => entry.lastEpisode === null)) {
    return {
      status: 'unknown',
      maxEpisode,
      results: [],
    };
  }

  return {
    status: 'unavailable',
    maxEpisode,
    results: [],
  };
}

export async function checkKodikEpisodeAvailability(
  shikimoriId: number | null | undefined,
  episode: number,
  options: { signal?: AbortSignal } = {},
): Promise<KodikEpisodeAvailability> {
  if (
    !shikimoriId ||
    !Number.isSafeInteger(shikimoriId) ||
    shikimoriId <= 0
  ) {
    return {
      status: 'unknown',
      maxEpisode: null,
      playableResults: [],
      reason: 'No Shikimori ID for Kodik lookup.',
    };
  }

  if (!Number.isSafeInteger(episode) || episode <= 0) {
    return {
      status: 'unknown',
      maxEpisode: null,
      playableResults: [],
      reason: 'Invalid episode number.',
    };
  }

  try {
    const results = await searchKodikByShikimoriId(shikimoriId, {
      signal: options.signal,
      noStore: true,
    });
    const filtered = filterKodikResultsForEpisode(results, episode);

    return {
      status: filtered.status,
      maxEpisode: filtered.maxEpisode,
      playableResults: filtered.results,
      reason:
        filtered.status === 'available'
          ? ''
          : filtered.status === 'unavailable'
            ? 'Requested episode is not available in Kodik yet.'
            : 'Kodik did not expose enough episode metadata to confirm availability.',
    };
  } catch (error) {
    return {
      status: 'unknown',
      maxEpisode: null,
      playableResults: [],
      reason:
        error instanceof Error
          ? error.message
          : 'Kodik availability check failed.',
    };
  }
}
