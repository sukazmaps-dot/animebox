import type { AnimeImage } from '@/types/anime';
import {
  buildAnimeBoxMediaCandidates,
  buildAnimeBoxMediaDefaultVariant,
  buildAnimeBoxMediaSrcSet,
  type MediaImageFormat,
  type MediaImagePreset,
} from '@/lib/media-delivery';

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

function prefersLegacyProxy(value: string): boolean {
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
  delivery?: {
    preset: MediaImagePreset;
    quality?: number;
    format?: MediaImageFormat;
  },
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
  const mediaVariant = delivery
    ? buildAnimeBoxMediaDefaultVariant(
        primary,
        delivery.preset,
        delivery.quality,
        delivery.format ?? 'webp',
      )
    : undefined;
  const mediaCandidates = buildAnimeBoxMediaCandidates(
    primary,
    mediaVariant,
  );
  const legacyProxy = proxyImageUrl(primary);
  const result: string[] = [...mediaCandidates];

  if (
    mediaCandidates.length === 0 &&
    prefersLegacyProxy(primary) &&
    legacyProxy &&
    legacyProxy !== primary
  ) {
    result.push(legacyProxy, primary);
  } else {
    result.push(primary);
  }

  if (secondary) {
    result.push(secondary);
  }

  if (
    legacyProxy &&
    legacyProxy !== primary &&
    !result.includes(legacyProxy)
  ) {
    result.push(legacyProxy);
  }

  result.push(...local);

  return Array.from(new Set(result));
}

export type ImageCandidatePreference = 'quality' | 'compact';

function imageValues(
  image: AnimeImage,
  preference: ImageCandidatePreference,
): Array<string | null | undefined> {
  if (preference === 'compact') {
    return [
      image.large,
      image.extraLarge,
      image.medium,
      image.original,
      image.preview,
    ];
  }

  return [
    image.extraLarge,
    image.large,
    image.medium,
    image.original,
    image.preview,
  ];
}

function primaryRemoteImage(
  image: AnimeImage,
  preference: ImageCandidatePreference,
): string | null {
  for (const value of imageValues(image, preference)) {
    const normalized = normalizeImageUrl(value);
    if (normalized && !normalized.startsWith('/')) return normalized;
  }

  return null;
}

export function getImageCandidates(
  image?: AnimeImage | null,
  preference: ImageCandidatePreference = 'quality',
  delivery?: {
    preset: MediaImagePreset;
    quality?: number;
    format?: MediaImageFormat;
  },
): string[] {
  if (!image) return [];

  /*
   * Compact rails still use bounded AnimeBox media variants, but the upstream
   * source must contain enough pixels for high-DPR phones. AniList medium can
   * be narrower than the rendered CSS slot after DPR scaling, which makes a
   * 240/360px edge variant permanently soft. Start from large, then let the
   * Worker resize/cache the exact responsive variant; medium is only fallback.
   */
  return buildImageCandidateChain(
    imageValues(image, preference),
    delivery,
  );
}

export function getImageMediaSrcSet(
  image: AnimeImage | null | undefined,
  preference: ImageCandidatePreference,
  preset: MediaImagePreset,
  quality?: number,
  format: MediaImageFormat = 'webp',
): string | undefined {
  if (!image) return undefined;

  const primary = primaryRemoteImage(image, preference);
  if (!primary) return undefined;

  return buildAnimeBoxMediaSrcSet(
    primary,
    preset,
    quality,
    format,
  );
}

export function getRawImageMediaSrcSet(
  values: Array<string | null | undefined>,
  preset: MediaImagePreset,
  quality?: number,
  format: MediaImageFormat = 'webp',
): string | undefined {
  for (const value of values) {
    const normalized = normalizeImageUrl(value);
    if (!normalized || normalized.startsWith('/')) continue;

    return buildAnimeBoxMediaSrcSet(
      normalized,
      preset,
      quality,
      format,
    );
  }

  return undefined;
}
