import { createClient } from '@/lib/supabase/server';
import { adminClient, failure } from '@/lib/community-server';
import { publicIdentityRoleFor } from '@/lib/identity-server';
import {
  makeSponsorStatus,
  resolveSponsorTier,
  type SponsorTier,
} from '@/lib/sponsor';
import { sponsorPublicCosmeticsFromRow } from '@/lib/sponsor-benefits-server';
import { resolvePublicAppearances } from '@/lib/public-avatar-server';

export const dynamic = 'force-dynamic';

type Period = 'week' | 'month' | 'all';

type PreferenceRow = {
  user_id: string;
  selected_frame: string | null;
  name_style: string | null;
  profile_theme: string | null;
  badge_visible: boolean | null;
  wall_visible: boolean | null;
  show_star_amount: boolean | null;
};

type DirectoryRow = {
  user_id: string | null;
  total_stars: number | string | null;
  sponsor_tier?: SponsorTier | null;
};

type ProfileRow = {
  id: string;
  username: string | null;
  avatar_path: string | null;
  telegram_id: number | string | null;
};

type PaymentRow = {
  id: string;
  user_id: string | null;
  telegram_id: number | string | null;
  amount: number | string;
  created_at: string;
};

type AdjustmentRow = {
  user_id: string;
  stars_delta: number | string;
  created_at: string;
  voided_at: string | null;
};

function normalizePeriod(value: string | null): Period {
  if (value === 'month' || value === 'all') return value;
  return 'week';
}

function cutoffFor(period: Period) {
  if (period === 'all') return null;
  const days = period === 'week' ? 7 : 30;
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

function isMissingRelation(error: { code?: string } | null | undefined) {
  return error?.code === '42P01' || error?.code === 'PGRST205';
}


async function loadDirectory(userIds: string[]) {
  if (!userIds.length) return [] as DirectoryRow[];
  const admin = adminClient();
  let result = await admin
    .from('sponsor_directory_v3')
    .select('user_id,total_stars,sponsor_tier')
    .in('user_id', userIds);

  if (result.error && isMissingRelation(result.error)) {
    result = await admin
      .from('sponsor_directory_v2')
      .select('user_id,total_stars,sponsor_tier')
      .in('user_id', userIds);
  }

  if (result.error) throw result.error;
  return (result.data ?? []) as DirectoryRow[];
}

async function loadConfirmedPayments(
  userIds: string[],
  telegramIds: string[],
  options: { cutoff?: string | null; limit?: number } = {},
): Promise<PaymentRow[]> {
  const admin = adminClient();
  const limit = Math.max(1, Math.min(5000, options.limit ?? 5000));
  const batches: PaymentRow[][] = [];

  if (userIds.length) {
    let query = admin
      .from('star_payments')
      .select('id,user_id,telegram_id,amount,created_at')
      .eq('status', 'confirmed')
      .in('user_id', userIds)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (options.cutoff) query = query.gte('created_at', options.cutoff);
    const result = await query;
    if (result.error) throw result.error;
    batches.push((result.data ?? []) as PaymentRow[]);
  }

  if (telegramIds.length) {
    let query = admin
      .from('star_payments')
      .select('id,user_id,telegram_id,amount,created_at')
      .eq('status', 'confirmed')
      .is('user_id', null)
      .in('telegram_id', telegramIds)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (options.cutoff) query = query.gte('created_at', options.cutoff);
    const result = await query;
    if (result.error) throw result.error;
    batches.push((result.data ?? []) as PaymentRow[]);
  }

  const unique = new Map<string, PaymentRow>();
  for (const batch of batches) {
    for (const row of batch) unique.set(row.id, row);
  }

  return [...unique.values()].sort(
    (a, b) => Date.parse(b.created_at) - Date.parse(a.created_at),
  );
}

export async function GET(request: Request) {
  try {
    const period = normalizePeriod(new URL(request.url).searchParams.get('period'));
    const cutoff = cutoffFor(period);
    const admin = adminClient();

    const auth = await createClient();
    const { data: authData } = await auth.auth.getUser();
    const currentUserId = authData.user?.id ?? null;

    const { data: preferenceData, error: preferenceError } = await admin
      .from('sponsor_preferences')
      .select('user_id,selected_frame,name_style,profile_theme,badge_visible,wall_visible,show_star_amount')
      .limit(5000);
    if (preferenceError) throw preferenceError;

    const preferences = (preferenceData ?? []) as PreferenceRow[];
    const preferenceByUser = new Map(preferences.map((row) => [row.user_id, row]));
    const visibleIds = preferences
      .filter((row) => row.wall_visible === true)
      .map((row) => row.user_id)
      .filter(Boolean);

    const idsToLoad = [...new Set([
      ...visibleIds,
      ...(currentUserId ? [currentUserId] : []),
    ])];

    if (!idsToLoad.length) {
      return Response.json(
        {
          period,
          entries: [],
          me: null,
          recent: [],
          stats: { publicStars: 0, supporters: 0 },
        },
        { headers: { 'Cache-Control': 'private, no-store' } },
      );
    }

    const [directoryRows, profilesResult] = await Promise.all([
      loadDirectory(idsToLoad),
      admin
        .from('profiles')
        .select('id,username,avatar_path,telegram_id')
        .in('id', idsToLoad),
    ]);
    if (profilesResult.error) throw profilesResult.error;

    const profileByUser = new Map(
      ((profilesResult.data ?? []) as ProfileRow[]).map((row) => [row.id, row]),
    );
    const directoryByUser = new Map(
      directoryRows
        .filter((row): row is DirectoryRow & { user_id: string } => Boolean(row.user_id))
        .map((row) => [row.user_id, row]),
    );

    const appearanceByUser = await resolvePublicAppearances(
      [...profileByUser.values()].map((profile) => ({
        id: profile.id,
        avatar_path: profile.avatar_path,
      })),
    );

    const visibleSponsorIds = visibleIds.filter((id) => {
      const total = Number(directoryByUser.get(id)?.total_stars ?? 0);
      return total >= 25 && profileByUser.has(id);
    });

    // A Telegram id is trusted only when it maps to one profile inside the loaded set.
    // This mirrors the anti-ambiguity rule used by /api/monetization/sponsor/me.
    const telegramOwner = new Map<string, string | null>();
    for (const id of idsToLoad) {
      const telegramId = profileByUser.get(id)?.telegram_id;
      if (telegramId == null) continue;
      const key = String(telegramId);
      if (!/^\d+$/.test(key)) continue;
      telegramOwner.set(key, telegramOwner.has(key) ? null : id);
    }

    const telegramIds = [...telegramOwner.entries()]
      .filter(([, owner]) => Boolean(owner))
      .map(([telegramId]) => telegramId);

    const periodStars = new Map<string, number>();
    const add = (userId: string, value: number) => {
      if (!Number.isFinite(value) || value === 0) return;
      periodStars.set(userId, (periodStars.get(userId) ?? 0) + value);
    };

    if (period === 'all') {
      for (const id of idsToLoad) {
        add(id, Number(directoryByUser.get(id)?.total_stars ?? 0));
      }
    } else if (cutoff) {
      const payments = await loadConfirmedPayments(idsToLoad, telegramIds, { cutoff });
      for (const payment of payments) {
        const direct = payment.user_id && idsToLoad.includes(payment.user_id)
          ? payment.user_id
          : null;
        const linked = !direct && payment.telegram_id != null
          ? telegramOwner.get(String(payment.telegram_id)) ?? null
          : null;
        const userId = direct ?? linked;
        if (userId) add(userId, Number(payment.amount));
      }

      const adjustmentsQuery = admin
        .from('sponsor_manual_adjustments')
        .select('user_id,stars_delta,created_at,voided_at')
        .in('user_id', idsToLoad)
        .gte('created_at', cutoff)
        .is('voided_at', null)
        .limit(5000);
      const adjustmentsResult = await adjustmentsQuery;

      if (adjustmentsResult.error && !isMissingRelation(adjustmentsResult.error)) {
        throw adjustmentsResult.error;
      }
      if (!adjustmentsResult.error) {
        for (const row of (adjustmentsResult.data ?? []) as AdjustmentRow[]) {
          add(row.user_id, Number(row.stars_delta));
        }
      }
    }

    const entries = visibleSponsorIds
      .map((userId) => {
        const profile = profileByUser.get(userId)!;
        const directory = directoryByUser.get(userId)!;
        const totalStars = Math.max(0, Number(directory.total_stars ?? 0));
        const stars = Math.max(0, periodStars.get(userId) ?? 0);
        const tier = resolveSponsorTier(totalStars);
        if (!tier || stars <= 0) return null;
        const preference = preferenceByUser.get(userId);
        const sponsor = makeSponsorStatus(
          totalStars,
          sponsorPublicCosmeticsFromRow(preference, tier),
        );
        return {
          rank: 0,
          userId,
          username: profile.username?.trim() || 'Пользователь',
          avatarUrl: appearanceByUser.get(userId)?.avatarUrl ?? '/default-avatar.webp',
          avatarTransform: appearanceByUser.get(userId)?.avatarTransform ?? { x: 50, y: 50, zoom: 1 },
          periodStars: stars,
          totalStars,
          showStarAmount: preference?.show_star_amount !== false,
          sponsor,
          role: publicIdentityRoleFor(userId),
          isCurrentUser: currentUserId === userId,
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
      .sort(
        (a, b) =>
          b.periodStars - a.periodStars ||
          b.totalStars - a.totalStars ||
          a.username.localeCompare(b.username, 'ru'),
      )
      .map((entry, index) => ({ ...entry, rank: index + 1 }));

    const visibleTelegramIds = visibleSponsorIds
      .map((id) => profileByUser.get(id)?.telegram_id)
      .filter((value): value is string | number => value != null)
      .map(String)
      .filter((telegramId) => telegramOwner.get(telegramId) != null);

    const recentPayments = await loadConfirmedPayments(
      visibleSponsorIds,
      [...new Set(visibleTelegramIds)],
      { limit: 80 },
    );

    const recent = recentPayments
      .flatMap((payment) => {
        const direct = payment.user_id && visibleSponsorIds.includes(payment.user_id)
          ? payment.user_id
          : null;
        const linked = !direct && payment.telegram_id != null
          ? telegramOwner.get(String(payment.telegram_id)) ?? null
          : null;
        const userId = direct ?? linked;
        if (!userId || !visibleSponsorIds.includes(userId)) return [];
        const profile = profileByUser.get(userId);
        const preference = preferenceByUser.get(userId);
        if (!profile) return [];
        return [{
          id: payment.id,
          userId,
          username: profile.username?.trim() || 'Пользователь',
          avatarUrl: appearanceByUser.get(userId)?.avatarUrl ?? '/default-avatar.webp',
          avatarTransform: appearanceByUser.get(userId)?.avatarTransform ?? { x: 50, y: 50, zoom: 1 },
          amount: Number(payment.amount),
          showStarAmount: preference?.show_star_amount !== false,
          createdAt: payment.created_at,
        }];
      })
      .slice(0, 8);

    let me: null | {
      userId: string;
      visible: boolean;
      rank: number | null;
      periodStars: number;
      totalStars: number;
      tier: SponsorTier | null;
      gapToNext: number | null;
      nextRank: number | null;
    } = null;

    if (currentUserId) {
      const currentDirectory = directoryByUser.get(currentUserId);
      const totalStars = Math.max(0, Number(currentDirectory?.total_stars ?? 0));
      const tier = resolveSponsorTier(totalStars);
      if (tier) {
        const visible = preferenceByUser.get(currentUserId)?.wall_visible === true;
        const entry = entries.find((item) => item.userId === currentUserId) ?? null;
        const periodValue = Math.max(
          0,
          periodStars.get(currentUserId) ?? (period === 'all' ? totalStars : 0),
        );
        const previous = entry && entry.rank > 1 ? entries[entry.rank - 2] : null;
        me = {
          userId: currentUserId,
          visible,
          rank: entry?.rank ?? null,
          periodStars: periodValue,
          totalStars,
          tier,
          gapToNext: previous ? Math.max(0, previous.periodStars - entry!.periodStars) : null,
          nextRank: previous?.rank ?? null,
        };
      }
    }

    return Response.json(
      {
        period,
        entries,
        me,
        recent,
        stats: {
          // Never use hidden personal amounts in the public aggregate.
          publicStars: entries.reduce(
            (sum, entry) => sum + (entry.showStarAmount ? entry.periodStars : 0),
            0,
          ),
          supporters: entries.length,
        },
      },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (error) {
    return failure(error);
  }
}
