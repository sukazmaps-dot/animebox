import 'server-only';

import {
  isTransientUpstreamResponse,
  runWithUpstreamBudget,
} from '@/lib/upstream-resilience-server';

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
  verifiedPlayerUrl: string | null;
  reason: string;
};

type PlayerProbeResult = {
  url: string;
  reachable: boolean;
  status: number | null;
  reason: string;
};

class KodikProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'KodikProviderError';
  }
}

const PLAYER_PROBE_TIMEOUT_MS = 6_000;
const PLAYER_PROBE_LIMIT = 3;

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

function isHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

async function probePlayerUrl(
  url: string,
  externalSignal?: AbortSignal,
): Promise<PlayerProbeResult> {
  if (!isHttpUrl(url)) {
    return {
      url,
      reachable: false,
      status: null,
      reason: 'Player URL is not HTTP(S).',
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PLAYER_PROBE_TIMEOUT_MS);

  const abortFromParent = () => controller.abort();
  externalSignal?.addEventListener('abort', abortFromParent, { once: true });

  try {
    if (externalSignal?.aborted) {
      controller.abort();
    }

    const siteUrl = (
      process.env.NEXT_PUBLIC_SITE_URL ?? 'https://youranimebox.com'
    ).replace(/\/$/, '');

    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      cache: 'no-store',
      signal: controller.signal,
      headers: {
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ru,en;q=0.8',
        Referer: `${siteUrl}/`,
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/151.0.0.0 Safari/537.36 AnimeBoxPlayerProbe/1.0',
      },
    });

    // We only need to prove that the player endpoint answers successfully.
    // Do not download the full iframe HTML/body during the notification cron.
    await response.body?.cancel().catch(() => undefined);

    if (response.ok) {
      return {
        url,
        reachable: true,
        status: response.status,
        reason: '',
      };
    }

    return {
      url,
      reachable: false,
      status: response.status,
      reason: `Player URL HTTP ${response.status}.`,
    };
  } catch (error) {
    return {
      url,
      reachable: false,
      status: null,
      reason:
        error instanceof Error
          ? error.name === 'AbortError'
            ? 'Player URL probe timed out.'
            : error.message
          : 'Player URL probe failed.',
    };
  } finally {
    clearTimeout(timer);
    externalSignal?.removeEventListener('abort', abortFromParent);
  }
}

async function verifyAtLeastOnePlayerUrl(
  results: KodikSearchResult[],
  signal?: AbortSignal,
): Promise<{
  reachableResult: KodikSearchResult | null;
  probes: PlayerProbeResult[];
}> {
  const candidates = playableResults(results).slice(0, PLAYER_PROBE_LIMIT);

  if (!candidates.length) {
    return { reachableResult: null, probes: [] };
  }

  // Probe a few translations in parallel. One healthy iframe is enough for
  // AnimeBox to truthfully say that this episode can be opened in the player.
  const probes = await Promise.all(
    candidates.map((item) => probePlayerUrl(item.link!, signal)),
  );

  const reachableIndex = probes.findIndex((probe) => probe.reachable);

  return {
    reachableResult:
      reachableIndex >= 0 ? candidates[reachableIndex] ?? null : null,
    probes,
  };
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

  const requestInit: RequestInit = options.noStore
    ? {
        cache: 'no-store',
        signal: options.signal,
      }
    : {
        next: { revalidate: 60 * 30 },
        signal: options.signal,
      };

  const response = await runWithUpstreamBudget(
    'kodik',
    () =>
      fetch(
        `https://kodik-api.com/search?${params.toString()}`,
        requestInit,
      ),
    {
      signal: options.signal,
      isFailure: isTransientUpstreamResponse,
      abortIsFailure: false,
    },
  );

  if (!response.ok) {
    throw new KodikProviderError(`Kodik API HTTP ${response.status}`);
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

  const withKnownEpisode = playable.map((item) => ({
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
  options: { signal?: AbortSignal; verifyPlayerUrl?: boolean } = {},
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
      verifiedPlayerUrl: null,
      reason: 'No Shikimori ID for Kodik lookup.',
    };
  }

  if (!Number.isSafeInteger(episode) || episode <= 0) {
    return {
      status: 'unknown',
      maxEpisode: null,
      playableResults: [],
      verifiedPlayerUrl: null,
      reason: 'Invalid episode number.',
    };
  }

  try {
    const results = await searchKodikByShikimoriId(shikimoriId, {
      signal: options.signal,
      noStore: true,
    });
    const filtered = filterKodikResultsForEpisode(results, episode);

    if (filtered.status !== 'available') {
      return {
        status: filtered.status,
        maxEpisode: filtered.maxEpisode,
        playableResults: filtered.results,
        verifiedPlayerUrl: null,
        reason:
          filtered.status === 'unavailable'
            ? 'Requested episode is not available in Kodik yet.'
            : 'Kodik did not expose enough episode metadata to confirm availability.',
      };
    }

    if (options.verifyPlayerUrl === false) {
      return {
        status: 'available',
        maxEpisode: filtered.maxEpisode,
        playableResults: filtered.results,
        verifiedPlayerUrl: filtered.results[0]?.link ?? null,
        reason: '',
      };
    }

    const verification = await verifyAtLeastOnePlayerUrl(
      filtered.results,
      options.signal,
    );

    if (!verification.reachableResult?.link) {
      const probeSummary = verification.probes
        .map((probe) =>
          probe.status == null
            ? probe.reason
            : `HTTP ${probe.status}`,
        )
        .filter(Boolean)
        .join(', ');

      return {
        // Kodik metadata says the episode exists, but the iframe itself could
        // not be reached. This is transient/ambiguous, so retry later instead
        // of falsely sending the notification or marking the episode absent.
        status: 'unknown',
        maxEpisode: filtered.maxEpisode,
        playableResults: [],
        verifiedPlayerUrl: null,
        reason: probeSummary
          ? `Episode exists in Kodik, but player URL is not reachable yet: ${probeSummary}`
          : 'Episode exists in Kodik, but player URL is not reachable yet.',
      };
    }

    return {
      status: 'available',
      maxEpisode: filtered.maxEpisode,
      playableResults: filtered.results,
      verifiedPlayerUrl: verification.reachableResult.link,
      reason: '',
    };
  } catch (error) {
    return {
      status: 'unknown',
      maxEpisode: null,
      playableResults: [],
      verifiedPlayerUrl: null,
      reason:
        error instanceof Error
          ? error.message
          : 'Kodik availability check failed.',
    };
  }
}
