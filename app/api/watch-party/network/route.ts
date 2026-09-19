import { createHmac } from 'node:crypto';

import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DEFAULT_STUN_URLS = [
  'stun:stun.l.google.com:19302',
  'stun:stun1.l.google.com:19302',
];

function envText(name: string) {
  const value = process.env[name]?.trim();
  return value || null;
}

function envBoolean(name: string, fallback = false) {
  const value = envText(name)?.toLowerCase();
  if (value == null) return fallback;
  return value === '1' || value === 'true' || value === 'yes' || value === 'on';
}

function envPort(name: string, fallback: number) {
  const value = Number(envText(name));
  return Number.isSafeInteger(value) && value >= 1 && value <= 65535
    ? value
    : fallback;
}

function envInteger(name: string, fallback: number, min: number, max: number) {
  const value = Number(envText(name));
  return Number.isSafeInteger(value)
    ? Math.max(min, Math.min(max, value))
    : fallback;
}

function envUrls(name: string, fallback: string[] = []) {
  const raw = envText(name);
  if (!raw) return fallback;

  return raw
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
    .slice(0, 12);
}

function normalizePath(value: string | null) {
  if (!value) return '/peerjs';
  return value.startsWith('/') ? value : `/${value}`;
}

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return Response.json(
        { error: 'auth_required' },
        { status: 401, headers: { 'Cache-Control': 'private, no-store' } },
      );
    }

    const signalHost = envText('WATCH_PARTY_SIGNAL_HOST');
    const signalPort = envPort('WATCH_PARTY_SIGNAL_PORT', 443);
    const signalSecure = envBoolean('WATCH_PARTY_SIGNAL_SECURE', true);
    const signalPath = normalizePath(envText('WATCH_PARTY_SIGNAL_PATH'));
    const signalKey = envText('WATCH_PARTY_SIGNAL_KEY');

    const signaling = signalHost
      ? {
          host: signalHost,
          port: signalPort,
          secure: signalSecure,
          path: signalPath,
          ...(signalKey ? { key: signalKey } : {}),
        }
      : null;

    const stunUrls = envUrls('WATCH_PARTY_STUN_URLS', DEFAULT_STUN_URLS);
    const turnUrls = envUrls('WATCH_PARTY_TURN_URLS');

    const turnSecret = envText('WATCH_PARTY_TURN_SECRET');
    const staticTurnUsername = envText('WATCH_PARTY_TURN_USERNAME');
    const staticTurnCredential = envText('WATCH_PARTY_TURN_CREDENTIAL');

    const iceServers: RTCIceServer[] = [];

    if (stunUrls.length) {
      iceServers.push({ urls: stunUrls });
    }

    let expiresAt: number | null = null;
    let turnConfigured = false;

    if (turnUrls.length && turnSecret) {
      const ttl = envInteger('WATCH_PARTY_TURN_TTL_SECONDS', 3600, 300, 7200);
      const expires = Math.floor(Date.now() / 1000) + ttl;
      const username = `${expires}:${user.id}`;
      const credential = createHmac('sha1', turnSecret)
        .update(username)
        .digest('base64');

      iceServers.push({
        urls: turnUrls,
        username,
        credential,
      });

      expiresAt = expires * 1000;
      turnConfigured = true;
    } else if (turnUrls.length && staticTurnUsername && staticTurnCredential) {
      // Compatibility mode for managed TURN providers that issue a fixed
      // username/password pair. Coturn shared-secret mode above is preferred.
      iceServers.push({
        urls: turnUrls,
        username: staticTurnUsername,
        credential: staticTurnCredential,
      });
      turnConfigured = true;
    }

    return Response.json(
      {
        signaling,
        signalingMode: signaling ? 'self-hosted' : 'peerjs-cloud',
        iceServers,
        turnConfigured,
        forceRelay: envBoolean('WATCH_PARTY_FORCE_RELAY', false),
        expiresAt,
      },
      {
        headers: {
          'Cache-Control': 'private, no-store, max-age=0',
          Vary: 'Cookie',
        },
      },
    );
  } catch (error) {
    console.error('[Watch Together network config]', error);
    return Response.json(
      { error: 'network_config_unavailable' },
      { status: 503, headers: { 'Cache-Control': 'private, no-store' } },
    );
  }
}
