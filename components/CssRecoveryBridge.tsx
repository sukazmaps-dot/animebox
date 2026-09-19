'use client';

import { useEffect } from 'react';

const RECOVERY_KEY = 'animebox:css-recovery:v1';

function cssIsReady() {
  try {
    return getComputedStyle(document.documentElement)
      .getPropertyValue('--animebox-css-ready')
      .trim() === '1';
  } catch {
    return true;
  }
}

export default function CssRecoveryBridge() {
  useEffect(() => {
    let timer: number | null = null;

    const recover = () => {
      if (cssIsReady()) {
        try {
          sessionStorage.removeItem(RECOVERY_KEY);
        } catch {
          // Storage can be unavailable in privacy-restricted webviews.
        }
        return;
      }

      try {
        if (sessionStorage.getItem(RECOVERY_KEY) === '1') return;
        sessionStorage.setItem(RECOVERY_KEY, '1');
      } catch {
        // The recovery still works without the loop guard when storage is blocked.
      }

      const url = new URL(window.location.href);
      url.searchParams.set('__abx_css_recover', String(Date.now()));
      window.location.replace(url.toString());
    };

    const scheduleRecoveryCheck = () => {
      timer = window.setTimeout(recover, 120);
    };

    if (document.readyState === 'complete') {
      scheduleRecoveryCheck();
    } else {
      window.addEventListener('load', scheduleRecoveryCheck, { once: true });
    }

    return () => {
      window.removeEventListener('load', scheduleRecoveryCheck);
      if (timer !== null) window.clearTimeout(timer);
    };
  }, []);

  return null;
}
