import { ApiError, adminClient, failure, readBody, response } from '@/lib/community-server';
import { assertCanModerateTarget, requireAdmin, requireAdminMutation, writeAdminAudit } from '@/lib/admin-server';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: Request) {
  try {
    const { role } = await requireAdmin();
    const params = new URL(request.url).searchParams;
    const page = Number(params.get('page') ?? 1);
    const state = params.get('state') ?? 'all';
    if (!Number.isInteger(page) || page < 1 || page > 10000 || !['all', 'visible', 'removed'].includes(state)) {
      throw new ApiError(400, 'Некорректный фильтр.');
    }

    const admin = adminClient();
    let query = admin
      .from('comments')
      .select('id,user_id,anime_id,episode_number,body,is_spoiler,created_at,deleted_at', { count: 'exact' });
    if (state === 'visible') query = query.is('deleted_at', null);
    if (state === 'removed') query = query.not('deleted_at', 'is', null);
    const result = await query.order('created_at', { ascending: false }).range((page - 1) * 30, page * 30 - 1);
    if (result.error) throw result.error;

    const userIds = [...new Set((result.data ?? []).map((item) => item.user_id).filter(Boolean))];
    const animeIds = [...new Set((result.data ?? []).map((item) => item.anime_id).filter(Boolean))];
    const [profiles, anime] = await Promise.all([
      userIds.length ? admin.from('profiles').select('id,username').in('id', userIds) : Promise.resolve({ data: [], error: null }),
      animeIds.length ? admin.from('anime_catalog').select('id,title').in('id', animeIds) : Promise.resolve({ data: [], error: null }),
    ]);
    if (profiles.error) throw profiles.error;
    if (anime.error) throw anime.error;
    const profileById = new Map((profiles.data ?? []).map((item) => [item.id, item.username]));
    const animeById = new Map((anime.data ?? []).map((item) => [item.id, item.title]));

    return response({
      role,
      comments: (result.data ?? []).map((item) => ({
        ...item,
        username: item.user_id ? profileById.get(item.user_id) ?? 'Пользователь' : 'Удалённый аккаунт',
        animeTitle: animeById.get(item.anime_id) ?? `Аниме #${item.anime_id}`,
      })),
      page,
      hasMore: page * 30 < (result.count ?? 0),
    });
  } catch (error) {
    return failure(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const { user, role } = await requireAdminMutation(request);
    const body = await readBody(request);
    const id = typeof body.id === 'string' ? body.id : '';
    const action = typeof body.action === 'string' ? body.action : '';
    const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
    if (!UUID.test(id) || !['remove', 'restore'].includes(action) || reason.length > 1000) {
      throw new ApiError(400, 'Некорректное действие модерации.');
    }
    if (action === 'remove' && !reason) throw new ApiError(400, 'Укажи причину удаления.');

    const admin = adminClient();
    const { data: comment, error: commentError } = await admin
      .from('comments')
      .select('id,user_id,body,is_spoiler,deleted_at')
      .eq('id', id)
      .maybeSingle();
    if (commentError) throw commentError;
    if (!comment) throw new ApiError(404, 'Комментарий не найден.');
    assertCanModerateTarget(user.id, role, comment.user_id);

    if (action === 'remove') {
      if (!comment.deleted_at) {
        const { error: snapshotError } = await admin.from('admin_comment_snapshots').upsert({
          comment_id: id,
          original_body: comment.body,
          original_spoiler: comment.is_spoiler,
          removed_by: user.id,
          removed_at: new Date().toISOString(),
          reason,
        });
        if (snapshotError) throw snapshotError;
      }
      const { error } = await admin.from('comments').update({
        body: 'Комментарий удалён модератором.',
        is_spoiler: false,
        deleted_at: new Date().toISOString(),
      }).eq('id', id);
      if (error) throw error;
    } else {
      const { data: snapshot, error: snapshotError } = await admin
        .from('admin_comment_snapshots')
        .select('original_body,original_spoiler')
        .eq('comment_id', id)
        .maybeSingle();
      if (snapshotError) throw snapshotError;
      if (!snapshot) throw new ApiError(409, 'Для старого удаления нет сохранённой копии комментария.');
      const { error } = await admin.from('comments').update({
        body: snapshot.original_body,
        is_spoiler: snapshot.original_spoiler,
        deleted_at: null,
      }).eq('id', id);
      if (error) throw error;
    }

    await writeAdminAudit({
      actorId: user.id,
      actorRole: role,
      action: action === 'remove' ? 'comment.removed' : 'comment.restored',
      targetType: 'comment',
      targetId: id,
      reason,
      details: { authorId: comment.user_id },
      request,
    });
    return response({ success: true });
  } catch (error) {
    return failure(error);
  }
}
