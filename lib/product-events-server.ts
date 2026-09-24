import 'server-only';

import { createSupabaseAdmin } from '@/lib/supabase/admin';

export { PRODUCT_CLIENT_EVENT_NAMES } from '@/lib/product-event-names';
export type { ProductClientEventName } from '@/lib/product-event-names';

export type ProductEventInput = {
  eventName: string;
  userId?: string | null;
  sessionId?: string | null;
  anonymousId?: string | null;
  source?: string | null;
  path?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  recommendationId?: string | null;
  recommendationSessionId?: string | null;
  algorithmVersion?: string | null;
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
    anonymous_id: compactText(event.anonymousId, 100),
    source: compactText(event.source, 64),
    path: compactText(event.path, 500),
    entity_type: compactText(event.entityType, 64),
    entity_id: compactText(event.entityId, 255),
    recommendation_id: compactText(event.recommendationId, 120),
    recommendation_session_id: compactText(event.recommendationSessionId, 100),
    algorithm_version: compactText(event.algorithmVersion, 80),
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
    let write = await admin.from('product_events').upsert(rows, {
      onConflict: 'dedupe_key',
      ignoreDuplicates: true,
    });

    if (
      write.error &&
      /anonymous_id|recommendation_id|recommendation_session_id|algorithm_version|schema cache/i.test(
        write.error.message,
      )
    ) {
      const legacyRows = rows.map((row) => {
        const {
          anonymous_id,
          recommendation_id,
          recommendation_session_id,
          algorithm_version,
          ...legacy
        } = row;

        return {
          ...legacy,
          metadata: compactMetadata({
            ...(legacy.metadata ?? {}),
            anonymous_id,
            recommendation_id,
            recommendation_session_id,
            algorithm_version,
          }),
        };
      });

      write = await admin.from('product_events').upsert(legacyRows, {
        onConflict: 'dedupe_key',
        ignoreDuplicates: true,
      });
    }

    if (write.error) {
      console.error('[Product analytics] event insert failed', write.error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('[Product analytics] event writer unavailable', error);
    return false;
  }
}
