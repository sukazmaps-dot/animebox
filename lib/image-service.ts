import type { AnimeImage } from '@/types/anime';
import {
  buildAnimeBoxMediaCandidates,
  buildAnimeBoxMediaDefaultVariant,
  buildAnimeBoxMediaSrcSet,
  buildMediaCandidateSrcSet,
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

  const params = new URLSearchParams({ url, fallback: 'error' });
  return `/api/image?${params.toString()}`;
}

function prefersLegacyProxy(value: string): boolean {
  try {
    const host = new URL(value).hostname.toLowerCase();
    return (
      host === 'shikimori.io' ||
      host.endsWith('.shikimori.io') ||
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
 * 3. best browser-safe source (Shikimori through same-origin proxy)
 * 4. one secondary browser-safe source
 * 5. one legacy same-origin proxy fallback
 *
 * This keeps the normal path to one request per poster while preserving a
 * bounded fallback chain. We intentionally do not fan every AniList size
 * through both direct and proxied URLs.
 */
// Only classify URLs actually present in metadata. Never manufacture a
// larger path by replacing /small/ or guessing a provider filename.
function posterSourceQuality(value: string): number {
  try {
    const url = new URL(value);
    if (url.hostname === 'anilist.co' || url.hostname.endsWith('.anilist.co')) {
      if (/\/cover\/small\//.test(url.pathname)) return 0;
      if (/\/cover\/medium\//.test(url.pathname)) return 1;
      if (/\/cover\/large\//.test(url.pathname)) return 3;
    }
    if (prefersLegacyProxy(value) && /\/(?:preview|x48|x96)\//.test(url.pathname)) return 0;
  } catch { /* Local candidates preserve their existing relative order. */ }
  return 2;
}

function optimizeRecoveryProxy(value: string | null): string | null {
  if (!value) return null;
  const url = new URL(value, 'https://youranimebox.com');
  url.searchParams.set('optimize', 'webp');
  return url.pathname + url.search;
}

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

  // The field named extraLarge may itself contain a thumbnail from a saved
  // snapshot. Move known small/medium URLs behind available originals only.
  if (delivery && delivery.preset !== 'tiny') {
    remote.sort((a, b) => posterSourceQuality(b) - posterSourceQuality(a));
  }
  const primary = remote[0];
  const secondary = remote.find((value) => new URL(value).origin !== new URL(primary).origin)
    ?? remote.find((value) => value !== primary) ?? null;
  // Keep independent providers ahead of repeated sizes on the same CDN.
  // Only two extra URLs survive: a corrupt provider payload cannot fan out.
  const remaining = remote.filter(value => value !== primary && value !== secondary)
    .slice(0, 2).map(value => prefersLegacyProxy(value) ? proxyImageUrl(value)! : value);
  const secondaryFallback = secondary
    ? prefersLegacyProxy(secondary) ? proxyImageUrl(secondary) : secondary
    : null;
  const secondaryProxy = secondary ? proxyImageUrl(secondary) : null;
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
  if (delivery && delivery.preset !== 'tiny') {
    // A blocked edge does not prove the source is unavailable to the app.
    // Recover the SAME best-known original before accepting a small size.
    const recoveryProxy = optimizeRecoveryProxy(legacyProxy);
    if (recoveryProxy) result.push(recoveryProxy);
    if (secondaryFallback) result.push(secondaryFallback);
    if (!prefersLegacyProxy(primary)) result.push(primary);
    result.push(...remaining);
    if (secondaryProxy && !result.includes(secondaryProxy)) result.push(secondaryProxy);
    result.push(...local.slice(0, 2));
    return Array.from(new Set(result));
  }

  // Compact schedule posters have a verified same-origin recovery path.
  // Avoid trying several blocked browser sizes before this route after edge 403.
  if (delivery?.preset === 'tiny' && legacyProxy) {
    result.push(legacyProxy);
    if (secondaryFallback) result.push(secondaryFallback);
    if (secondaryProxy) result.push(secondaryProxy);
    result.push(...remaining, ...local.slice(0, 2));
    return Array.from(new Set(result));
  }

  // Shikimori must stay server-side: direct browser requests reset/403.
  if (prefersLegacyProxy(primary) && legacyProxy) {
    if (secondaryFallback) result.push(secondaryFallback);
    result.push(...remaining, legacyProxy, ...local.slice(0, 2));
    return Array.from(new Set(result));
  }

  if (mediaCandidates.length > 0) {
    // If the AnimeBox edge has already failed for the primary object, try a
    // genuinely different source/size before re-hitting that same origin.
    if (secondaryFallback) result.push(secondaryFallback);
    result.push(primary);
  } else {
    result.push(primary);
    if (secondaryFallback) result.push(secondaryFallback);
  }

  result.push(...remaining);

  // Preserve a server route for the alternate original when the edge/browser fail.
  if (secondaryProxy && !result.includes(secondaryProxy)) result.push(secondaryProxy);

  if (
    legacyProxy &&
    legacyProxy !== primary &&
    !result.includes(legacyProxy)
  ) {
    result.push(legacyProxy);
  }

  result.push(...local.slice(0, 2));

  return Array.from(new Set(result));
}

export type ImageCandidatePreference = 'quality' | 'compact';

function imageValues(
  image: AnimeImage,
  preference: ImageCandidatePreference,
  preset?: MediaImagePreset,
): Array<string | null | undefined> {
  // Card-sized slots on DPR 2/3 screens need the highest known original.
  // Tiny rows retain their smaller origin and existing traffic budget.
  if (preference === 'compact' && (preset === 'card' || preset === 'large' || preset === 'hero')) {
    return [image.extraLarge, image.large, ...(image.fallbackUrls ?? []).slice(0, 6),
      image.medium, image.original, image.preview];
  }
  if (preference === 'compact') {
    return [
      image.large,
      image.extraLarge,
      ...(image.fallbackUrls ?? []).slice(0, 6),
      image.medium,
      image.original,
      image.preview,
    ];
  }

  return [
    image.extraLarge,
    image.large,
    ...(image.fallbackUrls ?? []).slice(0, 6),
    image.medium,
    image.original,
    image.preview,
  ];
}

function primaryRemoteImage(
  image: AnimeImage,
  preference: ImageCandidatePreference,
  preset?: MediaImagePreset,
): string | null {
  const values = imageValues(image, preference, preset);
  if (preset && preset !== 'tiny') {
    values.sort((a, b) => posterSourceQuality(b ?? '') - posterSourceQuality(a ?? ''));
  }
  for (const value of values) {
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
   * Compact delivery still uses bounded media variants. Card/large/hero slots
   * start from extraLarge for DPR fidelity; tiny slots keep the smaller large
   * original. The Worker chooses a responsive derivative, not an upscale from
   * AniList medium, which remains a last-resort source.
   */
  const preferred = imageValues(image, preference, delivery?.preset);
  return buildImageCandidateChain(
    preferred,
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

  const primary = primaryRemoteImage(image, preference, preset);
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
  const preferred = preset === 'tiny' ? values : [...values]
    .sort((a, b) => posterSourceQuality(b ?? '') - posterSourceQuality(a ?? ''));
  for (const value of preferred) {
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

/** Responsive variants must follow the active delivery endpoint on recovery. */
export function getImageCandidateMediaSrcSet(
  candidate: string,
  preset: MediaImagePreset,
  quality?: number,
  format: MediaImageFormat = 'webp',
): string | undefined {
  return buildMediaCandidateSrcSet(candidate, preset, quality, format);
}
