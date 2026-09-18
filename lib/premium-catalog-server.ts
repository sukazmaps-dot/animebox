import 'server-only';

import { createSupabaseAdmin } from '@/lib/supabase/admin';
import {
  PREMIUM_PLAN_DEFINITIONS,
  type PremiumCatalogPlan,
  type PremiumPlanId,
} from '@/lib/premium';

function numberOrNull(value: unknown) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export async function getPremiumCatalog(): Promise<PremiumCatalogPlan[]> {
  const admin = createSupabaseAdmin();
  const codes = Object.values(PREMIUM_PLAN_DEFINITIONS).map((item) => item.productCode);

  const { data, error } = await admin
    .from('payment_products')
    .select('code,active,metadata')
    .in('code', codes);

  if (error) throw error;

  const rows = new Map((data ?? []).map((row) => [row.code, row]));

  return (Object.entries(PREMIUM_PLAN_DEFINITIONS) as [
    PremiumPlanId,
    (typeof PREMIUM_PLAN_DEFINITIONS)[PremiumPlanId],
  ][]).map(([id, definition]) => {
    const row = rows.get(definition.productCode);
    const metadata =
      row?.metadata && typeof row.metadata === 'object'
        ? (row.metadata as Record<string, unknown>)
        : {};

    return {
      id,
      productCode: definition.productCode,
      label: definition.label,
      durationDays: numberOrNull(metadata.duration_days) ?? definition.durationDays,
      active: Boolean(row?.active),
      telegramStarsAmount: numberOrNull(metadata.telegram_stars_amount),
    };
  });
}

export async function getPremiumPlan(planId: PremiumPlanId) {
  const plans = await getPremiumCatalog();
  return plans.find((plan) => plan.id === planId) ?? null;
}

export async function updatePremiumPlanConfig({
  planId,
  telegramStarsAmount,
  active,
}: {
  planId: PremiumPlanId;
  telegramStarsAmount: number | null;
  active: boolean;
}) {
  const definition = PREMIUM_PLAN_DEFINITIONS[planId];
  const admin = createSupabaseAdmin();

  const { data: existing, error: lookupError } = await admin
    .from('payment_products')
    .select('metadata')
    .eq('code', definition.productCode)
    .single();

  if (lookupError) throw lookupError;

  const metadata =
    existing?.metadata && typeof existing.metadata === 'object'
      ? (existing.metadata as Record<string, unknown>)
      : {};

  const nextMetadata = {
    ...metadata,
    duration_days: definition.durationDays,
    telegram_stars_amount: telegramStarsAmount,
  };

  const { error } = await admin
    .from('payment_products')
    .update({
      active,
      metadata: nextMetadata,
      updated_at: new Date().toISOString(),
    })
    .eq('code', definition.productCode);

  if (error) throw error;

  return {
    id: planId,
    productCode: definition.productCode,
    label: definition.label,
    durationDays: definition.durationDays,
    active,
    telegramStarsAmount,
  } satisfies PremiumCatalogPlan;
}
