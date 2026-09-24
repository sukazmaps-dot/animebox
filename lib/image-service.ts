import type { AnimeImage } from '@/types/anime';
import { buildAnimeBoxMediaCandidates } from '@/lib/media-delivery';

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
 * Poster delivery policy:
 *
 * 1. AnimeBox media edge (Cloudflare Worker -> edge cache -> R2 when bound)
 * 2. optional RU media edge
 * 3. best original source
 * 4. one secondary original source
 * 5. one legacy same-origin proxy fallback
 *
 * This keeps the normal path to one request per poster while preserving a
 * bounded fallback chain. We intentionally do not fan every AniList size
 * through both direct and proxied URLs.
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

  const local = originals.filter((value) => value.startsWith('/'));
  const remote = originals.filter((value) => !value.startsWith('/'));

  if (remote.length === 0) {
    return local;
  }

  const primary = remote[0];
  const secondary = remote.find((value) => value !== primary) ?? null;
  const result: string[] = [
    ...buildAnimeBoxMediaCandidates(primary),
    primary,
  ];

  if (secondary) {
    result.push(secondary);
  }

  const legacyProxy = proxyImageUrl(primary);
  if (legacyProxy && legacyProxy !== primary) {
    result.push(legacyProxy);
  }

  result.push(...local);

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
