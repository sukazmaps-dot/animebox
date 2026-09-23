import { readJsonBody } from '@/lib/community-server';
import { createClient } from '@/lib/supabase/server';
import {
  trackMonetizationEvents,
  type MonetizationEventInput,
  type MonetizationEventName,
} from '@/lib/monetization-events-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CLIENT_EVENTS = new Set<MonetizationEventName>([
  'premium_page_view',
  'premium_checkout_started',
  'ad_slot_requested',
  'ad_slot_filled',
  'ad_slot_impression',
  'ad_slot_no_fill',
  'ad_slot_clicked',
]);

function text(value: unknown, max: number) {
  return typeof value === 'string' && value.trim()
    ? value.trim().slice(0, max)
    : null;
}

function numberOrNull(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function metadata(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
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

    const body = await readJsonBody(request, { maxBytes: 32_000 });
    const rawEvents = Array.isArray(body?.events) ? body.events.slice(0, 20) : [];
    if (!rawEvents.length) {
      return Response.json({ ok: true, accepted: 0 });
    }

    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    const userId = data.user?.id ?? null;

    const events: MonetizationEventInput[] = [];
    for (const raw of rawEvents) {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
      const event = raw as Record<string, unknown>;
      const eventName = text(event.eventName, 64) as MonetizationEventName | null;
      if (!eventName || !CLIENT_EVENTS.has(eventName)) continue;

      events.push({
        eventName,
        userId,
        sessionId: text(event.sessionId, 100),
        source: text(event.source, 64),
        entityId: text(event.entityId, 255),
        value: numberOrNull(event.value),
        currency: text(event.currency, 12),
        metadata: metadata(event.metadata),
      });
    }

    const stored = await trackMonetizationEvents(events);
    return Response.json(
      { ok: true, accepted: stored ? events.length : 0 },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (error) {
    console.error('[Monetization analytics] client event endpoint', error);
    // Telemetry must never become a UX blocker.
    return Response.json({ ok: true, accepted: 0 });
  }
}
