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

function buildMediaUrl(base: string, source: string): string {
  const params = new URLSearchParams({ url: source });
  return `${base}/image?${params.toString()}`;
}

export function buildAnimeBoxMediaCandidates(
  value?: string | null,
): string[] {
  const source = normalizeRemoteUrl(value);
  if (!source) return [];

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
      [
        primary ? buildMediaUrl(primary, source) : null,
        ru ? buildMediaUrl(ru, source) : null,
      ].filter((item): item is string => Boolean(item)),
    ),
  );
}
