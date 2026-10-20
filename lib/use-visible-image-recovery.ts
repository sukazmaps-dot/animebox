'use client';

import {useEffect, useRef, useState, useSyncExternalStore, type RefObject} from 'react';
import {observeVisibleViewportMedia} from '@/lib/media-warmup-client';

// Total foreground time for one pass through the existing bounded source chain.
// Background tabs and off-screen native-lazy images do not consume this budget.
export const VISIBLE_IMAGE_PASS_BUDGET_MS = 24_000;

const noSubscription = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;
export function useImageHydration() {
  return useSyncExternalStore(noSubscription, clientSnapshot, serverSnapshot);
}

export function useVisibleImageRecovery({hostRef, active, passKey, attemptKey, timeoutMs, onTimeout}: {
  hostRef: RefObject<HTMLElement | null>;
  active: boolean;
  passKey: string;
  attemptKey: string;
  timeoutMs: number;
  onTimeout: (budgetExhausted: boolean) => void;
}) {
  const [visible, setVisible] = useState(false);
  const budgetRef = useRef({key: passKey, spentMs: 0, attempt: attemptKey, attemptSpentMs: 0});
  useEffect(() => {
    if (!active || !hostRef.current) return;
    return observeVisibleViewportMedia(hostRef.current, setVisible);
  }, [active, hostRef]);

  useEffect(() => {
    if (!active || !visible) return;
    if (budgetRef.current.key !== passKey) {
      budgetRef.current = {key: passKey, spentMs: 0, attempt: attemptKey, attemptSpentMs: 0};
    }
    const budget = budgetRef.current;
    if (budget.attempt !== attemptKey) { budget.attempt = attemptKey; budget.attemptSpentMs = 0; }
    const remaining = Math.max(0, VISIBLE_IMAGE_PASS_BUDGET_MS - budget.spentMs);
    const attemptRemaining = Math.max(0, timeoutMs - budget.attemptSpentMs);
    const delay = Math.min(attemptRemaining, remaining);
    const startedAt = Date.now();
    const timer = window.setTimeout(() => onTimeout(remaining <= attemptRemaining), delay);
    return () => {
      window.clearTimeout(timer);
      const elapsed = Math.min(delay, Math.max(0, Date.now() - startedAt));
      budget.spentMs += elapsed;
      budget.attemptSpentMs += elapsed;
    };
  }, [active, visible, passKey, attemptKey, timeoutMs, onTimeout]);
  return active && visible;
}
