'use client';

import { createClient } from '@/lib/supabase/client';
import {
  parseWatchPartyPacket,
  type WatchPartyInvite,
  type WatchPartyPacket,
} from '@/lib/watch-party';

export type WatchPartyRelayPresence = {
  relayId: string;
  userId: string;
  name: string;
  host: boolean;
  joinedAt: number;
  onlineAt: number;
};

export type WatchPartyRelayStatus = 'connecting' | 'open' | 'closed' | 'error';

export type WatchPartyRelay = {
  id: string;
  send: (packet: WatchPartyPacket, targetId?: string | null) => Promise<boolean>;
  isOpen: () => boolean;
  close: () => Promise<void>;
};

type RelayEnvelope = {
  senderId: string;
  targetId: string | null;
  packet: unknown;
};

type RelayOptions = {
  presence?: Omit<WatchPartyRelayPresence, 'relayId' | 'onlineAt'>;
  onPresence?: (members: WatchPartyRelayPresence[]) => void;
  onStatus?: (status: WatchPartyRelayStatus) => void;
};

const RELAY_SUBSCRIBE_TIMEOUT_MS = 8_000;
const RELAY_PRESENCE_DEBOUNCE_MS = 120;

/**
 * One Watch Together relay per room/topic in a browser tab.
 *
 * React remounts, reconnect paths and route transitions can otherwise briefly
 * leave two Supabase Realtime channels alive for the same room. The registry
 * serializes replacement so a newer relay always closes the previous lease
 * before subscribing.
 */
const activeRelayByTopic = new Map<string, Promise<WatchPartyRelay>>();

function randomId() {
  if (typeof crypto.randomUUID === 'function') {
    return `relay_${crypto.randomUUID().replace(/-/g, '')}`;
  }

  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return `relay_${Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('')}`;
}

function isRelayId(value: unknown): value is string {
  return typeof value === 'string' && /^relay_[a-f0-9]{32}$/i.test(value);
}

function parsePresence(value: unknown): WatchPartyRelayPresence | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (
    !isRelayId(row.relayId) ||
    typeof row.userId !== 'string' ||
    typeof row.name !== 'string' ||
    typeof row.host !== 'boolean'
  ) {
    return null;
  }

  const joinedAt = Number(row.joinedAt);
  const onlineAt = Number(row.onlineAt);
  if (!Number.isFinite(joinedAt) || !Number.isFinite(onlineAt)) return null;

  return {
    relayId: row.relayId,
    userId: row.userId,
    name: row.name.slice(0, 32),
    host: row.host,
    joinedAt,
    onlineAt,
  };
}

async function relayTopic(invite: WatchPartyInvite) {
  const source = new TextEncoder().encode(
    `animebox-watch-together-v3:${invite.roomId}:${invite.secret}`,
  );
  const digest = await crypto.subtle.digest('SHA-256', source);
  const hash = Array.from(new Uint8Array(digest), (value) =>
    value.toString(16).padStart(2, '0'),
  ).join('');

  return `watch-party-relay:${invite.roomId}:${hash.slice(0, 32)}`;
}

export async function openWatchPartyRelay(
  invite: WatchPartyInvite,
  onPacket: (packet: WatchPartyPacket, senderId: string) => void,
  options: RelayOptions = {},
): Promise<WatchPartyRelay> {
  const topic = await relayTopic(invite);
  const previousPromise = activeRelayByTopic.get(topic);

  if (previousPromise) {
    try {
      const previous = await previousPromise;
      await previous.close();
    } catch {
      // Failed/half-open relay is safe to replace.
    }
  }

  const openingPromise: Promise<WatchPartyRelay> = (async () => {
    const supabase = createClient();
    const id = randomId();
    let open = false;
    let closed = false;
    let initialSettled = false;
    let presenceTimer: number | null = null;
    let lastPresenceSignature = '';

    const channel = supabase.channel(topic, {
      config: {
        broadcast: {
          self: false,
          ack: true,
        },
        presence: {
          key: options.presence?.userId ?? id,
        },
      },
    });

    const flushPresence = () => {
      presenceTimer = null;
      if (!options.onPresence || closed) return;

      const state = channel.presenceState();
      const members = Object.values(state)
        .flatMap((items) => items)
        .map(parsePresence)
        .filter((item): item is WatchPartyRelayPresence => Boolean(item))
        .sort((left, right) => left.relayId.localeCompare(right.relayId));

      const signature = members
        .map((member) =>
          [
            member.relayId,
            member.userId,
            member.host ? '1' : '0',
            member.joinedAt,
          ].join(':'),
        )
        .join('|');

      if (signature === lastPresenceSignature) return;
      lastPresenceSignature = signature;
      options.onPresence(members);
    };

    const schedulePresence = () => {
      if (!options.onPresence || closed || presenceTimer != null) return;
      presenceTimer = window.setTimeout(
        flushPresence,
        RELAY_PRESENCE_DEBOUNCE_MS,
      );
    };

    channel
      .on('broadcast', { event: 'packet' }, ({ payload }) => {
        if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return;

        const envelope = payload as Partial<RelayEnvelope>;
        if (!isRelayId(envelope.senderId) || envelope.senderId === id) return;

        if (
          envelope.targetId != null &&
          (!isRelayId(envelope.targetId) || envelope.targetId !== id)
        ) {
          return;
        }

        const packet = parseWatchPartyPacket(envelope.packet);
        if (!packet) return;
        onPacket(packet, envelope.senderId);
      })
      .on('presence', { event: 'sync' }, schedulePresence)
      .on('presence', { event: 'join' }, schedulePresence)
      .on('presence', { event: 'leave' }, schedulePresence);

    options.onStatus?.('connecting');

    try {
      await new Promise<void>((resolve, reject) => {
        const timer = window.setTimeout(() => {
          if (initialSettled) return;
          initialSettled = true;
          options.onStatus?.('error');
          reject(new Error('relay_subscribe_timeout'));
        }, RELAY_SUBSCRIBE_TIMEOUT_MS);

        channel.subscribe(async (status) => {
          if (closed) return;

          if (status === 'SUBSCRIBED') {
            open = true;
            options.onStatus?.('open');

            if (options.presence) {
              await channel.track({
                ...options.presence,
                relayId: id,
                onlineAt: Date.now(),
              });
            }

            flushPresence();

            if (!initialSettled) {
              initialSettled = true;
              window.clearTimeout(timer);
              resolve();
            }
            return;
          }

          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            open = false;
            options.onStatus?.('error');
            if (!initialSettled) {
              initialSettled = true;
              window.clearTimeout(timer);
              reject(new Error(`relay_subscribe_${status.toLowerCase()}`));
            }
            return;
          }

          if (status === 'CLOSED') {
            open = false;
            options.onStatus?.('closed');
            if (!initialSettled) {
              initialSettled = true;
              window.clearTimeout(timer);
              reject(new Error('relay_subscribe_closed'));
            }
          }
        });
      });
    } catch (error) {
      closed = true;
      open = false;

      if (presenceTimer != null) {
        window.clearTimeout(presenceTimer);
        presenceTimer = null;
      }

      try {
        await supabase.removeChannel(channel);
      } catch {
        // Failed subscriptions must not leak a Realtime channel.
      }

      throw error;
    }

    const relay: WatchPartyRelay = {
      id,

      async send(packet, targetId = null) {
        if (closed || !open) return false;
        if (targetId != null && !isRelayId(targetId)) return false;

        try {
          const result = await channel.send({
            type: 'broadcast',
            event: 'packet',
            payload: {
              senderId: id,
              targetId,
              packet,
            } satisfies RelayEnvelope,
          });
          return result === 'ok';
        } catch {
          return false;
        }
      },

      isOpen() {
        return open && !closed;
      },

      async close() {
        if (closed) return;
        closed = true;
        open = false;

        if (presenceTimer != null) {
          window.clearTimeout(presenceTimer);
          presenceTimer = null;
        }

        try {
          await channel.untrack();
        } catch {
          // Presence cleanup is best-effort.
        }

        try {
          await supabase.removeChannel(channel);
        } catch {
          // Realtime reconnect/cleanup is best-effort.
        }

        if (activeRelayByTopic.get(topic) === openingPromise) {
          activeRelayByTopic.delete(topic);
        }

        options.onStatus?.('closed');
      },
    };

    return relay;
  })();

  activeRelayByTopic.set(topic, openingPromise);

  try {
    return await openingPromise;
  } catch (error) {
    if (activeRelayByTopic.get(topic) === openingPromise) {
      activeRelayByTopic.delete(topic);
    }
    throw error;
  }
}
