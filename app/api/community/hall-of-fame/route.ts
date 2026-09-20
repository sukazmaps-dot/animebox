import { adminClient, failure } from '@/lib/community-server';
import { normalizeProgression } from '@/lib/progression';
import {
  resolvePublicAppearances,
  type PublicResolvedAppearance,
} from '@/lib/public-avatar-server';

type Period = 'week' | 'month';

function normalizePeriod(value: string | null): Period {
  return value === 'month' ? 'month' : 'week';
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const period = normalizePeriod(url.searchParams.get('period'));
    const admin = adminClient();

    const { data: seasons, error: seasonsError } = await admin
      .from('leaderboard_seasons')
      .select('id,period_type,period_key,starts_at,ends_at,finalized_at')
      .eq('period_type', period)
      .order('ends_at', { ascending: false })
      .limit(8);

    if (seasonsError) throw seasonsError;

    const seasonIds = (seasons ?? []).map((season) => season.id);
    if (!seasonIds.length) {
      return Response.json(
        { period, seasons: [] },
        { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=900' } },
      );
    }

    const { data: entries, error: entriesError } = await admin
      .from('leaderboard_season_entries')
      .select('season_id,user_id,place,active_ms,episodes,username_snapshot,avatar_path_snapshot')
      .in('season_id', seasonIds)
      .order('place', { ascending: true });

    if (entriesError) throw entriesError;

    const userIds = [
      ...new Set((entries ?? []).map((entry) => entry.user_id)),
    ];

    let appearanceByUser = new Map<string, PublicResolvedAppearance>();
    const progressionByUser = new Map<string, ReturnType<typeof normalizeProgression>>();

    if (userIds.length) {
      const [profilesResult, progressionResult] = await Promise.all([
        admin
          .from('profiles')
          .select('id,avatar_path')
          .in('id', userIds),
        admin
          .from('user_progression')
          .select('user_id,total_xp,activity_xp,premium_bonus_xp,achievement_xp,challenge_xp')
          .in('user_id', userIds),
      ]);

      if (profilesResult.error) throw profilesResult.error;
      if (progressionResult.error) throw progressionResult.error;

      appearanceByUser = await resolvePublicAppearances(
        (profilesResult.data ?? []).map((profile) => ({
          id: profile.id,
          avatar_path: profile.avatar_path,
        })),
      );

      for (const row of progressionResult.data ?? []) {
        progressionByUser.set(row.user_id, normalizeProgression(row));
      }
    }

    const entriesBySeason = new Map<string, NonNullable<typeof entries>>();
    for (const entry of entries ?? []) {
      const bucket = entriesBySeason.get(entry.season_id) ?? [];
      bucket.push(entry);
      entriesBySeason.set(entry.season_id, bucket);
    }

    const payload = (seasons ?? [])
      .map((season) => {
        const seasonEntries = entriesBySeason.get(season.id) ?? [];

        return {
          id: season.id,
          periodType: season.period_type,
          periodKey: season.period_key,
          startsAt: season.starts_at,
          endsAt: season.ends_at,
          finalizedAt: season.finalized_at,
          entries: seasonEntries.map((entry) => {
            const appearance = appearanceByUser.get(entry.user_id);

            return {
              userId: entry.user_id,
              place: Number(entry.place),
              activeMs: Number(entry.active_ms) || 0,
              episodes: Number(entry.episodes) || 0,
              username: entry.username_snapshot || 'Пользователь',
              avatarUrl: appearance?.avatarUrl ?? '/default-avatar.webp',
              avatarTransform: appearance?.avatarTransform ?? { x: 50, y: 50, zoom: 1 },
              progression: progressionByUser.get(entry.user_id) ?? normalizeProgression(null),
            };
          }),
        };
      })
      .filter((season) => season.entries.length > 0);

    return Response.json(
      { period, seasons: payload },
      { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=900' } },
    );
  } catch (error) {
    return failure(error);
  }
}
