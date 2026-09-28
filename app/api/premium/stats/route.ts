import {
  ApiError,
  adminClient,
  failure,
  response,
  userClient,
} from '@/lib/community-server';
import { getEffectiveUserEntitlements } from '@/lib/entitlements-server';
import { getEffectivePremiumState } from '@/lib/premium-server';
import { getTrustedProgressionMetrics } from '@/lib/trusted-progression-metrics-server';
import type {
  PremiumStatsHistoryItem,
  PremiumStatsMonth,
  PremiumStatsPayload,
  PremiumStatsTopGenre,
  PremiumStatsTopTitle,
} from '@/lib/premium-stats';

export const dynamic = 'force-dynamic';

type HistoryRow = {
  anime_id: number;
  episode_number: number;
  completed_at: string | null;
};

type CatalogRow = {
  id: number;
  slug: string | null;
  title: string;
  poster_url: string | null;
  genres: string[] | null;
};

function safeInt(value: unknown) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
}

function monthKey(value: Date) {
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(value: Date) {
  return new Intl.DateTimeFormat('ru-RU', {
    month: 'short',
    year: '2-digit',
    timeZone: 'UTC',
  }).format(value);
}

function sixMonthSkeleton(now: Date): PremiumStatsMonth[] {
  const result: PremiumStatsMonth[] = [];

  for (let offset = 5; offset >= 0; offset -= 1) {
    const point = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 1));
    result.push({
      key: monthKey(point),
      label: monthLabel(point),
      episodes: 0,
    });
  }

  return result;
}

function yearMonthSkeleton(year: number): PremiumStatsMonth[] {
  return Array.from({ length: 12 }, (_, month) => {
    const point = new Date(Date.UTC(year, month, 1));
    return {
      key: monthKey(point),
      label: monthLabel(point),
      episodes: 0,
    };
  });
}

export async function GET() {
  try {
    const { user } = await userClient();

    // Reconcile before reading feature flags so existing Premium users receive
    // new Patch 20.2 capabilities without waiting for another payment event.
    const lifecycle = await getEffectivePremiumState(user.id);
    const entitlements = await getEffectiveUserEntitlements(user.id);

    if (!lifecycle.active || !entitlements.advancedStats) {
      throw new ApiError(
        403,
        'Расширенная статистика доступна с AnimeBox Premium.',
      );
    }

    const admin = adminClient();
    const now = new Date();
    const year = now.getUTCFullYear();
    const yearStart = new Date(Date.UTC(year, 0, 1)).toISOString();
    const nextYearStart = new Date(Date.UTC(year + 1, 0, 1)).toISOString();

    const [metrics, historyResult, yearHistoryResult] = await Promise.all([
      getTrustedProgressionMetrics(user.id),
      admin
        .from('episodes_history')
        .select('anime_id,episode_number,completed_at')
        .eq('user_id', user.id)
        .eq('completed', true)
        .not('completed_at', 'is', null)
        .order('completed_at', { ascending: false })
        .limit(2000),
      admin
        .from('episodes_history')
        .select('anime_id,episode_number,completed_at')
        .eq('user_id', user.id)
        .eq('completed', true)
        .not('completed_at', 'is', null)
        .gte('completed_at', yearStart)
        .lt('completed_at', nextYearStart)
        .order('completed_at', { ascending: false })
        .limit(5000),
    ]);

    if (historyResult.error) throw historyResult.error;
    if (yearHistoryResult.error) throw yearHistoryResult.error;

    const history = (historyResult.data ?? []) as HistoryRow[];
    const yearHistory = (yearHistoryResult.data ?? []) as HistoryRow[];
    const animeIds = [
      ...new Set(
        [...history, ...yearHistory]
          .map((item) => safeInt(item.anime_id))
          .filter((id) => id > 0),
      ),
    ];

    let catalog: CatalogRow[] = [];
    if (animeIds.length > 0) {
      const { data, error } = await admin
        .from('anime_catalog')
        .select('id,slug,title,poster_url,genres')
        .in('id', animeIds.slice(0, 1000));

      if (error) throw error;
      catalog = (data ?? []) as CatalogRow[];
    }

    const catalogById = new Map(
      catalog.map((item) => [Number(item.id), item] as const),
    );

    const thirtyDaysAgo = now.getTime() - 30 * 86_400_000;
    const activeDayKeys = new Set<string>();
    let episodes30 = 0;

    const months = sixMonthSkeleton(now);
    const monthByKey = new Map(months.map((item) => [item.key, item] as const));
    const titleCounts = new Map<
      number,
      { episodes: number; lastCompletedAt: string | null }
    >();
    const genreCounts = new Map<string, number>();

    for (const item of history) {
      const completedAt = item.completed_at;
      if (!completedAt) continue;

      const completedDate = new Date(completedAt);
      const completedMs = completedDate.getTime();
      if (!Number.isFinite(completedMs)) continue;

      if (completedMs >= thirtyDaysAgo) {
        episodes30 += 1;
        activeDayKeys.add(completedAt.slice(0, 10));
      }

      const monthly = monthByKey.get(monthKey(completedDate));
      if (monthly) monthly.episodes += 1;

      const animeId = safeInt(item.anime_id);
      if (!animeId) continue;

      const current = titleCounts.get(animeId) ?? {
        episodes: 0,
        lastCompletedAt: null,
      };
      current.episodes += 1;
      if (
        !current.lastCompletedAt ||
        completedMs > Date.parse(current.lastCompletedAt)
      ) {
        current.lastCompletedAt = completedAt;
      }
      titleCounts.set(animeId, current);

      const genres = catalogById.get(animeId)?.genres ?? [];
      for (const genre of genres) {
        const clean = typeof genre === 'string' ? genre.trim() : '';
        if (!clean) continue;
        genreCounts.set(clean, (genreCounts.get(clean) ?? 0) + 1);
      }
    }

    const topGenres: PremiumStatsTopGenre[] = [...genreCounts.entries()]
      .map(([genre, episodes]) => ({ genre, episodes }))
      .sort((left, right) => right.episodes - left.episodes || left.genre.localeCompare(right.genre, 'ru'))
      .slice(0, 8);

    const topTitles: PremiumStatsTopTitle[] = [...titleCounts.entries()]
      .map(([animeId, stat]) => {
        const anime = catalogById.get(animeId);
        return {
          animeId,
          slug: anime?.slug ?? null,
          title: anime?.title?.trim() || `Тайтл #${animeId}`,
          posterUrl: anime?.poster_url ?? null,
          episodes: stat.episodes,
          lastCompletedAt: stat.lastCompletedAt,
        };
      })
      .sort(
        (left, right) =>
          right.episodes - left.episodes ||
          Date.parse(right.lastCompletedAt || '1970-01-01') -
            Date.parse(left.lastCompletedAt || '1970-01-01'),
      )
      .slice(0, 8);

    const yearMonths = yearMonthSkeleton(year);
    const yearMonthByKey = new Map(
      yearMonths.map((item) => [item.key, item] as const),
    );
    const yearActiveDays = new Set<string>();
    const yearTitleCounts = new Map<
      number,
      { episodes: number; lastCompletedAt: string | null }
    >();
    const yearGenreCounts = new Map<string, number>();

    for (const item of yearHistory) {
      const completedAt = item.completed_at;
      if (!completedAt) continue;
      const completedDate = new Date(completedAt);
      const completedMs = completedDate.getTime();
      if (!Number.isFinite(completedMs)) continue;

      yearActiveDays.add(completedAt.slice(0, 10));
      const month = yearMonthByKey.get(monthKey(completedDate));
      if (month) month.episodes += 1;

      const animeId = safeInt(item.anime_id);
      if (!animeId) continue;

      const titleStat = yearTitleCounts.get(animeId) ?? {
        episodes: 0,
        lastCompletedAt: null,
      };
      titleStat.episodes += 1;
      if (
        !titleStat.lastCompletedAt ||
        completedMs > Date.parse(titleStat.lastCompletedAt)
      ) {
        titleStat.lastCompletedAt = completedAt;
      }
      yearTitleCounts.set(animeId, titleStat);

      for (const genre of catalogById.get(animeId)?.genres ?? []) {
        const clean = typeof genre === 'string' ? genre.trim() : '';
        if (!clean) continue;
        yearGenreCounts.set(clean, (yearGenreCounts.get(clean) ?? 0) + 1);
      }
    }

    const yearTopGenre: PremiumStatsTopGenre | null =
      [...yearGenreCounts.entries()]
        .map(([genre, episodes]) => ({ genre, episodes }))
        .sort(
          (left, right) =>
            right.episodes - left.episodes ||
            left.genre.localeCompare(right.genre, 'ru'),
        )[0] ?? null;

    const yearTopTitle: PremiumStatsTopTitle | null =
      [...yearTitleCounts.entries()]
        .map(([animeId, stat]) => {
          const anime = catalogById.get(animeId);
          return {
            animeId,
            slug: anime?.slug ?? null,
            title: anime?.title?.trim() || `Тайтл #${animeId}`,
            posterUrl: anime?.poster_url ?? null,
            episodes: stat.episodes,
            lastCompletedAt: stat.lastCompletedAt,
          };
        })
        .sort(
          (left, right) =>
            right.episodes - left.episodes ||
            Date.parse(right.lastCompletedAt || '1970-01-01') -
              Date.parse(left.lastCompletedAt || '1970-01-01'),
        )[0] ?? null;

    const busiestMonth =
      [...yearMonths].sort(
        (left, right) => right.episodes - left.episodes,
      )[0] ?? null;

    const recentHistory: PremiumStatsHistoryItem[] = history
      .slice(0, 120)
      .flatMap((item) => {
        if (!item.completed_at) return [];
        const animeId = safeInt(item.anime_id);
        if (!animeId) return [];
        const anime = catalogById.get(animeId);

        return [{
          animeId,
          slug: anime?.slug ?? null,
          title: anime?.title?.trim() || `Тайтл #${animeId}`,
          posterUrl: anime?.poster_url ?? null,
          episode: safeInt(item.episode_number),
          completedAt: item.completed_at,
        }];
      });

    const activeMs = safeInt(metrics?.active_ms);
    const payload: PremiumStatsPayload = {
      generatedAt: now.toISOString(),
      yearReview: {
        year,
        episodes: yearHistory.length,
        titles: yearTitleCounts.size,
        activeDays: yearActiveDays.size,
        topGenre: yearTopGenre,
        topTitle: yearTopTitle,
        busiestMonth,
        months: yearMonths,
      },
      overview: {
        episodes: safeInt(metrics?.episodes),
        titles: safeInt(metrics?.titles),
        watchMinutes: safeInt(metrics?.watch_minutes || metrics?.minutes),
        activeMs,
        comments: safeInt(metrics?.comments),
        longestStreak: safeInt(metrics?.longest_streak),
        activeDays30: activeDayKeys.size,
        episodes30,
        weeklyAverage30:
          Math.round((episodes30 / (30 / 7)) * 10) / 10,
      },
      topGenres,
      topTitles,
      months,
      activityTimestamps: history
        .slice(0, 1000)
        .flatMap((item) => item.completed_at ? [item.completed_at] : []),
      recentHistory,
    };

    return response(payload);
  } catch (error) {
    return failure(error);
  }
}
