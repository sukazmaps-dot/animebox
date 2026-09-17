import { createClient } from '@/lib/supabase/server';
import { adminClient, failure } from '@/lib/community-server';
import { getSponsorStatuses } from '@/lib/sponsor-server';

type LeaderboardPeriod = 'week' | 'month' | 'all';

type LeaderboardRow = {
  rank_no: number | string;
  user_id: string;
  username: string;
  avatar_path: string | null;
  active_ms: number | string;
  episodes: number | string;
  last_watched_at: string | null;
  is_current_user: boolean;
};

function normalizePeriod(value: string | null): LeaderboardPeriod {
  if (value === 'month' || value === 'all') return value;
  return 'week';
}

function avatarUrl(path: string | null) {
  if (!path) return '/default-avatar.webp';
  if (/^https?:\/\//i.test(path)) return path;

  const admin = adminClient();
  return (
    admin.storage.from('profile-media').getPublicUrl(path).data.publicUrl ||
    '/default-avatar.webp'
  );
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const period = normalizePeriod(url.searchParams.get('period'));

    const userClient = await createClient();
    const { data: userData } = await userClient.auth.getUser();
    const currentUserId = userData.user?.id ?? null;

    const admin = adminClient();
    const watch = admin.schema('animebox_watch');

    const { data, error } = await watch.rpc('leaderboard', {
      p_period: period,
      p_limit: 100,
      p_user_id: currentUserId,
    });

    if (error) throw error;

    const rows = (Array.isArray(data) ? data : []) as LeaderboardRow[];
    const sponsorByUser = await getSponsorStatuses(
      rows.map((row) => row.user_id),
    );

    const normalized = rows.map((row) => ({
      rank: Number(row.rank_no),
      userId: row.user_id,
      username: row.username || 'Пользователь',
      avatarUrl: avatarUrl(row.avatar_path),
      activeMs: Number(row.active_ms) || 0,
      episodes: Number(row.episodes) || 0,
      lastWatchedAt: row.last_watched_at,
      isCurrentUser: Boolean(row.is_current_user),
      sponsor: sponsorByUser.get(row.user_id) ?? null,
    }));

    return Response.json(
      {
        period,
        entries: normalized.filter((entry) => entry.rank <= 100),
        me: normalized.find((entry) => entry.isCurrentUser) ?? null,
      },
      {
        headers: {
          'Cache-Control': 'private, no-store',
        },
      },
    );
  } catch (error) {
    return failure(error);
  }
}
