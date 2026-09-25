'use client';

import { useCallback, useEffect, useState } from 'react';

import { useAuthState } from '@/components/AuthStateProvider';

export const SOCIAL_NOTIFICATIONS_CHANGED_EVENT =
  'animebox:social-notifications-changed';

export function notifySocialNotificationsChanged() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(SOCIAL_NOTIFICATIONS_CHANGED_EVENT));
}

export default function SocialNotificationBadge() {
  const { user } = useAuthState();
  const [unread, setUnread] = useState(0);

  const refresh = useCallback(async () => {
    if (!user?.id) {
      setUnread(0);
      return;
    }

    if (
      document.visibilityState !== 'visible' ||
      !navigator.onLine
    ) {
      return;
    }

    try {
      const response = await fetch('/api/social/notifications?limit=1', {
        cache: 'no-store',
      });
      const payload = (await response.json()) as { unread?: number };
      if (!response.ok) return;
      setUnread(Math.max(0, Number(payload.unread ?? 0)));
    } catch {
      // Badge is best-effort; the notifications page remains authoritative.
    }
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;

    let timer: number | null = null;

    const stopPolling = () => {
      if (timer === null) return;
      window.clearInterval(timer);
      timer = null;
    };

    const startPolling = () => {
      if (
        document.visibilityState !== 'visible' ||
        !navigator.onLine ||
        timer !== null
      ) {
        return;
      }

      timer = window.setInterval(() => {
        void refresh();
      }, 30_000);
    };

    const resume = () => {
      if (
        document.visibilityState !== 'visible' ||
        !navigator.onLine
      ) {
        return;
      }

      void refresh();
      startPolling();
    };

    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        resume();
      } else {
        stopPolling();
      }
    };

    const onOnline = () => resume();
    const onOffline = () => stopPolling();

    queueMicrotask(resume);

    window.addEventListener(SOCIAL_NOTIFICATIONS_CHANGED_EVENT, refresh);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);

    return () => {
      stopPolling();
      window.removeEventListener(SOCIAL_NOTIFICATIONS_CHANGED_EVENT, refresh);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [refresh, user?.id]);

  if (unread <= 0) return null;

  return (
    <span className="pointer-events-none absolute -right-1 -top-1 grid min-h-[16px] min-w-[16px] place-items-center rounded-full bg-rose-500 px-1 text-[10px] font-black leading-none text-white shadow-[0_0_14px_rgba(244,63,94,0.45)]">
      {unread > 99 ? '99+' : unread}
    </span>
  );
}
