import 'server-only';

import { createSupabaseAdmin } from '@/lib/supabase/admin';
import {
  EMPTY_ENTITLEMENTS,
  isEntitlementKey,
  type Entitlements,
} from '@/lib/payments/entitlements';

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
