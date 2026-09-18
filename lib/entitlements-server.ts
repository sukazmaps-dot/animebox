import 'server-only';

import { createSupabaseAdmin } from '@/lib/supabase/admin';
import {
  EMPTY_ENTITLEMENTS,
  isEntitlementKey,
  type Entitlements,
} from '@/lib/payments/entitlements';
import { getSponsorTotal } from '@/lib/sponsor-server';
import { resolveSponsorTier, sponsorAdFree } from '@/lib/sponsor';
import { publicIdentityRoleFor } from '@/lib/identity-server';

export async function getUserEntitlements(userId: string): Promise<Entitlements> {
  const supabase = createSupabaseAdmin();
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from('user_entitlements')
    .select('entitlement,active,starts_at,expires_at')
    .eq('user_id', userId)
    .eq('active', true)
    .lte('starts_at', now)
    .or(`expires_at.is.null,expires_at.gt.${now}`);

  if (error) throw error;

  const result: Entitlements = { ...EMPTY_ENTITLEMENTS };
  for (const row of data ?? []) {
    if (typeof row.entitlement === 'string' && isEntitlementKey(row.entitlement)) {
      result[row.entitlement] = true;
    }
  }

  return result;
}

/**
 * Effective entitlements are the single source of truth for product access.
 *
 * Sources can coexist:
 * - Premium rows in user_entitlements;
 * - legacy sponsor compatibility (100+ Stars stays ad-free);
 * - staff compatibility (owner/admin/moderator stays ad-free).
 *
 * This lets AnimeBox migrate features away from direct sponsor-tier checks
 * without taking already-earned benefits away from existing users.
 */
export async function getEffectiveUserEntitlements(userId: string): Promise<Entitlements> {
  const [stored, sponsorTotal] = await Promise.all([
    getUserEntitlements(userId),
    getSponsorTotal(userId).catch(() => 0),
  ]);

  const result: Entitlements = { ...stored };
  const sponsorTier = resolveSponsorTier(sponsorTotal);
  const role = publicIdentityRoleFor(userId);

  if (sponsorAdFree(sponsorTier) || role) {
    result.adFree = true;
  }

  return result;
}
