'use client';

import Link from 'next/link';
import { createPortal } from 'react-dom';
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import styles from './TooltipLink.module.css';

type Props = { href: string; className?: string; label: string; children: ReactNode };
let dismissActiveTooltip: (() => void) | null = null;

/** A descriptive link tooltip outside clipping/stacking contexts, including keyboard access. */
export default function TooltipLink({ href, className, label, children }: Props) {
  const id = useId();
  const anchor = useRef<HTMLAnchorElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const keyboardFocus = useRef(false);
  const [active, setActive] = useState(false);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const clearTimer = useCallback(() => { if (timer.current) clearTimeout(timer.current); timer.current = null; }, []);
  const dismiss = useCallback(() => { clearTimer(); setActive(false); setOpen(false); setPosition(null); }, [clearTimer]);
  const claim = () => {
    clearTimer();
    if (dismissActiveTooltip !== dismiss) dismissActiveTooltip?.();
    dismissActiveTooltip = dismiss;
    setActive(true);
  };
  const show = (event: React.PointerEvent<HTMLAnchorElement>) => {
    if (event.pointerType === 'touch') return;
    claim();
    // Returning during the close grace period keeps the visible tooltip open.
    if (open) return;
    timer.current = setTimeout(() => { timer.current = null; setOpen(true); }, 350);
  };
  const focus = () => {
    keyboardFocus.current = Boolean(anchor.current?.matches(':focus-visible'));
    if (!keyboardFocus.current) return;
    claim();
    setOpen(true);
  };
  const leave = () => {
    clearTimer();
    if (!active || keyboardFocus.current) return;
    timer.current = setTimeout(() => {
      timer.current = null;
      dismiss();
    }, 150);
  };
  useEffect(() => {
    // A populated week can contain hundreds of links. Only the active owner
    // (including its opening delay) needs global dismissal subscriptions.
    if (!active) return;
    const close = dismiss;
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') close(); };
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    window.addEventListener('keydown', escape);
    return () => {
      clearTimer();
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
      window.removeEventListener('keydown', escape);
      // Clear ownership only if this is still the active anchor.
      if (dismissActiveTooltip === dismiss) dismissActiveTooltip = null;
    };
  }, [active, clearTimer, dismiss]);
  useLayoutEffect(() => {
    if (!open) return;
    let frame = 0;
    const place = () => {
      if (!anchor.current || !panel.current) return;
      const a = anchor.current.getBoundingClientRect(), p = panel.current.getBoundingClientRect();
      if (a.bottom < 0 || a.top > innerHeight || a.right < 0 || a.left > innerWidth) { dismiss(); return; }
      const above = a.top - p.height - 8;
      setPosition({
        left: Math.max(12, Math.min(a.left + (a.width - p.width) / 2, innerWidth - p.width - 12)),
        top: Math.max(12, Math.min(above >= 12 ? above : a.bottom + 8, innerHeight - p.height - 12)),
      });
    };
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(place); };
    schedule();
    const observer = new ResizeObserver(schedule); observer.observe(panel.current!);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); };
  }, [dismiss, open]);
  return <>
    <Link ref={anchor} href={href} className={className} aria-describedby={open ? id : undefined}
      onPointerEnter={show} onPointerLeave={leave} onFocus={focus}
      onBlur={() => { keyboardFocus.current = false; dismiss(); }} onClick={dismiss}>
      {children}
    </Link>
    {open && createPortal(<div ref={panel} id={id} role="tooltip" className={styles.tooltip}
      style={{ left: position?.left ?? 0, top: position?.top ?? 0, visibility: position ? 'visible' : 'hidden' }}>{label}</div>, document.body)}
  </>;
}
