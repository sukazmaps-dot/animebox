import {
  ApiError,
  adminClient,
  failure,
  readBody,
  response,
  userClient,
} from '@/lib/community-server';
import {
  WATCH_PARTY_MAX_PARTICIPANTS,
  isWatchPartyRoomId,
  isWatchPartySecret,
} from '@/lib/watch-party';
import type {
  PublicWatchPartyRoom,
  WatchPartyRoomStatus,
  WatchPartyVisibility,
} from '@/lib/watch-party-directory';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function text(value: unknown, max: number) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function visibility(value: unknown): WatchPartyVisibility {
  return value === 'private' || value === 'public' || value === 'unlisted'
    ? value
    : 'unlisted';
}

function status(value: unknown): WatchPartyRoomStatus | null {
  return value === 'waiting' ||
    value === 'watching' ||
    value === 'paused' ||
    value === 'voting' ||
    value === 'ended'
    ? value
    : null;
}

function positiveEpisode(value: unknown) {
  const episode = Number(value);
  if (!Number.isSafeInteger(episode) || episode < 1 || episode > 100_000) {
    throw new ApiError(400, 'Некорректный номер серии.');
  }
  return episode;
}

function participantCount(value: unknown) {
  const count = Number(value);
  if (!Number.isSafeInteger(count)) return 1;
  return Math.max(1, Math.min(WATCH_PARTY_MAX_PARTICIPANTS, count));
}

function roomCode(roomId: string) {
  return roomId.slice(-6).toUpperCase();
}

function publicRoom(
  row: Record<string, unknown>,
  hostName: string,
): PublicWatchPartyRoom {
  return {
    id: String(row.id),
    roomCode: String(row.room_code),
    animeId: typeof row.anime_id === 'number' ? row.anime_id : null,
    animeSlug: String(row.anime_slug),
    animeTitle: String(row.anime_title),
    coverUrl: typeof row.cover_url === 'string' ? row.cover_url : null,
    episode: Number(row.episode),
    status: row.status as WatchPartyRoomStatus,
    language: String(row.language || 'ru'),
    participantCount: Number(row.participant_count || 1),
    maxParticipants: Number(row.max_participants || WATCH_PARTY_MAX_PARTICIPANTS),
    hostUserId: String(row.host_user_id),
    hostName,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export async function GET() {
  try {
    const admin = adminClient();
    const staleCutoff = new Date(Date.now() - 90_000).toISOString();
    const now = new Date().toISOString();

    const { data, error } = await admin
      .from('watch_party_rooms')
      .select(
        'id,room_code,host_user_id,anime_id,anime_slug,anime_title,cover_url,episode,status,language,participant_count,max_participants,created_at,updated_at,last_heartbeat_at,expires_at',
      )
      .eq('visibility', 'public')
      .neq('status', 'ended')
      .gte('last_heartbeat_at', staleCutoff)
      .gt('expires_at', now)
      .order('participant_count', { ascending: false })
      .order('last_heartbeat_at', { ascending: false })
      .limit(24);

    if (error) throw error;

    const rows = (data ?? []) as Array<Record<string, unknown>>;
    const hostIds = [...new Set(rows.map((row) => String(row.host_user_id)))];

    const hostNames = new Map<string, string>();
    if (hostIds.length) {
      const { data: profiles, error: profileError } = await admin
        .from('profiles')
        .select('id,username')
        .in('id', hostIds);

      if (profileError) throw profileError;
      for (const profile of profiles ?? []) {
        hostNames.set(
          String(profile.id),
          typeof profile.username === 'string' && profile.username.trim()
            ? profile.username.trim()
            : 'Пользователь',
        );
      }
    }

    return Response.json(
      {
        rooms: rows.map((row) =>
          publicRoom(
            row,
            hostNames.get(String(row.host_user_id)) ?? 'Пользователь',
          ),
        ),
      },
      {
        headers: {
          'Cache-Control': 'public, max-age=5, s-maxage=10, stale-while-revalidate=20',
        },
      },
    );
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request) {
  try {
    const { user } = await userClient();
    const body = await readBody(request);

    const roomId = text(body.roomId, 24).toLowerCase();
    const joinSecret = text(body.joinSecret, 32).toLowerCase();
    if (!isWatchPartyRoomId(roomId) || !isWatchPartySecret(joinSecret)) {
      throw new ApiError(400, 'Некорректная комната.');
    }

    const animeSlug = text(body.animeSlug, 180);
    const animeTitle = text(body.animeTitle, 180);
    if (!animeSlug || !animeTitle) {
      throw new ApiError(400, 'Не удалось определить аниме.');
    }

    const animeIdRaw = Number(body.animeId);
    const animeId =
      Number.isSafeInteger(animeIdRaw) && animeIdRaw > 0 ? animeIdRaw : null;
    const episode = positiveEpisode(body.episode);
    const roomVisibility = visibility(body.visibility);
    const coverRaw = text(body.coverUrl, 1000);
    const coverUrl = /^https?:\/\//i.test(coverRaw) ? coverRaw : null;
    const language = text(body.language, 8).toLowerCase() || 'ru';
    const now = new Date().toISOString();

    const admin = adminClient();

    // One active directory room per host. Old P2P rooms still work by direct
    // invite, but they disappear from the public lobby.
    await admin
      .from('watch_party_rooms')
      .update({
        status: 'ended',
        ended_at: now,
        updated_at: now,
      })
      .eq('host_user_id', user.id)
      .neq('status', 'ended');

    const { data, error } = await admin
      .from('watch_party_rooms')
      .insert({
        id: roomId,
        join_secret: joinSecret,
        host_user_id: user.id,
        anime_id: animeId,
        anime_slug: animeSlug,
        anime_title: animeTitle,
        cover_url: coverUrl,
        episode,
        visibility: roomVisibility,
        status: 'waiting',
        language,
        participant_count: 1,
        max_participants: WATCH_PARTY_MAX_PARTICIPANTS,
        room_code: roomCode(roomId),
        last_heartbeat_at: now,
        updated_at: now,
      })
      .select(
        'id,room_code,host_user_id,anime_id,anime_slug,anime_title,cover_url,episode,status,language,participant_count,max_participants,created_at,updated_at',
      )
      .single();

    if (error) throw error;

    return response({
      ok: true,
      room: publicRoom(data as Record<string, unknown>, 'Вы'),
    }, 201);
  } catch (error) {
    return failure(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const { user } = await userClient();
    const body = await readBody(request);
    const roomId = text(body.roomId, 24).toLowerCase();

    if (!isWatchPartyRoomId(roomId)) {
      throw new ApiError(400, 'Некорректная комната.');
    }

    const nextStatus = status(body.status);
    const patch: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
      last_heartbeat_at: new Date().toISOString(),
    };

    if (nextStatus) {
      patch.status = nextStatus;
      if (nextStatus === 'ended') patch.ended_at = new Date().toISOString();
    }
    if (body.participantCount != null) {
      patch.participant_count = participantCount(body.participantCount);
    }
    if (body.episode != null) patch.episode = positiveEpisode(body.episode);
    if (body.visibility != null) patch.visibility = visibility(body.visibility);

    const admin = adminClient();
    const { data, error } = await admin
      .from('watch_party_rooms')
      .update(patch)
      .eq('id', roomId)
      .eq('host_user_id', user.id)
      .select('id,status,visibility,participant_count,episode')
      .maybeSingle();

    if (error) throw error;
    if (!data) throw new ApiError(403, 'Управлять комнатой может только хост.');

    return response({ ok: true, room: data });
  } catch (error) {
    return failure(error);
  }
}
