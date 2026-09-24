import 'server-only';

import { adminClient, ApiError } from '@/lib/community-server';
import { resolvePublicAppearances } from '@/lib/public-avatar-server';

export type SocialNotificationType =
  | 'friend_request'
  | 'friend_accepted'
  | 'watch_party_invite'
  | 'ranking_overtaken'
  | 'ranking_entered_top10'
  | 'comment_reply'
  | 'comment_mention';

export type SocialNotificationItem = {
  id: number;
  type: SocialNotificationType;
  createdAt: string;
  readAt: string | null;
  payload: Record<string, unknown>;
  actor: {
    id: string;
    username: string;
    avatarUrl: string;
  } | null;
};

export async function createSocialNotification(input: {
  userId: string;
  actorId?: string | null;
  type: SocialNotificationType;
  payload?: Record<string, unknown>;
}) {
  const { error } = await adminClient()
    .from('social_notifications')
    .insert({
      user_id: input.userId,
      actor_id: input.actorId ?? null,
      type: input.type,
      payload: input.payload ?? {},
    });

  if (error) throw error;
}

export async function listSocialNotifications(
  userId: string,
  limit = 30,
): Promise<SocialNotificationItem[]> {
  const admin = adminClient();
  const safeLimit = Math.min(50, Math.max(1, Math.floor(limit)));

  const { data, error } = await admin
    .from('social_notifications')
    .select('id,type,payload,read_at,created_at,actor_id')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(safeLimit);

  if (error) throw error;

  const rows = data ?? [];
  const actorIds = [...new Set(
    rows
      .map((row) => row.actor_id)
      .filter((value): value is string => typeof value === 'string' && Boolean(value)),
  )];

  const actors = new Map<string, { id: string; username: string; avatar_path: string | null }>();

  if (actorIds.length) {
    const { data: profiles, error: profilesError } = await admin
      .from('profiles')
      .select('id,username,avatar_path')
      .in('id', actorIds);

    if (profilesError) throw profilesError;

    for (const profile of profiles ?? []) {
      actors.set(profile.id, {
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

  const appearances = await resolvePublicAppearances([...actors.values()]);

  return rows.map((row) => {
    const actor =
      typeof row.actor_id === 'string'
        ? actors.get(row.actor_id) ?? null
        : null;
    const appearance = actor ? appearances.get(actor.id) : null;

    return {
      id: Number(row.id),
      type: row.type as SocialNotificationType,
      createdAt: row.created_at,
      readAt: row.read_at ?? null,
      payload:
        row.payload && typeof row.payload === 'object' && !Array.isArray(row.payload)
          ? row.payload as Record<string, unknown>
          : {},
      actor: actor
        ? {
            id: actor.id,
            username: actor.username,
            avatarUrl: appearance?.avatarUrl ?? '/default-avatar.webp',
          }
        : null,
    };
  });
}

export async function markSocialNotificationsRead(
  userId: string,
  ids?: number[],
) {
  const admin = adminClient();
  const normalized = [...new Set(
    (ids ?? [])
      .map((value) => Number(value))
      .filter((value) => Number.isSafeInteger(value) && value > 0),
  )].slice(0, 50);

  let query = admin
    .from('social_notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('user_id', userId)
    .is('read_at', null);

  if (normalized.length) query = query.in('id', normalized);

  const { error } = await query;
  if (error) throw error;
}

export async function requireSocialNotificationOwnership(
  userId: string,
  notificationId: number,
) {
  const { data, error } = await adminClient()
    .from('social_notifications')
    .select('id')
    .eq('id', notificationId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new ApiError(404, 'Уведомление не найдено.');
}


export async function countUnreadSocialNotifications(userId: string) {
  const { count, error } = await adminClient()
    .from('social_notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .is('read_at', null);

  if (error) throw error;
  return Math.max(0, Number(count ?? 0));
}
