'use client';

import { useEffect, useRef } from 'react';

/** One impression per visible signature, per mounted surface. */
export function useVisibleHomeImpression(signature: string, onVisible: () => void) {
  const elementRef = useRef<HTMLElement | null>(null);
  const seenRef = useRef(new Set<string>());
  const callbackRef = useRef(onVisible);
  useEffect(() => { callbackRef.current = onVisible; }, [onVisible]);
  useEffect(() => {
    const element = elementRef.current;
    if (!element || !signature || seenRef.current.has(signature)) return;
    const record = () => {
      if (document.visibilityState !== 'visible' || seenRef.current.has(signature)) return;
      seenRef.current.add(signature);
      callbackRef.current();
    };
    let visible = false;
    const onVisibility = () => { if (visible) record(); };
    if (typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver((entries) => {
      visible = entries.some((entry) => entry.isIntersecting && entry.intersectionRatio >= 0.25);
      if (visible) record();
    }, { threshold: 0.25 });
    observer.observe(element);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      observer.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [signature]);
  return elementRef;
}
