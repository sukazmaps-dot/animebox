'use client';

import { useLayoutEffect, useRef, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import styles from './ChoiceSelect.module.css';

/** Native top layer escapes clipping and stacking contexts, including fullscreen. */
export default function FloatingMenu({ anchor, label, onClose, children }: {
  anchor: RefObject<HTMLElement | null>; label: string; onClose: () => void; children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    const node = dialog.current;
    const trigger = anchor.current;
    if (!node) return;
    const position = () => {
      const rect = anchor.current?.getBoundingClientRect();
      if (!rect || matchMedia('(max-width: 767px)').matches) return;
      node.style.width = `${Math.min(Math.max(rect.width, 260), innerWidth - 24)}px`;
      node.style.left = `${Math.max(12, Math.min(rect.left, innerWidth - node.offsetWidth - 12))}px`;
      node.style.top = `${Math.max(12, Math.min(rect.bottom + 8, innerHeight - node.offsetHeight - 12))}px`;
    };
    node.showModal();
    position();
    const active = node.querySelector<HTMLElement>('[aria-selected="true"], [aria-checked="true"]');
    (active || node.querySelector<HTMLElement>('button:not(:disabled)'))?.focus({ preventScroll: true });
    const resize = () => { node.style.removeProperty('width'); node.style.removeProperty('left'); node.style.removeProperty('top'); position(); };
    window.addEventListener('resize', resize);
    window.addEventListener('scroll', position, true);
    window.visualViewport?.addEventListener('resize', resize);
    return () => {
      window.removeEventListener('resize', resize);
      window.removeEventListener('scroll', position, true);
      window.visualViewport?.removeEventListener('resize', resize);
      node.close();
      trigger?.focus({ preventScroll: true });
    };
  }, [anchor]);
  const search = useRef({ text: '', time: 0 });
  if (typeof document === 'undefined') return null;
  return createPortal(<dialog ref={dialog} className={styles.popup} aria-label={label}
    onCancel={event => { event.stopPropagation(); event.preventDefault(); onClose(); }}
    onClick={event => { if (event.target === event.currentTarget) {
      const r = event.currentTarget.getBoundingClientRect();
      if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) onClose();
    } }}
    onKeyDown={event => {
      event.stopPropagation();
      const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
      const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
      let next = -1;
      if (!buttons.length) return;
      if (event.key === 'ArrowDown') next = (index + 1) % buttons.length;
      if (event.key === 'ArrowUp') next = (index - 1 + buttons.length) % buttons.length;
      if (event.key === 'Home') next = 0;
      if (event.key === 'End') next = buttons.length - 1;
      if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && event.key !== ' ') {
        const now = Date.now();
        search.current.text = (now - search.current.time < 700 ? search.current.text : '') + event.key.toLocaleLowerCase();
        search.current.time = now;
        next = buttons.findIndex(button => (button.dataset.label || button.textContent || '').trim().toLocaleLowerCase().startsWith(search.current.text));
      }
      if (next >= 0 && buttons[next]) { event.preventDefault(); buttons[next].focus({ preventScroll: true }); buttons[next].scrollIntoView({ block: 'nearest' }); }
    }}>
    <div className={styles.heading}><strong>{label}</strong><button type="button" aria-label="Закрыть" onClick={onClose}>×</button></div>
    {children}
  </dialog>, document.fullscreenElement || document.body);
}
