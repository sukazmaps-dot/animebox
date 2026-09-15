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

  if (!url) {
    return null;
  }

  // Локальные изображения проксировать не нужно.
  if (url.startsWith('/')) {
    return url;
  }

  const params = new URLSearchParams({
    url,
  });

  return `/api/image?${params.toString()}`;
}

/**
 * Сначала пробуем оригинальный CDN.
 * Если он не загрузился — следующий кандидат будет тот же URL через proxy.
 */
export function getImageCandidates(
  image?: AnimeImage | null,
): string[] {
  if (!image) {
    return [];
  }

  const originals = [
    image.extraLarge,
    image.large,
    image.medium,
    image.original,
    image.preview,
  ]
    .map(normalizeImageUrl)
    .filter(
      (value): value is string =>
        Boolean(value),
    );

  const result: string[] = [];

  for (const original of originals) {
    // 1. Прямая ссылка CDN
    result.push(original);

    // 2. Fallback через наш proxy
    const proxied =
      proxyImageUrl(original);

    if (
      proxied &&
      proxied !== original
    ) {
      result.push(proxied);
    }
  }

  return Array.from(
    new Set(result),
  );
}