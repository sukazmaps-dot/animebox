'use client';

import { useEffect } from 'react';

const METRIKA_ID = 112789274;
const METRIKA_SRC = `https://mc.yandex.ru/metrika/tag.js?id=${METRIKA_ID}`;

type YmFunction = ((...args: unknown[]) => void) & {
  a?: unknown[][];
  l?: number;
};

type WindowWithYm = Window & {
  ym?: YmFunction;
};

function installMetrika(): void {
  const target = window as WindowWithYm;

  if (document.querySelector(`script[src="${METRIKA_SRC}"]`)) {
    return;
  }

  if (!target.ym) {
    const ym: YmFunction = (...args: unknown[]) => {
      (ym.a ??= []).push(args);
    };
    ym.l = Date.now();
    target.ym = ym;
  }

  const script = document.createElement('script');
  script.async = true;
  script.src = METRIKA_SRC;
  script.dataset.animeboxDeferred = 'true';
  document.head.appendChild(script);

  target.ym?.(METRIKA_ID, 'init', {
    ssr: true,
    webvisor: true,
    clickmap: true,
    ecommerce: 'dataLayer',
    referrer: document.referrer,
    url: window.location.href,
    accurateTrackBounce: true,
    trackLinks: true,
  });
}

const METRIKA_FALLBACK_DELAY_MS = 30_000;

type IdleWindow = Window & {
  requestIdleCallback?: (
    callback: IdleRequestCallback,
    options?: IdleRequestOptions,
  ) => number;
  cancelIdleCallback?: (handle: number) => void;
};

export default function DeferredYandexMetrika() {
  useEffect(() => {
    const idleWindow = window as IdleWindow;
    let scheduled = false;
    let installed = false;
    let idleHandle: number | null = null;
    let fallbackTimer: number | null = null;

    const removeInteractionListeners = () => {
      window.removeEventListener('pointerdown', scheduleLoad);
      window.removeEventListener('keydown', scheduleLoad);
      window.removeEventListener('touchstart', scheduleLoad);
    };

    const load = () => {
      if (installed) return;
      installed = true;
      installMetrika();
    };

    function scheduleLoad() {
      if (scheduled || installed) return;
      scheduled = true;
      window.clearTimeout(timer);
      removeInteractionListeners();

      // Never parse the third-party analytics bundle inside the input handler.
      // Schedule it into idle time so the first interaction keeps a clean INP.
      if (idleWindow.requestIdleCallback) {
        idleHandle = idleWindow.requestIdleCallback(
          load,
          { timeout: 2_500 },
        );
        return;
      }

      fallbackTimer = window.setTimeout(load, 250);
    }

    const timer = window.setTimeout(
      scheduleLoad,
      METRIKA_FALLBACK_DELAY_MS,
    );

    window.addEventListener('pointerdown', scheduleLoad, {
      once: true,
      passive: true,
    });
    window.addEventListener('keydown', scheduleLoad, { once: true });
    window.addEventListener('touchstart', scheduleLoad, {
      once: true,
      passive: true,
    });

    return () => {
      window.clearTimeout(timer);
      removeInteractionListeners();

      if (fallbackTimer !== null) {
        window.clearTimeout(fallbackTimer);
      }

      if (idleHandle !== null) {
        idleWindow.cancelIdleCallback?.(idleHandle);
      }
    };
  }, []);

  return null;
}
