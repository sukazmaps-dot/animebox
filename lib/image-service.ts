import type { AnimeImage } from '@/types/anime';

export function normalizeImageUrl(
  value?: string | null,
): string | null {
  if (!value) return null;

  const raw = value.trim();
  if (!raw) return null;

  if (
    raw.startsWith('/api/') ||
    raw.startsWith('/anime-placeholder')
  ) {
    return raw;
  }

  if (raw.startsWith('//')) {
    return `https:${raw}`;
  }

  if (raw.startsWith('/')) {
    return raw;
  }

  try {
    const url = new URL(raw);

    if (
      url.protocol !== 'https:' &&
      url.protocol !== 'http:'
    ) {
      return null;
    }

    return url.toString();
  } catch {
    return null;
  }
}

export function proxyImageUrl(
  value?: string | null,
  _malId?: number | null,
): string | null {
  const url = normalizeImageUrl(value);

  if (!url) return null;
  if (url.startsWith('/')) return url;

  const params = new URLSearchParams({ url });
  return `/api/image?${params.toString()}`;
}

/**
 * Poster delivery is intentionally direct-first.
 *
 * Massive anime grids must not fan every poster through Vercel's /_next/image
 * transformation service. We first try the original CDN sizes in order, then
 * use exactly one same-origin proxy fallback for the best original candidate.
 */
function prefersImageProxy(value: string) {
  if (value.startsWith('/')) return false;

  try {
    const host = new URL(value).hostname.toLowerCase();
    return (
      host === 'shikimori.one' ||
      host.endsWith('.shikimori.one') ||
      host === 'shikimori.me' ||
      host.endsWith('.shikimori.me')
    );
  } catch {
    return false;
  }
}

export function buildImageCandidateChain(
  values: Array<string | null | undefined>,
): string[] {
  const originals = Array.from(
    new Set(
      values
        .map(normalizeImageUrl)
        .filter((value): value is string => Boolean(value)),
    ),
  );

  const result: string[] = [];

  for (const original of originals) {
    if (!prefersImageProxy(original)) {
      result.push(original);
      continue;
    }

    // Shikimori media is more reliable through our host-aware proxy because
    // it can send the expected Referer. Do not make the browser fail several
    // hotlink attempts before trying the path that is designed for it.
    const proxied = proxyImageUrl(original);
    if (proxied) result.push(proxied);
    result.push(original);
  }

  const primaryDirect = originals.find(
    (value) => !value.startsWith('/') && !prefersImageProxy(value),
  );

  if (primaryDirect) {
    const proxied = proxyImageUrl(primaryDirect);
    if (proxied && proxied !== primaryDirect) {
      result.push(proxied);
    }
  }

  return Array.from(new Set(result));
}

export function getImageCandidates(
  image?: AnimeImage | null,
): string[] {
  if (!image) return [];

  return buildImageCandidateChain([
    image.extraLarge,
    image.large,
    image.medium,
    image.original,
    image.preview,
  ]);
}
