export const MEDIA_IMAGE_WIDTHS = [
  96,
  144,
  240,
  360,
  540,
  720,
  1080,
  1440,
] as const;

export const MEDIA_IMAGE_QUALITIES = [60, 70, 80] as const;

export type MediaImageWidth = (typeof MEDIA_IMAGE_WIDTHS)[number];
export type MediaImageQuality = (typeof MEDIA_IMAGE_QUALITIES)[number];
export type MediaImageFormat = 'auto' | 'webp' | 'avif';
export type MediaImagePreset = 'tiny' | 'card' | 'large' | 'hero';

type MediaPresetConfig = {
  widths: readonly MediaImageWidth[];
  defaultWidth: MediaImageWidth;
  defaultQuality: MediaImageQuality;
};

const MEDIA_IMAGE_PRESETS: Record<MediaImagePreset, MediaPresetConfig> = {
  tiny: {
    widths: [96, 144, 240],
    defaultWidth: 144,
    defaultQuality: 60,
  },
  card: {
    widths: [240, 360, 540, 720],
    defaultWidth: 360,
    defaultQuality: 70,
  },
  large: {
    widths: [360, 540, 720, 1080],
    defaultWidth: 540,
    defaultQuality: 80,
  },
  hero: {
    widths: [720, 1080, 1440],
    defaultWidth: 1080,
    defaultQuality: 80,
  },
};

export type MediaImageVariant = {
  width: MediaImageWidth;
  quality: MediaImageQuality;
  format: MediaImageFormat;
};

function normalizeBaseUrl(value?: string | null): string | null {
  const raw = value?.trim();
  if (!raw) return null;

  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    return url.origin;
  } catch {
    return null;
  }
}

function normalizeRemoteUrl(value?: string | null): string | null {
  const raw = value?.trim();
  if (!raw) return null;
  if (raw.startsWith('/')) return null;

  try {
    const url = new URL(raw.startsWith('//') ? `https:${raw}` : raw);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function getPrimaryMediaOrigin(): string | null {
  return normalizeBaseUrl(process.env.NEXT_PUBLIC_MEDIA_ORIGIN);
}

export function getRuMediaOrigin(): string | null {
  return normalizeBaseUrl(process.env.NEXT_PUBLIC_MEDIA_RU_ORIGIN);
}

export function getMediaImagePreset(
  preset: MediaImagePreset,
): MediaPresetConfig {
  return MEDIA_IMAGE_PRESETS[preset];
}

export function normalizeMediaImageQuality(
  value: number | null | undefined,
  fallback: MediaImageQuality,
): MediaImageQuality {
  if (!Number.isFinite(value)) return fallback;

  return MEDIA_IMAGE_QUALITIES.reduce((best, candidate) =>
    Math.abs(candidate - Number(value)) < Math.abs(best - Number(value))
      ? candidate
      : best,
  );
}

function buildMediaUrl(
  base: string,
  source: string,
  variant?: MediaImageVariant,
): string {
  const params = new URLSearchParams({ url: source });

  if (variant) {
    params.set('w', String(variant.width));
    params.set('q', String(variant.quality));
    params.set('f', variant.format);
  }

  return `${base}/image?${params.toString()}`;
}

function mediaOriginsForSource(source: string) {
  const primary = getPrimaryMediaOrigin();
  const ru = getRuMediaOrigin();

  try {
    const sourceOrigin = new URL(source).origin;
    if (sourceOrigin === primary || sourceOrigin === ru) return [];
  } catch {
    return [];
  }

  return Array.from(
    new Set(
      [primary, ru].filter((item): item is string => Boolean(item)),
    ),
  );
}

export function buildAnimeBoxMediaCandidates(
  value?: string | null,
  variant?: MediaImageVariant,
): string[] {
  const source = normalizeRemoteUrl(value);
  if (!source) return [];

  return mediaOriginsForSource(source).map((origin) =>
    buildMediaUrl(origin, source, variant),
  );
}

export function buildAnimeBoxMediaSrcSet(
  value: string | null | undefined,
  preset: MediaImagePreset,
  quality?: number,
  format: MediaImageFormat = 'webp',
): string | undefined {
  const source = normalizeRemoteUrl(value);
  if (!source) return undefined;

  const origin = mediaOriginsForSource(source)[0];
  if (!origin) return undefined;

  const config = getMediaImagePreset(preset);
  const normalizedQuality = normalizeMediaImageQuality(
    quality,
    config.defaultQuality,
  );

  return config.widths
    .map((width) => {
      const url = buildMediaUrl(origin, source, {
        width,
        quality: normalizedQuality,
        format,
      });

      return `${url} ${width}w`;
    })
    .join(', ');
}

export function buildAnimeBoxMediaDefaultVariant(
  value: string | null | undefined,
  preset: MediaImagePreset,
  quality?: number,
  format: MediaImageFormat = 'webp',
): MediaImageVariant | undefined {
  const source = normalizeRemoteUrl(value);
  if (!source) return undefined;

  const config = getMediaImagePreset(preset);

  return {
    width: config.defaultWidth,
    quality: normalizeMediaImageQuality(
      quality,
      config.defaultQuality,
    ),
    format,
  };
}
