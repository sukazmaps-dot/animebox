'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';

import { useAuthState } from '@/components/AuthStateProvider';
import {
  readTelegramWelcomePending,
  subscribeTelegramWelcomePending,
} from '@/lib/telegram-growth-client';

const SocialPresenceHeartbeat = dynamic(
  () => import('@/components/social/SocialPresenceHeartbeat'),
  { ssr: false },
);

const ProgressionCelebration = dynamic(
  () => import('@/components/ProgressionCelebration'),
  { ssr: false },
);

const TelegramWelcomePromo = dynamic(
  () => import('@/components/TelegramWelcomePromo'),
  { ssr: false },
);

const PRESENCE_DELAY_MS = 4_500;
const PROGRESSION_DELAY_MS = 8_000;

type IdleWindow = Window & {
  requestIdleCallback?: (
    callback: IdleRequestCallback,
    options?: IdleRequestOptions,
  ) => number;
  cancelIdleCallback?: (handle: number) => void;
};

function scheduleDeferredFeature(
  delayMs: number,
  callback: () => void,
) {
  const idleWindow = window as IdleWindow;
  let idleHandle: number | null = null;
  let fallbackTimer: number | null = null;

  const timer = window.setTimeout(() => {
    if (idleWindow.requestIdleCallback) {
      idleHandle = idleWindow.requestIdleCallback(
        callback,
        { timeout: 1_500 },
      );
      return;
    }

    fallbackTimer = window.setTimeout(callback, 180);
  }, delayMs);

  return () => {
    window.clearTimeout(timer);
    if (fallbackTimer !== null) {
      window.clearTimeout(fallbackTimer);
    }
    if (idleHandle !== null) {
      idleWindow.cancelIdleCallback?.(idleHandle);
    }
  };
}

/**
 * Non-critical global features are intentionally staggered.
 *
 * Patch 18.3.1 put all three dynamic chunks behind one idle boundary. On a
 * fast first paint that boundary could open almost immediately and create a
 * burst of parsing, hydration and network work inside Lighthouse's TBT window.
 * Presence and progression now have separate post-paint budgets, while the
 * registration welcome chunk loads only when sessionStorage says it is needed.
 */
export default function DeferredAppEnhancements() {
  const { user, loading } = useAuthState();
  const [presenceReady, setPresenceReady] = useState(false);
  const [progressionReady, setProgressionReady] = useState(false);
  const [welcomePending, setWelcomePending] = useState(false);

  useEffect(() => {
    const syncWelcome = () => {
      setWelcomePending(Boolean(readTelegramWelcomePending()));
    };

    const frame = window.requestAnimationFrame(syncWelcome);
    const unsubscribe = subscribeTelegramWelcomePending(syncWelcome);

    return () => {
      window.cancelAnimationFrame(frame);
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (loading || !user?.id) return;

    const cancelPresence = scheduleDeferredFeature(
      PRESENCE_DELAY_MS,
      () => setPresenceReady(true),
    );

    const cancelProgression = scheduleDeferredFeature(
      PROGRESSION_DELAY_MS,
      () => setProgressionReady(true),
    );

    return () => {
      cancelPresence();
      cancelProgression();
    };
  }, [loading, user?.id]);

  return (
    <>
      {welcomePending && <TelegramWelcomePromo />}
      {!loading && user?.id && presenceReady && <SocialPresenceHeartbeat />}
      {!loading && user?.id && progressionReady && <ProgressionCelebration />}
    </>
  );
}
