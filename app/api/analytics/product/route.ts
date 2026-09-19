import { createClient } from '@/lib/supabase/server';
import {
  PRODUCT_CLIENT_EVENT_NAMES,
  trackProductEvents,
  type ProductClientEventName,
  type ProductEventInput,
} from '@/lib/product-events-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CLIENT_EVENTS = new Set<ProductClientEventName>(PRODUCT_CLIENT_EVENT_NAMES);
const SAFE_ID = /^[A-Za-z0-9._:-]{8,255}$/;

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
    const origin = request.headers.get('origin');
    if (origin && origin !== new URL(request.url).origin) {
      return Response.json({ ok: false }, { status: 403 });
    }

    const contentLength = Number(request.headers.get('content-length') || 0);
    if (contentLength > 32_000) {
      return Response.json({ ok: false }, { status: 413 });
    }

    const body = (await request.json().catch(() => null)) as { events?: unknown } | null;
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

      events.push({
        eventName,
        userId,
        sessionId,
        source,
        path: safePath(item.path),
        entityType,
        entityId,
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
