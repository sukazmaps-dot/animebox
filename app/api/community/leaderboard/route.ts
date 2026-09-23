import { createClient } from '@/lib/supabase/server';
import { adminClient, failure } from '@/lib/community-server';
import {
  sponsorStatusFromSnapshot,
} from '@/lib/sponsor-server';
import type { PreferenceRow } from '@/lib/sponsor-benefits-server';
import { publicIdentityRoleFor } from '@/lib/identity-server';
import {
  resolvePublicAppearancesFromPreloaded,
  type PublicAppearancePreload,
} from '@/lib/public-avatar-server';
import { normalizeProgression } from '@/lib/progression';

type LeaderboardPeriod = 'week' | 'month' | 'all';

type LeaderboardBundleRow = {
  rank_no: number | string;
  user_id: string;
  username: string;
  avatar_path: string | null;
  active_ms: number | string;
  episodes: number | string;
  last_watched_at: string | null;
  is_current_user: boolean;
  progression?: unknown;
  sponsor_total?: number | string | null;
  sponsor_preferences?: unknown;
  premium_settings?: unknown;
  entitlements?: unknown;
};

function normalizePeriod(value: string | null): LeaderboardPeriod {
  if (value === 'month' || value === 'all') return value;
  return 'week';
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function bundleRows(value: unknown): LeaderboardBundleRow[] {
  const record = asRecord(value);
  if (!record || !Array.isArray(record.entries)) return [];

  return record.entries.filter(
    (row): row is LeaderboardBundleRow =>
      Boolean(row) &&
      typeof row === 'object' &&
      !Array.isArray(row) &&
      typeof (row as Record<string, unknown>).user_id === 'string',
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
    const { data, error } = await admin.rpc(
      'community_leaderboard_bundle',
      {
        p_period: period,
        p_limit: 100,
        p_user_id: currentUserId,
      },
    );

    if (error) throw error;

    const rows = bundleRows(data);

    if (rows.length === 0) {
      return Response.json(
        { period, entries: [], me: null },
        { headers: { 'Cache-Control': 'private, no-store' } },
      );
    }

    const preloadByUser = new Map<string, PublicAppearancePreload>();

    for (const row of rows) {
      preloadByUser.set(row.user_id, {
        premiumSettings: asRecord(row.premium_settings),
        entitlements: Array.isArray(row.entitlements)
          ? row.entitlements.filter(
              (value): value is string => typeof value === 'string',
            )
          : [],
      });
    }

    const appearanceByUser = resolvePublicAppearancesFromPreloaded(
      rows.map((row) => ({
        id: row.user_id,
        avatar_path: row.avatar_path,
      })),
      preloadByUser,
    );

    const normalized = rows.map((row) => {
      const appearance = appearanceByUser.get(row.user_id);
      const sponsorPreferences = asRecord(row.sponsor_preferences);

      return {
        rank: Number(row.rank_no),
        userId: row.user_id,
        username: row.username || 'Пользователь',
        avatarUrl: appearance?.avatarUrl ?? '/default-avatar.webp',
        avatarTransform:
          appearance?.avatarTransform ?? { x: 50, y: 50, zoom: 1 },
        activeMs: Number(row.active_ms) || 0,
        completedEpisodes: Number(row.episodes) || 0,
        lastWatchedAt: row.last_watched_at,
        isCurrentUser: Boolean(row.is_current_user),
        sponsor: sponsorStatusFromSnapshot(
          Number(row.sponsor_total ?? 0),
          sponsorPreferences as PreferenceRow | null,
        ),
        role: publicIdentityRoleFor(row.user_id),
        progression: normalizeProgression(row.progression),
      };
    });

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
