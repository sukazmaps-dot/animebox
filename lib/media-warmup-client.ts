type NetworkInformationLike = {
  saveData?: boolean;
  effectiveType?: string;
};

export type MediaWarmupActivation = 'warm' | 'native-lazy';

type WarmupCallback = (activation: MediaWarmupActivation) => void;

const callbacks = new WeakMap<Element, WarmupCallback>();
let observer: IntersectionObserver | null = null;

function connectionInfo() {
  if (typeof navigator === 'undefined') return null;

  return (
    navigator as Navigator & { connection?: NetworkInformationLike }
  ).connection ?? null;
}

export function resolveMediaWarmupRootMargin() {
  const connection = connectionInfo();
  const viewportWidth =
    typeof window === 'undefined' ? 1440 : window.innerWidth;

  if (connection?.saveData) {
    return '60px 40px 100px 40px';
  }

  if (
    connection?.effectiveType === 'slow-2g' ||
    connection?.effectiveType === '2g'
  ) {
    return '90px 60px 140px 60px';
  }

  if (connection?.effectiveType === '3g') {
    return viewportWidth <= 768
      ? '140px 90px 240px 90px'
      : '220px 180px 380px 180px';
  }

  // Mobile LCP must own the initial network. The old 1600px bottom overscan
  // promoted several off-screen poster rows to eager requests during startup.
  // Warm roughly half a mobile screen ahead, then expand the window on wider
  // layouts where bandwidth and visible-card density are usually higher.
  if (viewportWidth <= 768) {
    return '220px 120px 460px 120px';
  }

  if (viewportWidth <= 1280) {
    return '360px 320px 720px 320px';
  }

  return '520px 600px 1000px 600px';
}

function getObserver() {
  if (
    typeof window === 'undefined' ||
    typeof IntersectionObserver === 'undefined'
  ) {
    return null;
  }

  if (observer) return observer;

  const margin = resolveMediaWarmupRootMargin();

  observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;

        const callback = callbacks.get(entry.target);
        callbacks.delete(entry.target);
        observer?.unobserve(entry.target);
        callback?.('warm');
      }
    },
    {
      rootMargin: margin,
      threshold: 0.01,
    },
  );

  return observer;
}

export function observeNearViewportMedia(
  element: Element,
  callback: WarmupCallback,
) {
  const sharedObserver = getObserver();

  if (!sharedObserver) {
    const timer = window.setTimeout(() => {
      callback('native-lazy');
    }, 0);

    return () => window.clearTimeout(timer);
  }

  callbacks.set(element, callback);
  sharedObserver.observe(element);

  return () => {
    callbacks.delete(element);
    sharedObserver.unobserve(element);
  };
}
