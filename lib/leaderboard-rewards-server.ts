import 'server-only';

import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { sendTelegramMessage } from '@/lib/notifications-server';
import {
  SEASON_FRAME_KEYS,
  isSeasonFrameKey,
  rewardTierForPlace,
  seasonFramePriority,
  type LeaderboardPeriodType,
  type SeasonFrameKey,
} from '@/lib/leaderboard-rewards';

export type LeaderboardRewardRecord = {
  id: string;
  seasonId: string;
  periodKey: string;
  startsAt: string;
  endsAt: string;
  periodType: LeaderboardPeriodType;
  place: number;
  rewardKey: string;
  premiumDays: number;
  cosmeticKey: SeasonFrameKey | null;
  status: 'pending' | 'claimed';
  createdAt: string;
  claimedAt: string | null;
};

async function notifyLeaderboardRewardWinners(
  rows: Array<{
    user_id: string;
    place: number;
    premium_days: number;
    cosmetic_key: SeasonFrameKey;
    period_type?: LeaderboardPeriodType;
  }>,
) {
  if (!rows.length) return;

  const admin = createSupabaseAdmin();
  const { data: profiles, error } = await admin
    .from('profiles')
    .select('id,telegram_id')
    .in('id', rows.map((row) => row.user_id));

  if (error) {
    console.warn('[Leaderboard rewards] Telegram profile lookup failed:', error);
    return;
  }

  const telegramByUser = new Map(
    (profiles ?? [])
      .filter((row) => row.telegram_id != null)
      .map((row) => [String(row.id), String(row.telegram_id)]),
  );

  const appUrl =
    (process.env.NEXT_PUBLIC_SITE_URL || 'https://youranimebox.com')
      .replace(/\/$/, '');

  await Promise.allSettled(
    rows.map(async (row) => {
      const chatId = telegramByUser.get(row.user_id);
      if (!chatId) return;

      const periodType: LeaderboardPeriodType = row.period_type === 'month' ? 'month' : 'week';
      const tier = rewardTierForPlace(row.place, periodType);
      if (!tier) return;

      const premium =
        row.premium_days > 0
          ? `\nPremium: <b>${row.premium_days} ${
              row.premium_days === 1
                ? 'день'
                : row.premium_days < 5
                  ? 'дня'
                  : 'дней'
            }</b>`
          : '';

      await sendTelegramMessage({
        chatId,
        text:
          `🏆 <b>AnimeBox League — итоги ${periodType === 'month' ? 'месяца' : 'недели'}</b>\n` +
          `Твоё место: <b>#${row.place}</b>\n` +
          `Награда: <b>${tier.title}</b>${premium}\n\n` +
          `Приз уже закреплён за аккаунтом. Забери его в AnimeBox.`,
        webAppUrl: `${appUrl}/leaderboard`,
        buttonText: 'Забрать приз',
      });
    }),
  );
}

function schemaMissing(message: string) {
  return /leaderboard_season_rewards|profile_cosmetic_(unlocks|preferences)|expires_at|schema cache|relation/i.test(message);
}

export async function materializeLeaderboardSeasonRewards(seasonId: string) {
  const admin = createSupabaseAdmin();
  const { data: season, error: seasonError } = await admin
    .from('leaderboard_seasons')
    .select('id,period_type,period_key,starts_at,ends_at')
    .eq('id', seasonId)
    .maybeSingle();

  if (seasonError) throw seasonError;
  if (!season || (season.period_type !== 'week' && season.period_type !== 'month')) {
    return { seasonId, inserted: 0, skipped: true };
  }

  const periodType: LeaderboardPeriodType = season.period_type === 'month' ? 'month' : 'week';

  const { data: entries, error: entriesError } = await admin
    .from('leaderboard_season_entries')
    .select('user_id,place')
    .eq('season_id', seasonId)
    .lte('place', 10)
    .order('place', { ascending: true });

  if (entriesError) throw entriesError;

  const userIds = (entries ?? []).map((entry) => String(entry.user_id));
  if (!userIds.length) return { seasonId, inserted: 0, skipped: false };

  const { data: existing, error: existingError } = await admin
    .from('leaderboard_season_rewards')
    .select('user_id')
    .eq('season_id', seasonId)
    .in('user_id', userIds);

  if (existingError) {
    if (schemaMissing(existingError.message)) {
      return { seasonId, inserted: 0, skipped: true, schemaMissing: true };
    }
    throw existingError;
  }

  const existingUsers = new Set((existing ?? []).map((row) => String(row.user_id)));
  const rows = (entries ?? []).flatMap((entry) => {
    const place = Number(entry.place);
    const tier = rewardTierForPlace(place, periodType);
    const userId = String(entry.user_id);
    if (!tier || existingUsers.has(userId)) return [];

    return [{
      season_id: seasonId,
      user_id: userId,
      place,
      reward_key: tier.rewardKey,
      premium_days: tier.premiumDays,
      cosmetic_key: tier.cosmeticKey,
      status: 'pending',
      period_type: periodType,
    }];
  });

  if (!rows.length) return { seasonId, inserted: 0, skipped: false };

  const dbRows = rows.map((row) => ({
    season_id: row.season_id,
    user_id: row.user_id,
    place: row.place,
    reward_key: row.reward_key,
    premium_days: row.premium_days,
    cosmetic_key: row.cosmetic_key,
    status: row.status,
  }));

  const { error: insertError } = await admin
    .from('leaderboard_season_rewards')
    .upsert(dbRows, {
      onConflict: 'season_id,user_id',
      ignoreDuplicates: true,
    });

  if (insertError) throw insertError;

  void notifyLeaderboardRewardWinners(rows).catch((notifyError) => {
    console.warn('[Leaderboard rewards] Telegram notification failed:', notifyError);
  });

  return { seasonId, inserted: rows.length, skipped: false };
}

export async function listLeaderboardRewardsForUser(userId: string) {
  const admin = createSupabaseAdmin();
  const { data, error } = await admin
    .from('leaderboard_season_rewards')
    .select('id,season_id,place,reward_key,premium_days,cosmetic_key,status,created_at,claimed_at,leaderboard_seasons!inner(period_key,starts_at,ends_at,period_type)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(24);

  if (error) {
    if (schemaMissing(error.message)) return [];
    throw error;
  }

  return (data ?? []).map((row) => {
    const joined = Array.isArray(row.leaderboard_seasons)
      ? row.leaderboard_seasons[0]
      : row.leaderboard_seasons;
    const cosmeticKey = isSeasonFrameKey(row.cosmetic_key)
      ? row.cosmetic_key
      : null;

    return {
      id: String(row.id),
      seasonId: String(row.season_id),
      periodKey: String(joined?.period_key ?? ''),
      startsAt: String(joined?.starts_at ?? row.created_at),
      endsAt: String(joined?.ends_at ?? row.created_at),
      periodType: joined?.period_type === 'month' ? 'month' as const : 'week' as const,
      place: Number(row.place),
      rewardKey: String(row.reward_key),
      premiumDays: Number(row.premium_days) || 0,
      cosmeticKey,
      status: row.status === 'claimed' ? 'claimed' as const : 'pending' as const,
      createdAt: String(row.created_at),
      claimedAt: typeof row.claimed_at === 'string' ? row.claimed_at : null,
    } satisfies LeaderboardRewardRecord;
  });
}

export type ActiveSeasonFrameUnlock = {
  key: SeasonFrameKey;
  expiresAt: string;
};

export async function listActiveSeasonFrameUnlocks(
  userId: string,
): Promise<ActiveSeasonFrameUnlock[]> {
  const admin = createSupabaseAdmin();
  const now = new Date().toISOString();
  const { data, error } = await admin
    .from('profile_cosmetic_unlocks')
    .select('cosmetic_key,expires_at')
    .eq('user_id', userId)
    .in('cosmetic_key', [...SEASON_FRAME_KEYS])
    .gt('expires_at', now)
    .order('expires_at', { ascending: false });

  if (error) {
    if (schemaMissing(error.message)) return [];
    throw error;
  }

  return (data ?? []).flatMap((row) => {
    if (!isSeasonFrameKey(row.cosmetic_key) || typeof row.expires_at !== 'string') return [];
    return [{ key: row.cosmetic_key, expiresAt: row.expires_at }];
  });
}

export async function getUnlockedSeasonFrames(userId: string): Promise<SeasonFrameKey[]> {
  return (await listActiveSeasonFrameUnlocks(userId)).map((item) => item.key);
}

function highestPriorityFrame(frames: ActiveSeasonFrameUnlock[]) {
  return [...frames].sort((a, b) => {
    const priority = seasonFramePriority(b.key) - seasonFramePriority(a.key);
    if (priority !== 0) return priority;
    return Date.parse(b.expiresAt) - Date.parse(a.expiresAt);
  })[0]?.key ?? null;
}

export async function getSelectedSeasonFrame(userId: string): Promise<SeasonFrameKey | null> {
  const admin = createSupabaseAdmin();
  const [{ data, error }, active] = await Promise.all([
    admin
      .from('profile_cosmetic_preferences')
      .select('season_frame_key')
      .eq('user_id', userId)
      .maybeSingle(),
    listActiveSeasonFrameUnlocks(userId),
  ]);

  if (error) {
    if (schemaMissing(error.message)) return highestPriorityFrame(active);
    throw error;
  }

  const selected = isSeasonFrameKey(data?.season_frame_key)
    ? data.season_frame_key
    : null;
  if (selected && active.some((item) => item.key === selected)) return selected;

  const fallback = highestPriorityFrame(active);
  if (fallback !== selected) {
    await admin
      .from('profile_cosmetic_preferences')
      .upsert({
        user_id: userId,
        season_frame_key: fallback,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });
  }
  return fallback;
}

export async function getSelectedSeasonFrames(userIds: string[]) {
  const ids = [...new Set(userIds.filter(Boolean))];
  const result = new Map<string, SeasonFrameKey>();
  if (!ids.length) return result;

  const admin = createSupabaseAdmin();
  const now = new Date().toISOString();
  const [{ data: preferences, error: preferenceError }, { data: unlocks, error: unlockError }] = await Promise.all([
    admin
      .from('profile_cosmetic_preferences')
      .select('user_id,season_frame_key')
      .in('user_id', ids),
    admin
      .from('profile_cosmetic_unlocks')
      .select('user_id,cosmetic_key,expires_at')
      .in('user_id', ids)
      .in('cosmetic_key', [...SEASON_FRAME_KEYS])
      .gt('expires_at', now),
  ]);

  if (preferenceError || unlockError) {
    const message = preferenceError?.message ?? unlockError?.message ?? '';
    if (schemaMissing(message)) return result;
    throw preferenceError ?? unlockError;
  }

  const activeByUser = new Map<string, ActiveSeasonFrameUnlock[]>();
  for (const row of unlocks ?? []) {
    if (!isSeasonFrameKey(row.cosmetic_key) || typeof row.expires_at !== 'string') continue;
    const userId = String(row.user_id);
    const list = activeByUser.get(userId) ?? [];
    list.push({ key: row.cosmetic_key, expiresAt: row.expires_at });
    activeByUser.set(userId, list);
  }

  const preferenceByUser = new Map(
    (preferences ?? []).map((row) => [String(row.user_id), row.season_frame_key]),
  );

  for (const id of ids) {
    const active = activeByUser.get(id) ?? [];
    const selected = preferenceByUser.get(id);
    if (isSeasonFrameKey(selected) && active.some((item) => item.key === selected)) {
      result.set(id, selected);
      continue;
    }
    const fallback = highestPriorityFrame(active);
    if (fallback) result.set(id, fallback);
  }

  return result;
}

export async function selectSeasonFrame(userId: string, frame: SeasonFrameKey | null) {
  const admin = createSupabaseAdmin();

  if (frame) {
    const unlocked = await getUnlockedSeasonFrames(userId);
    if (!unlocked.includes(frame)) {
      throw new Error('SEASON_FRAME_LOCKED');
    }
  }

  const { error } = await admin
    .from('profile_cosmetic_preferences')
    .upsert({
      user_id: userId,
      season_frame_key: frame,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });

  if (error) throw error;
  return frame;
}
