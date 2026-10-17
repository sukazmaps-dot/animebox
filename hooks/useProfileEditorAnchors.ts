'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import type { ProfileEditorAnchor } from '@/lib/profile-editor-navigation';

/** The editor root owns scrolling. Navigation never focuses an input or opens a picker. */
export function useProfileEditorAnchors(enabled: boolean, initialAnchor: ProfileEditorAnchor) {
  const [activeAnchor, setActiveAnchor] = useState<ProfileEditorAnchor>(initialAnchor);
  const [request, setRequest] = useState<{ anchor: ProfileEditorAnchor; sequence: number } | null>(null);
  const initialApplied = useRef(false);
  // A compact form may reach the end before the requested section reaches the header.
  // Preserve explicit navigation until the user takes over scrolling.
  const navigationTarget = useRef<ProfileEditorAnchor | null>(initialAnchor === 'name' ? null : initialAnchor);
  const navigateToAnchor = useCallback((anchor: ProfileEditorAnchor) => {
    navigationTarget.current = anchor;
    setRequest(previous => ({ anchor, sequence: (previous?.sequence ?? 0) + 1 }));
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const root = document.querySelector<HTMLElement>('.profile-editor-v13');
    const chips = document.querySelector<HTMLElement>('[data-profile-anchor-nav]');
    const header = root?.querySelector<HTMLElement>('.profile-editor-v13__header');
    const preview = root?.querySelector<HTMLElement>('.profile-editor-v31__live-preview');
    const navigation = root?.querySelector<HTMLElement>('.profile-editor-v18__rail');
    if (!root || !chips) return;
    const anchors = [...root.querySelectorAll<HTMLElement>('[data-profile-anchor]')];
    let frame = 0;
    const measure = () => {
      frame = 0;
      const compact = window.matchMedia('(max-width: 899px)').matches;
      const horizontalNavigation = window.matchMedia('(min-width: 900px) and (max-width: 1179px)').matches;
      const top = (header?.getBoundingClientRect().height ?? 0) +
        (compact && preview ? preview.getBoundingClientRect().height : 0) +
        (horizontalNavigation && navigation ? navigation.getBoundingClientRect().height : 0);
      root.style.setProperty('--profile-editor-chips-top', `${top}px`);
      const offset = top + chips.getBoundingClientRect().height + 12;
      root.style.setProperty('--profile-editor-anchor-offset', `${offset}px`);
      const threshold = root.getBoundingClientRect().top + offset + 2;
      const ordered = [...anchors].sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
      let current = ordered[0];
      for (const anchor of ordered) if (anchor.getBoundingClientRect().top <= threshold) current = anchor;
      // A short last card cannot always reach the sticky threshold before the scroll ends.
      const last = ordered.at(-1);
      if (last && root.scrollTop > 0 && root.scrollTop + root.clientHeight >= root.scrollHeight - 2) current = last;
      if (navigationTarget.current) setActiveAnchor(navigationTarget.current);
      else if (current) setActiveAnchor(current.dataset.profileAnchor as ProfileEditorAnchor);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(measure); };
    const observer = new ResizeObserver(schedule);
    [header, preview, navigation, chips, ...anchors].forEach(node => { if (node) observer.observe(node); });
    const releaseNavigation = () => { navigationTarget.current = null; schedule(); };
    const releaseOnKey = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement)?.closest('input,textarea,[contenteditable="true"]')) return;
      if (['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End', ' '].includes(event.key)) releaseNavigation();
    };
    root.addEventListener('wheel', releaseNavigation, { passive: true });
    root.addEventListener('touchmove', releaseNavigation, { passive: true });
    root.addEventListener('pointerdown', releaseNavigation, { passive: true });
    root.addEventListener('keydown', releaseOnKey);
    root.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    measure();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      root.removeEventListener('scroll', schedule);
      root.removeEventListener('wheel', releaseNavigation);
      root.removeEventListener('touchmove', releaseNavigation);
      root.removeEventListener('pointerdown', releaseNavigation);
      root.removeEventListener('keydown', releaseOnKey);
      window.removeEventListener('resize', schedule);
      root.style.removeProperty('--profile-editor-chips-top');
      root.style.removeProperty('--profile-editor-anchor-offset');
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    if (!request && initialApplied.current) return;
    if (!request && initialAnchor === 'name') { initialApplied.current = true; return; }
    const anchor = request?.anchor ?? initialAnchor;
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => {
        const root = document.querySelector<HTMLElement>('.profile-editor-v13');
        const target = root?.querySelector<HTMLElement>(`[data-profile-anchor="${anchor}"]`);
        if (!root || !target) return;
        if (target instanceof HTMLDetailsElement) target.open = true;
        initialApplied.current = true;
        const offset = parseFloat(root.style.getPropertyValue('--profile-editor-anchor-offset')) || 120;
        root.scrollTo({ top: root.scrollTop + target.getBoundingClientRect().top - root.getBoundingClientRect().top - offset,
          behavior: !request || window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
        setActiveAnchor(anchor);
        setRequest(null);
      });
    });
    return () => { cancelAnimationFrame(first); cancelAnimationFrame(second); };
  }, [enabled, initialAnchor, request]);

  return { activeAnchor, navigateToAnchor };
}
