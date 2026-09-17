import { adminClient, failure, response } from '@/lib/community-server';
import { requireAdmin } from '@/lib/admin-server';

export async function GET() {
  try {
    const { role } = await requireAdmin();
    const admin = adminClient();
    const since = new Date(Date.now() - 7 * 86_400_000).toISOString();

    const [
      users,
      newUsers,
      comments,
      newComments,
      library,
      removed,
      stars,
      recentUsers,
      recentAudit,
    ] = await Promise.all([
      admin.from('profiles').select('id', { count: 'exact', head: true }),
      admin.from('profiles').select('id', { count: 'exact', head: true }).gte('created_at', since),
      admin.from('comments').select('id', { count: 'exact', head: true }),
      admin.from('comments').select('id', { count: 'exact', head: true }).gte('created_at', since),
      admin.from('anime_library').select('user_id', { count: 'exact', head: true }),
      admin.from('comments').select('id', { count: 'exact', head: true }).not('deleted_at', 'is', null),
      admin.from('sponsor_metrics_v2').select('*').single(),
      admin.from('profiles').select('id,username,created_at').order('created_at', { ascending: false }).limit(6),
      admin.from('admin_audit_log').select('id,actor_id,action,target_type,target_id,created_at').order('created_at', { ascending: false }).limit(8),
    ]);

    for (const result of [users, newUsers, comments, newComments, library, removed, stars, recentUsers, recentAudit]) {
      if (result.error) throw result.error;
    }

    return response({
      role,
      periodDays: 7,
      metrics: {
        users: users.count ?? 0,
        newUsers: newUsers.count ?? 0,
        comments: comments.count ?? 0,
        newComments: newComments.count ?? 0,
        libraryItems: library.count ?? 0,
        removedComments: removed.count ?? 0,
        stars: Number(stars.data?.total_stars ?? 0),
        sponsors: Number(stars.data?.sponsors ?? 0),
      },
      recentUsers: recentUsers.data ?? [],
      recentAudit: recentAudit.data ?? [],
    });
  } catch (error) {
    return failure(error);
  }
}
