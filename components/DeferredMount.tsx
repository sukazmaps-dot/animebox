'use client';

import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';

type DeferredMountProps = {
  children: ReactNode;
  className?: string;
  minHeight?: number;
  rootMargin?: string;
  ariaLabel?: string;
};

type NetworkInformationLike = {
  saveData?: boolean;
  effectiveType?: string;
};

function resolveRootMargin(fallback: string) {
  if (typeof navigator === 'undefined') return fallback;

  const connection = (
    navigator as Navigator & { connection?: NetworkInformationLike }
  ).connection;

  if (
    connection?.saveData ||
    connection?.effectiveType === 'slow-2g' ||
    connection?.effectiveType === '2g'
  ) {
    return '220px 0px';
  }

  return fallback;
}

export default function DeferredMount({
  children,
  className = '',
  minHeight = 120,
  rootMargin = '680px 0px',
  ariaLabel,
}: DeferredMountProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (ready) return;

    const host = hostRef.current;
    if (!host) return;

    let fallbackTimer = 0;

    if (typeof IntersectionObserver === 'undefined') {
      fallbackTimer = window.setTimeout(() => {
        setReady(true);
      }, 250);

      return () => window.clearTimeout(fallbackTimer);
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;

        observer.disconnect();
        setReady(true);
      },
      {
        rootMargin: resolveRootMargin(rootMargin),
        threshold: 0.01,
      },
    );

    observer.observe(host);

    // Unusual embedded browsers can occasionally miss an observer callback.
    // Mount eventually, but never during the critical first paint.
    fallbackTimer = window.setTimeout(() => {
      observer.disconnect();
      setReady(true);
    }, 12_000);

    return () => {
      observer.disconnect();
      window.clearTimeout(fallbackTimer);
    };
  }, [ready, rootMargin]);

  return (
    <div
      ref={hostRef}
      className={`deferred-mount ${className}`.trim()}
      data-ready={ready ? 'true' : 'false'}
      aria-label={ariaLabel}
      style={!ready ? { minHeight } : undefined}
    >
      {ready ? (
        children
      ) : (
        <div className="deferred-mount__placeholder" aria-hidden="true">
          <span />
          <span />
        </div>
      )}
    </div>
  );
}
