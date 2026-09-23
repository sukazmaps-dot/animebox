import { ApiError, adminClient, failure, readBody, response } from '@/lib/community-server';
import { adminRoleFor, assertCanModerateTarget, requireAdmin, requireAdminMutation, writeAdminAudit } from '@/lib/admin-server';
import { resolveSponsorTier } from '@/lib/sponsor';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUSES = new Set(['active', 'muted', 'banned']);

export async function GET(request: Request) {
  try {
    const { role } = await requireAdmin();
    const params = new URL(request.url).searchParams;
    const page = Number(params.get('page') ?? 1);
    const query = (params.get('q') ?? '').trim().slice(0, 100);
    if (!Number.isInteger(page) || page < 1 || page > 10000) throw new ApiError(400, 'Некорректная страница.');

    const admin = adminClient();
    let profilesQuery = admin
      .from('profiles')
      .select('id,username,avatar_path,telegram_id,created_at', { count: 'exact' });

    if (query) {
      profilesQuery = UUID.test(query)
        ? profilesQuery.eq('id', query)
        : profilesQuery.ilike('username', `%${query}%`);
    }

    const profilesResult = await profilesQuery
      .order('created_at', { ascending: false })
      .range((page - 1) * 25, page * 25 - 1);
    if (profilesResult.error) throw profilesResult.error;

    const ids = (profilesResult.data ?? []).map((item) => item.id);
    const [controls, sponsors, authUsers] = await Promise.all([
      ids.length
        ? admin.from('admin_user_controls').select('user_id,status,note,expires_at,updated_at').in('user_id', ids)
        : Promise.resolve({ data: [], error: null }),
      ids.length
        ? admin.from('sponsor_directory_v3').select('user_id,total_stars').in('user_id', ids)
        : Promise.resolve({ data: [], error: null }),
      role === 'moderator'
        ? Promise.resolve({ data: { users: [] }, error: null })
        : admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    ]);
    if (controls.error) throw controls.error;
    if (sponsors.error) throw sponsors.error;
    if (authUsers.error) throw authUsers.error;

    const controlById = new Map((controls.data ?? []).map((item) => [item.user_id, item]));
    const sponsorById = new Map((sponsors.data ?? []).map((item) => [item.user_id, Number(item.total_stars)]));
    const authById = new Map(authUsers.data.users.map((item) => [item.id, item]));

    const users = (profilesResult.data ?? []).map((profile) => {
      const avatarUrl = profile.avatar_path
        ? admin.storage.from('profile-media').getPublicUrl(profile.avatar_path).data.publicUrl
        : '/default-avatar.webp';
      const control = controlById.get(profile.id);
      const totalStars = sponsorById.get(profile.id) ?? 0;
      return {
        ...profile,
        telegram_id: role === 'moderator' ? null : profile.telegram_id,
        avatarUrl,
        email: role === 'moderator' ? null : authById.get(profile.id)?.email ?? null,
        status: control?.status ?? 'active',
        note: control?.note ?? null,
        expiresAt: control?.expires_at ?? null,
        totalStars,
        sponsorTier: resolveSponsorTier(totalStars),
        adminRole: adminRoleFor(profile.id),
      };
    });

    return response({ role, users, page, hasMore: page * 25 < (profilesResult.count ?? 0), total: profilesResult.count ?? 0 });
  } catch (error) {
    return failure(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const { user: actor, role } = await requireAdminMutation(request, ['owner', 'admin']);
    const body = await readBody(request);
    const userId = typeof body.userId === 'string' ? body.userId : '';
    const status = typeof body.status === 'string' ? body.status : '';
    const note = typeof body.note === 'string' ? body.note.trim() : '';
    const expiresAt = typeof body.expiresAt === 'string' && body.expiresAt ? body.expiresAt : null;

    if (!UUID.test(userId) || !STATUSES.has(status) || note.length > 1000) {
      throw new ApiError(400, 'Некорректные параметры ограничения.');
    }
    if (expiresAt && !Number.isFinite(Date.parse(expiresAt))) throw new ApiError(400, 'Некорректная дата окончания.');
    assertCanModerateTarget(actor.id, role, userId);

    const admin = adminClient();
    const { data: before, error: beforeError } = await admin
      .from('admin_user_controls')
      .select('status,note,expires_at')
      .eq('user_id', userId)
      .maybeSingle();
    if (beforeError) throw beforeError;

    const { error } = await admin.from('admin_user_controls').upsert({
      user_id: userId,
      status,
      note: note || null,
      expires_at: status === 'active' ? null : expiresAt,
      updated_by: actor.id,
      updated_at: new Date().toISOString(),
    });
    if (error) throw error;

    await writeAdminAudit({
      actorId: actor.id,
      actorRole: role,
      action: 'user.status_changed',
      targetType: 'user',
      targetId: userId,
      reason: note,
      details: { before: before ?? { status: 'active' }, after: { status, expiresAt } },
      request,
    });

    return response({ success: true });
  } catch (error) {
    return failure(error);
  }
}
