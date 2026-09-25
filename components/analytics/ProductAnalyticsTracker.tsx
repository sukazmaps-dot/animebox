'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

import { useAuthState } from '@/components/AuthStateProvider';
import { trackProductClientEvent } from '@/lib/product-events-client';

const REGISTRATION_SESSION_PREFIX = 'animebox:registration-session:v1:';

type IdleWindow = Window & {
  requestIdleCallback?: (
    callback: IdleRequestCallback,
    options?: IdleRequestOptions,
  ) => number;
  cancelIdleCallback?: (handle: number) => void;
};

function scheduleSecondaryAnalytics(callback: () => void) {
  const idleWindow = window as IdleWindow;

  if (idleWindow.requestIdleCallback) {
    const handle = idleWindow.requestIdleCallback(callback, {
      timeout: 1_500,
    });

    return () => idleWindow.cancelIdleCallback?.(handle);
  }

  const timer = window.setTimeout(callback, 180);
  return () => window.clearTimeout(timer);
}

function safeSource(telegramMiniApp: boolean) {
  return telegramMiniApp ? 'telegram_mini_app' : 'web';
}

export default function ProductAnalyticsTracker() {
  const pathname = usePathname();
  const { user, loading, telegramMiniApp } = useAuthState();
  const previousPath = useRef<string | null>(null);

  useEffect(() => {
    if (!pathname || pathname.startsWith('/admin')) return;
    if (previousPath.current === pathname) return;
    previousPath.current = pathname;

    const source = safeSource(telegramMiniApp);

    trackProductClientEvent('page_view', {
      source,
      path: pathname,
    });

    const animeMatch = pathname.match(/^\/anime\/([^/]+)$/);

    return scheduleSecondaryAnalytics(() => {
      if (document.visibilityState !== 'visible') return;

      if (animeMatch?.[1]) {
        trackProductClientEvent('anime_open', {
          source,
          path: pathname,
          entityType: 'anime_slug',
          entityId: animeMatch[1],
        });
      }

      if (pathname === '/chat') {
        trackProductClientEvent('chat_open', {
          source,
          path: pathname,
        });
      }
    });
  }, [pathname, telegramMiniApp]);

  useEffect(() => {
    if (loading || !user?.id || !user.created_at) return;

    const createdAt = Date.parse(user.created_at);
    if (!Number.isFinite(createdAt)) return;

    // Session-linking event only. Canonical registration counts are recorded by
    // the database trigger, so a normal login can never inflate registrations.
    if (Date.now() - createdAt > 30 * 60 * 1000) return;

    const key = `${REGISTRATION_SESSION_PREFIX}${user.id}`;
    try {
      if (window.sessionStorage.getItem(key)) return;
      window.sessionStorage.setItem(key, '1');
    } catch {
      // Restricted WebViews may deny sessionStorage. Dedupe still happens by event id.
    }

    const provider = typeof user.app_metadata?.provider === 'string'
      ? user.app_metadata.provider
      : 'unknown';

    trackProductClientEvent('registration_session', {
      source: safeSource(telegramMiniApp),
      path: pathname || '/',
      metadata: { provider },
      flush: true,
    });
  }, [loading, pathname, telegramMiniApp, user]);

  return null;
}
