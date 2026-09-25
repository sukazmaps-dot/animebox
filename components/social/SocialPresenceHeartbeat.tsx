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
    let timer: number | null = null;
    let inFlight = false;

    const canPing = () =>
      !stopped &&
      document.visibilityState === 'visible' &&
      navigator.onLine;

    const ping = async () => {
      if (!canPing() || inFlight) return;

      inFlight = true;

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

      inFlight = false;
    };

    const stopTimer = () => {
      if (timer === null) return;
      window.clearInterval(timer);
      timer = null;
    };

    const startTimer = () => {
      if (!canPing() || timer !== null) return;

      timer = window.setInterval(() => {
        void ping();
      }, 60_000);
    };

    const resume = () => {
      if (!canPing()) return;
      void ping();
      startTimer();
    };

    const pause = () => {
      stopTimer();
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        resume();
      } else {
        pause();
      }
    };

    const onOnline = () => resume();
    const onOffline = () => pause();

    resume();

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);

    return () => {
      stopped = true;
      stopTimer();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [loading, user?.id]);

  return null;
}
