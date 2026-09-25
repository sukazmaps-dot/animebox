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

  if (connection?.saveData) {
    return '100px 80px 160px 80px';
  }

  if (
    connection?.effectiveType === 'slow-2g' ||
    connection?.effectiveType === '2g'
  ) {
    return '180px 120px 260px 120px';
  }

  if (connection?.effectiveType === '3g') {
    return '420px 420px 760px 420px';
  }

  // Default/4G: warm roughly 1–2 screens ahead vertically, while allowing
  // horizontal rails to prepare only several neighbouring cards.
  return '700px 900px 1600px 900px';
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
