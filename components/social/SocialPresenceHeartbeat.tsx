'use client';

import { useEffect } from 'react';

import { useAuthState } from '@/components/AuthStateProvider';

function detectSurface() {
  const path = window.location.pathname;

  if (path.startsWith('/watch-together')) return 'watch_together';
  if (path === '/chat' || path.startsWith('/chat/')) return 'chat';
  if (/\/episode\/\d+/.test(path) || path.endsWith('/watch')) return 'player';
  return 'site';
}

export default function SocialPresenceHeartbeat() {
  const { user, loading } = useAuthState();

  useEffect(() => {
    if (loading || !user?.id) return;

    let stopped = false;

    const ping = async () => {
      if (
        stopped ||
        document.visibilityState !== 'visible' ||
        !navigator.onLine
      ) {
        return;
      }

      await fetch('/api/social/presence', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          surface: detectSurface(),
        }),
        keepalive: true,
      }).catch(() => undefined);
    };

    void ping();

    const timer = window.setInterval(() => {
      void ping();
    }, 60_000);

    const onVisibility = () => {
      if (document.visibilityState === 'visible') void ping();
    };
    const onOnline = () => void ping();

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('online', onOnline);

    return () => {
      stopped = true;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('online', onOnline);
    };
  }, [loading, user?.id]);

  return null;
}
