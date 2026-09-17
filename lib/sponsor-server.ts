import 'server-only';
import { adminClient } from '@/lib/community-server';
import { makeSponsorStatus, type SponsorStatus } from '@/lib/sponsor';

export async function getSponsorTotal(userId: string): Promise<number> {
 const { data, error } = await adminClient().from('sponsor_directory_v2').select('total_stars').eq('user_id', userId).maybeSingle();
 if (error) throw error;
 return Number(data?.total_stars ?? 0);
}
export async function getSponsorStatuses(userIds: string[]): Promise<Map<string, SponsorStatus>> {
 const ids = [...new Set(userIds.filter(Boolean))];
 const result = new Map<string, SponsorStatus>();
 if (!ids.length) return result;
 const { data, error } = await adminClient().from('sponsor_directory_v2').select('user_id,total_stars').in('user_id', ids);
 if (error) { console.error('[Sponsor] cache unavailable', error); return result; }
 for (const row of data ?? []) {
  const status = makeSponsorStatus(Number(row.total_stars));
  if (status) result.set(row.user_id, status);
 }
 return result;
}
export async function getSponsorStatus(userId: string): Promise<SponsorStatus | null> {
 return makeSponsorStatus(await getSponsorTotal(userId));
}
