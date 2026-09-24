'use client';

import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Icon from '@/components/Icon';
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
import { premiumMediaStyle, type PremiumMediaTransform } from '@/lib/premium-studio';
import { trackProductClientEvent } from '@/lib/product-events-client';
import UserIdentity from '@/components/identity/UserIdentity';
import ProfilePreview from '@/components/profile/ProfilePreview';
import WatchPartyFriendInvite from '@/components/friends/WatchPartyFriendInvite';
import type { PublicIdentityRole } from '@/lib/identity';
import type { SponsorStatus } from '@/lib/sponsor';
import {
  WATCH_PARTY_EPISODE_CHANGE_EVENT,
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
  type WatchPartyEpisodeChangeDetail,
  type WatchPartyInvite,
  type WatchPartyPacket,
  type WatchPartyParticipant,
  type WatchPartyPlayerActionDetail,
  type WatchPartyPlayerCommandDetail,
  type WatchPartyPlayerControlDetail,
  type WatchPartyPlayerStateDetail,
  type WatchPartyReaction,
  type WatchPartyReactionEvent,
  type WatchPartyVote,
  type WatchPartyVoteState,
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

const HOST_HEARTBEAT_MS = 20_000;
const PLAYER_SYNC_MS = 20_000;
const PLAYER_DRIFT_SEEK_SECONDS = 2;
const CHAT_SEND_COOLDOWN_MS = 650;
const NEGOTIATION_TIMEOUT_MS = 18_000;
const HANDSHAKE_TIMEOUT_MS = 8_000;
const MAX_RECONNECT_ATTEMPTS = 6;
const HOST_STARTUP_TIMEOUT_MS = 15_000;
const IDENTITY_BOOT_TIMEOUT_MS = 4_000;
const GUEST_HEALTH_CHECK_MS = 15_000;
const HOST_STALE_MS = 75_000;
const P2P_ACCELERATOR_GUEST_LIMIT = 6;
const REACTION_COOLDOWN_MS = 850;

const REACTION_OPTIONS: Array<{ value: WatchPartyReaction; label: string }> = [
  { value: 'love', label: '❤️' },
  { value: 'cry', label: '😭' },
  { value: 'fire', label: '🔥' },
  { value: 'wow', label: '😳' },
  { value: 'dead', label: '💀' },
  { value: 'peak', label: 'PEAK' },
];

const EMPTY_VOTE_STATE: WatchPartyVoteState = {
  next: 0,
  wait: 0,
  stop: 0,
  total: 0,
  sentAt: 0,
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
  const [copyLabel, setCopyLabel] = useState('Скопировать ссылку');
  const [messages, setMessages] = useState<WatchPartyChatMessage[]>([]);
  const [chatText, setChatText] = useState('');
  const [playerState, setPlayerState] = useState<WatchPartyPlayerStateDetail | null>(null);
  const [lastController, setLastController] = useState('');
  const [mobileSection, setMobileSection] = useState<MobileSection>('chat');
  const [roomIdentities, setRoomIdentities] = useState<Record<string, RoomPublicIdentity>>({});
  const [networkRoute, setNetworkRoute] = useState<WatchPartyNetworkRoute>('unknown');
  const [signalingMode, setSignalingMode] = useState<'peerjs-cloud' | 'self-hosted'>('peerjs-cloud');
  const [liveReactions, setLiveReactions] = useState<WatchPartyReactionEvent[]>([]);
  const [voteState, setVoteState] = useState<WatchPartyVoteState>(EMPTY_VOTE_STATE);
  const [myVote, setMyVote] = useState<WatchPartyVote | null>(null);

  const theaterPath = watchPartyTheaterPath(animeSlug, episodeNumber);
  const episodePath = `/anime/${encodeURIComponent(animeSlug)}/episode/${episodeNumber}`;

  const peerRef = useRef<PeerInstance | null>(null);
  const guestConnectionRef = useRef<DataConnection | null>(null);
  const hostConnectionsRef = useRef(new Map<string, DataConnection>());
  const pendingHostConnectionsRef = useRef(new Set<string>());
  const participantsRef = useRef(new Map<string, WatchPartyParticipant>());
  const inviteRef = useRef<WatchPartyInvite | null>(null);
  const roleRef = useRef<PartyRole>(null);
  const statusRef = useRef<PartyStatus>('idle');
  const hostBootKeyRef = useRef<string | null>(null);
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
  const startGuestRef = useRef<(invite: WatchPartyInvite) => void>(() => undefined);
  const requestedIdentityIdsRef = useRef(new Set<string>());
  const relayRef = useRef<WatchPartyRelay | null>(null);
  const relayFallbackTimerRef = useRef<number | null>(null);
  const hostStartupTimerRef = useRef<number | null>(null);
  const healthTimerRef = useRef<number | null>(null);
  const guestWelcomedRef = useRef(false);
  const relayWelcomedRef = useRef(false);
  const guestTransportRef = useRef<'p2p' | 'server' | null>(null);
  const lastHostSeenAtRef = useRef(0);
  const hostTransportReadyRef = useRef(false);
  const transportGenerationRef = useRef(0);
  const relayHostGuestIdsRef = useRef(new Set<string>());
  const lastReactionSentAtRef = useRef(0);
  const voteByUserRef = useRef(new Map<string, WatchPartyVote>());
  const wasReconnectingRef = useRef(false);
  const lastPresenceCountRef = useRef(0);
  const lastDriftTelemetryAtRef = useRef(0);

  useEffect(() => {
    statusRef.current = status;

    if (status === 'reconnecting') {
      wasReconnectingRef.current = true;
      return;
    }

    if (status === 'active' && wasReconnectingRef.current) {
      wasReconnectingRef.current = false;
      trackProductClientEvent('watch_party_reconnected', {
        source: roleRef.current === 'host' ? 'room_host' : 'room_guest',
        path: window.location.pathname,
        entityType: 'watch_party_room',
        entityId: inviteRef.current?.roomId,
        metadata: {
          role: roleRef.current,
          route: networkRoute,
          episode: episodeNumber,
        },
      });
    }
  }, [episodeNumber, networkRoute, status]);

  const publishReaction = useCallback((reaction: WatchPartyReactionEvent) => {
    setLiveReactions((current) => [...current, reaction].slice(-10));
    window.setTimeout(() => {
      setLiveReactions((current) => current.filter((item) => item.id !== reaction.id));
    }, 2_400);
  }, []);

  const publishVoteState = useCallback(() => {
    const votes = [...voteByUserRef.current.values()];
    const state: WatchPartyVoteState = {
      next: votes.filter((vote) => vote === 'next').length,
      wait: votes.filter((vote) => vote === 'wait').length,
      stop: votes.filter((vote) => vote === 'stop').length,
      total: votes.length,
      sentAt: Date.now(),
    };
    setVoteState(state);
    return state;
  }, []);

  const publishParticipants = useCallback((next: WatchPartyParticipant[]) => {
    const byUser = new Map<string, WatchPartyParticipant>();

    for (const participant of next) {
      const existing = byUser.get(participant.userId);
      if (
        !existing ||
        participant.host ||
        (!existing.host && participant.joinedAt < existing.joinedAt)
      ) {
        byUser.set(participant.userId, participant);
      }
    }

    const sorted = [...byUser.values()]
      .sort((left, right) => Number(right.host) - Number(left.host) || left.joinedAt - right.joinedAt)
      .slice(0, WATCH_PARTY_MAX_PARTICIPANTS);

    const nextCount = sorted.length;
    if (
      roleRef.current === 'host' &&
      lastPresenceCountRef.current !== nextCount
    ) {
      lastPresenceCountRef.current = nextCount;
      trackProductClientEvent('watch_party_presence_changed', {
        source: 'room_host',
        path: window.location.pathname,
        entityType: 'watch_party_room',
        entityId: inviteRef.current?.roomId,
        metadata: {
          participants: nextCount,
          episode: episodeNumber,
        },
      });
    }

    setParticipants(sorted);
  }, [episodeNumber]);

  const resolveIdentity = useCallback(async (): Promise<PartyIdentity | null> => {
    if (!identityPromiseRef.current) {
      identityPromiseRef.current = (async () => {
        try {
          const supabase = createClient();
          const sessionResult = await Promise.race([
            supabase.auth.getSession(),
            new Promise<null>((resolve) => {
              window.setTimeout(() => resolve(null), IDENTITY_BOOT_TIMEOUT_MS);
            }),
          ]);

          if (!sessionResult) return null;

          const user = sessionResult.data.session?.user;
          if (!user) return null;

          const metadataName =
            typeof user.user_metadata?.username === 'string'
              ? user.user_metadata.username
              : typeof user.user_metadata?.full_name === 'string'
                ? user.user_metadata.full_name
                : typeof user.user_metadata?.name === 'string'
                  ? user.user_metadata.name
                  : null;

          return {
            userId: user.id,
            displayName: sanitizeDisplayName(
              metadataName || user.email?.split('@')[0],
            ),
          };
        } catch {
          return null;
        }
      })();
    }

    const identity = await identityPromiseRef.current;
    if (!identity) identityPromiseRef.current = null;
    return identity;
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

  useEffect(() => {
    if (role !== 'host' || status !== 'active') return;

    const timer = window.setTimeout(() => {
      broadcast({
        type: 'EPISODE_CHANGE',
        animeSlug,
        episode: episodeNumber,
        sentAt: Date.now(),
      });
    }, 120);

    return () => window.clearTimeout(timer);
  }, [animeSlug, broadcast, episodeNumber, role, status]);

  const handleHostReaction = useCallback((
    participant: Pick<WatchPartyParticipant, 'userId' | 'name'>,
    id: string,
    reaction: WatchPartyReaction,
  ) => {
    const event: WatchPartyReactionEvent = {
      id,
      userId: participant.userId,
      name: participant.name,
      reaction,
      sentAt: Date.now(),
    };
    publishReaction(event);
    broadcast({ type: 'REACTION', reaction: event });
  }, [broadcast, publishReaction]);

  const handleHostVote = useCallback((userId: string, vote: WatchPartyVote) => {
    voteByUserRef.current.set(userId, vote);
    const state = publishVoteState();
    broadcast({ type: 'VOTE_STATE', state });
  }, [broadcast, publishVoteState]);

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

  const dispatchEpisodeChange = useCallback((
    detail: WatchPartyEpisodeChangeDetail,
  ) => {
    if (
      detail.animeSlug === animeSlug &&
      detail.episode === episodeNumber
    ) {
      return;
    }

    window.dispatchEvent(
      new CustomEvent<WatchPartyEpisodeChangeDetail>(
        WATCH_PARTY_EPISODE_CHANGE_EVENT,
        { detail },
      ),
    );
  }, [animeSlug, episodeNumber]);

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
    if (hostStartupTimerRef.current != null) {
      window.clearTimeout(hostStartupTimerRef.current);
      hostStartupTimerRef.current = null;
    }
    if (healthTimerRef.current != null) {
      window.clearInterval(healthTimerRef.current);
      healthTimerRef.current = null;
    }
  }, []);

  const destroyTransport = useCallback(() => {
    transportGenerationRef.current += 1;
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
    relayWelcomedRef.current = false;
    guestTransportRef.current = null;
    lastHostSeenAtRef.current = 0;
    hostTransportReadyRef.current = false;
    hostBootKeyRef.current = null;
  }, [clearTimers]);

  const acceptHostTransfer = useCallback((
    invite: WatchPartyInvite,
    targetUserId: string,
  ) => {
    const identity = identityRef.current;
    if (!identity || identity.userId !== targetUserId) return;

    try {
      sessionStorage.setItem(watchPartyHostSessionKey(invite.roomId), invite.secret);
      claimWatchPartyHostTab(invite);
    } catch {
      claimWatchPartyHostTab(invite);
    }

    intentionalCloseRef.current = true;
    setStatus('reconnecting');
    setError('Передаём тебе управление комнатой…');
    destroyTransport();

    window.setTimeout(() => {
      intentionalCloseRef.current = false;
      startHostRef.current(invite);
    }, 650);
  }, [destroyTransport]);

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
    voteByUserRef.current.clear();
    setVoteState(EMPTY_VOTE_STATE);
    setMyVote(null);
    setLiveReactions([]);
    clearWatchPartyFromLocation();
    setRole(null);
    setParticipants([]);
    setInviteUrl('');
    setError('');
    setMessages([]);
    setChatText('');
    setPlayerState(null);
    setLastController('');
    setNetworkRoute('unknown');
    setSignalingMode('peerjs-cloud');
    setStatus('idle');
  }, [destroyTransport]);

  const scheduleGuestReconnectRef = useRef<() => void>(() => undefined);

  const syncRegisteredRoom = useCallback(async () => {
    if (roleRef.current !== 'host') return;

    const invite = inviteRef.current;
    if (!invite) return;

    const state = playerStateRef.current;
    const nextStatus =
      statusRef.current === 'ended'
        ? 'ended'
        : state?.playing
          ? 'watching'
          : state
            ? 'paused'
            : 'waiting';

    try {
      await fetch(
        `/api/watch-party/rooms/${encodeURIComponent(invite.roomId)}/heartbeat`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            participantCount: Math.max(
              1,
              new Set(
                [...participantsRef.current.values()].map((participant) => participant.userId),
              ).size,
            ),
            status: nextStatus,
            episode: state?.episode ?? episodeNumber,
          }),
          cache: 'no-store',
          keepalive: true,
        },
      );
    } catch {
      // Lobby registration is best-effort. P2P/relay playback must continue.
    }
  }, [episodeNumber]);

  const ensureHostTimers = useCallback(() => {
    if (roleRef.current !== 'host') return;

    if (heartbeatTimerRef.current == null) {
      heartbeatTimerRef.current = window.setInterval(() => {
        broadcast({ type: 'ROOM_HEARTBEAT', sentAt: Date.now() });
        void syncRegisteredRoom();
      }, HOST_HEARTBEAT_MS);

      void syncRegisteredRoom();
    }

    if (syncTimerRef.current == null) {
      syncTimerRef.current = window.setInterval(() => {
        sendHostSync();
      }, PLAYER_SYNC_MS);
    }
  }, [broadcast, sendHostSync, syncRegisteredRoom]);


  const sendGuestPacket = useCallback((packet: WatchPartyPacket) => {
    const connection = guestConnectionRef.current;

    if (guestTransportRef.current === 'p2p' && connection?.open && send(connection, packet)) {
      return true;
    }

    if (relayWelcomedRef.current && relayRef.current?.isOpen()) {
      void relayRef.current.send(packet);
      return true;
    }

    return connection?.open ? send(connection, packet) : false;
  }, [send]);

  const attachGuestConnection = useCallback((peer: PeerInstance, invite: WatchPartyInvite, identity: PartyIdentity) => {
    if (
      intentionalCloseRef.current ||
      hostEndedRef.current ||
      peerRef.current !== peer
    ) return;

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
    let negotiationTimer: number | null = null;

    const clearAttemptTimers = () => {
      if (negotiationTimer != null) {
        window.clearTimeout(negotiationTimer);
        negotiationTimer = null;
      }
      if (handshakeTimer != null) {
        window.clearTimeout(handshakeTimer);
        handshakeTimer = null;
      }
    };

    const activateRelayStandby = () => {
      if (!relayWelcomedRef.current || !relayRef.current?.isOpen()) return false;
      guestWelcomedRef.current = true;
      guestTransportRef.current = 'server';
      lastHostSeenAtRef.current = Date.now();
      reconnectAttemptRef.current = 0;
      clearAttemptTimers();
      setNetworkRoute('server');
      setError('');
      setStatus('active');
      return true;
    };

    negotiationTimer = window.setTimeout(() => {
      if (welcomed || connection.open || intentionalCloseRef.current || hostEndedRef.current) return;
      if (activateRelayStandby()) {
        connection.close();
        return;
      }
      reconnectQueued = true;
      setStatus('reconnecting');
      setError('Подключение заняло слишком долго. Пробуем резервный маршрут…');
      connection.close();
      scheduleGuestReconnectRef.current();
    }, NEGOTIATION_TIMEOUT_MS);

    connection.on('open', () => {
      if (guestConnectionRef.current !== connection) {
        connection.close();
        return;
      }
      if (negotiationTimer != null) {
        window.clearTimeout(negotiationTimer);
        negotiationTimer = null;
      }
      inspectWatchPartyRoute(connection, (route) => {
        setNetworkRoute((current) => current === 'relay' ? current : route);
      });
      if (intentionalCloseRef.current || peer.destroyed || !peer.id) return;

      handshakeTimer = window.setTimeout(() => {
        if (welcomed || intentionalCloseRef.current || hostEndedRef.current) return;
        if (activateRelayStandby()) {
          connection.close();
          return;
        }
        reconnectQueued = true;
        setStatus('reconnecting');
        setError('Хост не подтвердил WebRTC. Пробуем резервный маршрут…');
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
      if (guestConnectionRef.current !== connection) return;
      const packet = parseWatchPartyPacket(value);
      if (!packet) return;
      lastHostSeenAtRef.current = Date.now();

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
        lastHostSeenAtRef.current = Date.now();
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

      if (packet.type === 'EPISODE_CHANGE') {
        if (welcomed) {
          dispatchEpisodeChange({
            animeSlug: packet.animeSlug,
            episode: packet.episode,
          });
        }
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
          const now = Date.now();
          if (now - lastDriftTelemetryAtRef.current >= 15_000) {
            lastDriftTelemetryAtRef.current = now;
            trackProductClientEvent('watch_party_sync_drift', {
              source: guestTransportRef.current === 'server' ? 'realtime' : 'p2p',
              path: window.location.pathname,
              entityType: 'watch_party_room',
              entityId: inviteRef.current?.roomId,
              metadata: {
                drift_seconds: Number(drift.toFixed(2)),
                episode: packet.episode,
                playing: packet.playing,
                route: guestTransportRef.current ?? networkRoute,
              },
            });
          }

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

      if (packet.type === 'CHAT_MESSAGE') {
        if (welcomed) appendChatMessage(packet.message);
        return;
      }

      if (packet.type === 'REACTION') {
        if (welcomed) publishReaction(packet.reaction);
        return;
      }

      if (packet.type === 'VOTE_STATE') {
        if (welcomed) setVoteState(packet.state);
        return;
      }

      if (packet.type === 'HOST_TRANSFER') {
        if (welcomed) acceptHostTransfer(invite, packet.targetUserId);
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
      const isCurrent = guestConnectionRef.current === connection;
      if (isCurrent) guestConnectionRef.current = null;
      if (!isCurrent) return;
      if (
        intentionalCloseRef.current ||
        hostEndedRef.current ||
        reconnectQueued ||
        guestTransportRef.current === 'server'
      ) return;
      if (activateRelayStandby()) return;
      reconnectQueued = true;
      setStatus('reconnecting');
      scheduleGuestReconnectRef.current();
    });

    connection.on('error', () => {
      clearAttemptTimers();
      if (guestConnectionRef.current !== connection) return;
      if (
        intentionalCloseRef.current ||
        hostEndedRef.current ||
        reconnectQueued ||
        guestTransportRef.current === 'server'
      ) return;
      if (activateRelayStandby()) return;
      reconnectQueued = true;
      setStatus('reconnecting');
      scheduleGuestReconnectRef.current();
    });

  }, [
    acceptHostTransfer,
    appendChatMessage,
    dispatchEpisodeChange,
    dispatchPlayerCommand,
    publishParticipants,
    publishReaction,
    send,
  ]);

  const startGuest = useCallback(async (invite: WatchPartyInvite) => {
    const generation = transportGenerationRef.current + 1;
    transportGenerationRef.current = generation;
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
    if (
      intentionalCloseRef.current ||
      transportGenerationRef.current !== generation
    ) return;

    guestWelcomedRef.current = false;
    relayWelcomedRef.current = false;
    guestTransportRef.current = null;
    lastHostSeenAtRef.current = Date.now();

    const startServerRelay = async () => {
      if (
        intentionalCloseRef.current ||
        hostEndedRef.current ||
        transportGenerationRef.current !== generation ||
        relayRef.current
      ) return;

      try {
        const relay = await openWatchPartyRelay(invite, (packet) => {
          if (
            intentionalCloseRef.current ||
            hostEndedRef.current ||
            transportGenerationRef.current !== generation
          ) return;

          lastHostSeenAtRef.current = Date.now();

          if (packet.type === 'WELCOME') {
            if (packet.roomId !== invite.roomId || packet.protocol !== WATCH_PARTY_PROTOCOL) return;

            relayWelcomedRef.current = true;
            reconnectAttemptRef.current = 0;
            publishParticipants(packet.participants);

            if (guestTransportRef.current === 'p2p' && guestConnectionRef.current?.open) {
              // Keep Realtime subscribed as a hot standby. If WebRTC dies, the
              // room can switch transports without a visible reconnect cycle.
              return;
            }

            guestWelcomedRef.current = true;
            guestTransportRef.current = 'server';
            setNetworkRoute('server');
            setError('');
            setStatus('active');
            guestConnectionRef.current?.close();
            return;
          }

          if (packet.type === 'ROOM_HEARTBEAT') {
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

          if (packet.type === 'EPISODE_CHANGE') {
            dispatchEpisodeChange({
              animeSlug: packet.animeSlug,
              episode: packet.episode,
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
              const now = Date.now();
              if (now - lastDriftTelemetryAtRef.current >= 15_000) {
                lastDriftTelemetryAtRef.current = now;
                trackProductClientEvent('watch_party_sync_drift', {
                  source: guestTransportRef.current === 'server' ? 'realtime' : 'p2p',
                  path: window.location.pathname,
                  entityType: 'watch_party_room',
                  entityId: inviteRef.current?.roomId,
                  metadata: {
                    drift_seconds: Number(drift.toFixed(2)),
                    episode: packet.episode,
                    playing: packet.playing,
                    route: guestTransportRef.current ?? networkRoute,
                  },
                });
              }

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

          if (packet.type === 'CHAT_MESSAGE') {
            appendChatMessage(packet.message);
            return;
          }

          if (packet.type === 'REACTION') {
            publishReaction(packet.reaction);
            return;
          }

          if (packet.type === 'VOTE_STATE') {
            setVoteState(packet.state);
            return;
          }

          if (packet.type === 'HOST_TRANSFER') {
            acceptHostTransfer(invite, packet.targetUserId);
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
        }, {
          presence: {
            userId: identity.userId,
            name: identity.displayName,
            host: false,
            joinedAt: Date.now(),
          },
          onPresence: (members) => {
            if (transportGenerationRef.current !== generation) return;
            publishParticipants(
              members.map((member) => ({
                id: member.relayId,
                userId: member.userId,
                name: member.name,
                host: member.host,
                joinedAt: member.joinedAt,
              })),
            );
          },
          onStatus: (relayStatus) => {
            if (transportGenerationRef.current !== generation) return;

            if (relayStatus === 'open') {
              const liveRelay = relayRef.current;
              if (liveRelay) {
                relayWelcomedRef.current = false;
                void liveRelay.send({
                  type: 'HELLO',
                  protocol: WATCH_PARTY_PROTOCOL,
                  roomId: invite.roomId,
                  secret: invite.secret,
                  participant: {
                    id: liveRelay.id,
                    userId: identity.userId,
                    name: identity.displayName,
                    host: false,
                    joinedAt: Date.now(),
                  },
                });
              }
              return;
            }

            relayWelcomedRef.current = false;
            if (
              guestTransportRef.current === 'server' &&
              !(guestConnectionRef.current?.open)
            ) {
              setStatus('reconnecting');
              setError('Восстанавливаем канал комнаты…');
            }
          },
        });

        if (
          intentionalCloseRef.current ||
          hostEndedRef.current ||
          transportGenerationRef.current !== generation
        ) {
          await relay.close();
          return;
        }

        relayRef.current = relay;
        if (guestTransportRef.current !== 'p2p') {
          setError('Подтверждаем вход в комнату…');
        }

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
        for (let attempt = 0; attempt < 5 && !relayWelcomedRef.current; attempt += 1) {
          await relay.send(hello);
          if (relayWelcomedRef.current) break;
          await new Promise((resolve) => window.setTimeout(resolve, 1_000));
        }
      } catch {
        if (
          transportGenerationRef.current === generation &&
          !guestWelcomedRef.current
        ) {
          setError('Realtime пока недоступен. Пробуем прямое соединение…');
        }
      }
    };

    void startServerRelay();

    let peerBundle: Awaited<ReturnType<typeof createWatchPartyPeer>>;
    try {
      peerBundle = await createWatchPartyPeer();
    } catch {
      if (
        transportGenerationRef.current === generation &&
        !relayWelcomedRef.current
      ) {
        setError('WebRTC недоступен. Ждём резервный канал комнаты…');
      }
      return;
    }

    const { peer, network } = peerBundle;
    if (
      transportGenerationRef.current !== generation ||
      intentionalCloseRef.current
    ) {
      if (!peer.destroyed) peer.destroy();
      return;
    }

    setSignalingMode(network.signalingMode);
    if (!relayWelcomedRef.current) setNetworkRoute('unknown');
    peerRef.current = peer;

    scheduleGuestReconnectRef.current = () => {
      if (
        intentionalCloseRef.current ||
        hostEndedRef.current ||
        transportGenerationRef.current !== generation ||
        peer.destroyed
      ) return;

      if (relayWelcomedRef.current && relayRef.current?.isOpen()) {
        guestWelcomedRef.current = true;
        guestTransportRef.current = 'server';
        setNetworkRoute('server');
        setError('');
        setStatus('active');
        return;
      }
      if (reconnectTimerRef.current != null) return;

      const attempt = reconnectAttemptRef.current + 1;
      reconnectAttemptRef.current = attempt;
      if (attempt > MAX_RECONNECT_ATTEMPTS) {
        setStatus('ended');
        setError('Хост недоступен. Комната, вероятно, завершена.');
        return;
      }

      const jitter = Math.floor(Math.random() * 280);
      const delay = Math.min(8_000, 700 * 2 ** (attempt - 1)) + jitter;
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
      if (transportGenerationRef.current !== generation) return;
      reconnectAttemptRef.current = 0;
      attachGuestConnection(peer, invite, identity);
    });

    peer.on('disconnected', () => {
      if (
        intentionalCloseRef.current ||
        hostEndedRef.current ||
        transportGenerationRef.current !== generation
      ) return;

      // PeerJS signaling can disappear while an established DataChannel is
      // still healthy. Do not flash "reconnecting" unless both transports are
      // actually unavailable.
      if (guestConnectionRef.current?.open) return;
      if (relayWelcomedRef.current && relayRef.current?.isOpen()) {
        guestTransportRef.current = 'server';
        setNetworkRoute('server');
        setError('');
        setStatus('active');
        return;
      }

      setStatus('reconnecting');
      scheduleGuestReconnectRef.current();
    });

    peer.on('close', () => {
      if (
        intentionalCloseRef.current ||
        hostEndedRef.current ||
        transportGenerationRef.current !== generation
      ) return;

      if (relayWelcomedRef.current && relayRef.current?.isOpen()) {
        guestTransportRef.current = 'server';
        setNetworkRoute('server');
        setError('');
        setStatus('active');
        return;
      }

      if (peerRef.current === peer) peerRef.current = null;
      setStatus('reconnecting');
      setError('Перезапускаем соединение с комнатой…');

      const nextInvite = inviteRef.current;
      if (!nextInvite) return;

      window.setTimeout(() => {
        if (
          intentionalCloseRef.current ||
          hostEndedRef.current ||
          transportGenerationRef.current !== generation
        ) return;

        destroyTransport();
        intentionalCloseRef.current = false;
        startGuestRef.current(nextInvite);
      }, 700);
    });

    peer.on('error', (peerError) => {
      if (
        intentionalCloseRef.current ||
        hostEndedRef.current ||
        transportGenerationRef.current !== generation
      ) return;
      if (guestConnectionRef.current?.open) return;
      if (relayWelcomedRef.current && relayRef.current?.isOpen()) {
        guestTransportRef.current = 'server';
        setNetworkRoute('server');
        setError('');
        setStatus('active');
        return;
      }
      const type = 'type' in peerError ? String(peerError.type) : '';
      if (type === 'peer-unavailable' || type === 'network' || type === 'disconnected') {
        setStatus('reconnecting');
        scheduleGuestReconnectRef.current();
        return;
      }
      setStatus('error');
      setError(describeWatchPartyPeerError(peerError, network));
    });

    if (healthTimerRef.current == null) {
      healthTimerRef.current = window.setInterval(() => {
        if (
          roleRef.current !== 'guest' ||
          intentionalCloseRef.current ||
          hostEndedRef.current ||
          transportGenerationRef.current !== generation
        ) {
          return;
        }

        const lastSeen = lastHostSeenAtRef.current;
        if (!lastSeen || Date.now() - lastSeen < HOST_STALE_MS) return;

        if (guestConnectionRef.current?.open) {
          // The P2P channel itself is alive; wait for the next room heartbeat
          // before disturbing playback.
          return;
        }

        if (relayWelcomedRef.current && relayRef.current?.isOpen()) {
          setError('Хост временно не отвечает. Канал комнаты остаётся подключён.');
          return;
        }

        setStatus('reconnecting');
        setError('Связь с комнатой потеряна. Восстанавливаем соединение…');
        scheduleGuestReconnectRef.current();
      }, GUEST_HEALTH_CHECK_MS);
    }
  }, [
    acceptHostTransfer,
    appendChatMessage,
    attachGuestConnection,
    dispatchEpisodeChange,
    dispatchPlayerCommand,
    publishParticipants,
    publishReaction,
    redirectToRegistration,
    resolveIdentity,
    destroyTransport,
  ]);

  const startHost = useCallback(async (invite: WatchPartyInvite) => {
    const bootKey = `${invite.roomId}:${invite.secret}`;

    // Booting the same host room twice used to create a lifecycle loop:
    // status -> callback identity -> boot effect -> startHost again.
    // Treat room bootstrap as idempotent and only restart after an explicit
    // transport teardown/reclaim clears hostBootKeyRef.
    if (
      hostBootKeyRef.current === bootKey &&
      roleRef.current === 'host' &&
      !intentionalCloseRef.current
    ) {
      return;
    }

    hostBootKeyRef.current = bootKey;
    const generation = transportGenerationRef.current + 1;
    transportGenerationRef.current = generation;
    intentionalCloseRef.current = false;
    hostEndedRef.current = false;
    hostTransportReadyRef.current = false;
    roleRef.current = 'host';
    inviteRef.current = invite;
    setRole('host');
    setStatus('connecting');
    setError('');
    setInviteUrl(buildWatchPartyUrl(invite));

    // Start the watchdog before any async identity/network work. Previously a
    // stalled Supabase identity lookup could leave the room on
    // "Создаём комнату…" forever because the watchdog had not been armed yet.
    hostStartupTimerRef.current = window.setTimeout(() => {
      hostStartupTimerRef.current = null;
      if (
        transportGenerationRef.current !== generation ||
        intentionalCloseRef.current ||
        hostTransportReadyRef.current
      ) {
        return;
      }

      hostBootKeyRef.current = null;
      setStatus('error');
      setError('Запуск комнаты занял слишком много времени. Попробуй ещё раз.');
    }, HOST_STARTUP_TIMEOUT_MS);

    const identity = await resolveIdentity();
    if (!identity) {
      if (hostStartupTimerRef.current != null) {
        window.clearTimeout(hostStartupTimerRef.current);
        hostStartupTimerRef.current = null;
      }
      hostBootKeyRef.current = null;
      redirectToRegistration();
      return;
    }
    identityRef.current = identity;
    if (
      intentionalCloseRef.current ||
      transportGenerationRef.current !== generation
    ) return;

    const hostPeerId = watchPartyHostPeerId(invite.roomId);
    let peerBundle: Awaited<ReturnType<typeof createWatchPartyPeer>>;

    try {
      peerBundle = await createWatchPartyPeer(hostPeerId);
    } catch {
      if (hostStartupTimerRef.current != null) {
        window.clearTimeout(hostStartupTimerRef.current);
        hostStartupTimerRef.current = null;
      }
      if (
        transportGenerationRef.current === generation &&
        !intentionalCloseRef.current
      ) {
        hostBootKeyRef.current = null;
        setStatus('error');
        setError('Не удалось запустить канал комнаты. Попробуй создать её ещё раз.');
      }
      return;
    }

    const { peer, network } = peerBundle;
    if (
      transportGenerationRef.current !== generation ||
      intentionalCloseRef.current
    ) {
      if (!peer.destroyed) peer.destroy();
      return;
    }

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
      if (
        intentionalCloseRef.current ||
        transportGenerationRef.current !== generation
      ) return;

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

        const uniqueParticipantCount = new Set(
          [...participantsRef.current.values()].map((participant) => participant.userId),
        ).size;

        if (
          !participantsRef.current.has(senderId) &&
          ![...participantsRef.current.values()].some(
            (participant) => participant.userId === packet.participant.userId,
          ) &&
          uniqueParticipantCount >= WATCH_PARTY_MAX_PARTICIPANTS
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
        void relayRef.current?.send({
          type: 'EPISODE_CHANGE',
          animeSlug,
          episode: episodeNumber,
          sentAt: Date.now(),
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
        return;
      }

      if (packet.type === 'REACTION_SEND') {
        handleHostReaction(participant, packet.id, packet.reaction);
        return;
      }

      if (packet.type === 'VOTE_CAST') {
        handleHostVote(participant.userId, packet.vote);
      }
    }, {
      presence: {
        userId: identity.userId,
        name: identity.displayName,
        host: true,
        joinedAt: hostParticipant.joinedAt,
      },
      onPresence: (members) => {
        if (transportGenerationRef.current !== generation) return;

        const liveRelayGuests = members.filter((member) => !member.host);
        const liveRelayIds = new Set(
          liveRelayGuests.map((member) => member.relayId),
        );
        let changed = false;

        // Presence is authoritative for the Realtime path. Hydrate guests from
        // it even when the initial HELLO broadcast was missed during subscribe.
        for (const member of liveRelayGuests) {
          const current = participantsRef.current.get(member.relayId);
          if (
            !current ||
            current.userId !== member.userId ||
            current.name !== member.name ||
            current.host
          ) {
            participantsRef.current.set(member.relayId, {
              id: member.relayId,
              userId: member.userId,
              name: member.name,
              host: false,
              joinedAt: member.joinedAt,
            });
            changed = true;
          }
          relayHostGuestIdsRef.current.add(member.relayId);
        }

        for (const relayId of [...relayHostGuestIdsRef.current]) {
          if (liveRelayIds.has(relayId)) continue;
          relayHostGuestIdsRef.current.delete(relayId);
          if (participantsRef.current.delete(relayId)) changed = true;
        }

        if (changed) {
          broadcastParticipants();
          void syncRegisteredRoom();
        }
      },
      onStatus: (relayStatus) => {
        if (transportGenerationRef.current !== generation) return;
        if (
          relayStatus !== 'open' &&
          !(peerRef.current && !peerRef.current.destroyed && !peerRef.current.disconnected)
        ) {
          setStatus('reconnecting');
          setError('Восстанавливаем канал комнаты…');
        }
      },
    }).then((relay) => {
      if (
        intentionalCloseRef.current ||
        transportGenerationRef.current !== generation
      ) {
        void relay.close();
        return;
      }
      relayRef.current = relay;
      hostTransportReadyRef.current = true;
      if (hostStartupTimerRef.current != null) {
        window.clearTimeout(hostStartupTimerRef.current);
        hostStartupTimerRef.current = null;
      }
      publishParticipants([...participantsRef.current.values()]);
      setNetworkRoute('server');
      setError('');
      setStatus('active');
      ensureHostTimers();
    }).catch(() => {
      // WebRTC remains available if Realtime is temporarily unavailable.
    });

    peer.on('connection', (connection) => {
      if (intentionalCloseRef.current) {
        connection.close();
        return;
      }

      const p2pLimit = relayRef.current?.isOpen()
        ? P2P_ACCELERATOR_GUEST_LIMIT
        : WATCH_PARTY_MAX_PARTICIPANTS - 1;

      if (
        hostConnectionsRef.current.size + pendingHostConnectionsRef.current.size >=
        p2pLimit
      ) {
        connection.on('open', () => {
          // Large rooms use the Realtime room bus. Do not make the host keep
          // dozens of WebRTC DataChannels just to synchronize tiny events.
          if (!relayRef.current?.isOpen()) {
            send(connection, { type: 'REJECT', reason: 'room_full' });
          }
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
          const currentP2pLimit = relayRef.current?.isOpen()
            ? P2P_ACCELERATOR_GUEST_LIMIT
            : WATCH_PARTY_MAX_PARTICIPANTS - 1;
          if (hostConnectionsRef.current.size >= currentP2pLimit) {
            if (!relayRef.current?.isOpen()) {
              send(connection, { type: 'REJECT', reason: 'room_full' });
            }
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
          send(connection, {
            type: 'EPISODE_CHANGE',
            animeSlug,
            episode: episodeNumber,
            sentAt: Date.now(),
          });
          broadcastParticipants();
          void syncRegisteredRoom();
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
          return;
        }

        if (packet.type === 'REACTION_SEND') {
          handleHostReaction(participant, packet.id, packet.reaction);
          return;
        }

        if (packet.type === 'VOTE_CAST') {
          handleHostVote(participant.userId, packet.vote);
        }
      });

      connection.on('close', () => {
        clearConnectionTimers();
        pendingHostConnectionsRef.current.delete(connection.peer);
        if (!accepted) return;
        hostConnectionsRef.current.delete(connection.peer);
        participantsRef.current.delete(connection.peer);
        broadcastParticipants();
        void syncRegisteredRoom();
      });

      connection.on('error', () => {
        clearConnectionTimers();
        pendingHostConnectionsRef.current.delete(connection.peer);
        if (!accepted) return;
        hostConnectionsRef.current.delete(connection.peer);
        participantsRef.current.delete(connection.peer);
        broadcastParticipants();
        void syncRegisteredRoom();
      });

    });

    peer.on('open', () => {
      if (transportGenerationRef.current !== generation) return;
      hostReclaimAttemptRef.current = 0;
      hostTransportReadyRef.current = true;
      if (hostStartupTimerRef.current != null) {
        window.clearTimeout(hostStartupTimerRef.current);
        hostStartupTimerRef.current = null;
      }
      publishParticipants([...participantsRef.current.values()]);
      setError('');
      setStatus('active');
      ensureHostTimers();
    });

    peer.on('disconnected', () => {
      if (
        intentionalCloseRef.current ||
        peer.destroyed ||
        transportGenerationRef.current !== generation
      ) return;

      try {
        peer.reconnect();
      } catch {
        // Realtime can keep the room alive while PeerJS signaling recovers.
      }

      if (relayRef.current?.isOpen()) {
        setNetworkRoute('server');
        setError('');
        setStatus('active');
        return;
      }

      setStatus('reconnecting');
      setError('Восстанавливаем соединение комнаты…');
    });

    peer.on('close', () => {
      if (
        intentionalCloseRef.current ||
        transportGenerationRef.current !== generation
      ) return;

      if (relayRef.current?.isOpen()) {
        setNetworkRoute('server');
        setError('');
        setStatus('active');
        return;
      }

      if (peerRef.current === peer) peerRef.current = null;
      hostBootKeyRef.current = null;
      setStatus('reconnecting');
      setError('Перезапускаем host-соединение комнаты…');

      window.setTimeout(() => {
        if (
          intentionalCloseRef.current ||
          transportGenerationRef.current !== generation
        ) return;

        destroyTransport();
        intentionalCloseRef.current = false;
        startHostRef.current(invite);
      }, 700);
    });

    peer.on('error', (peerError) => {
      if (
        intentionalCloseRef.current ||
        transportGenerationRef.current !== generation
      ) return;
      const type = 'type' in peerError ? String(peerError.type) : '';
      if (type === 'unavailable-id') {
        if (relayRef.current?.isOpen()) {
          setNetworkRoute('server');
          setError('');
          setStatus('active');
          return;
        }

        const attempt = hostReclaimAttemptRef.current + 1;
        hostReclaimAttemptRef.current = attempt;
        if (attempt <= 3) {
          setStatus('reconnecting');
          setError('Возвращаем комнату после переподключения…');
          window.setTimeout(() => {
            if (intentionalCloseRef.current) return;
            if (peerRef.current === peer) peerRef.current = null;
            hostBootKeyRef.current = null;
            startHostRef.current(invite);
          }, attempt * 900);
          return;
        }
        setStatus('error');
        setError('Эта комната ещё активна в другой вкладке. Закрой её или используй текущую вкладку хоста.');
        return;
      }
      if (type === 'network' || type === 'disconnected') {
        if (relayRef.current?.isOpen()) {
          setNetworkRoute('server');
          setError('');
          setStatus('active');
          return;
        }
        setStatus('reconnecting');
        return;
      }

      if (relayRef.current?.isOpen()) {
        setNetworkRoute('server');
        setError('');
        setStatus('active');
        return;
      }

      setStatus('error');
      setError(describeWatchPartyPeerError(peerError, network));
    });
  }, [
    appendChatMessage,
    broadcast,
    handleHostReaction,
    handleHostVote,
    broadcastParticipants,
    currentPlayerSnapshot,
    destroyTransport,
    ensureHostTimers,
    episodeNumber,
    publishParticipants,
    redirectToRegistration,
    resolveIdentity,
    send,
    sendHostSync,
    sequencePlayerAction,
    syncRegisteredRoom,
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
    startGuestRef.current = (nextInvite) => {
      void startGuest(nextInvite);
    };
  }, [startGuest]);

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
     * Room bootstrap must depend only on the invite/location, not on callback
     * identities. startHost/startGuest legitimately change when networking
     * internals change; putting them in this effect's dependency list caused
     * status transitions to reboot the same room indefinitely.
     *
     * The refs above always point at the latest callbacks, while this effect
     * runs only when the actual theater target changes.
     */
    let cancelled = false;

    queueMicrotask(() => {
      if (cancelled) return;
      if (hostClaim) {
        startHostRef.current(invite);
      } else {
        startGuestRef.current(invite);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [mode, theaterPath]);

  useEffect(() => {
    const onOffline = () => {
      if (roleRef.current) {
        setStatus('reconnecting');
        setError('Интернет-соединение потеряно. Ждём восстановления сети…');
      }
    };

    const onOnline = () => {
      if (intentionalCloseRef.current || hostEndedRef.current) return;

      if (relayRef.current?.isOpen()) {
        setNetworkRoute('server');
        setError('');
        setStatus('active');
        return;
      }

      const peer = peerRef.current;
      if (peer?.disconnected && !peer.destroyed) {
        try {
          peer.reconnect();
        } catch {
          // A fresh transport is created below if PeerJS cannot reconnect.
        }
      }

      if (!peer || peer.destroyed) {
        const invite = inviteRef.current;
        const currentRole = roleRef.current;
        if (!invite || !currentRole) return;

        setStatus('reconnecting');
        setError('Связь восстановлена. Перезапускаем комнату…');
        destroyTransport();
        intentionalCloseRef.current = false;

        queueMicrotask(() => {
          if (intentionalCloseRef.current || hostEndedRef.current) return;
          if (currentRole === 'host') startHostRef.current(invite);
          else startGuestRef.current(invite);
        });
        return;
      }

      setError('');
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
  }, [destroyTransport]);

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
      trackProductClientEvent('watch_party_invite_shared', {
        source: 'watch_party_room',
        path: window.location.pathname,
        entityType: 'watch_party_room',
        entityId: inviteRef.current?.roomId ?? undefined,
        flush: true,
      });
      setCopyLabel('Ссылка скопирована');
      window.setTimeout(() => setCopyLabel('Скопировать ссылку'), 1_800);
    } catch {
      setCopyLabel('Не удалось скопировать');
      window.setTimeout(() => setCopyLabel('Скопировать ссылку'), 1_800);
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

  const sendReaction = useCallback((reaction: WatchPartyReaction) => {
    if (status !== 'active') return;
    const identity = identityRef.current;
    if (!identity) return;

    const now = Date.now();
    if (now - lastReactionSentAtRef.current < REACTION_COOLDOWN_MS) return;
    lastReactionSentAtRef.current = now;

    const id = createWatchPartyMessageId();
    if (roleRef.current === 'host') {
      handleHostReaction(
        { userId: identity.userId, name: identity.displayName },
        id,
        reaction,
      );
    } else {
      sendGuestPacket({
        type: 'REACTION_SEND',
        id,
        reaction,
        sentAt: now,
      });
    }

    trackProductClientEvent('watch_party_reaction', {
      source: 'watch_party_room',
      path: window.location.pathname,
      entityType: 'watch_party_room',
      entityId: inviteRef.current?.roomId,
      metadata: { reaction },
    });
  }, [handleHostReaction, sendGuestPacket, status]);

  const castVote = useCallback((vote: WatchPartyVote) => {
    if (status !== 'active') return;
    const identity = identityRef.current;
    if (!identity) return;

    setMyVote(vote);

    if (roleRef.current === 'host') {
      handleHostVote(identity.userId, vote);
    } else {
      sendGuestPacket({
        type: 'VOTE_CAST',
        vote,
        sentAt: Date.now(),
      });
    }

    trackProductClientEvent('watch_party_vote', {
      source: 'watch_party_room',
      path: window.location.pathname,
      entityType: 'watch_party_room',
      entityId: inviteRef.current?.roomId,
      metadata: { vote, episode: episodeNumber },
    });
  }, [episodeNumber, handleHostVote, sendGuestPacket, status]);

  const transferHost = useCallback(async (
    target: WatchPartyParticipant,
    behavior: 'stay' | 'leave' = 'stay',
  ): Promise<boolean> => {
    if (roleRef.current !== 'host' || target.host) return false;
    const invite = inviteRef.current;
    if (!invite) return false;

    try {
      const response = await fetch(
        `/api/watch-party/rooms/${encodeURIComponent(invite.roomId)}/transfer`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ targetUserId: target.userId }),
          cache: 'no-store',
        },
      );
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error || 'Не удалось передать host.');
      }

      const packet: WatchPartyPacket = {
        type: 'HOST_TRANSFER',
        targetUserId: target.userId,
        sentAt: Date.now(),
      };

      let delivered = false;

      // Every guest keeps the Realtime room bus as a standby. Broadcasting the
      // transfer is safer than targeting a transport id: P2P and relay ids are
      // intentionally different, while acceptHostTransfer validates userId.
      if (relayRef.current?.isOpen()) {
        delivered = await relayRef.current.send(packet);
      }

      if (!delivered) {
        const direct = hostConnectionsRef.current.get(target.id);
        if (direct) delivered = send(direct, packet);
      }

      if (!delivered) {
        throw new Error('Новый host потерял соединение. Попробуй другого участника.');
      }

      trackProductClientEvent('watch_party_host_transferred', {
        source: behavior === 'leave' ? 'host_leave' : 'host_tools',
        path: window.location.pathname,
        entityType: 'watch_party_room',
        entityId: invite.roomId,
        metadata: {
          target_user_id: target.userId,
          participants: participants.length,
          episode: episodeNumber,
        },
        flush: true,
      });

      intentionalCloseRef.current = true;
      setStatus('reconnecting');
      setError(
        behavior === 'leave'
          ? `Передаём комнату пользователю ${target.name} перед выходом…`
          : `Передаём управление пользователю ${target.name}…`,
      );

      try {
        sessionStorage.removeItem(watchPartyHostSessionKey(invite.roomId));
      } catch {
        // Optional host recovery storage.
      }
      clearWatchPartyHostTab(invite);

      // Give the direct DataChannel a short flush window. Realtime delivery
      // already waited for ACK above.
      if (!relayRef.current?.isOpen()) {
        await new Promise((resolve) => window.setTimeout(resolve, 140));
      }

      destroyTransport();

      if (behavior === 'leave') {
        roleRef.current = null;
        setRole(null);
        return true;
      }

      roleRef.current = 'guest';
      setRole('guest');

      window.setTimeout(() => {
        intentionalCloseRef.current = false;
        startGuestRef.current(invite);
      }, 900);

      return true;
    } catch (transferError) {
      setError(
        transferError instanceof Error
          ? transferError.message
          : 'Не удалось передать управление.',
      );
      return false;
    }
  }, [destroyTransport, episodeNumber, participants.length, send]);

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

  const leaveParty = useCallback(async () => {
    const finish = (removeHostClaim: boolean) => {
      resetParty(removeHostClaim);
      if (mode === 'theater') {
        window.location.replace(episodePath);
      }
    };

    if (roleRef.current === 'host') {
      const guestsByUser = new Map<string, WatchPartyParticipant>();
      for (const participant of participantsRef.current.values()) {
        if (participant.host) continue;
        const current = guestsByUser.get(participant.userId);
        if (!current || participant.joinedAt < current.joinedAt) {
          guestsByUser.set(participant.userId, participant);
        }
      }

      const successor = [...guestsByUser.values()]
        .sort((left, right) => left.joinedAt - right.joinedAt)[0];

      // A graceful host exit should not kill an active room. Hand control to
      // the longest-connected guest; only end the room when nobody can inherit.
      if (successor) {
        const transferred = await transferHost(successor, 'leave');
        if (transferred) {
          window.setTimeout(() => finish(true), 120);
          return;
        }
      }

      intentionalCloseRef.current = true;
      broadcast({ type: 'HOST_ENDED', reason: 'host_left' });

      const roomId = inviteRef.current?.roomId;
      if (roomId) {
        void fetch(
          `/api/watch-party/rooms/${encodeURIComponent(roomId)}/end`,
          {
            method: 'POST',
            cache: 'no-store',
            keepalive: true,
          },
        ).catch(() => undefined);
      }

      window.setTimeout(() => finish(true), 120);
      return;
    }

    finish(false);
  }, [broadcast, episodePath, mode, resetParty, transferHost]);

  const joinedTrackedRef = useRef(false);

  useEffect(() => {
    if (status !== 'active' || joinedTrackedRef.current) return;
    const invite = inviteRef.current;
    if (!invite) return;

    joinedTrackedRef.current = true;
    trackProductClientEvent('watch_party_joined', {
      source: role === 'host' ? 'room_host' : 'room_guest',
      path: window.location.pathname,
      entityType: 'watch_party_room',
      entityId: invite.roomId,
      metadata: {
        role,
        participants: participants.length,
        episode: episodeNumber,
      },
      flush: true,
    });
  }, [episodeNumber, participants.length, role, status]);

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
              <strong>{animeTitle}</strong>
              <span>{episodeNumber} серия · {label}</span>
            </div>
          </div>
          <div className={styles.connectionBadges}>
            <span className={styles.roomHealth} data-state={status}>
              {status === 'active'
                ? 'Синхронизация стабильна'
                : status === 'reconnecting'
                  ? 'Восстанавливаем'
                  : status === 'connecting'
                    ? 'Подключаем'
                    : status === 'ended'
                      ? 'Завершена'
                      : status === 'error'
                        ? 'Ошибка'
                        : 'Готово'}
            </span>
            <span className={styles.participantCountBadge}>
              {participants.length}/{WATCH_PARTY_MAX_PARTICIPANTS}
            </span>
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
                ? 'Relay'
                : networkRoute === 'relay'
                  ? 'TURN'
                  : networkRoute === 'p2p'
                    ? 'P2P'
                    : signalingMode === 'self-hosted'
                      ? 'ICE'
                      : 'Cloud'}
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
          <>
            <div className={styles.participantsHead}>
              <span>Участники</span>
              <small>{participants.length} в комнате</small>
            </div>
            <div
              className={`${styles.participants} ${styles.participantsSection}`}
            data-mobile-active={mobileSection === 'participants'}
            aria-label="Участники комнаты"
          >
            {participants.map((participant) => {
              const publicIdentity = roomIdentities[participant.userId];
              const displayName = publicIdentity?.username || participant.name;

              return (
                <ProfilePreview
                  className={styles.participant}
                  key={participant.id}
                  userId={participant.userId}
                  username={displayName}
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
                        <Icon name="crown" size={14} weight="fill" />
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
                </ProfilePreview>
              );
            })}
            </div>
          </>
        )}

        {role === 'host' && participants.some((participant) => !participant.host) && (
          <div className={styles.hostTools}>
            <span>Передать host</span>
            <div>
              {participants
                .filter((participant) => !participant.host)
                .map((participant) => (
                  <button
                    key={participant.id}
                    type="button"
                    onClick={() => void transferHost(participant)}
                  >
                    {participant.name}
                  </button>
                ))}
            </div>
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

        <div className={styles.socialBar}>
          <div className={styles.reactions} aria-label="Быстрые реакции">
            {REACTION_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => sendReaction(option.value)}
                disabled={status !== 'active'}
                aria-label={`Реакция ${option.value}`}
              >
                {option.label}
              </button>
            ))}
          </div>

          <div className={styles.voteBox}>
            <div className={styles.voteHeading}>
              <span>Следующая серия?</span>
              <small>{voteState.total ? `${voteState.total} голосов` : 'голосование открыто'}</small>
            </div>
            <div>
              <button
                type="button"
                data-active={myVote === 'next'}
                onClick={() => castVote('next')}
              >
                <span>Следующая</span>
                <strong>{voteState.next}</strong>
              </button>
              <button
                type="button"
                data-active={myVote === 'wait'}
                onClick={() => castVote('wait')}
              >
                <span>+5 минут</span>
                <strong>{voteState.wait}</strong>
              </button>
              <button
                type="button"
                data-active={myVote === 'stop'}
                onClick={() => castVote('stop')}
              >
                <span>Стоп</span>
                <strong>{voteState.stop}</strong>
              </button>
            </div>
          </div>
        </div>

        {liveReactions.length > 0 && (
          <div className={styles.liveReactions} aria-live="polite">
            {liveReactions.map((item) => {
              const option = REACTION_OPTIONS.find((entry) => entry.value === item.reaction);
              return (
                <span key={item.id}>
                  <b>{option?.label ?? '✦'}</b>
                  <small>{item.name}</small>
                </span>
              );
            })}
          </div>
        )}

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
              <div className={styles.chatEmpty}>
                <span aria-hidden="true">✦</span>
                <strong>Чат пока тихий</strong>
                <small>Напиши первым — сообщения видят только участники этой комнаты.</small>
              </div>
            ) : (
              messages.map((message) => {
                const publicIdentity = roomIdentities[message.userId];
                const displayName = publicIdentity?.username || message.name;
                return (
                  <div className={styles.chatMessage} key={message.id}>
                    <ProfilePreview
                      className={styles.chatAvatar}
                      userId={message.userId}
                      username={displayName}
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
                    </ProfilePreview>
                    <div className={styles.chatBubble}>
                      <div className={styles.chatAuthor}>
                        <div className={styles.chatIdentityRow}>
                          <ProfilePreview
                            className={styles.chatAuthorLink}
                            userId={message.userId}
                            username={displayName}
                          >
                            <UserIdentity
                              username={displayName}
                              role={publicIdentity?.role ?? null}
                              sponsor={publicIdentity?.sponsor ?? null}
                              compact
                            />
                          </ProfilePreview>
                          {publicIdentity?.premium && (
                            <span className={styles.chatPremiumBadge} title="AnimeBox Premium">
                              <Icon name="crown" size={14} weight="fill" />
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
            AnimeBox синхронизирует только управление, чат и реакции. Видео каждый участник получает напрямую от выбранного плеера.
          </span>
          <div className={styles.actions}>
            {inviteUrl && status !== 'ended' && status !== 'error' && (
              <>
                <WatchPartyFriendInvite
                  inviteUrl={inviteUrl}
                  animeTitle={animeTitle}
                  episode={episodeNumber}
                />
                <button type="button" className={styles.secondary} onClick={() => void copyInvite()}>
                  {copyLabel}
                </button>
              </>
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
