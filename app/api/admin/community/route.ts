import { assertCanModerateTarget, requireAdmin, requireAdminMutation, writeAdminAudit, type AdminRole } from '@/lib/admin-server';
import { ApiError, adminClient, readBody, response } from '@/lib/community-server';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function cleanText(value: unknown, max = 500) {
  if (typeof value !== 'string') return '';
  return value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

function requireSenior(role: AdminRole) {
  if (role === 'moderator') throw new ApiError(403, 'Это действие доступно только владельцу или администратору.');
}

async function deleteMessage(messageId: string, actorId: string, actorRole: AdminRole) {
  const admin = adminClient();
  const message = await admin.from('chat_messages').select('id,user_id,deleted_at').eq('id', messageId).maybeSingle();
  if (message.error) throw message.error;
  if (!message.data) throw new ApiError(404, 'Сообщение не найдено.');
  assertCanModerateTarget(actorId, actorRole, message.data.user_id);
  if (!message.data.deleted_at) {
    const update = await admin
      .from('chat_messages')
      .update({ body: 'Сообщение удалено.', deleted_at: new Date().toISOString() })
      .eq('id', messageId);
    if (update.error) throw update.error;
  }
  await writeAdminAudit({
    actorId,
    actorRole,
    action: 'chat_message_delete',
    targetType: 'chat_message',
    targetId: messageId,
    details: { authorId: message.data.user_id },
  });
  return message.data.user_id as string;
}

async function restrictUser(input: {
  targetId: string;
  status: 'muted' | 'banned' | 'active';
  minutes?: number | null;
  note: string;
  actorId: string;
  actorRole: AdminRole;
}) {
  if (!UUID.test(input.targetId)) throw new ApiError(400, 'Некорректный пользователь.');
  assertCanModerateTarget(input.actorId, input.actorRole, input.targetId);
  if (input.status === 'banned') {
    requireSenior(input.actorRole);
    if (!input.note) throw new ApiError(400, 'Для блокировки укажи причину.');
  }

  const now = new Date();
  const expiresAt = input.status === 'muted' && input.minutes
    ? new Date(now.getTime() + input.minutes * 60_000).toISOString()
    : null;

  const admin = adminClient();
  const result = await admin.from('admin_user_controls').upsert({
    user_id: input.targetId,
    status: input.status,
    note: input.note || null,
    expires_at: expiresAt,
    updated_by: input.actorId,
    updated_at: now.toISOString(),
  }, { onConflict: 'user_id' });
  if (result.error) throw result.error;

  await writeAdminAudit({
    actorId: input.actorId,
    actorRole: input.actorRole,
    action: `chat_user_${input.status}`,
    targetType: 'user',
    targetId: input.targetId,
    reason: input.note || null,
    details: { expiresAt },
  });
}

export async function GET() {
  try {
    const { role } = await requireAdmin();
    const admin = adminClient();
    const dayAgo = new Date(Date.now() - 86_400_000).toISOString();

    const [settings, reports, commentReports, controls, messagesToday] = await Promise.all([
      admin.from('chat_settings').select('slow_mode_seconds,pinned_message_id,updated_at').eq('id', 1).maybeSingle(),
      admin
        .from('chat_reports')
        .select('id,message_id,reporter_id,reason,details,status,created_at')
        .eq('status', 'open')
        .order('created_at', { ascending: true })
        .limit(100),
      admin
        .from('comment_reports')
        .select('id,comment_id,reporter_id,reason,details,status,created_at')
        .eq('status', 'open')
        .order('created_at', { ascending: true })
        .limit(100),
      admin
        .from('admin_user_controls')
        .select('user_id,status,note,expires_at,updated_at')
        .in('status', ['muted', 'banned'])
        .order('updated_at', { ascending: false })
        .limit(100),
      admin.from('chat_messages').select('*', { count: 'exact', head: true }).gte('created_at', dayAgo),
    ]);

    if (settings.error) throw settings.error;
    if (reports.error) throw reports.error;
    if (commentReports.error) throw commentReports.error;
    if (controls.error) throw controls.error;
    if (messagesToday.error) throw messagesToday.error;

    const reportMessageIds = [...new Set((reports.data ?? []).map((item) => item.message_id))];
    const reportMessages = reportMessageIds.length
      ? await admin.from('chat_messages').select('id,user_id,body,deleted_at').in('id', reportMessageIds)
      : { data: [], error: null };
    if (reportMessages.error) throw reportMessages.error;

    const reportCommentIds = [...new Set((commentReports.data ?? []).map((item) => item.comment_id))];
    const reportComments = reportCommentIds.length
      ? await admin
          .from('comments')
          .select('id,user_id,body,deleted_at,anime_id,episode_number')
          .in('id', reportCommentIds)
      : { data: [], error: null };
    if (reportComments.error) throw reportComments.error;

    const userIds = [...new Set([
      ...(reports.data ?? []).map((item) => item.reporter_id),
      ...(reportMessages.data ?? []).map((item) => item.user_id),
      ...(commentReports.data ?? []).map((item) => item.reporter_id),
      ...(reportComments.data ?? []).map((item) => item.user_id),
      ...(controls.data ?? []).map((item) => item.user_id),
    ].filter((id): id is string => typeof id === 'string' && Boolean(id)))];
    const profiles = userIds.length
      ? await admin.from('profiles').select('id,username').in('id', userIds)
      : { data: [], error: null };
    if (profiles.error) throw profiles.error;

    const profileRows = (profiles.data ?? []) as Array<{ id: string; username: string | null }>;
    const messageRows = (reportMessages.data ?? []) as Array<{ id: string; user_id: string; body: string; deleted_at: string | null }>;
    const commentRows = (reportComments.data ?? []) as Array<{
      id: string;
      user_id: string | null;
      body: string;
      deleted_at: string | null;
      anime_id: number;
      episode_number: number | null;
    }>;
    const profileById = new Map<string, string>(profileRows.map((item) => [item.id, item.username?.trim() || 'Пользователь']));
    const messageById = new Map<string, { id: string; user_id: string; body: string; deleted_at: string | null }>(messageRows.map((item) => [item.id, item]));
    const commentById = new Map(commentRows.map((item) => [item.id, item]));

    const recentRows = await admin
      .from('chat_messages')
      .select('user_id')
      .gte('created_at', dayAgo)
      .limit(3000);
    if (recentRows.error) throw recentRows.error;

    return response({
      role,
      metrics: {
        messages24h: messagesToday.count ?? 0,
        activeChatters24h: new Set((recentRows.data ?? []).map((item) => item.user_id)).size,
        openReports:
          (reports.data?.length ?? 0) +
          (commentReports.data?.length ?? 0),
        restrictedUsers: controls.data?.length ?? 0,
      },
      settings: {
        slowModeSeconds: Number(settings.data?.slow_mode_seconds ?? 0),
        pinnedMessageId: settings.data?.pinned_message_id ?? null,
        updatedAt: settings.data?.updated_at ?? null,
      },
      reports: (reports.data ?? []).map((item) => {
        const message = messageById.get(item.message_id);
        return {
          ...item,
          messageBody: message?.body ?? 'Сообщение недоступно.',
          authorId: message?.user_id ?? null,
          authorUsername: message?.user_id ? profileById.get(message.user_id) ?? 'Пользователь' : 'Пользователь',
          reporterUsername: profileById.get(item.reporter_id) ?? 'Пользователь',
        };
      }),
      commentReports: (commentReports.data ?? []).map((item) => {
        const comment = commentById.get(item.comment_id);
        return {
          ...item,
          commentBody: comment?.body ?? 'Комментарий недоступен.',
          authorId: comment?.user_id ?? null,
          authorUsername: comment?.user_id
            ? profileById.get(comment.user_id) ?? 'Пользователь'
            : 'Пользователь',
          reporterUsername:
            profileById.get(item.reporter_id) ?? 'Пользователь',
          animeId: comment?.anime_id ?? null,
          episode: comment?.episode_number ?? null,
        };
      }),
      controls: (controls.data ?? []).map((item) => ({
        ...item,
        username: profileById.get(item.user_id) ?? 'Пользователь',
      })),
    });
  } catch (error) {
    if (error instanceof ApiError) return response({ error: error.message }, error.status);
    console.error('[Admin community GET]', error);
    return response({ error: 'Не удалось загрузить Community Admin.' }, 503);
  }
}

export async function POST(request: Request) {
  try {
    const { user, role } = await requireAdminMutation(request);
    const body = await readBody(request);
    const action = body.action;
    const admin = adminClient();

    if (action === 'set_slow_mode') {
      requireSenior(role);
      const seconds = Number(body.seconds);
      if (![0, 5, 10, 30, 60].includes(seconds)) throw new ApiError(400, 'Некорректный slow mode.');
      const result = await admin.from('chat_settings').upsert({
        id: 1,
        slow_mode_seconds: seconds,
        updated_by: user.id,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' });
      if (result.error) throw result.error;
      await writeAdminAudit({ actorId: user.id, actorRole: role, action: 'chat_slow_mode', targetType: 'chat', details: { seconds } });
      return response({ ok: true });
    }

    if (action === 'pin_message') {
      requireSenior(role);
      const messageId = body.messageId === null || body.messageId === '' ? null : String(body.messageId);
      if (messageId && !UUID.test(messageId)) throw new ApiError(400, 'Некорректное сообщение.');
      if (messageId) {
        const exists = await admin.from('chat_messages').select('id,deleted_at').eq('id', messageId).maybeSingle();
        if (exists.error) throw exists.error;
        if (!exists.data || exists.data.deleted_at) throw new ApiError(404, 'Сообщение для закрепления не найдено.');
      }
      const result = await admin.from('chat_settings').upsert({
        id: 1,
        pinned_message_id: messageId,
        updated_by: user.id,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' });
      if (result.error) throw result.error;
      await writeAdminAudit({ actorId: user.id, actorRole: role, action: 'chat_pin_message', targetType: 'chat_message', targetId: messageId });
      return response({ ok: true });
    }

    if (action === 'system_message') {
      requireSenior(role);
      const text = cleanText(body.body, 500);
      if (!text) throw new ApiError(400, 'Системное сообщение пустое.');
      const inserted = await admin.from('chat_messages').insert({
        user_id: user.id,
        body: text,
        reply_to: null,
        request_id: crypto.randomUUID(),
        kind: 'system',
      }).select('id').single();
      if (inserted.error) throw inserted.error;
      if (body.pin === true) {
        const pin = await admin.from('chat_settings').upsert({
          id: 1,
          pinned_message_id: inserted.data.id,
          updated_by: user.id,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'id' });
        if (pin.error) throw pin.error;
      }
      await writeAdminAudit({ actorId: user.id, actorRole: role, action: 'chat_system_message', targetType: 'chat_message', targetId: inserted.data.id });
      return response({ ok: true });
    }

    if (action === 'delete_message') {
      const messageId = String(body.messageId ?? '');
      if (!UUID.test(messageId)) throw new ApiError(400, 'Некорректное сообщение.');
      await deleteMessage(messageId, user.id, role);
      return response({ ok: true });
    }

    if (action === 'mute_user' || action === 'ban_user' || action === 'unrestrict_user') {
      const targetId = String(body.userId ?? '');
      const note = cleanText(body.reason, 300);
      if (action === 'mute_user') {
        const minutes = Number(body.minutes);
        if (![10, 60, 1440].includes(minutes)) throw new ApiError(400, 'Некорректная длительность mute.');
        await restrictUser({ targetId, status: 'muted', minutes, note, actorId: user.id, actorRole: role });
      } else if (action === 'ban_user') {
        await restrictUser({ targetId, status: 'banned', note, actorId: user.id, actorRole: role });
      } else {
        await restrictUser({ targetId, status: 'active', note, actorId: user.id, actorRole: role });
      }
      return response({ ok: true });
    }

    if (action === 'delete_comment') {
      const commentId = String(body.commentId ?? '');
      if (!UUID.test(commentId)) {
        throw new ApiError(400, 'Некорректный комментарий.');
      }

      const existing = await admin
        .from('comments')
        .select('id,user_id,deleted_at')
        .eq('id', commentId)
        .maybeSingle();

      if (existing.error) throw existing.error;
      if (!existing.data) throw new ApiError(404, 'Комментарий не найден.');

      if (existing.data.user_id) {
        assertCanModerateTarget(user.id, role, existing.data.user_id);
      }

      if (!existing.data.deleted_at) {
        const update = await admin
          .from('comments')
          .update({
            body: 'Комментарий удалён.',
            is_spoiler: false,
            deleted_at: new Date().toISOString(),
          })
          .eq('id', commentId);

        if (update.error) throw update.error;
      }

      await admin
        .from('comment_reports')
        .update({
          status: 'actioned',
          resolved_at: new Date().toISOString(),
          resolved_by: user.id,
        })
        .eq('comment_id', commentId)
        .eq('status', 'open');

      await writeAdminAudit({
        actorId: user.id,
        actorRole: role,
        action: 'comment_delete',
        targetType: 'comment',
        targetId: commentId,
        details: { authorId: existing.data.user_id },
      });

      return response({ ok: true });
    }

    if (action === 'resolve_comment_report') {
      const reportId = String(body.reportId ?? '');
      const status =
        body.status === 'actioned'
          ? 'actioned'
          : body.status === 'dismissed'
            ? 'dismissed'
            : null;

      if (!UUID.test(reportId) || !status) {
        throw new ApiError(400, 'Некорректная жалоба.');
      }

      const update = await admin
        .from('comment_reports')
        .update({
          status,
          resolved_at: new Date().toISOString(),
          resolved_by: user.id,
        })
        .eq('id', reportId)
        .eq('status', 'open');

      if (update.error) throw update.error;

      await writeAdminAudit({
        actorId: user.id,
        actorRole: role,
        action: `comment_report_${status}`,
        targetType: 'comment_report',
        targetId: reportId,
      });

      return response({ ok: true });
    }

    if (action === 'resolve_report') {
      const reportId = String(body.reportId ?? '');
      const status = body.status === 'actioned' ? 'actioned' : body.status === 'dismissed' ? 'dismissed' : null;
      if (!UUID.test(reportId) || !status) throw new ApiError(400, 'Некорректная жалоба.');
      const update = await admin.from('chat_reports').update({
        status,
        resolved_at: new Date().toISOString(),
        resolved_by: user.id,
      }).eq('id', reportId).eq('status', 'open');
      if (update.error) throw update.error;
      await writeAdminAudit({ actorId: user.id, actorRole: role, action: `chat_report_${status}`, targetType: 'chat_report', targetId: reportId });
      return response({ ok: true });
    }

    throw new ApiError(400, 'Неизвестное действие Community Admin.');
  } catch (error) {
    if (error instanceof ApiError) return response({ error: error.message }, error.status);
    console.error('[Admin community POST]', error);
    return response({ error: 'Не удалось выполнить действие.' }, 503);
  }
}
