export type AniLibriaVideo = {
  title: string;
  url: string;
  type: 'hls' | 'iframe' | 'video';
  quality?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeUrl(value: unknown, base?: string): string | null {
  if (typeof value !== 'string') return null;

  const raw = value.trim();
  if (!raw) return null;

  if (raw.startsWith('//')) return `https:${raw}`;

  if (/^https?:\/\//i.test(raw)) return raw;

  if (!base) return raw.startsWith('/') ? raw : `/${raw}`;

  try {
    return new URL(raw, base.endsWith('/') ? base : `${base}/`).toString();
  } catch {
    return null;
  }
}

function collectUrls(
  value: unknown,
  base: string | undefined,
  path: string[] = [],
  result: Array<{ url: string; key: string }>,
): void {
  if (typeof value === 'string') {
    if (!/\.m3u8(?:$|\?)/i.test(value)) return;

    const url = normalizeUrl(value, base);
    if (!url) return;

    result.push({
      url,
      key: path[path.length - 1] || 'hls',
    });
    return;
  }

  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      collectUrls(item, base, [...path, String(index)], result);
    }
    return;
  }

  if (!isRecord(value)) return;

  for (const [key, item] of Object.entries(value)) {
    collectUrls(item, base, [...path, key], result);
  }
}

function qualityLabel(key: string): string {
  const normalized = key.toLowerCase();

  if (normalized.includes('1080') || normalized.includes('fhd') || normalized.includes('fullhd')) {
    return '1080p';
  }

  if (normalized.includes('720') || normalized.includes('hd')) {
    return '720p';
  }

  if (normalized.includes('480') || normalized.includes('sd')) {
    return '480p';
  }

  if (normalized.includes('360')) {
    return '360p';
  }

  return key.toUpperCase();
}

export function extractHlsVideos(episode: unknown, host?: unknown): AniLibriaVideo[] {
  const hostValue =
    typeof host === 'string'
      ? host
      : isRecord(host)
        ? host.hls ?? host.host ?? host.default
        : undefined;

  const base = typeof hostValue === 'string'
    ? (/^https?:\/\//i.test(hostValue) ? hostValue : `https://${hostValue}`) : undefined;

  const containers: unknown[] = [];

  if (isRecord(episode)) {
    if ('hls' in episode) containers.push(episode.hls);
    if ('src' in episode) containers.push(episode.src);

    for (const key of ['hls_1080', 'hls_720', 'hls_480', 'hls_360']) {
      if (key in episode) containers.push({ [key]: episode[key] });
    }

    containers.push(episode);
  } else {
    containers.push(episode);
  }

  const found: Array<{ url: string; key: string }> = [];

  for (const container of containers) {
    collectUrls(container, base, [], found);
  }

  const unique = new Map<string, { url: string; key: string }>();
  for (const item of found) {
    if (!unique.has(item.url)) {
      unique.set(item.url, item);
    }
  }

  const priority = new Map([
    ['fhd', 0],
    ['1080', 0],
    ['hls_1080', 0],
    ['hd', 1],
    ['720', 1],
    ['hls_720', 1],
    ['sd', 2],
    ['480', 2],
    ['hls_480', 2],
    ['360', 3],
    ['hls_360', 3],
  ]);

  return Array.from(unique.values())
    .sort((a, b) => {
      const pa = priority.get(a.key.toLowerCase()) ?? 99;
      const pb = priority.get(b.key.toLowerCase()) ?? 99;
      return pa - pb;
    })
    .map(({ url, key }) => ({
      title: qualityLabel(key),
      quality: qualityLabel(key),
      url,
      type: 'hls' as const,
    }));
}

export function getEpisodeFromList(list: unknown, episodeNumber: number): unknown {
  if (Array.isArray(list)) {
    return (
      list.find((item) => {
        if (!isRecord(item)) return false;

        const value = Number(item.episode ?? item.ordinal ?? item.number);
        return Number.isFinite(value) && value === episodeNumber;
      })
    );
  }

  if (!isRecord(list)) return undefined;

  const direct =
    list[String(episodeNumber)] ??
    list[episodeNumber] ??
    list[`ep${episodeNumber}`];

  if (isRecord(direct)) {
    const ordinal = direct.episode ?? direct.ordinal ?? direct.number;
    if (ordinal == null || Number(ordinal) === episodeNumber) return direct;
  }

  for (const value of Object.values(list)) {
    if (!isRecord(value)) continue;

    const candidate = Number(value.episode ?? value.ordinal ?? value.number);
    if (Number.isFinite(candidate) && candidate === episodeNumber) {
      return value;
    }
  }

  return undefined;
}

export function getExternalPlayer(data: unknown): string | null {
  const candidates: unknown[] = [];

  const visit = (value: unknown, depth = 0): void => {
    if (depth > 6 || value === null || value === undefined) return;

    if (typeof value === 'string') {
      if (/^https?:\/\//i.test(value) || value.startsWith('//')) {
        if (
          value.includes('/video_online') ||
          value.includes('/video/') ||
          value.includes('kodik.') ||
          value.includes('alloha') ||
          value.includes('embed')
        ) {
          candidates.push(value);
        }
      }
      return;
    }

    if (Array.isArray(value)) {
      for (const item of value) visit(item, depth + 1);
      return;
    }

    if (!isRecord(value)) return;

    for (const [key, item] of Object.entries(value)) {
      if (
        key === 'external_player' ||
        key === 'alternative_player' ||
        key === 'iframe' ||
        key === 'embed'
      ) {
        visit(item, depth + 1);
      }
    }
  };

  visit(data);

  const first = candidates.find((value): value is string => typeof value === 'string');
  if (!first) return null;

  return first.startsWith('//') ? `https:${first}` : first;
}
