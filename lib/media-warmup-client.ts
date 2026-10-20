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
  const [, right, , left] = margin.split(' ');
  const horizontalMargin = `0px ${right} 0px ${left}`;

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
      // rootMargin alone is clipped by a horizontal scroll container. Modern
      // engines can also warm the next posters inside nested scroll tracks.
      ...('scrollMargin' in IntersectionObserver.prototype ? { scrollMargin: horizontalMargin } : {}),
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

type VisibleMediaTarget = { callback: (visible: boolean) => void; intersecting: boolean };
const visibleTargets = new Map<Element, VisibleMediaTarget>();
let visibleObserver: IntersectionObserver | null = null;
let visibilityFrame: number | null = null;
let visibilityListenersInstalled = false;

function notifyVisibility(target: VisibleMediaTarget) {
  target.callback(target.intersecting && document.visibilityState !== 'hidden');
}

function refreshVisibleMedia() {
  for (const [element, target] of visibleTargets) {
    if (!visibleObserver) {
      const rect = element.getBoundingClientRect?.();
      target.intersecting = Boolean(rect && rect.bottom > 0 && rect.top < window.innerHeight &&
        rect.right > 0 && rect.left < window.innerWidth);
    }
    notifyVisibility(target);
  }
}

function scheduleVisibilityRefresh() {
  if (visibilityFrame !== null) return;
  visibilityFrame = window.requestAnimationFrame(() => {
    visibilityFrame = null;
    refreshVisibleMedia();
  });
}

/** One viewport observer for pending images. It remains subscribed while an
 * image is loading, so leaving the viewport or hiding the tab pauses recovery.
 * Native lazy loading is not a signal that an actual request has started.
 */
export function observeVisibleViewportMedia(element: Element, callback: (visible: boolean) => void) {
  if (!visibleTargets.size && typeof IntersectionObserver !== 'undefined') {
    visibleObserver = new IntersectionObserver(entries => {
      for (const entry of entries) {
        const target = visibleTargets.get(entry.target);
        if (!target) continue;
        target.intersecting = entry.isIntersecting;
        notifyVisibility(target);
      }
    }, { rootMargin: '0px', threshold: 0.01 });
  }
  const target = {callback, intersecting: false};
  visibleTargets.set(element, target);
  callback(false);
  visibleObserver?.observe(element);
  if (!visibilityListenersInstalled) {
    document.addEventListener('visibilitychange', refreshVisibleMedia);
    if (!visibleObserver) {
      window.addEventListener('scroll', scheduleVisibilityRefresh, {passive: true, capture: true});
      window.addEventListener('resize', scheduleVisibilityRefresh, {passive: true});
    }
    visibilityListenersInstalled = true;
  }
  if (!visibleObserver) scheduleVisibilityRefresh();

  return () => {
    visibleTargets.delete(element);
    visibleObserver?.unobserve(element);
    if (visibleTargets.size) return;
    visibleObserver?.disconnect();
    visibleObserver = null;
    if (visibilityFrame !== null) window.cancelAnimationFrame(visibilityFrame);
    visibilityFrame = null;
    document.removeEventListener('visibilitychange', refreshVisibleMedia);
    window.removeEventListener('scroll', scheduleVisibilityRefresh, true);
    window.removeEventListener('resize', scheduleVisibilityRefresh);
    visibilityListenersInstalled = false;
  };
}
