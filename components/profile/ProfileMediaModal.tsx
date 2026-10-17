'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/** Native top layer keeps crop actions above fixed navigation and save docks. */
export default function ProfileMediaModal({children, onClose, busy, labelledBy, className = ''}: {
  children: ReactNode; onClose: () => void; busy: boolean; labelledBy: string; className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.showModal();
    const syncViewport = () => {
      const viewport = window.visualViewport;
      dialog.style.top = `${viewport?.offsetTop ?? 0}px`;
      dialog.style.height = `${viewport?.height ?? window.innerHeight}px`;
      dialog.style.setProperty('--profile-media-vh', `${viewport?.height ?? window.innerHeight}px`);
    };
    syncViewport();
    window.visualViewport?.addEventListener('resize', syncViewport);
    window.visualViewport?.addEventListener('scroll', syncViewport);
    return () => {
      window.visualViewport?.removeEventListener('resize', syncViewport);
      window.visualViewport?.removeEventListener('scroll', syncViewport);
      dialog.close();
      document.body.style.overflow = overflow;
      previous?.focus({preventScroll:true});
    };
  }, []);
  return createPortal(
    <dialog ref={ref} className={`premium-media-editor-modal ${className}`} aria-labelledby={labelledBy}
      onCancel={event => {event.preventDefault(); if (!busy) onClose();}}
      onClick={event => {if (event.target === event.currentTarget && !busy) onClose();}}>
      {children}
    </dialog>, document.body,
  );
}
