import 'server-only';

import { ApiError, adminClient } from '@/lib/community-server';
import { resolvePublicAppearances } from '@/lib/public-avatar-server';

export type SocialSurface = 'site' | 'player' | 'watch_together' | 'chat';

export type SocialPrivacy = {
  showOnlineToFriends: boolean;
  showActivityToFriends: boolean;
};

export type FriendDiscoveryItem = {
  userId: string;
  username: string;
  avatarUrl: string;
  friendshipState:
    | 'none'
    | 'pending_incoming'
    | 'pending_outgoing'
    | 'accepted';
  friendshipId: string | null;
  online: boolean;
};

export type FriendActivityItem = {
  id: string;
  type: 'completed' | 'commented' | 'rated';
  createdAt: string;
  actor: {
    userId: string;
    username: string;
    avatarUrl: string;
    online: boolean;
  };
  anime: {
    id: number;
    title: string;
    slug: string | null;
    posterUrl: string | null;
  } | null;
  episode: number | null;
  score: number | null;
  href: string;
};

type FriendshipRow = {
  id: string;
  user_a: string;
  user_b: string;
  requested_by: string;
  status: 'pending' | 'accepted';
};

type ProfileRow = {
  id: string;
  username: string | null;
  avatar_path: string | null;
};

type PrivacyRow = {
  user_id: string;
  show_online_to_friends: boolean;
  show_activity_to_friends: boolean;
};

type PresenceRow = {
  user_id: string;
  last_seen_at: string;
};

type ProductEventRow = {
  id: number;
  event_name: string;
  user_id: string | null;
  entity_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

function cleanSearch(value: string) {
  return value
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N}_. -]+/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 24);
}

function onlineCutoff() {
  return Date.now() - 2 * 60_000;
}

function isOnline(lastSeenAt: string | null | undefined) {
  if (!lastSeenAt) return false;
  const value = Date.parse(lastSeenAt);
  return Number.isFinite(value) && value >= onlineCutoff();
}

function pairKey(left: string, right: string) {
  return left < right ? `${left}:${right}` : `${right}:${left}`;
}

function parseEpisodeEntity(value: string | null) {
  if (!value) return { animeId: null, episode: null };
  const [animeRaw, episodeRaw] = value.split(':');
  const animeId = Number(animeRaw);
  const episode = Number(episodeRaw);
  return {
    animeId: Number.isSafeInteger(animeId) && animeId > 0 ? animeId : null,
    episode:
      Number.isSafeInteger(episode) && episode > 0 ? episode : null,
  };
}

async function decorateProfiles(rows: ProfileRow[]) {
  const appearances = await resolvePublicAppearances(rows);
  return new Map(
    rows.map((row) => [
      row.id,
      {
        userId: row.id,
        username: row.username?.trim() || 'Пользователь',
        avatarUrl:
          appearances.get(row.id)?.avatarUrl ?? '/default-avatar.webp',
      },
    ]),
  );
}

async function friendshipRowsFor(userId: string) {
  const { data, error } = await adminClient()
    .from('friendships')
    .select('id,user_a,user_b,requested_by,status')
    .or(`user_a.eq.${userId},user_b.eq.${userId}`);

  if (error) throw error;
  return (data ?? []) as FriendshipRow[];
}

export async function touchSocialPresence(
  userId: string,
  surface: SocialSurface,
) {
  const now = new Date().toISOString();
  const { error } = await adminClient()
    .from('social_presence')
    .upsert(
      {
        user_id: userId,
        last_seen_at: now,
        surface,
        updated_at: now,
      },
      { onConflict: 'user_id' },
    );

  if (error) throw error;
}

export async function getSocialPrivacy(
  userId: string,
): Promise<SocialPrivacy> {
  const { data, error } = await adminClient()
    .from('social_privacy')
    .select('show_online_to_friends,show_activity_to_friends')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;

  return {
    showOnlineToFriends: data?.show_online_to_friends ?? true,
    showActivityToFriends: data?.show_activity_to_friends ?? true,
  };
}

export async function updateSocialPrivacy(
  userId: string,
  input: Partial<SocialPrivacy>,
): Promise<SocialPrivacy> {
  const current = await getSocialPrivacy(userId);
  const next = {
    showOnlineToFriends:
      input.showOnlineToFriends ?? current.showOnlineToFriends,
    showActivityToFriends:
      input.showActivityToFriends ?? current.showActivityToFriends,
  };

  const { error } = await adminClient()
    .from('social_privacy')
    .upsert(
      {
        user_id: userId,
        show_online_to_friends: next.showOnlineToFriends,
        show_activity_to_friends: next.showActivityToFriends,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    );

  if (error) throw error;
  return next;
}

export async function searchFriendDiscovery(
  userId: string,
  rawQuery: string,
): Promise<FriendDiscoveryItem[]> {
  const query = cleanSearch(rawQuery);
  if (query.length < 2) return [];

  const admin = adminClient();
  const [profilesResult, friendships] = await Promise.all([
    admin
      .from('profiles')
      .select('id,username,avatar_path')
      .ilike('username', `%${query}%`)
      .neq('id', userId)
      .order('username', { ascending: true })
      .limit(12),
    friendshipRowsFor(userId),
  ]);

  if (profilesResult.error) throw profilesResult.error;
  const profiles = (profilesResult.data ?? []) as ProfileRow[];
  if (!profiles.length) return [];

  const friendshipByPair = new Map(
    friendships.map((row) => [pairKey(row.user_a, row.user_b), row]),
  );
  const acceptedIds = new Set(
    friendships
      .filter((row) => row.status === 'accepted')
      .map((row) => (row.user_a === userId ? row.user_b : row.user_a)),
  );
  const candidateIds = profiles.map((profile) => profile.id);

  const [privacyResult, presenceResult, decorated] = await Promise.all([
    admin
      .from('social_privacy')
      .select('user_id,show_online_to_friends,show_activity_to_friends')
      .in('user_id', candidateIds),
    admin
      .from('social_presence')
      .select('user_id,last_seen_at')
      .in('user_id', candidateIds),
    decorateProfiles(profiles),
  ]);

  if (privacyResult.error) throw privacyResult.error;
  if (presenceResult.error) throw presenceResult.error;

  const privacyByUser = new Map(
    ((privacyResult.data ?? []) as PrivacyRow[]).map((row) => [
      row.user_id,
      row,
    ]),
  );
  const presenceByUser = new Map(
    ((presenceResult.data ?? []) as PresenceRow[]).map((row) => [
      row.user_id,
      row.last_seen_at,
    ]),
  );

  return profiles.flatMap((profile) => {
    const appearance = decorated.get(profile.id);
    if (!appearance) return [];

    const friendship = friendshipByPair.get(pairKey(userId, profile.id));
    const state: FriendDiscoveryItem['friendshipState'] =
      !friendship
        ? 'none'
        : friendship.status === 'accepted'
          ? 'accepted'
          : friendship.requested_by === userId
            ? 'pending_outgoing'
            : 'pending_incoming';

    const privacy = privacyByUser.get(profile.id);
    const online =
      acceptedIds.has(profile.id) &&
      (privacy?.show_online_to_friends ?? true) &&
      isOnline(presenceByUser.get(profile.id));

    return [{
      ...appearance,
      friendshipState: state,
      friendshipId: friendship?.id ?? null,
      online,
    }];
  });
}

export async function getFriendActivity(
  userId: string,
  limit = 24,
): Promise<FriendActivityItem[]> {
  const admin = adminClient();
  const friendships = await friendshipRowsFor(userId);
  const friendIds = friendships
    .filter((row) => row.status === 'accepted')
    .map((row) => (row.user_a === userId ? row.user_b : row.user_a));

  if (!friendIds.length) return [];

  const privacyResult = await admin
    .from('social_privacy')
    .select('user_id,show_online_to_friends,show_activity_to_friends')
    .in('user_id', friendIds);

  if (privacyResult.error) throw privacyResult.error;

  const privacyByUser = new Map(
    ((privacyResult.data ?? []) as PrivacyRow[]).map((row) => [
      row.user_id,
      row,
    ]),
  );
  const visibleIds = friendIds.filter(
    (id) => privacyByUser.get(id)?.show_activity_to_friends ?? true,
  );

  if (!visibleIds.length) return [];

  const since = new Date(Date.now() - 14 * 86_400_000).toISOString();
  const eventsResult = await admin
    .from('product_events')
    .select('id,event_name,user_id,entity_id,metadata,created_at')
    .in('user_id', visibleIds)
    .in('event_name', [
      'player_completed',
      'social_comment_created',
      'social_rating_set',
    ])
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(Math.min(80, Math.max(12, limit * 3)));

  if (eventsResult.error) throw eventsResult.error;

  const events = (eventsResult.data ?? []) as ProductEventRow[];
  if (!events.length) return [];

  const actorIds = [...new Set(
    events
      .map((event) => event.user_id)
      .filter((id): id is string => Boolean(id)),
  )];
  const parsed = events.map((event) => ({
    event,
    ...parseEpisodeEntity(event.entity_id),
  }));
  const animeIds = [...new Set(
    parsed
      .map((item) => item.animeId)
      .filter((id): id is number => id != null),
  )];

  const [profilesResult, presenceResult, animeResult] = await Promise.all([
    admin
      .from('profiles')
      .select('id,username,avatar_path')
      .in('id', actorIds),
    admin
      .from('social_presence')
      .select('user_id,last_seen_at')
      .in('user_id', actorIds),
    animeIds.length
      ? admin
          .from('anime_catalog')
          .select('id,title,slug,poster_url')
          .in('id', animeIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (profilesResult.error) throw profilesResult.error;
  if (presenceResult.error) throw presenceResult.error;
  if (animeResult.error) throw animeResult.error;

  const profiles = (profilesResult.data ?? []) as ProfileRow[];
  const decorated = await decorateProfiles(profiles);
  const presenceByUser = new Map(
    ((presenceResult.data ?? []) as PresenceRow[]).map((row) => [
      row.user_id,
      row.last_seen_at,
    ]),
  );
  const animeById = new Map(
    (animeResult.data ?? []).map((row) => [
      Number(row.id),
      {
        id: Number(row.id),
        title: row.title,
        slug: row.slug,
        posterUrl: row.poster_url,
      },
    ]),
  );

  return parsed.flatMap(({ event, animeId, episode }) => {
    if (!event.user_id) return [];
    const actor = decorated.get(event.user_id);
    if (!actor) return [];

    const privacy = privacyByUser.get(event.user_id);
    const anime = animeId ? animeById.get(animeId) ?? null : null;
    const online =
      (privacy?.show_online_to_friends ?? true) &&
      isOnline(presenceByUser.get(event.user_id));

    const type: FriendActivityItem['type'] =
      event.event_name === 'player_completed'
        ? 'completed'
        : event.event_name === 'social_rating_set'
          ? 'rated'
          : 'commented';

    const scoreRaw = Number(event.metadata?.score);
    const score =
      type === 'rated' &&
      Number.isSafeInteger(scoreRaw) &&
      scoreRaw >= 1 &&
      scoreRaw <= 10
        ? scoreRaw
        : null;

    const slug = anime?.slug;
    const href = slug
      ? episode
        ? `/anime/${slug}/episode/${episode}`
        : `/anime/${slug}`
      : animeId
        ? `/anime/${animeId}`
        : `/profile/${event.user_id}`;

    return [{
      id: String(event.id),
      type,
      createdAt: event.created_at,
      actor: {
        ...actor,
        online,
      },
      anime,
      episode,
      score,
      href,
    }];
  }).slice(0, Math.min(40, Math.max(1, limit)));
}

export async function reportEpisodeComment(input: {
  userId: string;
  commentId: string;
  reason: 'spam' | 'abuse' | 'spoiler' | 'scam' | 'other';
  details?: string | null;
}) {
  const admin = adminClient();
  const comment = await admin
    .from('comments')
    .select('id,user_id,deleted_at')
    .eq('id', input.commentId)
    .maybeSingle();

  if (comment.error) throw comment.error;
  if (!comment.data || comment.data.deleted_at) {
    throw new ApiError(404, 'Комментарий уже недоступен.');
  }
  if (comment.data.user_id === input.userId) {
    throw new ApiError(400, 'Нельзя пожаловаться на свой комментарий.');
  }

  const inserted = await admin
    .from('comment_reports')
    .insert({
      comment_id: input.commentId,
      reporter_id: input.userId,
      reason: input.reason,
      details: input.details?.trim().slice(0, 300) || null,
    });

  if (inserted.error?.code === '23505') {
    throw new ApiError(409, 'Ты уже отправлял жалобу на этот комментарий.');
  }
  if (inserted.error) throw inserted.error;
}
