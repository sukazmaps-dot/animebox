'use client';

import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import type { DataConnection, Peer as PeerInstance } from 'peerjs';
import {
  createWatchPartyPeer,
  describeWatchPartyPeerError,
  detectWatchPartyRoute,
  type WatchPartyNetworkRoute,
} from '@/lib/watch-party-network-client';
import {
  openWatchPartyRelay,
  type WatchPartyRelay,
} from '@/lib/watch-party-relay-client';

import { createClient } from '@/lib/supabase/client';
import { trackProductClientEvent } from '@/lib/product-events-client';
import { premiumMediaStyle, type PremiumMediaTransform } from '@/lib/premium-studio';
import UserIdentity from '@/components/identity/UserIdentity';
import type { PublicIdentityRole } from '@/lib/identity';
import type { SponsorStatus } from '@/lib/sponsor';
import {
  WATCH_PARTY_EXIT_EVENT,
  WATCH_PARTY_MAX_PARTICIPANTS,
  WATCH_PARTY_PLAYER_ACTION_EVENT,
  WATCH_PARTY_PLAYER_COMMAND_EVENT,
  WATCH_PARTY_PLAYER_CONTROL_EVENT,
  WATCH_PARTY_PLAYER_STATE_EVENT,
  WATCH_PARTY_PROTOCOL,
  buildWatchPartyUrl,
  claimWatchPartyHostTab,
  clearWatchPartyFromLocation,
  clearWatchPartyHostTab,
  createWatchPartyInvite,
  createWatchPartyMessageId,
  parseWatchPartyPacket,
  sanitizeWatchPartyChatText,
  isWatchPartyHostTab,
  readWatchPartyInviteFromLocation,
  watchPartyHostPeerId,
  watchPartyTheaterPath,
  watchPartyHostSessionKey,
  watchPartyInitials,
  watchPartyReturnPath,
  type WatchPartyChatMessage,
  type WatchPartyInvite,
  type WatchPartyPacket,
  type WatchPartyParticipant,
  type WatchPartyReaction,
  type WatchPartyReactionKind,
  type WatchPartyVoteChoice,
  type WatchPartyVoteState,
  type WatchPartyPlayerActionDetail,
  type WatchPartyPlayerCommandDetail,
  type WatchPartyPlayerControlDetail,
  type WatchPartyPlayerStateDetail,
} from '@/lib/watch-party';

import styles from './WatchPartyPanel.module.css';

type PartyRole = 'host' | 'guest' | null;
type PartyStatus = 'idle' | 'connecting' | 'active' | 'reconnecting' | 'ended' | 'error';
type MobileSection = 'chat' | 'participants' | 'controls';

type PartyIdentity = {
  userId: string;
  displayName: string;
};

type RoomPublicIdentity = {
  userId: string;
  username: string;
  avatarUrl: string;
  avatarTransform: PremiumMediaTransform;
  premium: boolean;
  role: PublicIdentityRole;
  sponsor: SponsorStatus | null;
};

type RoomIdentitiesResponse = {
  users?: RoomPublicIdentity[];
};

const HOST_HEARTBEAT_MS = 15_000;
const PLAYER_SYNC_MS = 4_000;
const PLAYER_DRIFT_SEEK_SECONDS = 3;
const CHAT_SEND_COOLDOWN_MS = 650;
const NEGOTIATION_TIMEOUT_MS = 30_000;
const HANDSHAKE_TIMEOUT_MS = 10_000;
const MAX_RECONNECT_ATTEMPTS = 7;
const SERVER_RELAY_FALLBACK_MS = 3_500;
const DIRECTORY_HEARTBEAT_MS = 15_000;
const REACTION_SEND_COOLDOWN_MS = 700;

const REACTION_EMOJI: Record<WatchPartyReactionKind, string> = {
  love: '❤️',
  cry: '😭',
  fire: '🔥',
  wow: '😳',
  dead: '💀',
  peak: '✦',
};

function sanitizeDisplayName(value: string | null | undefined) {
  const clean = value?.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 32);
  return clean || 'Гость';
}

function rejectMessage(reason: Extract<WatchPartyPacket, { type: 'REJECT' }>['reason']) {
  if (reason === 'room_full') return 'Комната уже заполнена.';
  if (reason === 'protocol_mismatch') return 'Версия Watch Together не совпадает. Обнови страницу.';
  return 'Ссылка на комнату недействительна.';
}

function statusLabel(status: PartyStatus, role: PartyRole, participants: number) {
  if (status === 'connecting') return role === 'host' ? 'Создаём комнату…' : 'Подключаемся к комнате…';
  if (status === 'reconnecting') return 'Восстанавливаем соединение…';
  if (status === 'ended') return 'Комната завершена';
  if (status === 'error') return 'Не удалось подключиться';
  if (status === 'active') return `${participants}/${WATCH_PARTY_MAX_PARTICIPANTS} участников онлайн`;
  return '';
}

function formatPlayerTime(seconds: number | null | undefined) {
  const safe = Math.max(0, Number.isFinite(seconds) ? Number(seconds) : 0);
  const minutes = Math.floor(safe / 60);
  const rest = Math.floor(safe % 60);
  return `${minutes}:${String(rest).padStart(2, '0')}`;
}

function inspectWatchPartyRoute(
  connection: DataConnection,
  report: (route: WatchPartyNetworkRoute) => void,
) {
  window.setTimeout(() => {
    void detectWatchPartyRoute(connection).then((route) => {
      if (route !== 'unknown') report(route);
    });
  }, 650);
}

export default function WatchPartyPanel({
  animeTitle,
  animeSlug,
  episodeNumber,
  mode = 'inline',
}: {
  animeTitle: string;
  animeSlug: string;
  episodeNumber: number;
  mode?: 'inline' | 'theater';
}) {
  const [role, setRole] = useState<PartyRole>(null);
  const [status, setStatus] = useState<PartyStatus>('idle');
  const [participants, setParticipants] = useState<WatchPartyParticipant[]>([]);
  const [inviteUrl, setInviteUrl] = useState('');
  const [error, setError] = useState('');
  const [copyLabel, setCopyLabel] = useState('Копировать ссылку');
  const [messages, setMessages] = useState<WatchPartyChatMessage[]>([]);
  const [chatText, setChatText] = useState('');
  const [playerState, setPlayerState] = useState<WatchPartyPlayerStateDetail | null>(null);
  const [lastController, setLastController] = useState('');
  const [mobileSection, setMobileSection] = useState<MobileSection>('chat');
  const [roomIdentities, setRoomIdentities] = useState<Record<string, RoomPublicIdentity>>({});
  const [networkRoute, setNetworkRoute] = useState<WatchPartyNetworkRoute>('unknown');
  const [signalingMode, setSignalingMode] = useState<'peerjs-cloud' | 'self-hosted'>('peerjs-cloud');
  const [reactions, setReactions] = useState<WatchPartyReaction[]>([]);
  const [voteState, setVoteState] = useState<WatchPartyVoteState | null>(null);
  const [reportLabel, setReportLabel] = useState('Пожаловаться');

  const theaterPath = watchPartyTheaterPath(animeSlug, episodeNumber);
  const episodePath = `/anime/${encodeURIComponent(animeSlug)}/episode/${episodeNumber}`;

  const peerRef = useRef<PeerInstance | null>(null);
  const guestConnectionRef = useRef<DataConnection | null>(null);
  const hostConnectionsRef = useRef(new Map<string, DataConnection>());
  const pendingHostConnectionsRef = useRef(new Set<string>());
  const participantsRef = useRef(new Map<string, WatchPartyParticipant>());
  const inviteRef = useRef<WatchPartyInvite | null>(null);
  const roleRef = useRef<PartyRole>(null);
  const intentionalCloseRef = useRef(false);
  const hostEndedRef = useRef(false);
  const reconnectAttemptRef = useRef(0);
  const hostReclaimAttemptRef = useRef(0);
  const reconnectTimerRef = useRef<number | null>(null);
  const heartbeatTimerRef = useRef<number | null>(null);
  const syncTimerRef = useRef<number | null>(null);
  const identityPromiseRef = useRef<Promise<PartyIdentity | null> | null>(null);
  const identityRef = useRef<PartyIdentity | null>(null);
  const playerStateRef = useRef<WatchPartyPlayerStateDetail | null>(null);
  const hostSeqRef = useRef(0);
  const lastAppliedSeqRef = useRef(0);
  const chatIdsRef = useRef(new Set<string>());
  const lastChatSentAtRef = useRef(0);
  const hostPeerChatAtRef = useRef(new Map<string, number>());
  const chatMessagesRef = useRef<HTMLDivElement | null>(null);
  const startHostRef = useRef<(invite: WatchPartyInvite) => void>(() => undefined);
  const requestedIdentityIdsRef = useRef(new Set<string>());
  const relayRef = useRef<WatchPartyRelay | null>(null);
  const relayFallbackTimerRef = useRef<number | null>(null);
  const directoryHeartbeatTimerRef = useRef<number | null>(null);
  const roomStartedTrackedRef = useRef(false);
  const lastReactionSentAtRef = useRef(0);
  const hostPeerReactionAtRef = useRef(new Map<string, number>());
  const voteChoicesRef = useRef(new Map<string, WatchPartyVoteChoice>());
  const voteStateRef = useRef<WatchPartyVoteState | null>(null);
  const guestWelcomedRef = useRef(false);
  const guestTransportRef = useRef<'p2p' | 'server' | null>(null);
  const relayHostGuestIdsRef = useRef(new Set<string>());

  const publishParticipants = useCallback((next: WatchPartyParticipant[]) => {
    const sorted = [...next]
      .sort((left, right) => Number(right.host) - Number(left.host) || left.joinedAt - right.joinedAt)
      .slice(0, WATCH_PARTY_MAX_PARTICIPANTS);
    setParticipants(sorted);
  }, []);

  const resolveIdentity = useCallback(async (): Promise<PartyIdentity | null> => {
    if (!identityPromiseRef.current) {
      identityPromiseRef.current = (async () => {
        try {
          const supabase = createClient();
          const { data, error: userError } = await supabase.auth.getUser();
          const user = data.user;
          if (userError || !user) return null;

          const { data: profile } = await supabase
            .from('profiles')
            .select('username')
            .eq('id', user.id)
            .maybeSingle();

          const metadataName =
            typeof user.user_metadata?.username === 'string'
              ? user.user_metadata.username
              : typeof user.user_metadata?.name === 'string'
                ? user.user_metadata.name
                : null;

          return {
            userId: user.id,
            displayName: sanitizeDisplayName(
              profile?.username || metadataName || user.email?.split('@')[0],
            ),
          };
        } catch {
          return null;
        }
      })();
    }

    return identityPromiseRef.current;
  }, []);

  useEffect(() => {
    const missingIds = [...new Set(participants.map((participant) => participant.userId))]
      .filter((userId) => !roomIdentities[userId] && !requestedIdentityIdsRef.current.has(userId))
      .slice(0, WATCH_PARTY_MAX_PARTICIPANTS);

    if (missingIds.length === 0) return;

    for (const userId of missingIds) {
      requestedIdentityIdsRef.current.add(userId);
    }

    let active = true;

    void fetch('/api/watch-party/identities', {
      method: 'POST',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userIds: missingIds }),
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`watch_party_identity_http_${response.status}`);
        return (await response.json()) as RoomIdentitiesResponse;
      })
      .then((payload) => {
        if (!active || !Array.isArray(payload.users)) return;

        setRoomIdentities((current) => {
          const next = { ...current };
          for (const identity of payload.users ?? []) {
            if (!identity?.userId) continue;
            next[identity.userId] = identity;
          }
          return next;
        });
      })
      .catch(() => {
        for (const userId of missingIds) {
          requestedIdentityIdsRef.current.delete(userId);
        }
      });

    return () => {
      active = false;
    };
  }, [participants, roomIdentities]);

  const redirectToRegistration = useCallback(() => {
    intentionalCloseRef.current = true;
    const next = watchPartyReturnPath();
    window.location.replace(`/register?next=${encodeURIComponent(next)}`);
  }, []);

  const send = useCallback((connection: DataConnection, packet: WatchPartyPacket) => {
    if (!connection.open) return false;
    try {
      connection.send(packet);
      return true;
    } catch {
      return false;
    }
  }, []);

  const broadcast = useCallback((packet: WatchPartyPacket) => {
    for (const connection of hostConnectionsRef.current.values()) {
      send(connection, packet);
    }

    if (roleRef.current === 'host' && relayRef.current) {
      void relayRef.current.send(packet);
    }
  }, [send]);

  const appendReaction = useCallback((reaction: WatchPartyReaction) => {
    setReactions((current) => [...current, reaction].slice(-10));
    window.setTimeout(() => {
      setReactions((current) => current.filter((item) => item.id !== reaction.id));
    }, 2_400);
  }, []);

  const publishVoteState = useCallback((next: WatchPartyVoteState) => {
    voteStateRef.current = next;
    setVoteState(next);
    broadcast({ type: 'VOTE_STATE', vote: next });
  }, [broadcast]);

  const handleVoteCast = useCallback((
    participant: WatchPartyParticipant,
    packet: Extract<WatchPartyPacket, { type: 'VOTE_CAST' }>,
  ) => {
    const current = voteStateRef.current;
    if (!current?.active || packet.id !== current.id) return;
    if (voteChoicesRef.current.has(participant.userId)) return;

    voteChoicesRef.current.set(participant.userId, packet.choice);
    const next: WatchPartyVoteState = {
      ...current,
      yes: current.yes + (packet.choice === 'yes' ? 1 : 0),
      no: current.no + (packet.choice === 'no' ? 1 : 0),
      voters: [...current.voters, participant.userId].slice(0, WATCH_PARTY_MAX_PARTICIPANTS),
      sentAt: Date.now(),
    };
    publishVoteState(next);
  }, [publishVoteState]);

  const appendChatMessage = useCallback((message: WatchPartyChatMessage) => {
    if (chatIdsRef.current.has(message.id)) return;
    chatIdsRef.current.add(message.id);
    setMessages((current) => [...current, message].slice(-100));
  }, []);

  const dispatchPlayerCommand = useCallback((detail: WatchPartyPlayerCommandDetail) => {
    window.dispatchEvent(
      new CustomEvent<WatchPartyPlayerCommandDetail>(WATCH_PARTY_PLAYER_COMMAND_EVENT, { detail }),
    );
  }, []);

  const currentPlayerSnapshot = useCallback(() => {
    const state = playerStateRef.current;
    if (!state || state.episode !== episodeNumber) return null;

    const elapsed = state.playing
      ? Math.max(0, (Date.now() - state.observedAt) / 1000)
      : 0;

    return {
      ...state,
      position: Math.max(0, state.position + elapsed),
      observedAt: Date.now(),
    };
  }, [episodeNumber]);

  const sendHostSync = useCallback((connection?: DataConnection) => {
    if (roleRef.current !== 'host') return;
    const state = currentPlayerSnapshot();
    if (!state) return;

    const packet: WatchPartyPacket = {
      type: 'PLAYER_SYNC',
      seq: hostSeqRef.current,
      episode: state.episode,
      position: state.position,
      playing: state.playing,
      sentAt: Date.now(),
    };

    if (connection) send(connection, packet);
    else broadcast(packet);
  }, [broadcast, currentPlayerSnapshot, send]);

  const sequencePlayerAction = useCallback((
    action: WatchPartyPlayerActionDetail,
    actor: PartyIdentity,
    applyLocally: boolean,
  ) => {
    if (roleRef.current !== 'host') return;
    const seq = hostSeqRef.current + 1;
    hostSeqRef.current = seq;

    const packet: WatchPartyPacket = {
      type: 'PLAYER_APPLY',
      seq,
      actionId: action.actionId,
      actorUserId: actor.userId,
      actorName: actor.displayName,
      action: action.action,
      episode: action.episode,
      position: action.position,
      sentAt: Date.now(),
    };

    const nextPlaying =
      action.action === 'play' ? true : action.action === 'pause' ? false : action.playing;
    const previous = playerStateRef.current;
    playerStateRef.current = {
      episode: action.episode,
      position: action.position,
      duration: previous?.episode === action.episode ? previous.duration : null,
      playing: nextPlaying,
      observedAt: Date.now(),
      source: previous?.source ?? 'kodik',
    };
    setPlayerState(playerStateRef.current);
    setLastController(`${actor.displayName}: ${action.action === 'play' ? '▶ воспроизведение' : action.action === 'pause' ? '❚❚ пауза' : '↔ перемотка'}`);

    if (applyLocally) {
      dispatchPlayerCommand({
        action: action.action,
        episode: action.episode,
        position: action.position,
        playing: nextPlaying,
        seq,
      });
    }

    broadcast(packet);
  }, [broadcast, dispatchPlayerCommand]);

  const broadcastParticipants = useCallback(() => {
    const next = [...participantsRef.current.values()];
    publishParticipants(next);
    const packet: WatchPartyPacket = { type: 'PARTICIPANTS', participants: next };
    broadcast(packet);
  }, [broadcast, publishParticipants]);

  const clearTimers = useCallback(() => {
    if (reconnectTimerRef.current != null) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (heartbeatTimerRef.current != null) {
      window.clearInterval(heartbeatTimerRef.current);
      heartbeatTimerRef.current = null;
    }
    if (syncTimerRef.current != null) {
      window.clearInterval(syncTimerRef.current);
      syncTimerRef.current = null;
    }
    if (relayFallbackTimerRef.current != null) {
      window.clearTimeout(relayFallbackTimerRef.current);
      relayFallbackTimerRef.current = null;
    }
    if (directoryHeartbeatTimerRef.current != null) {
      window.clearInterval(directoryHeartbeatTimerRef.current);
      directoryHeartbeatTimerRef.current = null;
    }
  }, []);

  const destroyTransport = useCallback(() => {
    clearTimers();
    guestConnectionRef.current?.close();
    guestConnectionRef.current = null;
    for (const connection of hostConnectionsRef.current.values()) connection.close();
    hostConnectionsRef.current.clear();
    pendingHostConnectionsRef.current.clear();
    const peer = peerRef.current;
    peerRef.current = null;
    if (peer && !peer.destroyed) peer.destroy();
    const relay = relayRef.current;
    relayRef.current = null;
    if (relay) void relay.close();
    relayHostGuestIdsRef.current.clear();
    guestWelcomedRef.current = false;
    guestTransportRef.current = null;
  }, [clearTimers]);

  const resetParty = useCallback((removeHostClaim = true) => {
    intentionalCloseRef.current = true;
    destroyTransport();
    const invite = inviteRef.current;
    if (removeHostClaim && invite) {
      try {
        sessionStorage.removeItem(watchPartyHostSessionKey(invite.roomId));
      } catch {
        // sessionStorage can be unavailable in strict/private browser modes.
      }
      clearWatchPartyHostTab(invite);
    }
    inviteRef.current = null;
    roleRef.current = null;
    reconnectAttemptRef.current = 0;
    hostReclaimAttemptRef.current = 0;
    hostEndedRef.current = false;
    participantsRef.current.clear();
    playerStateRef.current = null;
    hostSeqRef.current = 0;
    lastAppliedSeqRef.current = 0;
    chatIdsRef.current.clear();
    hostPeerChatAtRef.current.clear();
    hostPeerReactionAtRef.current.clear();
    voteChoicesRef.current.clear();
    voteStateRef.current = null;
    roomStartedTrackedRef.current = false;
    clearWatchPartyFromLocation();
    setRole(null);
    setParticipants([]);
    setInviteUrl('');
    setError('');
    setMessages([]);
    setChatText('');
    setPlayerState(null);
    setLastController('');
    setReactions([]);
    setVoteState(null);
    setReportLabel('Пожаловаться');
    setNetworkRoute('unknown');
    setSignalingMode('peerjs-cloud');
    setStatus('idle');
  }, [destroyTransport]);

  const scheduleGuestReconnectRef = useRef<() => void>(() => undefined);

  const updateDirectoryRoom = useCallback(async (
    nextStatus?: 'waiting' | 'watching' | 'paused' | 'voting' | 'ended',
  ) => {
    if (roleRef.current !== 'host') return;
    const invite = inviteRef.current;
    if (!invite) return;

    const currentState = playerStateRef.current;
    const derivedStatus =
      nextStatus ??
      (voteStateRef.current?.active
        ? 'voting'
        : currentState
          ? currentState.playing
            ? 'watching'
            : 'paused'
          : 'waiting');

    try {
      await fetch('/api/watch-party/rooms', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        cache: 'no-store',
        keepalive: derivedStatus === 'ended',
        body: JSON.stringify({
          roomId: invite.roomId,
          status: derivedStatus,
          participantCount: participantsRef.current.size || 1,
          episode: episodeNumber,
        }),
      });
    } catch {
      // Public directory presence is best-effort. Room transport must continue.
    }
  }, [episodeNumber]);

  const ensureHostTimers = useCallback(() => {
    if (roleRef.current !== 'host') return;

    if (heartbeatTimerRef.current == null) {
      heartbeatTimerRef.current = window.setInterval(() => {
        broadcast({ type: 'ROOM_HEARTBEAT', sentAt: Date.now() });
      }, HOST_HEARTBEAT_MS);
    }

    if (syncTimerRef.current == null) {
      syncTimerRef.current = window.setInterval(() => {
        sendHostSync();
      }, PLAYER_SYNC_MS);
    }

    if (directoryHeartbeatTimerRef.current == null) {
      void updateDirectoryRoom();
      directoryHeartbeatTimerRef.current = window.setInterval(() => {
        void updateDirectoryRoom();
      }, DIRECTORY_HEARTBEAT_MS);
    }
  }, [broadcast, sendHostSync, updateDirectoryRoom]);

  const sendGuestPacket = useCallback((packet: WatchPartyPacket) => {
    if (guestTransportRef.current === 'server' && relayRef.current) {
      void relayRef.current.send(packet);
      return true;
    }

    const connection = guestConnectionRef.current;
    return connection?.open ? send(connection, packet) : false;
  }, [send]);

  const attachGuestConnection = useCallback((peer: PeerInstance, invite: WatchPartyInvite, identity: PartyIdentity) => {
    if (intentionalCloseRef.current || hostEndedRef.current) return;

    const connection = peer.connect(watchPartyHostPeerId(invite.roomId), {
      reliable: true,
      serialization: 'json',
      metadata: {
        protocol: WATCH_PARTY_PROTOCOL,
        roomId: invite.roomId,
      },
    });
    guestConnectionRef.current?.close();
    guestConnectionRef.current = connection;

    let welcomed = false;
    let reconnectQueued = false;
    let handshakeTimer: number | null = null;
    const negotiationTimer = window.setTimeout(() => {
      if (welcomed || connection.open || intentionalCloseRef.current || hostEndedRef.current) return;
      reconnectQueued = true;
      setStatus('reconnecting');
      setError('Подключение заняло слишком долго. Пробуем ещё раз…');
      connection.close();
      scheduleGuestReconnectRef.current();
    }, NEGOTIATION_TIMEOUT_MS);

    const clearAttemptTimers = () => {
      window.clearTimeout(negotiationTimer);
      if (handshakeTimer != null) {
        window.clearTimeout(handshakeTimer);
        handshakeTimer = null;
      }
    };

    connection.on('open', () => {
      window.clearTimeout(negotiationTimer);
      inspectWatchPartyRoute(connection, (route) => {
        setNetworkRoute((current) => current === 'relay' ? current : route);
      });
      if (intentionalCloseRef.current || peer.destroyed || !peer.id) return;

      handshakeTimer = window.setTimeout(() => {
        if (welcomed || intentionalCloseRef.current || hostEndedRef.current) return;
        reconnectQueued = true;
        setStatus('reconnecting');
        setError('Хост открыл соединение, но не подтвердил комнату. Переподключаемся…');
        connection.close();
        scheduleGuestReconnectRef.current();
      }, HANDSHAKE_TIMEOUT_MS);

      const participant: WatchPartyParticipant = {
        id: peer.id,
        userId: identity.userId,
        name: identity.displayName,
        host: false,
        joinedAt: Date.now(),
      };
      send(connection, {
        type: 'HELLO',
        protocol: WATCH_PARTY_PROTOCOL,
        roomId: invite.roomId,
        secret: invite.secret,
        participant,
      });
    });

    connection.on('data', (value) => {
      const packet = parseWatchPartyPacket(value);
      if (!packet) return;

      if (packet.type === 'WELCOME') {
        if (packet.roomId !== invite.roomId) return;
        if (packet.protocol !== WATCH_PARTY_PROTOCOL) {
          hostEndedRef.current = true;
          setStatus('error');
          setError('Версия Watch Together не совпадает. Обнови страницу.');
          connection.close();
          return;
        }
        if (guestTransportRef.current === 'server') {
          connection.close();
          return;
        }
        welcomed = true;
        guestWelcomedRef.current = true;
        guestTransportRef.current = 'p2p';
        clearAttemptTimers();
        reconnectAttemptRef.current = 0;
        publishParticipants(packet.participants);
        setError('');
        setStatus('active');
        return;
      }

      if (packet.type === 'PARTICIPANTS') {
        if (welcomed) publishParticipants(packet.participants);
        return;
      }

      if (packet.type === 'PLAYER_APPLY') {
        if (!welcomed || packet.seq <= lastAppliedSeqRef.current) return;
        lastAppliedSeqRef.current = packet.seq;
        const playing =
          packet.action === 'play' ? true : packet.action === 'pause' ? false : playerStateRef.current?.playing ?? false;
        setLastController(`${packet.actorName}: ${packet.action === 'play' ? '▶ воспроизведение' : packet.action === 'pause' ? '❚❚ пауза' : '↔ перемотка'}`);
        dispatchPlayerCommand({
          action: packet.action,
          episode: packet.episode,
          position: packet.position,
          playing,
          seq: packet.seq,
        });
        return;
      }

      if (packet.type === 'PLAYER_SYNC') {
        if (!welcomed || packet.seq < lastAppliedSeqRef.current) return;
        const state = playerStateRef.current;
        const networkAdjusted = packet.playing
          ? packet.position + Math.min(2, Math.max(0, (Date.now() - packet.sentAt) / 1000))
          : packet.position;

        if (!state) {
          dispatchPlayerCommand({
            action: packet.playing ? 'play' : 'pause',
            episode: packet.episode,
            position: networkAdjusted,
            playing: packet.playing,
            seq: packet.seq,
          });
          return;
        }
        if (state.episode !== packet.episode) return;

        const drift = Math.abs(state.position - networkAdjusted);

        if (state.playing !== packet.playing) {
          dispatchPlayerCommand({
            action: packet.playing ? 'play' : 'pause',
            episode: packet.episode,
            position: networkAdjusted,
            playing: packet.playing,
            seq: packet.seq,
          });
        } else if (drift >= PLAYER_DRIFT_SEEK_SECONDS) {
          dispatchPlayerCommand({
            action: 'seek',
            episode: packet.episode,
            position: networkAdjusted,
            playing: packet.playing,
            seq: packet.seq,
          });
        }
        return;
      }

      if (packet.type === 'REACTION') {
        appendReaction(packet.reaction);
        return;
      }

      if (packet.type === 'VOTE_STATE') {
        voteStateRef.current = packet.vote;
        setVoteState(packet.vote);
        return;
      }

      if (packet.type === 'CHAT_MESSAGE') {
        if (welcomed) appendChatMessage(packet.message);
        return;
      }

      if (packet.type === 'HOST_ENDED') {
        hostEndedRef.current = true;
        setStatus('ended');
        setError('Хост завершил совместный просмотр.');
        connection.close();
        return;
      }

      if (packet.type === 'REJECT') {
        hostEndedRef.current = true;
        setStatus('error');
        setError(rejectMessage(packet.reason));
        connection.close();
      }
    });

    connection.on('close', () => {
      clearAttemptTimers();
      if (guestConnectionRef.current === connection) guestConnectionRef.current = null;
      if (
        intentionalCloseRef.current ||
        hostEndedRef.current ||
        reconnectQueued ||
        guestTransportRef.current === 'server'
      ) return;
      reconnectQueued = true;
      setStatus('reconnecting');
      scheduleGuestReconnectRef.current();
    });

    connection.on('error', () => {
      clearAttemptTimers();
      if (
        intentionalCloseRef.current ||
        hostEndedRef.current ||
        reconnectQueued ||
        guestTransportRef.current === 'server'
      ) return;
      reconnectQueued = true;
      setStatus('reconnecting');
      scheduleGuestReconnectRef.current();
    });

  }, [appendChatMessage, appendReaction, dispatchPlayerCommand, publishParticipants, send]);

  const startGuest = useCallback(async (invite: WatchPartyInvite) => {
    intentionalCloseRef.current = false;
    hostEndedRef.current = false;
    roleRef.current = 'guest';
    inviteRef.current = invite;
    setRole('guest');
    setStatus('connecting');
    setError('');
    setInviteUrl(buildWatchPartyUrl(invite));

    const identity = await resolveIdentity();
    if (!identity) {
      redirectToRegistration();
      return;
    }
    identityRef.current = identity;
    if (intentionalCloseRef.current) return;

    guestWelcomedRef.current = false;
    guestTransportRef.current = null;

    const startServerRelay = async () => {
      if (
        intentionalCloseRef.current ||
        hostEndedRef.current ||
        guestWelcomedRef.current ||
        relayRef.current
      ) return;

      try {
        const relay = await openWatchPartyRelay(invite, (packet) => {
          if (intentionalCloseRef.current || hostEndedRef.current) return;

          if (packet.type === 'WELCOME') {
            if (packet.roomId !== invite.roomId || packet.protocol !== WATCH_PARTY_PROTOCOL) return;
            if (guestTransportRef.current === 'p2p') return;

            guestWelcomedRef.current = true;
            guestTransportRef.current = 'server';
            reconnectAttemptRef.current = 0;
            publishParticipants(packet.participants);
            setNetworkRoute('server');
            setError('');
            setStatus('active');
            guestConnectionRef.current?.close();
            return;
          }

          if (guestTransportRef.current !== 'server') return;

          if (packet.type === 'PARTICIPANTS') {
            publishParticipants(packet.participants);
            return;
          }

          if (packet.type === 'PLAYER_APPLY') {
            if (packet.seq <= lastAppliedSeqRef.current) return;
            lastAppliedSeqRef.current = packet.seq;
            const playing = packet.action === 'play'
              ? true
              : packet.action === 'pause'
                ? false
                : playerStateRef.current?.playing ?? false;
            setLastController(`${packet.actorName}: ${packet.action === 'play' ? '▶ воспроизведение' : packet.action === 'pause' ? '❚❚ пауза' : '↔ перемотка'}`);
            dispatchPlayerCommand({
              action: packet.action,
              episode: packet.episode,
              position: packet.position,
              playing,
              seq: packet.seq,
            });
            return;
          }

          if (packet.type === 'PLAYER_SYNC') {
            if (packet.seq < lastAppliedSeqRef.current) return;
            const state = playerStateRef.current;
            const networkAdjusted = packet.playing
              ? packet.position + Math.min(2, Math.max(0, (Date.now() - packet.sentAt) / 1000))
              : packet.position;

            if (!state) {
              dispatchPlayerCommand({
                action: packet.playing ? 'play' : 'pause',
                episode: packet.episode,
                position: networkAdjusted,
                playing: packet.playing,
                seq: packet.seq,
              });
              return;
            }
            if (state.episode !== packet.episode) return;

            const drift = Math.abs(state.position - networkAdjusted);
            if (state.playing !== packet.playing) {
              dispatchPlayerCommand({
                action: packet.playing ? 'play' : 'pause',
                episode: packet.episode,
                position: networkAdjusted,
                playing: packet.playing,
                seq: packet.seq,
              });
            } else if (drift >= PLAYER_DRIFT_SEEK_SECONDS) {
              dispatchPlayerCommand({
                action: 'seek',
                episode: packet.episode,
                position: networkAdjusted,
                playing: packet.playing,
                seq: packet.seq,
              });
            }
            return;
          }

          if (packet.type === 'REACTION') {
        appendReaction(packet.reaction);
        return;
      }

      if (packet.type === 'VOTE_STATE') {
        voteStateRef.current = packet.vote;
        setVoteState(packet.vote);
        return;
      }

      if (packet.type === 'CHAT_MESSAGE') {
            appendChatMessage(packet.message);
            return;
          }

          if (packet.type === 'HOST_ENDED') {
            hostEndedRef.current = true;
            setStatus('ended');
            setError('Хост завершил совместный просмотр.');
            return;
          }

          if (packet.type === 'REJECT') {
            hostEndedRef.current = true;
            setStatus('error');
            setError(rejectMessage(packet.reason));
          }
        });

        if (intentionalCloseRef.current || hostEndedRef.current || guestWelcomedRef.current) {
          await relay.close();
          return;
        }

        relayRef.current = relay;
        setError('WebRTC недоступен — подключаем защищённый серверный relay…');

        const hello: WatchPartyPacket = {
          type: 'HELLO',
          protocol: WATCH_PARTY_PROTOCOL,
          roomId: invite.roomId,
          secret: invite.secret,
          participant: {
            id: relay.id,
            userId: identity.userId,
            name: identity.displayName,
            host: false,
            joinedAt: Date.now(),
          },
        };

        // Broadcast has no durable queue. Retry HELLO briefly so a host
        // that is finishing its Realtime subscription cannot miss it.
        for (let attempt = 0; attempt < 5 && !guestWelcomedRef.current; attempt += 1) {
          await relay.send(hello);
          if (guestWelcomedRef.current) break;
          await new Promise((resolve) => window.setTimeout(resolve, 1_200));
        }
      } catch {
        if (!guestWelcomedRef.current) {
          setError('Не удалось открыть резервный relay. Продолжаем попытки WebRTC…');
        }
      }
    };

    relayFallbackTimerRef.current = window.setTimeout(() => {
      relayFallbackTimerRef.current = null;
      void startServerRelay();
    }, SERVER_RELAY_FALLBACK_MS);

    const { peer, network } = await createWatchPartyPeer();
    setSignalingMode(network.signalingMode);
    setNetworkRoute('unknown');
    peerRef.current = peer;

    scheduleGuestReconnectRef.current = () => {
      if (
        intentionalCloseRef.current ||
        hostEndedRef.current ||
        peer.destroyed ||
        guestTransportRef.current === 'server'
      ) return;
      if (reconnectTimerRef.current != null) return;

      const attempt = reconnectAttemptRef.current + 1;
      reconnectAttemptRef.current = attempt;
      if (attempt > MAX_RECONNECT_ATTEMPTS) {
        setStatus('ended');
        setError('Хост недоступен. Комната, вероятно, завершена.');
        return;
      }

      const delay = Math.min(8_000, 700 * 2 ** (attempt - 1));
      reconnectTimerRef.current = window.setTimeout(() => {
        reconnectTimerRef.current = null;
        if (peer.disconnected && !peer.destroyed) {
          try {
            peer.reconnect();
          } catch {
            // A new data connection below can still succeed if signaling recovered.
          }
        }
        attachGuestConnection(peer, invite, identity);
      }, delay);
    };

    peer.on('open', () => {
      reconnectAttemptRef.current = 0;
      attachGuestConnection(peer, invite, identity);
    });

    peer.on('disconnected', () => {
      if (intentionalCloseRef.current || hostEndedRef.current || guestTransportRef.current === 'server') return;
      setStatus('reconnecting');
      scheduleGuestReconnectRef.current();
    });

    peer.on('error', (peerError) => {
      if (intentionalCloseRef.current || hostEndedRef.current || guestTransportRef.current === 'server') return;
      const type = 'type' in peerError ? String(peerError.type) : '';
      if (type === 'peer-unavailable' || type === 'network' || type === 'disconnected') {
        setStatus('reconnecting');
        scheduleGuestReconnectRef.current();
        return;
      }
      setStatus('error');
      setError(describeWatchPartyPeerError(peerError, network));
    });
  }, [attachGuestConnection, redirectToRegistration, resolveIdentity]);

  const startHost = useCallback(async (invite: WatchPartyInvite) => {
    intentionalCloseRef.current = false;
    hostEndedRef.current = false;
    roleRef.current = 'host';
    inviteRef.current = invite;
    setRole('host');
    setStatus('connecting');
    setError('');
    setInviteUrl(buildWatchPartyUrl(invite));

    const identity = await resolveIdentity();
    if (!identity) {
      redirectToRegistration();
      return;
    }
    identityRef.current = identity;
    if (intentionalCloseRef.current) return;

    const hostPeerId = watchPartyHostPeerId(invite.roomId);
    const { peer, network } = await createWatchPartyPeer(hostPeerId);
    setSignalingMode(network.signalingMode);
    setNetworkRoute('unknown');
    peerRef.current = peer;

    const hostParticipant: WatchPartyParticipant = {
      id: hostPeerId,
      userId: identity.userId,
      name: identity.displayName,
      host: true,
      joinedAt: Date.now(),
    };
    participantsRef.current.set(hostPeerId, hostParticipant);

    void openWatchPartyRelay(invite, (packet, senderId) => {
      if (intentionalCloseRef.current) return;

      if (packet.type === 'HELLO') {
        if (
          packet.protocol !== WATCH_PARTY_PROTOCOL ||
          packet.roomId !== invite.roomId ||
          packet.secret !== invite.secret ||
          packet.participant.host ||
          packet.participant.id !== senderId
        ) {
          void relayRef.current?.send({ type: 'REJECT', reason: 'invalid_room' }, senderId);
          return;
        }

        if (
          !participantsRef.current.has(senderId) &&
          participantsRef.current.size >= WATCH_PARTY_MAX_PARTICIPANTS
        ) {
          void relayRef.current?.send({ type: 'REJECT', reason: 'room_full' }, senderId);
          return;
        }

        relayHostGuestIdsRef.current.add(senderId);
        participantsRef.current.set(senderId, {
          ...packet.participant,
          id: senderId,
          joinedAt: Date.now(),
        });

        const current = [...participantsRef.current.values()];
        void relayRef.current?.send({
          type: 'WELCOME',
          protocol: WATCH_PARTY_PROTOCOL,
          roomId: invite.roomId,
          participants: current,
        }, senderId);
        broadcastParticipants();
        setNetworkRoute('server');

        const state = currentPlayerSnapshot();
        if (state) {
          void relayRef.current?.send({
            type: 'PLAYER_SYNC',
            seq: hostSeqRef.current,
            episode: state.episode,
            position: state.position,
            playing: state.playing,
            sentAt: Date.now(),
          }, senderId);
        }
        return;
      }

      const participant = participantsRef.current.get(senderId);
      if (!participant || participant.host || !relayHostGuestIdsRef.current.has(senderId)) return;

      if (packet.type === 'PLAYER_ACTION') {
        if (packet.episode !== episodeNumber) return;
        sequencePlayerAction(
          {
            actionId: packet.actionId,
            action: packet.action,
            episode: packet.episode,
            position: packet.position,
            playing: packet.action === 'play'
              ? true
              : packet.action === 'pause'
                ? false
                : playerStateRef.current?.playing ?? false,
            observedAt: packet.sentAt,
          },
          { userId: participant.userId, displayName: participant.name },
          true,
        );
        return;
      }

      if (packet.type === 'REACTION_SEND') {
          acceptReaction(participant, packet.id, packet.reaction);
          return;
        }

        if (packet.type === 'VOTE_CAST') {
          handleVoteCast(participant, packet);
          return;
        }

        if (packet.type === 'CHAT_SEND') {
        if (chatIdsRef.current.has(packet.id)) return;
        const now = Date.now();
        const previous = hostPeerChatAtRef.current.get(senderId) ?? 0;
        if (now - previous < CHAT_SEND_COOLDOWN_MS) return;
        hostPeerChatAtRef.current.set(senderId, now);

        const message: WatchPartyChatMessage = {
          id: packet.id,
          userId: participant.userId,
          name: participant.name,
          host: false,
          text: packet.text,
          sentAt: now,
        };
        appendChatMessage(message);
        broadcast({ type: 'CHAT_MESSAGE', message });
      }
    }).then((relay) => {
      if (intentionalCloseRef.current) {
        void relay.close();
        return;
      }
      relayRef.current = relay;
      publishParticipants([...participantsRef.current.values()]);
      setError('');
      setStatus('active');
      ensureHostTimers();
    }).catch(() => {
      // PeerJS remains the primary path if Supabase Realtime is unavailable.
    });

    peer.on('connection', (connection) => {
      if (intentionalCloseRef.current) {
        connection.close();
        return;
      }

      if (
        hostConnectionsRef.current.size + pendingHostConnectionsRef.current.size >=
        WATCH_PARTY_MAX_PARTICIPANTS - 1
      ) {
        connection.on('open', () => {
          send(connection, { type: 'REJECT', reason: 'room_full' });
          window.setTimeout(() => connection.close(), 80);
        });
        return;
      }

      pendingHostConnectionsRef.current.add(connection.peer);
      let accepted = false;
      let handshakeTimer: number | null = null;
      const negotiationTimer = window.setTimeout(() => {
        if (accepted || connection.open) return;
        pendingHostConnectionsRef.current.delete(connection.peer);
        connection.close();
      }, NEGOTIATION_TIMEOUT_MS);

      const clearConnectionTimers = () => {
        window.clearTimeout(negotiationTimer);
        if (handshakeTimer != null) {
          window.clearTimeout(handshakeTimer);
          handshakeTimer = null;
        }
      };

      connection.on('open', () => {
        window.clearTimeout(negotiationTimer);
        inspectWatchPartyRoute(connection, (route) => {
          setNetworkRoute((current) => current === 'relay' ? current : route);
        });
        handshakeTimer = window.setTimeout(() => {
          if (accepted) return;
          pendingHostConnectionsRef.current.delete(connection.peer);
          connection.close();
        }, HANDSHAKE_TIMEOUT_MS);
      });

      connection.on('data', (value) => {
        const packet = parseWatchPartyPacket(value);
        if (!packet) return;

        if (!accepted) {
          if (packet.type !== 'HELLO') return;

          if (packet.protocol !== WATCH_PARTY_PROTOCOL) {
            send(connection, { type: 'REJECT', reason: 'protocol_mismatch' });
            connection.close();
            return;
          }
          if (packet.roomId !== invite.roomId || packet.secret !== invite.secret) {
            send(connection, { type: 'REJECT', reason: 'invalid_room' });
            connection.close();
            return;
          }
          if (packet.participant.id !== connection.peer || packet.participant.host) {
            send(connection, { type: 'REJECT', reason: 'invalid_room' });
            connection.close();
            return;
          }
          if (hostConnectionsRef.current.size >= WATCH_PARTY_MAX_PARTICIPANTS - 1) {
            send(connection, { type: 'REJECT', reason: 'room_full' });
            connection.close();
            return;
          }

          accepted = true;
          clearConnectionTimers();
          pendingHostConnectionsRef.current.delete(connection.peer);
          hostConnectionsRef.current.set(connection.peer, connection);
          participantsRef.current.set(connection.peer, {
            ...packet.participant,
            joinedAt: Date.now(),
          });
          const current = [...participantsRef.current.values()];
          send(connection, {
            type: 'WELCOME',
            protocol: WATCH_PARTY_PROTOCOL,
            roomId: invite.roomId,
            participants: current,
          });
          broadcastParticipants();
          window.setTimeout(() => sendHostSync(connection), 120);
          return;
        }

        const participant = participantsRef.current.get(connection.peer);
        if (!participant || participant.host) return;

        if (packet.type === 'PLAYER_ACTION') {
          if (packet.episode !== episodeNumber) return;
          sequencePlayerAction(
            {
              actionId: packet.actionId,
              action: packet.action,
              episode: packet.episode,
              position: packet.position,
              playing:
                packet.action === 'play'
                  ? true
                  : packet.action === 'pause'
                    ? false
                    : playerStateRef.current?.playing ?? false,
              observedAt: packet.sentAt,
            },
            { userId: participant.userId, displayName: participant.name },
            true,
          );
          return;
        }

        if (packet.type === 'REACTION_SEND') {
          acceptReaction(participant, packet.id, packet.reaction);
          return;
        }

        if (packet.type === 'VOTE_CAST') {
          handleVoteCast(participant, packet);
          return;
        }

        if (packet.type === 'CHAT_SEND') {
          if (chatIdsRef.current.has(packet.id)) return;
          const now = Date.now();
          const previous = hostPeerChatAtRef.current.get(connection.peer) ?? 0;
          if (now - previous < CHAT_SEND_COOLDOWN_MS) return;
          hostPeerChatAtRef.current.set(connection.peer, now);

          const message: WatchPartyChatMessage = {
            id: packet.id,
            userId: participant.userId,
            name: participant.name,
            host: false,
            text: packet.text,
            sentAt: now,
          };
          appendChatMessage(message);
          broadcast({ type: 'CHAT_MESSAGE', message });
        }
      });

      connection.on('close', () => {
        clearConnectionTimers();
        pendingHostConnectionsRef.current.delete(connection.peer);
        if (!accepted) return;
        hostConnectionsRef.current.delete(connection.peer);
        participantsRef.current.delete(connection.peer);
        broadcastParticipants();
      });

      connection.on('error', () => {
        clearConnectionTimers();
        pendingHostConnectionsRef.current.delete(connection.peer);
        if (!accepted) return;
        hostConnectionsRef.current.delete(connection.peer);
        participantsRef.current.delete(connection.peer);
        broadcastParticipants();
      });

    });

    peer.on('open', () => {
      hostReclaimAttemptRef.current = 0;
      publishParticipants([...participantsRef.current.values()]);
      setError('');
      setStatus('active');
      ensureHostTimers();
    });

    peer.on('disconnected', () => {
      if (intentionalCloseRef.current || peer.destroyed) return;
      setStatus('reconnecting');
      try {
        peer.reconnect();
      } catch {
        setStatus('error');
        setError('Связь с сервером Watch Together потеряна. Обнови страницу, чтобы вернуть комнату.');
      }
    });

    peer.on('error', (peerError) => {
      if (intentionalCloseRef.current) return;
      const type = 'type' in peerError ? String(peerError.type) : '';
      if (type === 'unavailable-id') {
        const attempt = hostReclaimAttemptRef.current + 1;
        hostReclaimAttemptRef.current = attempt;
        if (attempt <= 3) {
          setStatus('reconnecting');
          setError('Возвращаем комнату после переподключения…');
          window.setTimeout(() => {
            if (intentionalCloseRef.current) return;
            if (peerRef.current === peer) peerRef.current = null;
            startHostRef.current(invite);
          }, attempt * 900);
          return;
        }
        setStatus('error');
        setError('Эта комната ещё активна в другой вкладке. Закрой её или используй текущую вкладку хоста.');
        return;
      }
      if (type === 'network' || type === 'disconnected') {
        setStatus('reconnecting');
        return;
      }
      setStatus('error');
      setError(describeWatchPartyPeerError(peerError, network));
    });
  }, [
    acceptReaction,
    appendChatMessage,
    broadcast,
    broadcastParticipants,
    currentPlayerSnapshot,
    ensureHostTimers,
    episodeNumber,
    handleVoteCast,
    publishParticipants,
    redirectToRegistration,
    resolveIdentity,
    send,
    sendHostSync,
    sequencePlayerAction,
  ]);

  useEffect(() => {
    function onPlayerState(event: Event) {
      const detail = (event as CustomEvent<WatchPartyPlayerStateDetail>).detail;
      if (!detail || detail.episode !== episodeNumber) return;
      playerStateRef.current = detail;
      setPlayerState(detail);
    }

    function onPlayerAction(event: Event) {
      const detail = (event as CustomEvent<WatchPartyPlayerActionDetail>).detail;
      if (!detail || detail.episode !== episodeNumber) return;
      const identity = identityRef.current;
      if (!identity) return;

      if (roleRef.current === 'host') {
        sequencePlayerAction(detail, identity, false);
        return;
      }

      if (roleRef.current === 'guest') {
        sendGuestPacket({
          type: 'PLAYER_ACTION',
          actionId: detail.actionId,
          action: detail.action,
          episode: detail.episode,
          position: detail.position,
          sentAt: detail.observedAt,
        });
      }
    }

    window.addEventListener(WATCH_PARTY_PLAYER_STATE_EVENT, onPlayerState);
    window.addEventListener(WATCH_PARTY_PLAYER_ACTION_EVENT, onPlayerAction);

    return () => {
      window.removeEventListener(WATCH_PARTY_PLAYER_STATE_EVENT, onPlayerState);
      window.removeEventListener(WATCH_PARTY_PLAYER_ACTION_EVENT, onPlayerAction);
    };
  }, [episodeNumber, sendGuestPacket, sequencePlayerAction]);

  useEffect(() => {
    startHostRef.current = (nextInvite) => {
      void startHost(nextInvite);
    };
  }, [startHost]);

  useEffect(() => {
    const invite = readWatchPartyInviteFromLocation();
    if (!invite) return;

    if (mode === 'inline') {
      window.location.replace(buildWatchPartyUrl(invite, theaterPath));
      return;
    }

    let hostClaim = false;
    try {
      hostClaim =
        sessionStorage.getItem(watchPartyHostSessionKey(invite.roomId)) === invite.secret &&
        isWatchPartyHostTab(invite);
    } catch {
      hostClaim = false;
    }

    /*
     * React Strict Mode intentionally runs client effects through a
     * setup -> cleanup -> setup cycle in development. The old one-shot
     * boot guard made the cleanup win, so an invite URL could remain in the
     * idle state forever on `next dev`. Keep this effect restartable instead:
     * the first scheduled boot is cancelled by its cleanup, while the second
     * setup starts a fresh host/guest transport. Production follows the same
     * code path without depending on Strict Mode behaviour.
     */
    let cancelled = false;

    queueMicrotask(() => {
      if (cancelled) return;
      void (hostClaim ? startHost(invite) : startGuest(invite));
    });

    return () => {
      cancelled = true;
    };
  }, [mode, startGuest, startHost, theaterPath]);

  useEffect(() => {
    const onOffline = () => {
      if (roleRef.current) {
        setStatus('reconnecting');
        setError('Интернет-соединение потеряно. Ждём восстановления сети…');
      }
    };

    const onOnline = () => {
      if (intentionalCloseRef.current || hostEndedRef.current) return;
      setError('');

      const peer = peerRef.current;
      if (peer?.disconnected && !peer.destroyed) {
        try {
          peer.reconnect();
        } catch {
          // Guest reconnect below can still recreate the DataConnection.
        }
      }

      if (roleRef.current === 'guest' && guestTransportRef.current !== 'server') {
        scheduleGuestReconnectRef.current();
      }
    };

    window.addEventListener('offline', onOffline);
    window.addEventListener('online', onOnline);
    return () => {
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('online', onOnline);
    };
  }, []);

  useEffect(() => {
    return () => {
      intentionalCloseRef.current = true;
      destroyTransport();
    };
  }, [destroyTransport]);

  useEffect(() => {
    const node = chatMessagesRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [messages]);

  useEffect(() => {
    if (status !== 'active' || roomStartedTrackedRef.current) return;
    const invite = inviteRef.current;
    if (!invite) return;

    roomStartedTrackedRef.current = true;
    trackProductClientEvent('watch_party_room_started', {
      source: 'watch_together_room',
      path: window.location.pathname,
      entityType: 'watch_party_room',
      entityId: invite.roomId,
      metadata: {
        role: roleRef.current,
        episode: episodeNumber,
      },
    });

    if (roleRef.current === 'host') {
      void updateDirectoryRoom();
    }
  }, [episodeNumber, status, updateDirectoryRoom]);

  const createRoom = useCallback(() => {
    if (status !== 'idle') return;
    const invite = createWatchPartyInvite();
    try {
      sessionStorage.setItem(watchPartyHostSessionKey(invite.roomId), invite.secret);
      claimWatchPartyHostTab(invite);
    } catch {
      // Host recovery after refresh is optional when storage is unavailable.
      claimWatchPartyHostTab(invite);
    }
    const nextUrl = buildWatchPartyUrl(invite, mode === 'inline' ? theaterPath : undefined);

    if (mode === 'inline') {
      window.location.assign(nextUrl);
      return;
    }

    window.history.replaceState(window.history.state, '', nextUrl);
    void startHost(invite);
  }, [mode, startHost, status, theaterPath]);

  const copyInvite = useCallback(async () => {
    if (!inviteUrl) return;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopyLabel('Ссылка скопирована');
      trackProductClientEvent('watch_party_invite_shared', {
        source: 'watch_together_room',
        path: window.location.pathname,
        entityType: 'watch_party_room',
        entityId: inviteRef.current?.roomId,
      });
      window.setTimeout(() => setCopyLabel('Копировать ссылку'), 1_800);
    } catch {
      setCopyLabel('Не удалось скопировать');
      window.setTimeout(() => setCopyLabel('Копировать ссылку'), 1_800);
    }
  }, [inviteUrl]);

  const dispatchPartyControl = useCallback((detail: WatchPartyPlayerControlDetail) => {
    if (status !== 'active') return;
    window.dispatchEvent(
      new CustomEvent<WatchPartyPlayerControlDetail>(WATCH_PARTY_PLAYER_CONTROL_EVENT, { detail }),
    );
  }, [status]);

  const seekRelative = useCallback((delta: number) => {
    const state = currentPlayerSnapshot() ?? playerStateRef.current;
    if (!state) return;
    dispatchPartyControl({
      action: 'seek',
      position: Math.max(0, Math.min(state.duration ?? 28_800, state.position + delta)),
    });
  }, [currentPlayerSnapshot, dispatchPartyControl]);

  const togglePartyPlayback = useCallback(() => {
    const state = currentPlayerSnapshot() ?? playerStateRef.current;
    dispatchPartyControl({ action: state?.playing ? 'pause' : 'play' });
  }, [currentPlayerSnapshot, dispatchPartyControl]);

  const acceptReaction = useCallback((
    participant: Pick<WatchPartyParticipant, 'id' | 'userId' | 'name'>,
    id: string,
    reactionKind: WatchPartyReactionKind,
  ) => {
    const now = Date.now();
    const previous = hostPeerReactionAtRef.current.get(participant.id) ?? 0;
    if (now - previous < REACTION_SEND_COOLDOWN_MS) return;
    hostPeerReactionAtRef.current.set(participant.id, now);

    const reaction: WatchPartyReaction = {
      id,
      userId: participant.userId,
      name: participant.name,
      reaction: reactionKind,
      sentAt: now,
    };

    appendReaction(reaction);
    broadcast({ type: 'REACTION', reaction });
  }, [appendReaction, broadcast]);

  const sendReaction = useCallback((reactionKind: WatchPartyReactionKind) => {
    if (status !== 'active') return;
    const identity = identityRef.current;
    if (!identity) return;

    const now = Date.now();
    if (now - lastReactionSentAtRef.current < REACTION_SEND_COOLDOWN_MS) return;
    lastReactionSentAtRef.current = now;

    const id = createWatchPartyMessageId();

    if (roleRef.current === 'host') {
      acceptReaction(
        {
          id: watchPartyHostPeerId(inviteRef.current?.roomId ?? '000000000000000000000000'),
          userId: identity.userId,
          name: identity.displayName,
        },
        id,
        reactionKind,
      );
    } else {
      sendGuestPacket({
        type: 'REACTION_SEND',
        id,
        reaction: reactionKind,
        sentAt: now,
      });
    }

    trackProductClientEvent('watch_party_reaction_sent', {
      source: 'watch_together_room',
      path: window.location.pathname,
      entityType: 'watch_party_room',
      entityId: inviteRef.current?.roomId,
      metadata: { reaction: reactionKind },
    });
  }, [acceptReaction, sendGuestPacket, status]);

  const startNextEpisodeVote = useCallback(() => {
    if (status !== 'active' || roleRef.current !== 'host') return;
    const identity = identityRef.current;
    if (!identity) return;

    const id = createWatchPartyMessageId();
    voteChoicesRef.current.clear();
    voteChoicesRef.current.set(identity.userId, 'yes');

    const next: WatchPartyVoteState = {
      id,
      episode: episodeNumber + 1,
      yes: 1,
      no: 0,
      voters: [identity.userId],
      active: true,
      sentAt: Date.now(),
    };
    publishVoteState(next);
    void updateDirectoryRoom('voting');

    window.setTimeout(() => {
      const current = voteStateRef.current;
      if (!current || current.id !== id || !current.active) return;
      publishVoteState({ ...current, active: false, sentAt: Date.now() });
      void updateDirectoryRoom();
    }, 25_000);
  }, [episodeNumber, publishVoteState, status, updateDirectoryRoom]);

  const castVote = useCallback((choice: WatchPartyVoteChoice) => {
    const current = voteStateRef.current;
    const identity = identityRef.current;
    if (!current?.active || !identity) return;
    if (current.voters.includes(identity.userId)) return;

    if (roleRef.current === 'host') {
      const hostParticipant = [...participantsRef.current.values()].find(
        (participant) => participant.host,
      );
      if (hostParticipant) {
        handleVoteCast(hostParticipant, {
          type: 'VOTE_CAST',
          id: current.id,
          choice,
          sentAt: Date.now(),
        });
      }
    } else {
      sendGuestPacket({
        type: 'VOTE_CAST',
        id: current.id,
        choice,
        sentAt: Date.now(),
      });
    }

    trackProductClientEvent('watch_party_vote_cast', {
      source: 'watch_together_room',
      path: window.location.pathname,
      entityType: 'watch_party_room',
      entityId: inviteRef.current?.roomId,
      metadata: {
        choice,
        next_episode: current.episode,
      },
    });
  }, [handleVoteCast, sendGuestPacket]);

  const reportRoom = useCallback(async () => {
    const invite = inviteRef.current;
    if (!invite || reportLabel !== 'Пожаловаться') return;

    const reason = window.prompt(
      'Что не так с этой комнатой? Опиши кратко причину жалобы.',
      'Нарушение правил',
    )?.trim();
    if (!reason) return;

    try {
      const response = await fetch('/api/watch-party/rooms/report', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        cache: 'no-store',
        body: JSON.stringify({
          roomId: invite.roomId,
          reason,
        }),
      });
      if (!response.ok) throw new Error('report_failed');
      setReportLabel('Жалоба отправлена');
      trackProductClientEvent('watch_party_room_reported', {
        source: 'watch_together_room',
        path: window.location.pathname,
        entityType: 'watch_party_room',
        entityId: invite.roomId,
        flush: true,
      });
    } catch {
      setReportLabel('Не удалось отправить');
      window.setTimeout(() => setReportLabel('Пожаловаться'), 1_800);
    }
  }, [reportLabel]);

  const submitChat = useCallback((event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (status !== 'active') return;
    const text = sanitizeWatchPartyChatText(chatText);
    if (!text) return;

    const now = Date.now();
    if (now - lastChatSentAtRef.current < CHAT_SEND_COOLDOWN_MS) return;
    lastChatSentAtRef.current = now;
    setChatText('');

    const identity = identityRef.current;
    if (!identity) return;
    const id = createWatchPartyMessageId();

    if (roleRef.current === 'host') {
      const message: WatchPartyChatMessage = {
        id,
        userId: identity.userId,
        name: identity.displayName,
        host: true,
        text,
        sentAt: now,
      };
      appendChatMessage(message);
      broadcast({ type: 'CHAT_MESSAGE', message });
      return;
    }

    if (roleRef.current === 'guest') {
      sendGuestPacket({ type: 'CHAT_SEND', id, text, sentAt: now });
    }
  }, [appendChatMessage, broadcast, chatText, sendGuestPacket, status]);

  const leaveParty = useCallback(() => {
    const finish = (removeHostClaim: boolean) => {
      resetParty(removeHostClaim);
      if (mode === 'theater') {
        window.location.replace(episodePath);
      }
    };

    if (roleRef.current === 'host') {
      intentionalCloseRef.current = true;
      broadcast({ type: 'HOST_ENDED', reason: 'host_left' });
      void updateDirectoryRoom('ended');
      trackProductClientEvent('watch_party_room_ended', {
        source: 'watch_together_room',
        path: window.location.pathname,
        entityType: 'watch_party_room',
        entityId: inviteRef.current?.roomId,
        metadata: {
          participants: participantsRef.current.size,
        },
        flush: true,
      });
      window.setTimeout(() => finish(true), 80);
      return;
    }

    finish(false);
  }, [broadcast, episodePath, mode, resetParty, updateDirectoryRoom]);

  useEffect(() => {
    if (mode !== 'theater') return;

    const onExit = () => {
      leaveParty();
    };

    window.addEventListener(WATCH_PARTY_EXIT_EVENT, onExit);
    return () => window.removeEventListener(WATCH_PARTY_EXIT_EVENT, onExit);
  }, [leaveParty, mode]);

  if (status === 'idle') {
    return (
      <section className={`${styles.panel} ${mode === 'theater' ? styles.theaterPanel : ''}`} aria-label="Watch Together">
        <div className={styles.inner}>
          <div className={styles.icon} aria-hidden="true">✦</div>
          <div className={styles.copy}>
            <span className={styles.eyebrow}>WATCH TOGETHER</span>
            <h2 className={styles.title}>Смотреть {episodeNumber}-ю серию вместе</h2>
            <p className={styles.description}>
              Создай приватную комнату для «{animeTitle}», пригласи друзей по ссылке и смотри серию синхронно. В комнате есть общий чат и управление просмотром.
            </p>
          </div>
          <div className={styles.actions}>
            <button type="button" className={styles.primary} onClick={createRoom}>
              Смотреть вместе
            </button>
          </div>
        </div>
      </section>
    );
  }

  const label = statusLabel(status, role, participants.length);

  return (
    <section className={`${styles.panel} ${mode === 'theater' ? styles.theaterPanel : ''}`} aria-label="Watch Together room">
      <div className={styles.activeInner}>
        <div className={styles.activeHead}>
          <div className={styles.statusLine}>
            <span className={styles.statusDot} data-state={status} aria-hidden="true" />
            <div className={styles.statusText}>
              <strong>Watch Together · {episodeNumber} серия</strong>
              <span>{label}</span>
            </div>
          </div>
          <div className={styles.connectionBadges}>
            <span
              className={styles.networkRoute}
              data-route={networkRoute}
              title={networkRoute === 'server'
                ? 'WebRTC заблокирован: команды и чат идут через защищённый серверный WebSocket relay'
                : networkRoute === 'relay'
                  ? 'Соединение идёт через TURN relay'
                  : networkRoute === 'p2p'
                  ? 'Прямое WebRTC P2P соединение'
                  : signalingMode === 'self-hosted'
                    ? 'AnimeBox signaling подключён, ICE маршрут определяется'
                    : 'Используется резервный PeerJS Cloud signaling'}
            >
              {networkRoute === 'server'
                ? 'WS RELAY'
                : networkRoute === 'relay'
                  ? 'TURN RELAY'
                  : networkRoute === 'p2p'
                  ? 'P2P'
                  : signalingMode === 'self-hosted'
                    ? 'ICE'
                    : 'CLOUD'}
            </span>
            <span className={styles.role}>{role === 'host' ? 'HOST' : 'GUEST'}</span>
          </div>
        </div>

        {mode === 'theater' && (
          <div className={styles.mobileTabs} aria-label="Разделы комнаты">
            <button
              type="button"
              data-active={mobileSection === 'chat'}
              onClick={() => setMobileSection('chat')}
            >
              Чат
            </button>
            <button
              type="button"
              data-active={mobileSection === 'participants'}
              onClick={() => setMobileSection('participants')}
            >
              Участники
              <span>{participants.length}</span>
            </button>
            <button
              type="button"
              data-active={mobileSection === 'controls'}
              onClick={() => setMobileSection('controls')}
            >
              Управление
            </button>
          </div>
        )}

        {participants.length > 0 && (
          <div
            className={`${styles.participants} ${styles.participantsSection}`}
            data-mobile-active={mobileSection === 'participants'}
            aria-label="Участники комнаты"
          >
            {participants.map((participant) => {
              const publicIdentity = roomIdentities[participant.userId];
              const displayName = publicIdentity?.username || participant.name;

              return (
                <a
                  className={styles.participant}
                  key={participant.id}
                  href={`/profile/${encodeURIComponent(participant.userId)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={`Открыть профиль ${displayName}`}
                  aria-label={`Открыть профиль ${displayName} в новой вкладке`}
                >
                  <span className={styles.avatar}>
                    {watchPartyInitials(displayName)}
                    {publicIdentity?.avatarUrl && (
                      <Image
                        className={styles.avatarImage}
                        src={publicIdentity.avatarUrl}
                        alt=""
                        aria-hidden="true"
                        fill
                        unoptimized
                        sizes="32px"
                        draggable={false}
                        style={premiumMediaStyle(publicIdentity.avatarTransform)}
                        onError={(event) => {
                          event.currentTarget.style.display = 'none';
                        }}
                      />
                    )}
                  </span>
                  <span className={styles.participantIdentity}>
                    <UserIdentity
                      username={displayName}
                      role={publicIdentity?.role ?? null}
                      sponsor={publicIdentity?.sponsor ?? null}
                      compact
                    />
                    {publicIdentity?.premium && (
                      <span className={styles.premiumBadge} title="AnimeBox Premium">
                        <Image
                          src="/premium/premium-user.webp"
                          alt=""
                          width={16}
                          height={16}
                          aria-hidden="true"
                          unoptimized
                        />
                        <span>Premium</span>
                      </span>
                    )}
                  </span>
                  {participant.host && (
                    <span className={styles.hostBadge} title="Хост комнаты">
                      <svg viewBox="0 0 20 20" aria-hidden="true">
                        <path d="M4.5 6.5 7.3 9l2.7-5 2.7 5 2.8-2.5-1.2 7H5.7l-1.2-7Z" fill="currentColor" />
                        <path d="M6 15.5h8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                      </svg>
                      <span>HOST</span>
                    </span>
                  )}
                </a>
              );
            })}
          </div>
        )}

        <div
          className={`${styles.syncCard} ${styles.controlsSection}`}
          data-mobile-active={mobileSection === 'controls'}
        >
          <div className={styles.syncMeta}>
            <span className={styles.syncEyebrow}>PLAYER SYNC · EVERYONE CAN CONTROL</span>
            <strong>{playerState?.playing ? 'Смотрим синхронно' : 'Пауза у комнаты'}</strong>
            <small>
              {formatPlayerTime(playerState?.position)}
              {playerState?.duration ? ` / ${formatPlayerTime(playerState.duration)}` : ''}
              {lastController ? ` · ${lastController}` : ''}
            </small>
          </div>
          <div className={styles.syncControls} aria-label="Управление совместным просмотром">
            <button
              type="button"
              onClick={() => seekRelative(-10)}
              disabled={status !== 'active' || !playerState}
              aria-label="Назад на 10 секунд"
            >
              −10
            </button>
            <button
              type="button"
              className={styles.syncPrimary}
              onClick={togglePartyPlayback}
              disabled={status !== 'active'}
              aria-label={playerState?.playing ? 'Поставить комнату на паузу' : 'Продолжить просмотр у всех'}
            >
              {playerState?.playing ? '❚❚ Пауза' : '▶ Смотреть'}
            </button>
            <button
              type="button"
              onClick={() => seekRelative(10)}
              disabled={status !== 'active' || !playerState}
              aria-label="Вперёд на 10 секунд"
            >
              +10
            </button>
          </div>
        </div>

        <div
          className={`${styles.chat} ${styles.chatSection}`}
          data-mobile-active={mobileSection === 'chat'}
        >
          <div className={styles.chatHead}>
            <div>
              <span>LIVE CHAT</span>
              <strong>Чат комнаты</strong>
            </div>
            <small>{messages.length ? `${messages.length} сообщений` : 'без истории на сервере'}</small>
          </div>

          <div ref={chatMessagesRef} className={styles.chatMessages} aria-live="polite">
            {messages.length === 0 ? (
              <div className={styles.chatEmpty}>Напиши первое сообщение — оно останется только у участников этой комнаты.</div>
            ) : (
              messages.map((message) => {
                const publicIdentity = roomIdentities[message.userId];
                const displayName = publicIdentity?.username || message.name;
                const profileHref = `/profile/${encodeURIComponent(message.userId)}`;

                return (
                  <div className={styles.chatMessage} key={message.id}>
                    <a
                      className={styles.chatAvatar}
                      href={profileHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={`Открыть профиль ${displayName}`}
                      aria-label={`Открыть профиль ${displayName} в новой вкладке`}
                    >
                      {watchPartyInitials(displayName)}
                      {publicIdentity?.avatarUrl && (
                        <Image
                          className={styles.avatarImage}
                          src={publicIdentity.avatarUrl}
                          alt=""
                          aria-hidden="true"
                          fill
                          unoptimized
                          sizes="32px"
                          draggable={false}
                          style={premiumMediaStyle(publicIdentity.avatarTransform)}
                          onError={(event) => {
                            event.currentTarget.style.display = 'none';
                          }}
                        />
                      )}
                    </a>
                    <div className={styles.chatBubble}>
                      <div className={styles.chatAuthor}>
                        <div className={styles.chatIdentityRow}>
                          <a
                            className={styles.chatAuthorLink}
                            href={profileHref}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <UserIdentity
                              username={displayName}
                              role={publicIdentity?.role ?? null}
                              sponsor={publicIdentity?.sponsor ?? null}
                              compact
                            />
                          </a>
                          {publicIdentity?.premium && (
                            <span className={styles.chatPremiumBadge} title="AnimeBox Premium">
                              <Image
                                src="/premium/premium-user.webp"
                                alt=""
                                width={14}
                                height={14}
                                aria-hidden="true"
                                unoptimized
                              />
                              Premium
                            </span>
                          )}
                          {message.host && (
                            <span className={`${styles.hostBadge} ${styles.chatHostBadge}`} title="Хост комнаты">
                              <svg viewBox="0 0 20 20" aria-hidden="true">
                                <path d="M4.5 6.5 7.3 9l2.7-5 2.7 5 2.8-2.5-1.2 7H5.7l-1.2-7Z" fill="currentColor" />
                                <path d="M6 15.5h8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                              </svg>
                              <span>HOST</span>
                            </span>
                          )}
                        </div>
                        <time>{new Date(message.sentAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</time>
                      </div>
                      <p>{message.text}</p>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <form className={styles.chatForm} onSubmit={submitChat}>
            <input
              value={chatText}
              onChange={(event) => setChatText(event.target.value.slice(0, 500))}
              placeholder="Написать в комнату…"
              maxLength={500}
              disabled={status !== 'active'}
              autoComplete="off"
            />
            <button type="submit" disabled={status !== 'active' || !chatText.trim()}>
              Отправить
            </button>
          </form>
        </div>

        {error && <p className={styles.error} role="status">{error}</p>}

        <div className={styles.footer}>
          <span className={styles.note}>
            Чат и команды идут через WebRTC, TURN или защищённый WS relay. Видео каждый участник загружает напрямую у провайдера. Максимум {WATCH_PARTY_MAX_PARTICIPANTS} человек.
          </span>
          <div className={styles.actions}>
            {inviteUrl && status !== 'ended' && status !== 'error' && (
              <button type="button" className={styles.secondary} onClick={() => void copyInvite()}>
                {copyLabel}
              </button>
            )}
            <button type="button" className={styles.danger} onClick={leaveParty}>
              {role === 'host' ? 'Завершить комнату' : 'Покинуть'}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
