'use client';

type ClientEventName =
  | 'premium_page_view'
  | 'premium_checkout_started'
  | 'ad_slot_requested'
  | 'ad_slot_filled'
  | 'ad_slot_impression'
  | 'ad_slot_no_fill'
  | 'ad_slot_clicked';

type ClientEvent = {
  eventName: ClientEventName;
  sessionId: string;
  source?: string;
  entityId?: string;
  value?: number;
  currency?: string;
  metadata?: Record<string, unknown>;
};

type TrackOptions = Omit<ClientEvent, 'eventName' | 'sessionId'> & {
  flush?: boolean;
};

const SESSION_KEY = 'animebox:monetization-session:v1';
const MAX_QUEUE = 40;
const MAX_BATCH = 20;
const FLUSH_DELAY_MS = 1_500;

let queue: ClientEvent[] = [];
let flushTimer: number | null = null;
let listenersInstalled = false;
let flushInFlight: Promise<void> | null = null;

function createSessionId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function getSessionId() {
  try {
    const existing = window.sessionStorage.getItem(SESSION_KEY)?.trim();
    if (existing) return existing.slice(0, 100);
    const created = createSessionId();
    window.sessionStorage.setItem(SESSION_KEY, created);
    return created;
  } catch {
    return createSessionId();
  }
}

function payloadFor(events: ClientEvent[]) {
  return JSON.stringify({ events });
}

function sendWithBeacon(events: ClientEvent[]) {
  if (!events.length || typeof navigator.sendBeacon !== 'function') return false;
  try {
    return navigator.sendBeacon(
      '/api/analytics/monetization',
      new Blob([payloadFor(events)], { type: 'application/json' }),
    );
  } catch {
    return false;
  }
}

async function flushQueue(useBeacon = false) {
  if (flushTimer != null) {
    window.clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (!queue.length) return;

  const events = queue.splice(0, MAX_BATCH);

  if (useBeacon && sendWithBeacon(events)) {
    if (queue.length) void flushQueue(true);
    return;
  }

  try {
    await fetch('/api/analytics/monetization', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: payloadFor(events),
      cache: 'no-store',
      keepalive: true,
    });
  } catch {
    // Analytics is intentionally best-effort. Requeue a single failed batch,
    // bounded by MAX_QUEUE, so a temporary network failure does not grow memory.
    queue = [...events, ...queue].slice(0, MAX_QUEUE);
  }

  if (queue.length && !useBeacon) scheduleFlush();
}

function scheduleFlush() {
  if (flushTimer != null) return;
  flushTimer = window.setTimeout(() => {
    flushTimer = null;
    if (!flushInFlight) {
      flushInFlight = flushQueue().finally(() => {
        flushInFlight = null;
      });
    }
  }, FLUSH_DELAY_MS);
}

function installLifecycleListeners() {
  if (listenersInstalled) return;
  listenersInstalled = true;

  window.addEventListener('pagehide', () => {
    void flushQueue(true);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void flushQueue(true);
  });
}

export function trackMonetizationClientEvent(
  eventName: ClientEventName,
  options: TrackOptions = {},
) {
  if (typeof window === 'undefined') return;
  installLifecycleListeners();

  const { flush = false, metadata, ...rest } = options;
  queue.push({
    eventName,
    sessionId: getSessionId(),
    ...rest,
    metadata,
  });

  if (queue.length > MAX_QUEUE) queue = queue.slice(-MAX_QUEUE);

  if (flush || queue.length >= 8) {
    if (!flushInFlight) {
      flushInFlight = flushQueue().finally(() => {
        flushInFlight = null;
      });
    }
    return;
  }

  scheduleFlush();
}
