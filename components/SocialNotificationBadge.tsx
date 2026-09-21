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
    void refresh();
    const timer = window.setInterval(() => void refresh(), 30_000);

    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };

    window.addEventListener(SOCIAL_NOTIFICATIONS_CHANGED_EVENT, refresh);
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener(SOCIAL_NOTIFICATIONS_CHANGED_EVENT, refresh);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refresh]);

  if (unread <= 0) return null;

  return (
    <span className="pointer-events-none absolute -right-1 -top-1 grid min-h-[16px] min-w-[16px] place-items-center rounded-full border border-[#080b13] bg-violet-500 px-1 text-[8px] font-black leading-none text-white">
      {unread > 9 ? '9+' : unread}
    </span>
  );
}
