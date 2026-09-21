export const WATCH_PARTY_PROTOCOL = 4;
export const WATCH_PARTY_MAX_PARTICIPANTS = 8;
export const WATCH_PARTY_ROOM_PREFIX = 'abx-party';

export const WATCH_PARTY_PLAYER_STATE_EVENT = 'animebox:watch-party-player-state';
export const WATCH_PARTY_PLAYER_ACTION_EVENT = 'animebox:watch-party-player-action';
export const WATCH_PARTY_PLAYER_COMMAND_EVENT = 'animebox:watch-party-player-command';
export const WATCH_PARTY_PLAYER_CONTROL_EVENT = 'animebox:watch-party-player-control';
export const WATCH_PARTY_EXIT_EVENT = 'animebox:watch-party-exit';

const ROOM_ID_RE = /^[a-f0-9]{24}$/;
const ROOM_SECRET_RE = /^[a-f0-9]{32}$/;
const PEER_ID_RE = /^[A-Za-z0-9_-]{1,80}$/;
const USER_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MESSAGE_ID_RE = /^[A-Za-z0-9_-]{8,80}$/;
const HOST_WINDOW_PREFIX = 'animebox-watch-party-host';

export type WatchPartyParticipant = {
  id: string;
  userId: string;
  name: string;
  host: boolean;
  joinedAt: number;
};

export type WatchPartyPlayerAction = 'play' | 'pause' | 'seek';

export type WatchPartyPlayerStateDetail = {
  episode: number;
  position: number;
  duration: number | null;
  playing: boolean;
  observedAt: number;
  source: 'kodik' | 'native';
};

export type WatchPartyPlayerActionDetail = {
  actionId: string;
  action: WatchPartyPlayerAction;
  episode: number;
  position: number;
  playing: boolean;
  observedAt: number;
};

export type WatchPartyPlayerCommandDetail = {
  action: WatchPartyPlayerAction;
  episode: number;
  position: number;
  playing: boolean;
  seq: number;
};

export type WatchPartyPlayerControlDetail = {
  action: WatchPartyPlayerAction;
  position?: number;
};

export type WatchPartyChatMessage = {
  id: string;
  userId: string;
  name: string;
  host: boolean;
  text: string;
  sentAt: number;
};

export type WatchPartyReactionKind =
  | 'love'
  | 'cry'
  | 'fire'
  | 'wow'
  | 'dead'
  | 'peak';

export type WatchPartyReaction = {
  id: string;
  userId: string;
  name: string;
  reaction: WatchPartyReactionKind;
  sentAt: number;
};

export type WatchPartyVoteChoice = 'yes' | 'no';

export type WatchPartyVoteState = {
  id: string;
  episode: number;
  yes: number;
  no: number;
  voters: string[];
  active: boolean;
  sentAt: number;
};

export type WatchPartyPacket =
  | {
      type: 'HELLO';
      protocol: number;
      roomId: string;
      secret: string;
      participant: WatchPartyParticipant;
    }
  | {
      type: 'WELCOME';
      protocol: number;
      roomId: string;
      participants: WatchPartyParticipant[];
    }
  | {
      type: 'PARTICIPANTS';
      participants: WatchPartyParticipant[];
    }
  | {
      type: 'ROOM_HEARTBEAT';
      sentAt: number;
    }
  | {
      type: 'HOST_ENDED';
      reason: 'host_left' | 'host_closed';
    }
  | {
      type: 'HOST_TRANSFER';
      newHostUserId: string;
      sentAt: number;
    }
  | {
      type: 'KICKED';
      reason: 'host_kick';
    }
  | {
      type: 'REJECT';
      reason: 'invalid_room' | 'room_full' | 'protocol_mismatch';
    }
  | {
      type: 'PLAYER_ACTION';
      actionId: string;
      action: WatchPartyPlayerAction;
      episode: number;
      position: number;
      sentAt: number;
    }
  | {
      type: 'PLAYER_APPLY';
      seq: number;
      actionId: string;
      actorUserId: string;
      actorName: string;
      action: WatchPartyPlayerAction;
      episode: number;
      position: number;
      sentAt: number;
    }
  | {
      type: 'PLAYER_SYNC';
      seq: number;
      episode: number;
      position: number;
      playing: boolean;
      sentAt: number;
    }
  | {
      type: 'CHAT_SEND';
      id: string;
      text: string;
      sentAt: number;
    }
  | {
      type: 'CHAT_MESSAGE';
      message: WatchPartyChatMessage;
    }
  | {
      type: 'REACTION_SEND';
      id: string;
      reaction: WatchPartyReactionKind;
      sentAt: number;
    }
  | {
      type: 'REACTION';
      reaction: WatchPartyReaction;
    }
  | {
      type: 'VOTE_CAST';
      id: string;
      choice: WatchPartyVoteChoice;
      sentAt: number;
    }
  | {
      type: 'VOTE_STATE';
      vote: WatchPartyVoteState;
    };

export type WatchPartyInvite = {
  roomId: string;
  secret: string;
};

function randomHex(bytes: number) {
  const array = new Uint8Array(bytes);
  crypto.getRandomValues(array);
  return Array.from(array, (value) => value.toString(16).padStart(2, '0')).join('');
}

export function createWatchPartyInvite(): WatchPartyInvite {
  return {
    roomId: randomHex(12),
    secret: randomHex(16),
  };
}

export function createWatchPartyMessageId() {
  return typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID().replace(/-/g, '')
    : randomHex(16);
}

export function isWatchPartyRoomId(value: string | null | undefined): value is string {
  return Boolean(value && ROOM_ID_RE.test(value));
}

export function isWatchPartySecret(value: string | null | undefined): value is string {
  return Boolean(value && ROOM_SECRET_RE.test(value));
}

export function watchPartyHostPeerId(roomId: string) {
  if (!isWatchPartyRoomId(roomId)) {
    throw new Error('Invalid watch party room id.');
  }

  return `${WATCH_PARTY_ROOM_PREFIX}-${roomId}`;
}

export function watchPartyHostSessionKey(roomId: string) {
  return `animebox:watch-party:host:${roomId}`;
}

function watchPartyHostWindowMarker(invite: WatchPartyInvite) {
  return `${HOST_WINDOW_PREFIX}:${invite.roomId}:${invite.secret}`;
}

export function claimWatchPartyHostTab(invite: WatchPartyInvite) {
  window.name = watchPartyHostWindowMarker(invite);
}

export function isWatchPartyHostTab(invite: WatchPartyInvite) {
  return window.name === watchPartyHostWindowMarker(invite);
}

export function clearWatchPartyHostTab(invite: WatchPartyInvite) {
  if (isWatchPartyHostTab(invite)) {
    window.name = '';
  }
}

export function watchPartyReturnPath() {
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

export function buildWatchPartyUrl(
  invite: WatchPartyInvite,
  targetPath?: string,
) {
  const url = targetPath
    ? new URL(targetPath, window.location.origin)
    : new URL(window.location.href);

  url.searchParams.set('party', invite.roomId);

  const hash = new URLSearchParams();
  hash.set('partyKey', invite.secret);
  url.hash = hash.toString();

  return url.toString();
}

export function watchPartyTheaterPath(animeSlug: string, episodeNumber: number) {
  return `/watch-together/${encodeURIComponent(animeSlug)}/episode/${episodeNumber}`;
}

export function readWatchPartyInviteFromLocation(): WatchPartyInvite | null {
  const url = new URL(window.location.href);
  const roomId = url.searchParams.get('party');
  const hash = new URLSearchParams(url.hash.replace(/^#/, ''));
  const secret = hash.get('partyKey');

  if (!isWatchPartyRoomId(roomId) || !isWatchPartySecret(secret)) {
    return null;
  }

  return { roomId, secret };
}

export function clearWatchPartyFromLocation() {
  const url = new URL(window.location.href);
  url.searchParams.delete('party');
  const hash = new URLSearchParams(url.hash.replace(/^#/, ''));
  hash.delete('partyKey');
  url.hash = hash.toString();
  window.history.replaceState(window.history.state, '', url.toString());
}

function cleanParticipantName(value: unknown) {
  if (typeof value !== 'string') return null;
  const clean = value.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 32);
  return clean || null;
}

export function sanitizeWatchPartyChatText(value: unknown) {
  if (typeof value !== 'string') return null;
  const clean = value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim();
  if (!clean || clean.length > 500) return null;
  return clean;
}

function parseParticipant(value: unknown): WatchPartyParticipant | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const id = typeof record.id === 'string' ? record.id : '';
  const userId = typeof record.userId === 'string' ? record.userId : '';
  const name = cleanParticipantName(record.name);
  const joinedAt = Number(record.joinedAt);

  if (
    !PEER_ID_RE.test(id) ||
    !USER_ID_RE.test(userId) ||
    !name ||
    typeof record.host !== 'boolean' ||
    !Number.isFinite(joinedAt) ||
    joinedAt <= 0
  ) {
    return null;
  }

  return {
    id,
    userId,
    name,
    host: record.host,
    joinedAt,
  };
}

function parsePlayerAction(value: unknown): WatchPartyPlayerAction | null {
  return value === 'play' || value === 'pause' || value === 'seek' ? value : null;
}

function parseEpisode(value: unknown) {
  const episode = Number(value);
  return Number.isSafeInteger(episode) && episode >= 1 && episode <= 100_000 ? episode : null;
}

function parsePosition(value: unknown) {
  const position = Number(value);
  return Number.isFinite(position) && position >= 0 && position <= 28_800 ? position : null;
}

function parseTimestamp(value: unknown) {
  const timestamp = Number(value);
  return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : null;
}

function parseSequence(value: unknown) {
  const seq = Number(value);
  return Number.isSafeInteger(seq) && seq >= 0 && seq <= Number.MAX_SAFE_INTEGER ? seq : null;
}

function parseMessageId(value: unknown) {
  return typeof value === 'string' && MESSAGE_ID_RE.test(value) ? value : null;
}

function parseReactionKind(value: unknown): WatchPartyReactionKind | null {
  return value === 'love' ||
    value === 'cry' ||
    value === 'fire' ||
    value === 'wow' ||
    value === 'dead' ||
    value === 'peak'
    ? value
    : null;
}

function parseReaction(value: unknown): WatchPartyReaction | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const id = parseMessageId(record.id);
  const userId = typeof record.userId === 'string' ? record.userId : '';
  const name = cleanParticipantName(record.name);
  const reaction = parseReactionKind(record.reaction);
  const sentAt = parseTimestamp(record.sentAt);
  if (!id || !USER_ID_RE.test(userId) || !name || !reaction || !sentAt) return null;
  return { id, userId, name, reaction, sentAt };
}

function parseVoteState(value: unknown): WatchPartyVoteState | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const id = parseMessageId(record.id);
  const episode = parseEpisode(record.episode);
  const yes = Number(record.yes);
  const no = Number(record.no);
  const sentAt = parseTimestamp(record.sentAt);
  const voters = Array.isArray(record.voters)
    ? record.voters.filter((item): item is string => typeof item === 'string' && USER_ID_RE.test(item)).slice(0, WATCH_PARTY_MAX_PARTICIPANTS)
    : [];
  if (
    !id ||
    !episode ||
    !Number.isSafeInteger(yes) ||
    yes < 0 ||
    yes > WATCH_PARTY_MAX_PARTICIPANTS ||
    !Number.isSafeInteger(no) ||
    no < 0 ||
    no > WATCH_PARTY_MAX_PARTICIPANTS ||
    typeof record.active !== 'boolean' ||
    !sentAt
  ) {
    return null;
  }
  return { id, episode, yes, no, voters, active: record.active, sentAt };
}

function parseChatMessage(value: unknown): WatchPartyChatMessage | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const id = parseMessageId(record.id);
  const userId = typeof record.userId === 'string' ? record.userId : '';
  const name = cleanParticipantName(record.name);
  const text = sanitizeWatchPartyChatText(record.text);
  const sentAt = parseTimestamp(record.sentAt);

  if (!id || !USER_ID_RE.test(userId) || !name || !text || !sentAt || typeof record.host !== 'boolean') {
    return null;
  }

  return { id, userId, name, host: record.host, text, sentAt };
}

export function parseWatchPartyPacket(value: unknown): WatchPartyPacket | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;

  switch (record.type) {
    case 'HELLO': {
      const participant = parseParticipant(record.participant);
      const protocol = Number(record.protocol);
      if (
        !Number.isSafeInteger(protocol) ||
        protocol < 1 ||
        protocol > 100 ||
        !isWatchPartyRoomId(typeof record.roomId === 'string' ? record.roomId : null) ||
        !isWatchPartySecret(typeof record.secret === 'string' ? record.secret : null) ||
        !participant
      ) {
        return null;
      }

      return {
        type: 'HELLO',
        protocol,
        roomId: record.roomId as string,
        secret: record.secret as string,
        participant,
      };
    }

    case 'WELCOME': {
      const protocol = Number(record.protocol);
      if (
        !Number.isSafeInteger(protocol) ||
        protocol < 1 ||
        protocol > 100 ||
        !isWatchPartyRoomId(typeof record.roomId === 'string' ? record.roomId : null) ||
        !Array.isArray(record.participants)
      ) {
        return null;
      }
      const participants = record.participants
        .map(parseParticipant)
        .filter((item): item is WatchPartyParticipant => Boolean(item))
        .slice(0, WATCH_PARTY_MAX_PARTICIPANTS);
      return {
        type: 'WELCOME',
        protocol,
        roomId: record.roomId as string,
        participants,
      };
    }

    case 'PARTICIPANTS': {
      if (!Array.isArray(record.participants)) return null;
      const participants = record.participants
        .map(parseParticipant)
        .filter((item): item is WatchPartyParticipant => Boolean(item))
        .slice(0, WATCH_PARTY_MAX_PARTICIPANTS);
      return { type: 'PARTICIPANTS', participants };
    }

    case 'ROOM_HEARTBEAT': {
      const sentAt = parseTimestamp(record.sentAt);
      return sentAt ? { type: 'ROOM_HEARTBEAT', sentAt } : null;
    }

    case 'HOST_ENDED': {
      if (record.reason !== 'host_left' && record.reason !== 'host_closed') return null;
      return { type: 'HOST_ENDED', reason: record.reason };
    }

    case 'HOST_TRANSFER': {
      const newHostUserId =
        typeof record.newHostUserId === 'string' ? record.newHostUserId : '';
      const sentAt = parseTimestamp(record.sentAt);
      return USER_ID_RE.test(newHostUserId) && sentAt
        ? { type: 'HOST_TRANSFER', newHostUserId, sentAt }
        : null;
    }

    case 'KICKED': {
      return record.reason === 'host_kick'
        ? { type: 'KICKED', reason: 'host_kick' }
        : null;
    }

    case 'REJECT': {
      if (
        record.reason !== 'invalid_room' &&
        record.reason !== 'room_full' &&
        record.reason !== 'protocol_mismatch'
      ) {
        return null;
      }
      return { type: 'REJECT', reason: record.reason };
    }

    case 'PLAYER_ACTION': {
      const actionId = parseMessageId(record.actionId);
      const action = parsePlayerAction(record.action);
      const episode = parseEpisode(record.episode);
      const position = parsePosition(record.position);
      const sentAt = parseTimestamp(record.sentAt);
      if (!actionId || !action || !episode || position == null || !sentAt) return null;
      return { type: 'PLAYER_ACTION', actionId, action, episode, position, sentAt };
    }

    case 'PLAYER_APPLY': {
      const seq = parseSequence(record.seq);
      const actionId = parseMessageId(record.actionId);
      const actorUserId = typeof record.actorUserId === 'string' ? record.actorUserId : '';
      const actorName = cleanParticipantName(record.actorName);
      const action = parsePlayerAction(record.action);
      const episode = parseEpisode(record.episode);
      const position = parsePosition(record.position);
      const sentAt = parseTimestamp(record.sentAt);
      if (
        seq == null ||
        !actionId ||
        !USER_ID_RE.test(actorUserId) ||
        !actorName ||
        !action ||
        !episode ||
        position == null ||
        !sentAt
      ) {
        return null;
      }
      return {
        type: 'PLAYER_APPLY',
        seq,
        actionId,
        actorUserId,
        actorName,
        action,
        episode,
        position,
        sentAt,
      };
    }

    case 'PLAYER_SYNC': {
      const seq = parseSequence(record.seq);
      const episode = parseEpisode(record.episode);
      const position = parsePosition(record.position);
      const sentAt = parseTimestamp(record.sentAt);
      if (seq == null || !episode || position == null || !sentAt || typeof record.playing !== 'boolean') {
        return null;
      }
      return { type: 'PLAYER_SYNC', seq, episode, position, playing: record.playing, sentAt };
    }

    case 'CHAT_SEND': {
      const id = parseMessageId(record.id);
      const text = sanitizeWatchPartyChatText(record.text);
      const sentAt = parseTimestamp(record.sentAt);
      if (!id || !text || !sentAt) return null;
      return { type: 'CHAT_SEND', id, text, sentAt };
    }

    case 'CHAT_MESSAGE': {
      const message = parseChatMessage(record.message);
      return message ? { type: 'CHAT_MESSAGE', message } : null;
    }

    case 'REACTION_SEND': {
      const id = parseMessageId(record.id);
      const reaction = parseReactionKind(record.reaction);
      const sentAt = parseTimestamp(record.sentAt);
      return id && reaction && sentAt
        ? { type: 'REACTION_SEND', id, reaction, sentAt }
        : null;
    }

    case 'REACTION': {
      const reaction = parseReaction(record.reaction);
      return reaction ? { type: 'REACTION', reaction } : null;
    }

    case 'VOTE_CAST': {
      const id = parseMessageId(record.id);
      const sentAt = parseTimestamp(record.sentAt);
      const choice =
        record.choice === 'yes' || record.choice === 'no'
          ? record.choice
          : null;
      return id && choice && sentAt
        ? { type: 'VOTE_CAST', id, choice, sentAt }
        : null;
    }

    case 'VOTE_STATE': {
      const vote = parseVoteState(record.vote);
      return vote ? { type: 'VOTE_STATE', vote } : null;
    }

    default:
      return null;
  }
}

export function watchPartyInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean).slice(0, 2);
  const value = parts.map((part) => part[0]).join('').toUpperCase();
  return value || '?';
}
