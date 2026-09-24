'use client';

import { useEffect } from 'react';

export default function OfflineCacheBridge() {
  useEffect(() => {
    const localDevelopment =
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1';

    if (
      localDevelopment ||
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
