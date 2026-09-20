import 'server-only';

import { createSupabaseAdmin } from '@/lib/supabase/admin';

export const MONETIZATION_EVENT_NAMES = [
  'premium_page_view',
  'premium_checkout_started',
  'premium_payment_success',
  'premium_activated',
  'premium_expired',
  'boosty_check',
  'boosty_verified',
  'ad_slot_requested',
  'ad_slot_filled',
  'ad_slot_impression',
  'ad_slot_no_fill',
  'ad_slot_clicked',
] as const;

export type MonetizationEventName = (typeof MONETIZATION_EVENT_NAMES)[number];

export type MonetizationEventInput = {
  eventName: MonetizationEventName;
  userId?: string | null;
  sessionId?: string | null;
  source?: string | null;
  entityId?: string | null;
  value?: number | null;
  currency?: string | null;
  metadata?: Record<string, unknown> | null;
  dedupeKey?: string | null;
};

function compactText(value: string | null | undefined, max: number) {
  const text = value?.trim();
  return text ? text.slice(0, max) : null;
}

function compactMetadata(value: Record<string, unknown> | null | undefined) {
  if (!value) return {};

  try {
    const serialized = JSON.stringify(value);
    if (serialized.length <= 3_000) return value;
    return { truncated: true, original_bytes: serialized.length };
  } catch {
    return { invalid_metadata: true };
  }
}

function normalizeEvent(event: MonetizationEventInput) {
  const numeric = Number(event.value);

  return {
    event_name: event.eventName,
    user_id: compactText(event.userId, 64),
    session_id: compactText(event.sessionId, 100),
    source: compactText(event.source, 64),
    entity_id: compactText(event.entityId, 255),
    value_numeric: Number.isFinite(numeric) ? numeric : null,
    currency: compactText(event.currency, 12)?.toUpperCase() ?? null,
    metadata: compactMetadata(event.metadata),
    dedupe_key: compactText(event.dedupeKey, 255),
  };
}

/**
 * Best-effort telemetry writer. Monetization must never fail because analytics
 * storage is temporarily unavailable or the Stage 4 migration was not run yet.
 * Dedupe keys are handled by a unique nullable column, allowing retry-safe
 * server events while keeping ordinary page/ad events append-only.
 */
export async function trackMonetizationEvents(
  events: MonetizationEventInput[],
): Promise<boolean> {
  if (!events.length) return true;

  try {
    const admin = createSupabaseAdmin();
    const rows = events.slice(0, 50).map(normalizeEvent);
    const { error } = await admin.from('monetization_events').upsert(rows, {
      onConflict: 'dedupe_key',
      ignoreDuplicates: true,
    });

    if (error) {
      console.error('[Monetization analytics] event insert failed', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('[Monetization analytics] event writer unavailable', error);
    return false;
  }
}

export async function trackMonetizationEvent(
  event: MonetizationEventInput,
): Promise<boolean> {
  return trackMonetizationEvents([event]);
}
