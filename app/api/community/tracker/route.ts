import {
  adminClient,
  failure,
  response,
  userClient,
} from '@/lib/community-server';
import type { LibraryStatus } from '@/lib/community-client';

const VALID_STATUS = new Set<LibraryStatus>([
  'watching',
  'planned',
  'completed',
  'dropped',
]);

export async function GET() {
  try {
    const { user } = await userClient();
    const admin = adminClient();

    const { data, error } = await admin
      .from('anime_library')
      .select('anime_id,status,updated_at,anime_catalog!inner(title)')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false });

    if (error) throw error;

    const stats: Record<LibraryStatus, number> = {
      watching: 0,
      planned: 0,
      completed: 0,
      dropped: 0,
    };

    const library = (data ?? []).flatMap((row) => {
      const status = row.status as LibraryStatus;
      if (!VALID_STATUS.has(status)) return [];

      const relation = row.anime_catalog as
        | { title?: string | null }
        | { title?: string | null }[]
        | null;
      const catalog = Array.isArray(relation) ? relation[0] : relation;

      stats[status] += 1;

      return [
        {
          anime_id: Number(row.anime_id),
          title: catalog?.title?.trim() || `Аниме #${row.anime_id}`,
          status,
        },
      ];
    });

    return response({ stats, library });
  } catch (error) {
    return failure(error);
  }
}
