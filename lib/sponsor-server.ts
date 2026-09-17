import 'server-only';

import { adminClient } from '@/lib/community-server';
import { makeSponsorStatus, type SponsorStatus } from '@/lib/sponsor';

type ProfileLinkRow = {
  id: string;
  telegram_id: number | string | null;
};

type PaymentRow = {
  id: string;
  user_id: string | null;
  telegram_id: number | string;
  amount: number | string;
};

function telegramKey(value: number | string | null | undefined) {
  if (value === null || value === undefined) return null;
  const key = String(value).trim();
  return key || null;
}

/**
 * Returns sponsor states for many users in a small number of queries.
 *
 * We count both payments already linked by user_id and older Stars payments
 * that were recorded only with telegram_id before the profile link existed.
 */
export async function getSponsorStatuses(
  userIds: string[],
): Promise<Map<string, SponsorStatus>> {
  const ids = [...new Set(userIds.filter(Boolean))];
  const result = new Map<string, SponsorStatus>();

  if (!ids.length) return result;

  try {
    const admin = adminClient();

    const profilesResult = await admin
      .from('profiles')
      .select('id,telegram_id')
      .in('id', ids);

    if (profilesResult.error) {
      console.error('[Sponsor] profile links:', profilesResult.error);
    }

    const profiles = (profilesResult.error
      ? []
      : profilesResult.data ?? []) as ProfileLinkRow[];

    const telegramToUser = new Map<string, string>();
    for (const profile of profiles) {
      const key = telegramKey(profile.telegram_id);
      if (key) telegramToUser.set(key, profile.id);
    }

    const telegramIds = [...telegramToUser.keys()];

    const [byUserResult, byTelegramResult] = await Promise.all([
      admin
        .from('star_payments')
        .select('id,user_id,telegram_id,amount')
        .in('user_id', ids),
      telegramIds.length
        ? admin
            .from('star_payments')
            .select('id,user_id,telegram_id,amount')
            .in('telegram_id', telegramIds)
        : Promise.resolve({ data: [] as PaymentRow[], error: null }),
    ]);

    if (byUserResult.error) {
      // Backward-compatible with projects where monetization SQL has not yet
      // been applied: the rest of AnimeBox must continue to render normally.
      console.error('[Sponsor] payments by user:', byUserResult.error);
    }
    if (byTelegramResult.error) {
      console.error('[Sponsor] payments by Telegram:', byTelegramResult.error);
    }

    const paymentsById = new Map<string, PaymentRow>();
    for (const raw of [
      ...(byUserResult.error ? [] : byUserResult.data ?? []),
      ...(byTelegramResult.error ? [] : byTelegramResult.data ?? []),
    ]) {
      const row = raw as PaymentRow;
      paymentsById.set(row.id, row);
    }

    const totals = new Map<string, number>();

    for (const payment of paymentsById.values()) {
      let userId = payment.user_id;

      if (!userId || !ids.includes(userId)) {
        const key = telegramKey(payment.telegram_id);
        userId = key ? telegramToUser.get(key) ?? null : null;
      }

      if (!userId || !ids.includes(userId)) continue;

      const amount = Math.max(0, Math.floor(Number(payment.amount) || 0));
      totals.set(userId, (totals.get(userId) ?? 0) + amount);
    }

    for (const [userId, totalStars] of totals) {
      const sponsor = makeSponsorStatus(totalStars);
      if (sponsor) result.set(userId, sponsor);
    }
  } catch (error) {
    console.error('[Sponsor] enrichment failed:', error);
  }

  return result;
}

export async function getSponsorStatus(
  userId: string,
): Promise<SponsorStatus | null> {
  return (await getSponsorStatuses([userId])).get(userId) ?? null;
}
