import 'server-only';

import { ApiError, adminClient } from '@/lib/community-server';
import { resolvePublicAppearances } from '@/lib/public-avatar-server';
import { createSocialNotification } from '@/lib/social-notifications-server';
import { isUuid } from '@/lib/uuid';

export type FriendshipState =
  | 'none'
  | 'pending_incoming'
  | 'pending_outgoing'
  | 'accepted';

export type FriendCard = {
  friendshipId: string;
  userId: string;
  username: string;
  avatarUrl: string;
  status: 'accepted' | 'pending';
  direction: 'incoming' | 'outgoing' | 'friend';
  createdAt: string;
  acceptedAt: string | null;
};

type FriendshipRow = {
  id: string;
  user_a: string;
  user_b: string;
  requested_by: string;
  status: 'pending' | 'accepted';
  created_at: string;
  updated_at: string;
  accepted_at: string | null;
};

function canonicalPair(left: string, right: string) {
  return left < right ? [left, right] as const : [right, left] as const;
}

function assertUserId(value: string) {
  if (!isUuid(value)) throw new ApiError(400, 'Некорректный пользователь.');
}

async function friendshipByPair(userId: string, targetUserId: string) {
  const [userA, userB] = canonicalPair(userId, targetUserId);
  const { data, error } = await adminClient()
    .from('friendships')
    .select('id,user_a,user_b,requested_by,status,created_at,updated_at,accepted_at')
    .eq('user_a', userA)
    .eq('user_b', userB)
    .maybeSingle();

  if (error) throw error;
  return data as FriendshipRow | null;
}

export async function getFriendshipStatus(
  userId: string,
  targetUserId: string,
): Promise<{ state: FriendshipState; friendshipId: string | null }> {
  assertUserId(targetUserId);
  if (userId === targetUserId) return { state: 'none', friendshipId: null };

  const row = await friendshipByPair(userId, targetUserId);
  if (!row) return { state: 'none', friendshipId: null };
  if (row.status === 'accepted') {
    return { state: 'accepted', friendshipId: row.id };
  }

  return {
    state: row.requested_by === userId ? 'pending_outgoing' : 'pending_incoming',
    friendshipId: row.id,
  };
}

export async function requestFriendship(userId: string, targetUserId: string) {
  assertUserId(targetUserId);
  if (userId === targetUserId) {
    throw new ApiError(400, 'Нельзя добавить в друзья самого себя.');
  }

  const admin = adminClient();
  const { data: target, error: targetError } = await admin
    .from('profiles')
    .select('id')
    .eq('id', targetUserId)
    .maybeSingle();

  if (targetError) throw targetError;
  if (!target) throw new ApiError(404, 'Пользователь не найден.');

  const existing = await friendshipByPair(userId, targetUserId);

  if (existing?.status === 'accepted') {
    return { state: 'accepted' as const, friendshipId: existing.id };
  }

  if (existing?.status === 'pending') {
    if (existing.requested_by === userId) {
      return { state: 'pending_outgoing' as const, friendshipId: existing.id };
    }

    const now = new Date().toISOString();
    const { error } = await admin
      .from('friendships')
      .update({
        status: 'accepted',
        accepted_at: now,
        updated_at: now,
      })
      .eq('id', existing.id);

    if (error) throw error;

    await admin
      .from('social_notifications')
      .update({ read_at: now })
      .eq('user_id', userId)
      .eq('type', 'friend_request')
      .contains('payload', { friendshipId: existing.id });

    await createSocialNotification({
      userId: targetUserId,
      actorId: userId,
      type: 'friend_accepted',
      payload: { friendshipId: existing.id },
    });

    return { state: 'accepted' as const, friendshipId: existing.id };
  }

  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count, error: countError } = await admin
    .from('friendships')
    .select('id', { count: 'exact', head: true })
    .eq('requested_by', userId)
    .eq('status', 'pending')
    .gte('created_at', oneHourAgo);

  if (countError) throw countError;
  if ((count ?? 0) >= 30) {
    throw new ApiError(429, 'Слишком много заявок. Попробуй немного позже.');
  }

  const [userA, userB] = canonicalPair(userId, targetUserId);
  const { data, error } = await admin
    .from('friendships')
    .insert({
      user_a: userA,
      user_b: userB,
      requested_by: userId,
      status: 'pending',
    })
    .select('id')
    .single();

  if (error) throw error;

  await createSocialNotification({
    userId: targetUserId,
    actorId: userId,
    type: 'friend_request',
    payload: { friendshipId: data.id },
  });

  return { state: 'pending_outgoing' as const, friendshipId: data.id as string };
}

export async function actOnFriendship(
  userId: string,
  friendshipId: string,
  action: 'accept' | 'decline' | 'cancel',
) {
  assertUserId(friendshipId);

  const admin = adminClient();
  const { data, error } = await admin
    .from('friendships')
    .select('id,user_a,user_b,requested_by,status,created_at,updated_at,accepted_at')
    .eq('id', friendshipId)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new ApiError(404, 'Заявка не найдена.');

  const row = data as FriendshipRow;
  if (row.user_a !== userId && row.user_b !== userId) {
    throw new ApiError(403, 'Эта заявка тебе не принадлежит.');
  }
  if (row.status !== 'pending') {
    throw new ApiError(409, 'Заявка уже обработана.');
  }

  const otherUserId = row.user_a === userId ? row.user_b : row.user_a;

  if (action === 'accept') {
    if (row.requested_by === userId) {
      throw new ApiError(403, 'Нельзя принять собственную заявку.');
    }

    const now = new Date().toISOString();
    const { error: updateError } = await admin
      .from('friendships')
      .update({ status: 'accepted', accepted_at: now, updated_at: now })
      .eq('id', friendshipId);

    if (updateError) throw updateError;

    await admin
      .from('social_notifications')
      .update({ read_at: now })
      .eq('user_id', userId)
      .eq('type', 'friend_request')
      .contains('payload', { friendshipId });

    await createSocialNotification({
      userId: otherUserId,
      actorId: userId,
      type: 'friend_accepted',
      payload: { friendshipId },
    });

    return { state: 'accepted' as const };
  }

  if (action === 'cancel' && row.requested_by !== userId) {
    throw new ApiError(403, 'Отменить заявку может только отправитель.');
  }
  if (action === 'decline' && row.requested_by === userId) {
    throw new ApiError(403, 'Отклонить заявку может только получатель.');
  }

  const { error: deleteError } = await admin
    .from('friendships')
    .delete()
    .eq('id', friendshipId);

  if (deleteError) throw deleteError;

  if (action === 'cancel') {
    await admin
      .from('social_notifications')
      .delete()
      .eq('user_id', otherUserId)
      .eq('type', 'friend_request')
      .contains('payload', { friendshipId });
  } else {
    await admin
      .from('social_notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('type', 'friend_request')
      .contains('payload', { friendshipId });
  }

  return { state: 'none' as const };
}

export async function removeFriend(userId: string, targetUserId: string) {
  assertUserId(targetUserId);
  const row = await friendshipByPair(userId, targetUserId);
  if (!row || row.status !== 'accepted') {
    throw new ApiError(404, 'Пользователь не находится в друзьях.');
  }

  const { error } = await adminClient()
    .from('friendships')
    .delete()
    .eq('id', row.id);

  if (error) throw error;
  return { state: 'none' as const };
}

export async function listFriends(userId: string) {
  const admin = adminClient();
  const { data, error } = await admin
    .from('friendships')
    .select('id,user_a,user_b,requested_by,status,created_at,updated_at,accepted_at')
    .or(`user_a.eq.${userId},user_b.eq.${userId}`)
    .order('updated_at', { ascending: false });

  if (error) throw error;

  const rows = (data ?? []) as FriendshipRow[];
  const otherIds = [...new Set(rows.map((row) => row.user_a === userId ? row.user_b : row.user_a))];

  const profiles = new Map<string, { id: string; username: string; avatar_path: string | null }>();

  if (otherIds.length) {
    const { data: profileRows, error: profileError } = await admin
      .from('profiles')
      .select('id,username,avatar_path')
      .in('id', otherIds);

    if (profileError) throw profileError;

    for (const profile of profileRows ?? []) {
      profiles.set(profile.id, {
        id: profile.id,
        username:
          typeof profile.username === 'string' && profile.username.trim()
            ? profile.username.trim()
            : 'Пользователь',
        avatar_path:
          typeof profile.avatar_path === 'string' ? profile.avatar_path : null,
      });
    }
  }

  const appearances = await resolvePublicAppearances([...profiles.values()]);

  const cards = rows.flatMap((row): FriendCard[] => {
    const otherId = row.user_a === userId ? row.user_b : row.user_a;
    const profile = profiles.get(otherId);
    if (!profile) return [];

    const accepted = row.status === 'accepted';
    const incoming = !accepted && row.requested_by !== userId;
    const appearance = appearances.get(otherId);

    return [{
      friendshipId: row.id,
      userId: otherId,
      username: profile.username,
      avatarUrl: appearance?.avatarUrl ?? '/default-avatar.webp',
      status: row.status,
      direction: accepted ? 'friend' : incoming ? 'incoming' : 'outgoing',
      createdAt: row.created_at,
      acceptedAt: row.accepted_at,
    }];
  });

  return {
    friends: cards.filter((item) => item.direction === 'friend'),
    incoming: cards.filter((item) => item.direction === 'incoming'),
    outgoing: cards.filter((item) => item.direction === 'outgoing'),
  };
}

export async function assertAcceptedFriendship(userId: string, targetUserId: string) {
  const row = await friendshipByPair(userId, targetUserId);
  if (!row || row.status !== 'accepted') {
    throw new ApiError(403, 'Можно приглашать только друзей.');
  }
  return row;
}
