import { adminRoleFor } from '@/lib/admin-server';
import { ApiError, adminClient, readBody, response, userClient } from '@/lib/community-server';

export const dynamic = 'force-dynamic';

function activeRestriction(row: { status?: string | null; expires_at?: string | null } | null) {
  if (!row || row.status === 'active') return { status: 'active' as const, expiresAt: null };
  if (row.expires_at && Date.parse(row.expires_at) <= Date.now()) return { status: 'active' as const, expiresAt: null };
  return {
    status: row.status === 'banned' ? ('banned' as const) : ('muted' as const),
    expiresAt: row.expires_at ?? null,
  };
}

export async function GET() {
  try {
    const { user } = await userClient();
    const admin = adminClient();

    const [control, settings, readState, notifications] = await Promise.all([
      admin.from('admin_user_controls').select('status,expires_at').eq('user_id', user.id).maybeSingle(),
      admin.from('chat_settings').select('slow_mode_seconds').eq('id', 1).maybeSingle(),
      admin.from('chat_read_state').select('last_seen_at').eq('user_id', user.id).maybeSingle(),
      admin
        .from('chat_notifications')
        .select('id,type,message_id,actor_id,created_at,read_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(8),
    ]);

    if (control.error) throw control.error;
    if (settings.error) throw settings.error;
    if (readState.error) throw readState.error;
    if (notifications.error) throw notifications.error;

    const lastSeenAt = readState.data?.last_seen_at ?? null;
    let unreadMessages = 0;
    if (lastSeenAt) {
      const unread = await admin
        .from('chat_messages')
        .select('*', { count: 'exact', head: true })
        .gt('created_at', lastSeenAt)
        .neq('user_id', user.id)
        .is('deleted_at', null);
      if (unread.error) throw unread.error;
      unreadMessages = Math.min(99, unread.count ?? 0);
    }

    const rawNotifications = notifications.data ?? [];
    const actorIds = [...new Set(rawNotifications.map((item) => item.actor_id))];
    const messageIds = [...new Set(rawNotifications.map((item) => item.message_id))];
    const [actors, messages] = await Promise.all([
      actorIds.length ? admin.from('profiles').select('id,username').in('id', actorIds) : Promise.resolve({ data: [], error: null }),
      messageIds.length ? admin.from('chat_messages').select('id,body').in('id', messageIds) : Promise.resolve({ data: [], error: null }),
    ]);
    if (actors.error) throw actors.error;
    if (messages.error) throw messages.error;

    const actorRows = (actors.data ?? []) as Array<{ id: string; username: string | null }>;
    const messageRows = (messages.data ?? []) as Array<{ id: string; body: string }>;
    const actorById = new Map<string, string | null>(actorRows.map((item) => [item.id, item.username]));
    const bodyById = new Map<string, string>(messageRows.map((item) => [item.id, item.body]));

    return response({
      role: adminRoleFor(user.id),
      restriction: activeRestriction(control.data),
      slowModeSeconds: Number(settings.data?.slow_mode_seconds ?? 0),
      lastSeenAt,
      unreadMessages,
      unreadNotifications: rawNotifications.filter((item) => !item.read_at).length,
      notifications: rawNotifications.map((item) => ({
        id: item.id,
        type: item.type,
        messageId: item.message_id,
        createdAt: item.created_at,
        actorId: item.actor_id,
        actorUsername: actorById.get(item.actor_id)?.trim() || 'Пользователь',
        body: bodyById.get(item.message_id) || 'Сообщение',
      })),
    });
  } catch (error) {
    if (error instanceof ApiError) return response({ error: error.message }, error.status);
    console.error('[Chat me]', error);
    return response({ error: 'Не удалось загрузить состояние чата.' }, 503);
  }
}

export async function POST(request: Request) {
  try {
    const { user } = await userClient();
    const body = await readBody(request);
    if (body.action !== 'mark_seen') throw new ApiError(400, 'Неизвестное действие.');

    const admin = adminClient();
    const seenAt = new Date().toISOString();
    const state = await admin.from('chat_read_state').upsert(
      { user_id: user.id, last_seen_at: seenAt, updated_at: seenAt },
      { onConflict: 'user_id' },
    );
    if (state.error) throw state.error;

    const notifications = await admin
      .from('chat_notifications')
      .update({ read_at: seenAt })
      .eq('user_id', user.id)
      .is('read_at', null);
    if (notifications.error) throw notifications.error;

    return response({ ok: true, seenAt });
  } catch (error) {
    if (error instanceof ApiError) return response({ error: error.message }, error.status);
    console.error('[Chat mark seen]', error);
    return response({ error: 'Не удалось обновить прочитанные сообщения.' }, 503);
  }
}
