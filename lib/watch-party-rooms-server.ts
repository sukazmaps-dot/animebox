import 'server-only';

import { randomBytes } from 'node:crypto';

import {
  ApiError,
  adminClient,
  userClient,
} from '@/lib/community-server';

export type WatchPartyRoomVisibility = 'public' | 'unlisted' | 'private';
export type WatchPartyRoomStatus = 'waiting' | 'watching' | 'paused' | 'voting' | 'ended';

const ROOM_ID_RE = /^[a-f0-9]{24}$/;
const ROOM_SECRET_RE = /^[a-f0-9]{32}$/;
const ROOM_HEARTBEAT_TTL_MS = 2 * 60 * 1000;

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
      max_participants: 8,
      room_code: roomCode,
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
      last_heartbeat_at: now.toISOString(),
      expires_at: expiresAt,
      ended_at: null,
    })
    .select(
      'id,join_secret,host_user_id,anime_id,anime_slug,anime_title,cover_url,episode,visibility,status,language,participant_count,max_participants,room_code,created_at,updated_at,last_heartbeat_at,expires_at',
    )
    .single();

  if (error) throw error;
  return data;
}

export async function listPublicWatchPartyRooms(limit = 12) {
  const admin = adminClient();
  const now = Date.now();
  const staleBefore = new Date(now - ROOM_HEARTBEAT_TTL_MS).toISOString();
  const nowIso = new Date(now).toISOString();

  const { data, error } = await admin
    .from('watch_party_rooms')
    .select(
      'id,join_secret,host_user_id,anime_id,anime_slug,anime_title,cover_url,episode,visibility,status,language,participant_count,max_participants,room_code,created_at,updated_at,last_heartbeat_at,expires_at',
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
    joinSecret: row.join_secret,
    roomCode: row.room_code,
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
    updatedAt: row.updated_at,
  }));
}

export async function heartbeatWatchPartyRoom(
  roomId: string,
  input: Record<string, unknown>,
) {
  const { user } = await userClient();
  const id = roomId.trim().toLowerCase();
  if (!ROOM_ID_RE.test(id)) throw new ApiError(400, 'Некорректная комната.');

  const now = new Date().toISOString();
  const participantCount = Math.min(8, Math.max(1, positiveInt(input.participantCount)));
  const status = roomStatus(input.status);
  const episode = positiveInt(input.episode);
  const admin = adminClient();

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

  const { error } = await admin
    .from('watch_party_rooms')
    .update({
      participant_count: participantCount,
      status: status === 'ended' ? 'ended' : status,
      episode,
      last_heartbeat_at: now,
      updated_at: now,
      ...(status === 'ended' ? { ended_at: now } : {}),
    })
    .eq('id', id);

  if (error) throw error;
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

  const rawTargetUserId = cleanText(input.targetUserId, 64);
  const targetUserId =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      rawTargetUserId,
    )
      ? rawTargetUserId
      : null;

  const { error } = await adminClient().from('watch_party_room_reports').insert({
    room_id: id,
    reporter_user_id: user.id,
    target_user_id: targetUserId,
    reason,
  });
  if (error) throw error;
}

