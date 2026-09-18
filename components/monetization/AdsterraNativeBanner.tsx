'use client';

import { useEffect, useRef, useState } from 'react';

const ADSTERRA_NATIVE_SRC =
  'https://pl31400950.profitableratecpmnetwork.com/0eab81815e26c1dbd2e83b2c49c17ef3/invoke.js';
const ADSTERRA_NATIVE_CONTAINER_ID =
  'container-0eab81815e26c1dbd2e83b2c49c17ef3';
const LOAD_TIMEOUT_MS = 12_000;

type AdsterraNativeBannerProps = {
  onReady?: () => void;
  onError?: () => void;
};

function isLocalPreview() {
  if (typeof window === 'undefined') return false;
  return ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);
}

/**
 * Adsterra Native Banner mount for AnimeBox.
 *
 * Only the Native Banner unit is integrated here. We intentionally do not
 * mount the separate Popunder / Social Bar scripts so the site keeps the
 * lightweight, non-intrusive monetization model used by Ad System v1.
 */
export default function AdsterraNativeBanner({
  onReady,
  onError,
}: AdsterraNativeBannerProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    // Never generate publisher traffic from localhost by accident. Real ad
    // rendering is reserved for deployed builds; use provider=house locally.
    if (isLocalPreview()) {
      queueMicrotask(() => {
        setFailed(true);
        onError?.();
      });
      return;
    }

    const container = host.querySelector<HTMLElement>(
      `#${ADSTERRA_NATIVE_CONTAINER_ID}`,
    );
    if (!container) return;

    let settled = false;

    const markReady = () => {
      if (settled) return;
      settled = true;
      setReady(true);
      setFailed(false);
      onReady?.();
    };

    const markFailed = () => {
      if (settled) return;
      settled = true;
      setFailed(true);
      onError?.();
    };

    const observer = new MutationObserver(() => {
      if (container.childElementCount > 0 || container.textContent?.trim()) {
        markReady();
      }
    });
    observer.observe(container, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    const script = document.createElement('script');
    script.async = true;
    script.dataset.cfasync = 'false';
    script.src = ADSTERRA_NATIVE_SRC;
    script.dataset.animeboxAdProvider = 'adsterra-native';
    script.onerror = markFailed;
    host.prepend(script);

    const timeout = window.setTimeout(() => {
      if (container.childElementCount > 0 || container.textContent?.trim()) {
        markReady();
      } else {
        markFailed();
      }
    }, LOAD_TIMEOUT_MS);

    return () => {
      window.clearTimeout(timeout);
      observer.disconnect();
      script.remove();
      // Provider content is third-party DOM. Clear it before the React mount
      // disappears so client-side route transitions do not leave stale ads.
      container.replaceChildren();
    };
  }, [onError, onReady]);

  return (
    <div
      ref={hostRef}
      className={`adsterra-native-host ${ready ? 'is-ready' : ''} ${failed ? 'is-failed' : ''}`.trim()}
      data-adsterra-format="native-banner"
    >
      <div id={ADSTERRA_NATIVE_CONTAINER_ID} />
    </div>
  );
}
