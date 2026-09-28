import 'server-only';

import { randomBytes } from 'node:crypto';

import {
  ApiError,
  adminClient,
  userClient,
} from '@/lib/community-server';
import { WATCH_PARTY_MAX_PARTICIPANTS } from '@/lib/watch-party';
import {
  readWatchPartyTheme,
  type WatchPartyTheme,
} from '@/lib/watch-party-premium';
import { getEffectiveUserEntitlements } from '@/lib/entitlements-server';
import { getEffectivePremiumState } from '@/lib/premium-server';
import { consumeRateLimit } from '@/lib/api-rate-limit';

export type WatchPartyRoomVisibility = 'public' | 'unlisted' | 'private';
export type WatchPartyRoomStatus = 'waiting' | 'watching' | 'paused' | 'voting' | 'ended';
export type WatchPartyMemberTransport = 'p2p' | 'turn' | 'server' | 'unknown';

const ROOM_ID_RE = /^[a-f0-9]{24}$/;
const ROOM_SECRET_RE = /^[a-f0-9]{32}$/;
const ROOM_CODE_RE = /^[A-Z2-9]{6}$/;
const ROOM_HEARTBEAT_TTL_MS = 90_000;
const ROOM_MEMBER_TTL_MS = 75_000;
const ROOM_REPORT_COOLDOWN_MS = 10 * 60 * 1000;

function cleanText(value: unknown, max: number) {
  if (typeof value !== 'string') return '';
  return value.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max);
}

export function roomVisibility(value: unknown): WatchPartyRoomVisibility {
  if (value === 'public' || value === 'private' || value === 'unlisted') return value;
  return 'unlisted';
}

export function roomStatus(value: unknown): WatchPartyRoomStatus {
  if (
    value === 'waiting' ||
    value === 'watching' ||
    value === 'paused' ||
    value === 'voting' ||
    value === 'ended'
  ) {
    return value;
  }
  return 'waiting';
}

function positiveInt(value: unknown, fallback = 1) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : fallback;
}

function safeCoverUrl(value: unknown) {
  const text = cleanText(value, 800);
  if (!text) return null;
  try {
    const url = new URL(text);
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

function memberTransport(value: unknown): WatchPartyMemberTransport {
  return value === 'p2p' || value === 'turn' || value === 'server'
    ? value
    : 'unknown';
}

function roomRpcError(error: { message?: string } | null | undefined): never {
  const message = error?.message || 'WATCH_PARTY_RPC_FAILED';

  if (message.includes('ROOM_NOT_FOUND')) {
    throw new ApiError(404, 'Комната не найдена.');
  }
  if (message.includes('ROOM_SECRET_INVALID')) {
    throw new ApiError(403, 'Ссылка на комнату больше не действительна.');
  }
  if (message.includes('ROOM_ENDED')) {
    throw new ApiError(410, 'Комната уже завершена.');
  }
  if (message.includes('ROOM_FULL')) {
    throw new ApiError(409, 'Комната уже заполнена.');
  }
  if (message.includes('HOST_MUST_TRANSFER_OR_END')) {
    throw new ApiError(409, 'Сначала передай host или заверши комнату.');
  }
  if (message.includes('TARGET_NOT_PRESENT')) {
    throw new ApiError(409, 'Новый host уже не находится в комнате.');
  }
  if (message.includes('HOST_CHANGED')) {
    throw new ApiError(409, 'Host комнаты уже изменился.');
  }
  if (message.includes('HOST_TRANSFER_INVALID')) {
    throw new ApiError(400, 'Некорректная передача host.');
  }

  throw error ?? new Error(message);
}

function randomRoomCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes(6);
  return Array.from(bytes, (value) => alphabet[value % alphabet.length]).join('');
}

async function uniqueRoomCode() {
  const admin = adminClient();
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = randomRoomCode();
    const { data, error } = await admin
      .from('watch_party_rooms')
      .select('id')
      .eq('room_code', code)
      .maybeSingle();
    if (error) throw error;
    if (!data) return code;
  }
  throw new ApiError(503, 'Не удалось создать код комнаты.');
}

export async function createWatchPartyRoom(input: Record<string, unknown>) {
  const { user } = await userClient();
  if (!(await consumeRateLimit(`user:${user.id}`, {
    scope: 'room_create_user', limit: 4, windowSeconds: 60,
  }))) {
    throw new ApiError(429, 'Слишком частое создание комнат. Попробуй через минуту.');
  }

  const id = cleanText(input.roomId, 24).toLowerCase();
  const joinSecret = cleanText(input.joinSecret, 32).toLowerCase();
  if (!ROOM_ID_RE.test(id) || !ROOM_SECRET_RE.test(joinSecret)) {
    throw new ApiError(400, 'Некорректный идентификатор комнаты.');
  }

  const animeSlug = cleanText(input.animeSlug, 180);
  const animeTitle = cleanText(input.animeTitle, 180);
  if (!animeSlug || !animeTitle) {
    throw new ApiError(400, 'Не удалось определить аниме для комнаты.');
  }

  const animeIdRaw = Number(input.animeId);
  const animeId =
    Number.isSafeInteger(animeIdRaw) && animeIdRaw > 0 ? animeIdRaw : null;
  const episode = positiveInt(input.episode);
  const visibility = roomVisibility(input.visibility);
  const roomTheme: WatchPartyTheme = readWatchPartyTheme(input.roomTheme);

  if (roomTheme !== 'default') {
    const lifecycle = await getEffectivePremiumState(user.id);
    const entitlements = await getEffectiveUserEntitlements(user.id);

    if (!lifecycle.active || !entitlements.watchPartyThemes) {
      throw new ApiError(
        403,
        'Темы Watch Together доступны с AnimeBox Premium.',
      );
    }
  }

  const roomCode = await uniqueRoomCode();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 8 * 60 * 60 * 1000).toISOString();

  const admin = adminClient();

  // A user can have one live registered room. Old stale rows are closed first.
  await admin
    .from('watch_party_rooms')
    .update({ status: 'ended', ended_at: now.toISOString(), updated_at: now.toISOString() })
    .eq('host_user_id', user.id)
    .neq('status', 'ended');

  const { data, error } = await admin
    .from('watch_party_rooms')
    .insert({
      id,
      join_secret: joinSecret,
      host_user_id: user.id,
      anime_id: animeId,
      anime_slug: animeSlug,
      anime_title: animeTitle,
      cover_url: safeCoverUrl(input.coverUrl),
      episode,
      visibility,
      status: 'waiting',
      language: cleanText(input.language, 8) || 'ru',
      participant_count: 1,
      max_participants: WATCH_PARTY_MAX_PARTICIPANTS,
      room_code: roomCode,
      room_theme: roomTheme,
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
      last_heartbeat_at: now.toISOString(),
      expires_at: expiresAt,
      ended_at: null,
    })
    .select(
      'id,host_user_id,anime_id,anime_slug,anime_title,cover_url,episode,visibility,status,language,participant_count,max_participants,room_code,room_theme,created_at,updated_at,last_heartbeat_at,expires_at',
    )
    .single();

  if (error) throw error;

  const { data: hostProfile } = await admin
    .from('profiles')
    .select('username')
    .eq('id', user.id)
    .maybeSingle();

  const displayName =
    hostProfile?.username?.trim() ||
    user.email?.split('@')[0]?.trim() ||
    'Host';

  const { error: memberError } = await admin
    .from('watch_party_room_members')
    .upsert(
      {
        room_id: id,
        user_id: user.id,
        display_name: displayName.slice(0, 32),
        role: 'host',
        transport: 'unknown',
        joined_at: now.toISOString(),
        last_seen_at: now.toISOString(),
        left_at: null,
      },
      { onConflict: 'room_id,user_id' },
    );

  if (memberError) throw memberError;
  return data;
}

export async function resolveWatchPartyRoomForJoin(input: {
  roomId?: unknown;
  roomCode?: unknown;
}) {
  await userClient();

  const id = cleanText(input.roomId, 24).toLowerCase();
  const code = cleanText(input.roomCode, 6).toUpperCase();

  if (!ROOM_ID_RE.test(id) && !ROOM_CODE_RE.test(code)) {
    throw new ApiError(400, 'Укажи корректный код комнаты.');
  }

  const admin = adminClient();
  const now = Date.now();
  const staleBefore = new Date(now - ROOM_HEARTBEAT_TTL_MS).toISOString();
  const nowIso = new Date(now).toISOString();

  let query = admin
    .from('watch_party_rooms')
    .select(
      'id,join_secret,anime_slug,anime_title,episode,visibility,status,participant_count,max_participants,room_code,room_theme,last_heartbeat_at,expires_at',
    )
    .neq('status', 'ended')
    .gte('last_heartbeat_at', staleBefore)
    .gt('expires_at', nowIso);

  query = ROOM_ID_RE.test(id)
    ? query.eq('id', id)
    : query.eq('room_code', code);

  const { data: room, error } = await query.maybeSingle();
  if (error) throw error;
  if (!room) throw new ApiError(404, 'Активная комната не найдена.');
  if (room.visibility === 'private') {
    throw new ApiError(403, 'В приватную комнату можно войти только по полной invite-ссылке.');
  }
  if (room.participant_count >= room.max_participants) {
    throw new ApiError(409, 'Комната уже заполнена.');
  }

  return {
    roomId: room.id,
    joinSecret: room.join_secret,
    roomCode: room.room_code,
    roomTheme: readWatchPartyTheme(room.room_theme),
    animeSlug: room.anime_slug,
    animeTitle: room.anime_title,
    episode: room.episode,
    visibility: room.visibility,
    status: room.status,
    participantCount: room.participant_count,
    maxParticipants: room.max_participants,
  };
}

export async function syncWatchPartyRoomMember(
  roomId: string,
  input: Record<string, unknown>,
) {
  const { user } = await userClient();
  const id = roomId.trim().toLowerCase();
  const joinSecret = cleanText(input.joinSecret, 32).toLowerCase();
  const displayName = cleanText(input.displayName, 32) || 'Гость';
  const action = input.action === 'leave' ? 'leave' : 'heartbeat';
  const transport = memberTransport(input.transport);

  if (!ROOM_ID_RE.test(id)) throw new ApiError(400, 'Некорректная комната.');
  if (!ROOM_SECRET_RE.test(joinSecret)) {
    throw new ApiError(400, 'Некорректное приглашение.');
  }

  const admin = adminClient();
  const { data, error } = await admin.rpc('watch_party_sync_member', {
    p_room_id: id,
    p_user_id: user.id,
    p_join_secret: joinSecret,
    p_display_name: displayName,
    p_transport: transport,
    p_leave: action === 'leave',
  });

  if (error) roomRpcError(error);
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new ApiError(503, 'Не удалось подтвердить присутствие в комнате.');
  }

  return data as Record<string, unknown>;
}

export async function listPublicWatchPartyRooms(limit = 12) {
  const admin = adminClient();
  const now = Date.now();
  const staleBefore = new Date(now - ROOM_HEARTBEAT_TTL_MS).toISOString();
  const nowIso = new Date(now).toISOString();

  const { data, error } = await admin
    .from('watch_party_rooms')
    .select(
      'id,host_user_id,anime_id,anime_slug,anime_title,cover_url,episode,visibility,status,language,participant_count,max_participants,room_code,room_theme,created_at,updated_at,last_heartbeat_at,expires_at',
    )
    .eq('visibility', 'public')
    .neq('status', 'ended')
    .gte('last_heartbeat_at', staleBefore)
    .gt('expires_at', nowIso)
    .order('participant_count', { ascending: false })
    .order('last_heartbeat_at', { ascending: false })
    .limit(Math.min(30, Math.max(1, limit)));

  if (error) throw error;

  const rows = data ?? [];
  const hostIds = [...new Set(rows.map((row) => row.host_user_id).filter(Boolean))];
  const hostNames = new Map<string, string>();

  if (hostIds.length) {
    const { data: profiles, error: profileError } = await admin
      .from('profiles')
      .select('id,username')
      .in('id', hostIds);
    if (profileError) throw profileError;
    for (const profile of profiles ?? []) {
      hostNames.set(profile.id, profile.username?.trim() || 'Пользователь');
    }
  }

  return rows.map((row) => ({
    roomId: row.id,
    roomCode: row.room_code,
    roomTheme: readWatchPartyTheme(row.room_theme),
    animeId: row.anime_id,
    animeSlug: row.anime_slug,
    animeTitle: row.anime_title,
    coverUrl: row.cover_url,
    episode: row.episode,
    visibility: row.visibility,
    status: row.status,
    language: row.language,
    participantCount: row.participant_count,
    maxParticipants: row.max_participants,
    host: {
      id: row.host_user_id,
      username: hostNames.get(row.host_user_id) || 'Пользователь',
    },
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastHeartbeatAt: row.last_heartbeat_at,
    expiresAt: row.expires_at,
    isFull: row.participant_count >= row.max_participants,
  }));
}

/** Run from the existing authenticated daily cron, never from lobby traffic. */
export async function cleanupWatchPartyRooms() {
  const admin = adminClient();
  const now = new Date();
  const endedAt = now.toISOString();
  const staleBefore = new Date(now.getTime() - ROOM_HEARTBEAT_TTL_MS).toISOString();

  const expired = await admin.from('watch_party_rooms')
    .update({ status: 'ended', participant_count: 0, ended_at: endedAt, updated_at: endedAt })
    .neq('status', 'ended').lte('expires_at', endedAt);
  if (expired.error) throw expired.error;

  const stale = await admin.from('watch_party_rooms')
    .update({ status: 'ended', participant_count: 0, ended_at: endedAt, updated_at: endedAt })
    .neq('status', 'ended').lt('last_heartbeat_at', staleBefore);
  if (stale.error) throw stale.error;

  const staleMembers = await admin
    .from('watch_party_room_members')
    .update({ left_at: endedAt })
    .is('left_at', null)
    .lt('last_seen_at', new Date(now.getTime() - ROOM_MEMBER_TTL_MS).toISOString());
  if (staleMembers.error) throw staleMembers.error;

}

export async function heartbeatWatchPartyRoom(
  roomId: string,
  input: Record<string, unknown>,
) {
  const { user } = await userClient();
  const id = roomId.trim().toLowerCase();
  if (!ROOM_ID_RE.test(id)) throw new ApiError(400, 'Некорректная комната.');

  const now = new Date().toISOString();
  const status = roomStatus(input.status);
  const episode = positiveInt(input.episode);
  const admin = adminClient();
  const liveMemberSince = new Date(Date.now() - ROOM_MEMBER_TTL_MS).toISOString();

  const { count: liveMemberCount, error: memberCountError } = await admin
    .from('watch_party_room_members')
    .select('user_id', { count: 'exact', head: true })
    .eq('room_id', id)
    .is('left_at', null)
    .gte('last_seen_at', liveMemberSince);

  if (memberCountError) throw memberCountError;
  const participantCount = Math.min(
    WATCH_PARTY_MAX_PARTICIPANTS,
    Math.max(1, Number(liveMemberCount ?? 0)),
  );

  const { data: room, error: roomError } = await admin
    .from('watch_party_rooms')
    .select('id,host_user_id,status')
    .eq('id', id)
    .maybeSingle();

  if (roomError) throw roomError;
  if (!room) throw new ApiError(404, 'Комната не найдена.');
  if (room.host_user_id !== user.id) {
    throw new ApiError(403, 'Только host может обновлять комнату.');
  }
  if (room.status === 'ended') throw new ApiError(409, 'Комната уже завершена.');

  const { data: updated, error } = await admin
    .from('watch_party_rooms')
    .update({
      participant_count: participantCount,
      status: status === 'ended' ? 'ended' : status,
      episode,
      last_heartbeat_at: now,
      updated_at: now,
      ...(status === 'ended' ? { ended_at: now } : {}),
    })
    .eq('id', id)
    .eq('host_user_id', user.id)
    .neq('status', 'ended')
    .select('id')
    .maybeSingle();

  if (error) throw error;
  if (!updated) {
    throw new ApiError(409, 'Host комнаты изменился или комната уже завершена.');
  }
}

export async function endWatchPartyRoom(roomId: string) {
  const { user } = await userClient();
  const id = roomId.trim().toLowerCase();
  if (!ROOM_ID_RE.test(id)) throw new ApiError(400, 'Некорректная комната.');

  const admin = adminClient();
  const now = new Date().toISOString();
  const { data: room, error: roomError } = await admin
    .from('watch_party_rooms')
    .select('host_user_id')
    .eq('id', id)
    .maybeSingle();

  if (roomError) throw roomError;
  if (!room) return;
  if (room.host_user_id !== user.id) {
    throw new ApiError(403, 'Только host может завершить комнату.');
  }

  const { error } = await admin
    .from('watch_party_rooms')
    .update({
      status: 'ended',
      participant_count: 0,
      ended_at: now,
      updated_at: now,
      last_heartbeat_at: now,
    })
    .eq('id', id);

  if (error) throw error;

  const { error: memberError } = await admin
    .from('watch_party_room_members')
    .update({ left_at: now, last_seen_at: now })
    .eq('room_id', id)
    .is('left_at', null);

  if (memberError) throw memberError;
}

export async function reportWatchPartyRoom(
  roomId: string,
  input: Record<string, unknown>,
) {
  const { user } = await userClient();
  const id = roomId.trim().toLowerCase();
  if (!ROOM_ID_RE.test(id)) throw new ApiError(400, 'Некорректная комната.');

  const reason = cleanText(input.reason, 300);
  if (reason.length < 3) throw new ApiError(400, 'Укажи причину жалобы.');

  const admin = adminClient();
  const { data: room, error: roomError } = await admin
    .from('watch_party_rooms')
    .select('id,host_user_id')
    .eq('id', id)
    .maybeSingle();

  if (roomError) throw roomError;
  if (!room) throw new ApiError(404, 'Комната не найдена.');

  const cooldownSince = new Date(Date.now() - ROOM_REPORT_COOLDOWN_MS).toISOString();
  const { data: recentReport, error: recentReportError } = await admin
    .from('watch_party_room_reports')
    .select('id')
    .eq('room_id', id)
    .eq('reporter_user_id', user.id)
    .gte('created_at', cooldownSince)
    .limit(1)
    .maybeSingle();

  if (recentReportError) throw recentReportError;
  if (recentReport) {
    throw new ApiError(429, 'Жалоба на эту комнату уже отправлена.');
  }

  const { error } = await admin.from('watch_party_room_reports').insert({
    room_id: id,
    reporter_user_id: user.id,
    target_user_id: room.host_user_id,
    reason,
  });
  if (error) throw error;
}



export async function transferWatchPartyRoomHost(
  roomId: string,
  targetUserId: string,
) {
  const { user } = await userClient();
  const id = roomId.trim().toLowerCase();

  if (!ROOM_ID_RE.test(id)) throw new ApiError(400, 'Некорректная комната.');
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      targetUserId,
    )
  ) {
    throw new ApiError(400, 'Некорректный новый host.');
  }

  const admin = adminClient();
  const { data, error } = await admin.rpc('watch_party_transfer_host_atomic', {
    p_room_id: id,
    p_current_host: user.id,
    p_target_user: targetUserId,
  });

  if (error) roomRpcError(error);
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new ApiError(503, 'Не удалось подтвердить передачу host.');
  }

  return data as {
    room_id?: string;
    host_user_id?: string;
    host_epoch?: number;
  };
}


export async function claimStaleWatchPartyRoomHost(roomId: string) {
  const { user } = await userClient();
  const id = roomId.trim().toLowerCase();

  if (!ROOM_ID_RE.test(id)) throw new ApiError(400, 'Некорректная комната.');

  const admin = adminClient();
  const { data, error } = await admin.rpc('watch_party_claim_stale_host', {
    p_room_id: id,
    p_candidate_user: user.id,
  });

  if (error) roomRpcError(error);
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new ApiError(503, 'Не удалось проверить нового host.');
  }

  return data as {
    claimed?: boolean;
    reason?: string;
    host_user_id?: string;
    host_epoch?: number;
    elected_user_id?: string;
  };
}
