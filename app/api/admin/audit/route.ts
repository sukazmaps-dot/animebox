import { ApiError, adminClient, failure, response } from '@/lib/community-server';
import { requireAdmin } from '@/lib/admin-server';

export async function GET(request: Request) {
  try {
    const { role } = await requireAdmin(['owner', 'admin']);
    const page = Number(new URL(request.url).searchParams.get('page') ?? 1);
    if (!Number.isInteger(page) || page < 1 || page > 10000) throw new ApiError(400, 'Некорректная страница.');
    const admin = adminClient();
    const result = await admin
      .from('admin_audit_log')
      .select('id,actor_id,actor_role,action,target_type,target_id,reason,details,created_at', { count: 'exact' })
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range((page - 1) * 40, page * 40 - 1);
    if (result.error) throw result.error;

    const actorIds = [...new Set((result.data ?? []).map((item) => item.actor_id).filter(Boolean))];
    const profiles = actorIds.length
      ? await admin.from('profiles').select('id,username').in('id', actorIds)
      : { data: [], error: null };
    if (profiles.error) throw profiles.error;
    const names = new Map((profiles.data ?? []).map((item) => [item.id, item.username]));

    return response({
      role,
      events: (result.data ?? []).map((item) => ({ ...item, actorName: item.actor_id ? names.get(item.actor_id) ?? item.actor_id : 'Системный аккаунт' })),
      page,
      hasMore: page * 40 < (result.count ?? 0),
    });
  } catch (error) {
    return failure(error);
  }
}
