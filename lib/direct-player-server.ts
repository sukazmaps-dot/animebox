import 'server-only';

export type DirectPlayerStream = {
  title: string;
  url: string;
  type: 'hls' | 'video';
  quality: string | null;
};

export type DirectPlayerResult = {
  enabled: boolean;
  provider: string;
  streams: DirectPlayerStream[];
  reason?: string;
};

const REQUEST_TIMEOUT_MS = 5_000;
const MAX_STREAMS = 24;

function envFlag(name: string) {
  return /^(1|true|yes|on)$/i.test(process.env[name]?.trim() || '');
}

function cleanLabel(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const label = value.replace(/\s+/g, ' ').trim();
  return label ? label.slice(0, 120) : null;
}

function inferQuality(value: string): string | null {
  const match = value.match(/(?:^|\D)(2160|1440|1080|720|576|480|360)p?(?:\D|$)/i);
  return match ? `${match[1]}p` : null;
}

function isDirectMediaUrl(value: string) {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) return false;
    return /\.m3u8(?:$|[?#])/i.test(value) || /\.mp4(?:$|[?#])/i.test(value);
  } catch {
    return false;
  }
}

function collectStreams(input: unknown): DirectPlayerStream[] {
  const found = new Map<string, DirectPlayerStream>();
  const seen = new Set<unknown>();

  function visit(value: unknown, context: string[], depth: number) {
    if (depth > 8 || value == null || found.size >= MAX_STREAMS) return;

    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!isDirectMediaUrl(trimmed)) return;
      const type = /\.m3u8(?:$|[?#])/i.test(trimmed) ? 'hls' : 'video';
      const contextLabel = context.filter(Boolean).join(' · ');
      const quality = inferQuality(`${contextLabel} ${trimmed}`);
      const title = contextLabel || quality || (type === 'hls' ? 'Авто HLS' : 'Видео');
      found.set(trimmed, { title: title.slice(0, 120), url: trimmed, type, quality });
      return;
    }

    if (typeof value !== 'object' || seen.has(value)) return;
    seen.add(value);

    if (Array.isArray(value)) {
      value.slice(0, 100).forEach((item) => visit(item, context, depth + 1));
      return;
    }

    const record = value as Record<string, unknown>;
    const localLabel =
      cleanLabel(record.translation) ||
      cleanLabel(record.name) ||
      cleanLabel(record.title) ||
      cleanLabel(record.quality) ||
      cleanLabel(record.resolution);
    const nextContext = localLabel ? [...context.slice(-1), localLabel] : context;

    for (const [key, child] of Object.entries(record)) {
      if (['iframe', 'iframe_url', 'poster', 'image', 'cover', 'trailer'].includes(key.toLowerCase())) {
        continue;
      }
      visit(child, nextContext, depth + 1);
      if (found.size >= MAX_STREAMS) break;
    }
  }

  visit(input, [], 0);

  return [...found.values()].sort((a, b) => {
    const aq = Number.parseInt(a.quality || '', 10) || 0;
    const bq = Number.parseInt(b.quality || '', 10) || 0;
    return bq - aq;
  });
}

export async function resolveDirectPlayerStreams(input: {
  shikimoriId: number;
  episode: number;
  signal?: AbortSignal;
}): Promise<DirectPlayerResult> {
  if (!envFlag('DIRECT_PLAYER_ENABLED') && !envFlag('NEXT_PUBLIC_DIRECT_PLAYER_ENABLED')) {
    return { enabled: false, provider: 'Alloha Direct', streams: [], reason: 'feature_disabled' };
  }

  const token = process.env.ALLOHA_API_TOKEN?.trim();
  if (!token) {
    return { enabled: true, provider: 'Alloha Direct', streams: [], reason: 'provider_not_configured' };
  }

  const endpoint = process.env.ALLOHA_DIRECT_ENDPOINT?.trim() || 'https://api.alloha.tv/';
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return { enabled: true, provider: 'Alloha Direct', streams: [], reason: 'invalid_provider_endpoint' };
  }

  url.searchParams.set('token', token);
  url.searchParams.set('shikimori', String(input.shikimoriId));
  url.searchParams.set('episode', String(input.episode));

  const signal = AbortSignal.any([
    input.signal ?? new AbortController().signal,
    AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  ]);

  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      redirect: 'follow',
      signal,
    });

    if (!response.ok) {
      return {
        enabled: true,
        provider: 'Alloha Direct',
        streams: [],
        reason: `provider_http_${response.status}`,
      };
    }

    const payload: unknown = await response.json();
    const streams = collectStreams(payload);

    return {
      enabled: true,
      provider: 'Alloha Direct',
      streams,
      reason: streams.length ? undefined : 'direct_stream_not_found',
    };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error;
    return {
      enabled: true,
      provider: 'Alloha Direct',
      streams: [],
      reason: 'provider_unavailable',
    };
  }
}
