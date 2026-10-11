'use client';

import Link from 'next/link';
import { createPortal } from 'react-dom';
import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import styles from './TooltipLink.module.css';

type Props = { href: string; className?: string; label: string; children: ReactNode };

/** A descriptive link tooltip outside clipping/stacking contexts, including keyboard access. */
export default function TooltipLink({ href, className, label, children }: Props) {
  const id = useId();
  const anchor = useRef<HTMLAnchorElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const clearTimer = () => { if (timer.current) clearTimeout(timer.current); timer.current = null; };
  const show = () => { clearTimer(); setOpen(true); };
  const leave = () => {
    clearTimer();
    timer.current = setTimeout(() => {
      if (document.activeElement !== anchor.current) setOpen(false);
    }, 150);
  };
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  useLayoutEffect(() => {
    if (!open) return;
    let frame = 0;
    const place = () => {
      if (!anchor.current || !panel.current) return;
      const a = anchor.current.getBoundingClientRect(), p = panel.current.getBoundingClientRect();
      if (a.bottom < 0 || a.top > innerHeight || a.right < 0 || a.left > innerWidth) { setOpen(false); return; }
      const above = a.top - p.height - 8;
      setPosition({
        left: Math.max(12, Math.min(a.left + (a.width - p.width) / 2, innerWidth - p.width - 12)),
        top: Math.max(12, Math.min(above >= 12 ? above : a.bottom + 8, innerHeight - p.height - 12)),
      });
    };
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(place); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { setOpen(false); setPosition(null); } };
    schedule();
    const observer = new ResizeObserver(schedule); observer.observe(panel.current!);
    window.addEventListener('scroll', schedule, true); window.addEventListener('resize', schedule); window.addEventListener('keydown', escape);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); window.removeEventListener('scroll', schedule, true); window.removeEventListener('resize', schedule); window.removeEventListener('keydown', escape); };
  }, [open]);
  return <>
    <Link ref={anchor} href={href} className={className} aria-describedby={open ? id : undefined}
      onPointerEnter={show} onPointerLeave={leave} onFocus={show}
      onBlur={leave} onClick={() => { setOpen(false); setPosition(null); }}>
      {children}
    </Link>
    {open && createPortal(<div ref={panel} id={id} role="tooltip" className={styles.tooltip}
      style={{ left: position?.left ?? 0, top: position?.top ?? 0, visibility: position ? 'visible' : 'hidden' }}
      onPointerEnter={clearTimer} onPointerLeave={leave}>{label}</div>, document.body)}
  </>;
}
