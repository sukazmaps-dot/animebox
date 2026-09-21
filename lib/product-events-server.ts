import 'server-only';

import { createSupabaseAdmin } from '@/lib/supabase/admin';

export const PRODUCT_CLIENT_EVENT_NAMES = [
  'page_view',
  'anime_open',
  'chat_open',
  'registration_session',
  'auth_modal_opened',
  'auth_mode_changed',
  'auth_completed',
  'onboarding_started',
  'onboarding_completed',
  'personal_home_activation',
  'player_source_selected',
  'player_source_ready',
  'player_source_failed',
  'player_source_switched',
  'player_started',
  'continue_watching_impression',
  'continue_watching_click',
  'continue_watching_started',
  'personal_home_view',
  'personal_schedule_impression',
  'personal_schedule_click',
  'notification_center_open',
  'notification_subscription_toggle',
  'recommendation_impression',
  'recommendation_dwell',
  'recommendation_click',
  'recommendation_planned',
  'recommendation_dismiss',
  'recommendation_mood_change',
  'recommendation_started',
  'recommendation_completed',
  'smart_discovery_search',
] as const;

export type ProductClientEventName = (typeof PRODUCT_CLIENT_EVENT_NAMES)[number];

export type ProductEventInput = {
  eventName: string;
  userId?: string | null;
  sessionId?: string | null;
  source?: string | null;
  path?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  metadata?: Record<string, unknown> | null;
  dedupeKey?: string | null;
  createdAt?: string | null;
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

function normalizeEvent(event: ProductEventInput) {
  return {
    event_name: compactText(event.eventName, 64),
    user_id: compactText(event.userId, 64),
    session_id: compactText(event.sessionId, 100),
    source: compactText(event.source, 64),
    path: compactText(event.path, 500),
    entity_type: compactText(event.entityType, 64),
    entity_id: compactText(event.entityId, 255),
    metadata: compactMetadata(event.metadata),
    dedupe_key: compactText(event.dedupeKey, 255),
    ...(event.createdAt ? { created_at: event.createdAt } : {}),
  };
}

/**
 * Best-effort product telemetry. Product UX must not fail when analytics storage
 * is temporarily unavailable or the migration has not been applied yet.
 */
export async function trackProductEvents(events: ProductEventInput[]): Promise<boolean> {
  if (!events.length) return true;

  try {
    const admin = createSupabaseAdmin();
    const rows = events.slice(0, 50).map(normalizeEvent);
    const { error } = await admin.from('product_events').upsert(rows, {
      onConflict: 'dedupe_key',
      ignoreDuplicates: true,
    });

    if (error) {
      console.error('[Product analytics] event insert failed', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('[Product analytics] event writer unavailable', error);
    return false;
  }
}
