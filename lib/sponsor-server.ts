import 'server-only';

import { adminClient } from '@/lib/community-server';
import {
  makeSponsorStatus,
  resolveSponsorTier,
  type SponsorStatus,
} from '@/lib/sponsor';
import {
  getSponsorPreferenceRows,
  sponsorPublicCosmeticsFromRow,
  type PreferenceRow,
} from '@/lib/sponsor-benefits-server';

const DIRECTORY_VIEW = 'sponsor_directory_v3';

export function sponsorStatusFromSnapshot(
  totalStars: number,
  preferences?: PreferenceRow | null,
): SponsorStatus | null {
  const tier = resolveSponsorTier(totalStars);
  if (!tier) return null;

  return makeSponsorStatus(
    totalStars,
    sponsorPublicCosmeticsFromRow(preferences, tier),
  );
}

export async function getSponsorTotal(userId: string): Promise<number> {
  const admin = adminClient();
  let query = await admin
    .from(DIRECTORY_VIEW)
    .select('total_stars')
    .eq('user_id', userId)
    .maybeSingle();

  if (query.error && (query.error.code === '42P01' || query.error.code === 'PGRST205')) {
    query = await admin
      .from('sponsor_directory_v2')
      .select('total_stars')
      .eq('user_id', userId)
      .maybeSingle();
  }

  if (query.error) throw query.error;
  return Number(query.data?.total_stars ?? 0);
}

export async function getSponsorStatuses(
  userIds: string[],
): Promise<Map<string, SponsorStatus>> {
  const ids = [...new Set(userIds.filter(Boolean))];
  const result = new Map<string, SponsorStatus>();
  if (!ids.length) return result;

  const admin = adminClient();
  let directory = await admin
    .from(DIRECTORY_VIEW)
    .select('user_id,total_stars')
    .in('user_id', ids);

  if (directory.error && (directory.error.code === '42P01' || directory.error.code === 'PGRST205')) {
    directory = await admin
      .from('sponsor_directory_v2')
      .select('user_id,total_stars')
      .in('user_id', ids);
  }

  if (directory.error) {
    console.error('[Sponsor] directory unavailable', directory.error);
    return result;
  }

  const preferences = await getSponsorPreferenceRows(ids);

  for (const row of directory.data ?? []) {
    if (!row.user_id) continue;
    const totalStars = Number(row.total_stars ?? 0);
    const status = sponsorStatusFromSnapshot(
      totalStars,
      preferences.get(row.user_id),
    );
    if (status) result.set(row.user_id, status);
  }

  return result;
}

export async function getSponsorStatus(
  userId: string,
): Promise<SponsorStatus | null> {
  const statuses = await getSponsorStatuses([userId]);
  return statuses.get(userId) ?? null;
}
