'use client';

import type { DataConnection, PeerOptions, Peer as PeerInstance } from 'peerjs';

export type WatchPartyNetworkRoute = 'unknown' | 'p2p' | 'relay' | 'server';
export type WatchPartySignalingMode = 'peerjs-cloud' | 'self-hosted';

export type WatchPartyNetworkConfig = {
  signaling: {
    host: string;
    port: number;
    path: string;
    secure: boolean;
    key?: string;
  } | null;
  signalingMode: WatchPartySignalingMode;
  iceServers: RTCIceServer[];
  turnConfigured: boolean;
  forceRelay: boolean;
  expiresAt: number | null;
  source: 'server' | 'fallback';
};

const FALLBACK_CONFIG: WatchPartyNetworkConfig = {
  signaling: null,
  signalingMode: 'peerjs-cloud',
  iceServers: [
    {
      urls: [
        'stun:stun.l.google.com:19302',
        'stun:stun1.l.google.com:19302',
      ],
    },
  ],
  turnConfigured: false,
  forceRelay: false,
  expiresAt: null,
  source: 'fallback',
};

function normalizeIceServers(value: unknown): RTCIceServer[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item): RTCIceServer[] => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];

    const record = item as Record<string, unknown>;
    const rawUrls = record.urls;
    const urls = Array.isArray(rawUrls)
      ? rawUrls.filter((url): url is string => typeof url === 'string' && url.trim().length > 0)
      : typeof rawUrls === 'string' && rawUrls.trim()
        ? rawUrls.trim()
        : null;

    if (!urls || (Array.isArray(urls) && urls.length === 0)) return [];

    const server: RTCIceServer = { urls };

    if (typeof record.username === 'string' && record.username) {
      server.username = record.username;
    }
    if (typeof record.credential === 'string' && record.credential) {
      server.credential = record.credential;
    }

    return [server];
  });
}

function normalizeNetworkConfig(value: unknown): WatchPartyNetworkConfig {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return FALLBACK_CONFIG;
  }

  const record = value as Record<string, unknown>;
  const rawSignaling = record.signaling;
  let signaling: WatchPartyNetworkConfig['signaling'] = null;

  if (rawSignaling && typeof rawSignaling === 'object' && !Array.isArray(rawSignaling)) {
    const signal = rawSignaling as Record<string, unknown>;
    const host = typeof signal.host === 'string' ? signal.host.trim() : '';
    const port = Number(signal.port);
    const path = typeof signal.path === 'string' && signal.path.trim()
      ? signal.path.trim()
      : '/';

    if (
      host &&
      Number.isSafeInteger(port) &&
      port >= 1 &&
      port <= 65535 &&
      typeof signal.secure === 'boolean'
    ) {
      signaling = {
        host,
        port,
        path: path.startsWith('/') ? path : `/${path}`,
        secure: signal.secure,
        ...(typeof signal.key === 'string' && signal.key.trim()
          ? { key: signal.key.trim() }
          : {}),
      };
    }
  }

  const iceServers = normalizeIceServers(record.iceServers);

  return {
    signaling,
    signalingMode: signaling ? 'self-hosted' : 'peerjs-cloud',
    iceServers: iceServers.length ? iceServers : FALLBACK_CONFIG.iceServers,
    turnConfigured: Boolean(record.turnConfigured),
    forceRelay: Boolean(record.forceRelay),
    expiresAt:
      typeof record.expiresAt === 'number' && Number.isFinite(record.expiresAt)
        ? record.expiresAt
        : null,
    source: 'server',
  };
}

export async function getWatchPartyNetworkConfig(): Promise<WatchPartyNetworkConfig> {
  try {
    const response = await fetch('/api/watch-party/network', {
      method: 'GET',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) return FALLBACK_CONFIG;

    const payload = await response.json();
    return normalizeNetworkConfig(payload);
  } catch {
    return FALLBACK_CONFIG;
  }
}

export function watchPartyPeerOptions(config: WatchPartyNetworkConfig): PeerOptions {
  const options: PeerOptions = {
    debug: 1,
    config: {
      iceServers: config.iceServers,
      iceTransportPolicy: config.forceRelay ? 'relay' : 'all',
    },
  };

  if (config.signaling) {
    options.host = config.signaling.host;
    options.port = config.signaling.port;
    options.path = config.signaling.path;
    options.secure = config.signaling.secure;

    if (config.signaling.key) {
      options.key = config.signaling.key;
    }
  }

  return options;
}

export async function createWatchPartyPeer(
  peerId?: string,
): Promise<{ peer: PeerInstance; network: WatchPartyNetworkConfig }> {
  const [{ Peer }, network] = await Promise.all([
    import('peerjs'),
    getWatchPartyNetworkConfig(),
  ]);

  const options = watchPartyPeerOptions(network);
  const peer = peerId ? new Peer(peerId, options) : new Peer(options);

  return { peer, network };
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value : '';
}

export async function detectWatchPartyRoute(
  connection: DataConnection,
): Promise<WatchPartyNetworkRoute> {
  try {
    const stats = await connection.peerConnection.getStats();
    const byId = new Map<string, Record<string, unknown>>();
    let selectedPair: Record<string, unknown> | null = null;

    stats.forEach((report) => {
      const row = report as unknown as Record<string, unknown>;
      const id = stringValue(row.id);
      if (id) byId.set(id, row);

      if (
        row.type === 'candidate-pair' &&
        row.state === 'succeeded' &&
        (row.selected === true || row.nominated === true)
      ) {
        selectedPair = row;
      }
    });

    if (!selectedPair) {
      stats.forEach((report) => {
        const row = report as unknown as Record<string, unknown>;
        if (row.type !== 'transport') return;

        const pairId = stringValue(row.selectedCandidatePairId);
        if (pairId) {
          selectedPair = byId.get(pairId) ?? null;
        }
      });
    }

    const chosenPair = selectedPair as Record<string, unknown> | null;
    if (!chosenPair) return 'unknown';

    const local = byId.get(stringValue(chosenPair.localCandidateId));
    const remote = byId.get(stringValue(chosenPair.remoteCandidateId));

    const localType = stringValue(local?.candidateType);
    const remoteType = stringValue(remote?.candidateType);

    if (localType === 'relay' || remoteType === 'relay') return 'relay';
    if (localType || remoteType) return 'p2p';

    return 'unknown';
  } catch {
    return 'unknown';
  }
}

export function describeWatchPartyPeerError(
  error: unknown,
  network: Pick<WatchPartyNetworkConfig, 'turnConfigured' | 'signalingMode'>,
) {
  const type =
    error && typeof error === 'object' && 'type' in error
      ? String((error as { type?: unknown }).type ?? '')
      : '';

  if (
    type === 'network' ||
    type === 'server-error' ||
    type === 'socket-error' ||
    type === 'socket-closed'
  ) {
    return network.signalingMode === 'self-hosted'
      ? 'Не удалось связаться с сервером Watch Together. AnimeBox попробует резервный серверный канал.'
      : 'PeerJS Cloud недоступен. AnimeBox попробует резервный серверный канал.';
  }

  if (type === 'webrtc') {
    return network.turnConfigured
      ? 'WebRTC не смог построить маршрут через ICE/TURN. Переключаемся на резервный серверный канал.'
      : 'Прямое WebRTC-соединение заблокировано сетью/NAT. Переключаемся на резервный серверный канал.';
  }

  if (type === 'peer-unavailable') {
    return 'Хост пока не найден через WebRTC. AnimeBox попробует резервный серверный канал.';
  }

  return 'WebRTC временно недоступен. AnimeBox попробует резервный серверный канал.';
}
