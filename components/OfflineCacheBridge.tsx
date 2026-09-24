'use client';

import { useEffect } from 'react';

export default function OfflineCacheBridge() {
  useEffect(() => {
    if (
      process.env.NODE_ENV !== 'production' ||
      !('serviceWorker' in navigator) ||
      !window.isSecureContext
    ) {
      return;
    }

    let timer = 0;

    const register = () => {
      timer = window.setTimeout(() => {
        void navigator.serviceWorker
          .register('/animebox-sw.js', {
            scope: '/',
            updateViaCache: 'none',
          })
          .catch((error) => {
            console.warn('[AnimeBox] service worker registration failed:', error);
          });
      }, 1200);
    };

    if (document.readyState === 'complete') {
      register();
    } else {
      window.addEventListener('load', register, { once: true });
    }

    return () => {
      window.removeEventListener('load', register);
      window.clearTimeout(timer);
    };
  }, []);

  return null;
}
