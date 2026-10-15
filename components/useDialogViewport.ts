'use client';

import { useEffect, type RefObject } from 'react';

/** Mounted only by an open dialog; no application-level viewport subscription. */
export function useDialogViewport(dialogRef: RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const overlay = dialogRef.current?.parentElement;
    if (!overlay) return;
    const viewport = window.visualViewport;
    let frame: number | null = null;
    const measure = () => {
      overlay.style.setProperty('--auth-viewport-height', `${viewport?.height ?? window.innerHeight}px`);
      overlay.style.setProperty('--auth-viewport-top', `${viewport?.offsetTop ?? 0}px`);
    };
    const scheduleMeasure = () => {
      if (frame !== null) return;
      frame = window.requestAnimationFrame(() => { frame = null; measure(); });
    };
    measure();
    viewport?.addEventListener('resize', scheduleMeasure);
    viewport?.addEventListener('scroll', scheduleMeasure);
    window.addEventListener('resize', scheduleMeasure);
    return () => {
      viewport?.removeEventListener('resize', scheduleMeasure);
      viewport?.removeEventListener('scroll', scheduleMeasure);
      window.removeEventListener('resize', scheduleMeasure);
      if (frame !== null) window.cancelAnimationFrame(frame);
    };
  }, [dialogRef]);

}
