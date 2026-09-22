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

export default function DeferredYandexMetrika() {
  useEffect(() => {
    let loaded = false;

    const load = () => {
      if (loaded) return;
      loaded = true;
      cleanup();
      installMetrika();
    };

    const timer = window.setTimeout(load, 12_000);

    const cleanup = () => {
      window.clearTimeout(timer);
      window.removeEventListener('pointerdown', load);
      window.removeEventListener('keydown', load);
      window.removeEventListener('touchstart', load);
    };

    window.addEventListener('pointerdown', load, { once: true, passive: true });
    window.addEventListener('keydown', load, { once: true });
    window.addEventListener('touchstart', load, { once: true, passive: true });

    return cleanup;
  }, []);

  return null;
}
