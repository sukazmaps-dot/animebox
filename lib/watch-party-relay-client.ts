'use client';

import type { RealtimeChannel } from '@supabase/supabase-js';

import { createClient } from '@/lib/supabase/client';
import {
  parseWatchPartyPacket,
  type WatchPartyInvite,
  type WatchPartyPacket,
} from '@/lib/watch-party';

export type WatchPartyRelay = {
  id: string;
  send: (packet: WatchPartyPacket, targetId?: string | null) => Promise<boolean>;
  close: () => Promise<void>;
};

type RelayEnvelope = {
  senderId: string;
  targetId: string | null;
  packet: unknown;
};

const RELAY_SUBSCRIBE_TIMEOUT_MS = 8_000;

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

async function relayTopic(invite: WatchPartyInvite) {
  const source = new TextEncoder().encode(
    `animebox-watch-together-v2:${invite.roomId}:${invite.secret}`,
  );
  const digest = await crypto.subtle.digest('SHA-256', source);
  const hash = Array.from(new Uint8Array(digest), (value) =>
    value.toString(16).padStart(2, '0'),
  ).join('');

  // The secret itself never becomes the topic. Knowing only roomId is not
  // enough to subscribe to the relay channel.
  return `watch-party-relay:${invite.roomId}:${hash.slice(0, 32)}`;
}

function subscribe(channel: RealtimeChannel) {
  return new Promise<void>((resolve, reject) => {
    let settled = false;

    const timer = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error('relay_subscribe_timeout'));
    }, RELAY_SUBSCRIBE_TIMEOUT_MS);

    channel.subscribe((status) => {
      if (settled) return;

      if (status === 'SUBSCRIBED') {
        settled = true;
        window.clearTimeout(timer);
        resolve();
        return;
      }

      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        settled = true;
        window.clearTimeout(timer);
        reject(new Error(`relay_subscribe_${status.toLowerCase()}`));
      }
    });
  });
}

export async function openWatchPartyRelay(
  invite: WatchPartyInvite,
  onPacket: (packet: WatchPartyPacket, senderId: string) => void,
): Promise<WatchPartyRelay> {
  const supabase = createClient();
  const id = randomId();
  const topic = await relayTopic(invite);

  const channel = supabase.channel(topic, {
    config: {
      broadcast: {
        self: false,
        ack: true,
      },
    },
  });

  channel.on('broadcast', { event: 'packet' }, ({ payload }) => {
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
  });

  await subscribe(channel);

  let closed = false;

  return {
    id,

    async send(packet, targetId = null) {
      if (closed) return false;

      if (targetId != null && !isRelayId(targetId)) {
        return false;
      }

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

    async close() {
      if (closed) return;
      closed = true;

      try {
        await supabase.removeChannel(channel);
      } catch {
        // Supabase Realtime reconnect/cleanup is best-effort.
      }
    },
  };
}
