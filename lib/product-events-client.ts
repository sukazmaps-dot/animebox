'use client';

export type ProductClientEventName =
  | 'page_view'
  | 'anime_open'
  | 'chat_open'
  | 'registration_session';

type ClientEvent = {
  eventName: ProductClientEventName;
  eventId: string;
  sessionId: string;
  source?: string;
  path?: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
};

type TrackOptions = Omit<ClientEvent, 'eventName' | 'eventId' | 'sessionId'> & {
  flush?: boolean;
};

const SESSION_KEY = 'animebox:product-session:v1';
const MAX_QUEUE = 50;
const MAX_BATCH = 20;
const FLUSH_DELAY_MS = 1_200;

let queue: ClientEvent[] = [];
let timer: number | null = null;
let flushing: Promise<void> | null = null;
let listenersInstalled = false;

function randomId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `evt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
}

export function getProductAnalyticsSessionId() {
  try {
    const existing = window.sessionStorage.getItem(SESSION_KEY)?.trim();
    if (existing) return existing.slice(0, 100);
    const created = randomId();
    window.sessionStorage.setItem(SESSION_KEY, created);
    return created;
  } catch {
    return randomId();
  }
}

function serialize(events: ClientEvent[]) {
  return JSON.stringify({ events });
}

function beacon(events: ClientEvent[]) {
  if (!events.length || typeof navigator.sendBeacon !== 'function') return false;
  try {
    return navigator.sendBeacon(
      '/api/analytics/product',
      new Blob([serialize(events)], { type: 'application/json' }),
    );
  } catch {
    return false;
  }
}

async function flushQueue(useBeacon = false) {
  if (timer != null) {
    window.clearTimeout(timer);
    timer = null;
  }
  if (!queue.length) return;

  const events = queue.splice(0, MAX_BATCH);
  if (useBeacon && beacon(events)) {
    if (queue.length) void flushQueue(true);
    return;
  }

  try {
    await fetch('/api/analytics/product', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: serialize(events),
      keepalive: true,
      cache: 'no-store',
    });
  } catch {
    queue = [...events, ...queue].slice(0, MAX_QUEUE);
  }

  if (queue.length && !useBeacon) scheduleFlush();
}

function scheduleFlush() {
  if (timer != null) return;
  timer = window.setTimeout(() => {
    timer = null;
    if (!flushing) {
      flushing = flushQueue().finally(() => {
        flushing = null;
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

export function trackProductClientEvent(
  eventName: ProductClientEventName,
  options: TrackOptions = {},
) {
  if (typeof window === 'undefined') return;
  installLifecycleListeners();

  const { flush = false, ...rest } = options;
  queue.push({
    eventName,
    eventId: randomId(),
    sessionId: getProductAnalyticsSessionId(),
    ...rest,
  });

  if (queue.length > MAX_QUEUE) queue = queue.slice(-MAX_QUEUE);

  if (flush || queue.length >= 8) {
    if (!flushing) {
      flushing = flushQueue().finally(() => {
        flushing = null;
      });
    }
    return;
  }

  scheduleFlush();
}
