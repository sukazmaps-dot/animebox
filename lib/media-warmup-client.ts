type NetworkInformationLike = {
  saveData?: boolean;
  effectiveType?: string;
};

export const MEDIA_WARMUP_POLICY_VERSION = '23.1-warmup-v4';

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

  if (connection?.saveData) {
    return '100px 48px 160px 48px';
  }

  if (
    connection?.effectiveType === 'slow-2g' ||
    connection?.effectiveType === '2g'
  ) {
    return '180px 80px 260px 80px';
  }

  if (connection?.effectiveType === '3g') {
    return '420px 360px 760px 360px';
  }

  // Default/4G: warm roughly 1–2 screens ahead vertically, while allowing
  // horizontal rails to prepare only several neighbouring cards.
  return '700px 720px 1600px 720px';
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
