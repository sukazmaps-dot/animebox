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

  const result = [...originals];
  const primaryRemote = originals.find((value) => !value.startsWith('/'));

  if (primaryRemote) {
    const proxied = proxyImageUrl(primaryRemote);
    if (proxied && proxied !== primaryRemote) {
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
