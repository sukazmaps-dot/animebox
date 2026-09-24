import { readJsonBody } from '@/lib/community-server';
import { createClient } from '@/lib/supabase/server';
import {
  PRODUCT_CLIENT_EVENT_NAMES,
  trackProductEvents,
  type ProductClientEventName,
  type ProductEventInput,
} from '@/lib/product-events-server';
import { enforceIpRateLimit } from '@/lib/api-rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CLIENT_EVENTS = new Set<ProductClientEventName>(PRODUCT_CLIENT_EVENT_NAMES);
const SAFE_ID = /^[A-Za-z0-9._:-]{8,255}$/;
const SAFE_VERSION = /^[A-Za-z0-9._:-]{2,80}$/;

function text(value: unknown, max: number) {
  return typeof value === 'string' && value.trim()
    ? value.trim().slice(0, max)
    : null;
}

function metadata(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function safePath(value: unknown) {
  const path = text(value, 500);
  return path && path.startsWith('/') && !path.startsWith('//') ? path : null;
}

export async function POST(request: Request) {
  try {
    const limited = await enforceIpRateLimit(request, {
      scope: 'product_analytics_ip', limit: 180, windowSeconds: 60,
    });
    if (limited) return limited;

    const origin = request.headers.get('origin');
    if (origin && origin !== new URL(request.url).origin) {
      return Response.json({ ok: false }, { status: 403 });
    }

    const contentLength = Number(request.headers.get('content-length') || 0);
    if (contentLength > 32_000) {
      return Response.json({ ok: false }, { status: 413 });
    }

    const body = await readJsonBody(request, { maxBytes: 32_000 });
    const rawEvents = Array.isArray(body?.events) ? body.events.slice(0, 20) : [];
    if (!rawEvents.length) return Response.json({ ok: true, accepted: 0 });

    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    const userId = data.user?.id ?? null;

    const events: ProductEventInput[] = [];

    for (const raw of rawEvents) {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
      const item = raw as Record<string, unknown>;
      const eventName = text(item.eventName, 64) as ProductClientEventName | null;
      const eventId = text(item.eventId, 100);
      const sessionId = text(item.sessionId, 100);

      if (!eventName || !CLIENT_EVENTS.has(eventName)) continue;
      if (!eventId || !SAFE_ID.test(eventId) || !sessionId || !SAFE_ID.test(sessionId)) continue;
      if (eventName === 'registration_session' && !userId) continue;

      const entityId = text(item.entityId, 255);
      const entityType = text(item.entityType, 64);
      const source = text(item.source, 64);
      const anonymousRaw = text(item.anonymousId, 100);
      const recommendationRaw = text(item.recommendationId, 120);
      const recommendationSessionRaw = text(item.recommendationSessionId, 100);
      const algorithmRaw = text(item.algorithmVersion, 80);

      const anonymousId =
        anonymousRaw && SAFE_ID.test(anonymousRaw) ? anonymousRaw : null;
      const recommendationId =
        recommendationRaw && SAFE_ID.test(recommendationRaw)
          ? recommendationRaw
          : null;
      const recommendationSessionId =
        recommendationSessionRaw && SAFE_ID.test(recommendationSessionRaw)
          ? recommendationSessionRaw
          : null;
      const algorithmVersion =
        algorithmRaw && SAFE_VERSION.test(algorithmRaw)
          ? algorithmRaw
          : null;

      events.push({
        eventName,
        userId,
        sessionId,
        anonymousId,
        source,
        path: safePath(item.path),
        entityType,
        entityId,
        recommendationId,
        recommendationSessionId,
        algorithmVersion,
        metadata: metadata(item.metadata),
        dedupeKey: `client:${sessionId}:${eventId}`,
      });
    }

    const stored = await trackProductEvents(events);
    return Response.json(
      { ok: true, accepted: stored ? events.length : 0 },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (error) {
    console.error('[Product analytics] client endpoint', error);
    return Response.json({ ok: true, accepted: 0 });
  }
}
