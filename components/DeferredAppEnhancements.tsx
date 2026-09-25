'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';

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

type IdleWindow = Window & {
  requestIdleCallback?: (
    callback: IdleRequestCallback,
    options?: IdleRequestOptions,
  ) => number;
  cancelIdleCallback?: (handle: number) => void;
};

/**
 * Features below are useful after the app becomes interactive, but none of
 * them contributes pixels to the first render. Keeping them out of the
 * critical hydration window reduces long main-thread tasks on desktop.
 */
export default function DeferredAppEnhancements() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const idleWindow = window as IdleWindow;

    if (idleWindow.requestIdleCallback) {
      const handle = idleWindow.requestIdleCallback(
        () => setReady(true),
        { timeout: 1_800 },
      );

      return () => idleWindow.cancelIdleCallback?.(handle);
    }

    const timer = window.setTimeout(() => setReady(true), 900);
    return () => window.clearTimeout(timer);
  }, []);

  if (!ready) return null;

  return (
    <>
      <SocialPresenceHeartbeat />
      <ProgressionCelebration />
      <TelegramWelcomePromo />
    </>
  );
}
