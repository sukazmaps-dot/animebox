'use client';

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

const HISTORY_KEY = '__animeboxPlayerFullscreen';
type Orientation = ScreenOrientation & { lock?: (mode: string) => Promise<void> };

function safely(action: (() => void) | undefined) {
  try { action?.(); } catch { /* CSS fullscreen remains available. */ }
}

function supports(tg: TelegramWebApp | undefined, version: string) {
  try { return Boolean(tg?.isVersionAtLeast?.(version)); } catch { return false; }
}

/** Keep the media node in place: a portal/reparent can reload cross-origin frames. */
export function usePlayerFullscreen(viewport: RefObject<HTMLDivElement | null>) {
  const [fullscreen, setFullscreen] = useState(false);
  const [pseudoFullscreen, setPseudoFullscreen] = useState(false);
  const pseudoRef = useRef(false);
  const closeRef = useRef<() => void>(() => {});
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    const sync = () => {
      const current = document.fullscreenElement;
      setFullscreen(Boolean(current && viewport.current?.contains(current)));
    };
    document.addEventListener('fullscreenchange', sync);
    return () => {
      mounted.current = false;
      document.removeEventListener('fullscreenchange', sync);
    };
  }, [viewport]);

  // Providers may still enter DOM fullscreen themselves. Mirror that request
  // to the host, but release only the host state this player acquired.
  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    if (!fullscreen || !tg?.initData || !supports(tg, '8.0') || tg.isFullscreen) return;
    safely(() => tg.requestFullscreen?.());
    return () => safely(() => tg.exitFullscreen?.());
  }, [fullscreen]);

  useEffect(() => {
    if (!pseudoFullscreen || !viewport.current) return;
    pseudoRef.current = true;
    const node = viewport.current;
    const root = document.documentElement;
    const body = document.body;
    const candidate = window.Telegram?.WebApp;
    const tg = candidate?.initData ? candidate : undefined;
    const tg8 = supports(tg, '8.0');
    const swipes = supports(tg, '7.7');
    const wasFullscreen = Boolean(tg?.isFullscreen);
    const wasLocked = Boolean(tg?.isOrientationLocked);
    const hadSwipes = tg?.isVerticalSwipesEnabled !== false;
    const backWasVisible = tg?.BackButton?.isVisible;
    const orientation = screen.orientation as Orientation | undefined;
    const previousOrientation = orientation?.type?.startsWith('portrait') ? 'portrait' : 'landscape';
    let orientationOwned = false;
    let screenOwned = false;
    let disposed = false;
    let closing = false;
    let observedFullscreen = wasFullscreen;
    const previousOverflow = [body.style.overflow, body.style.overscrollBehavior, root.style.overflow];
    const scroll = { x: window.scrollX, y: window.scrollY };
    const ancestors: HTMLElement[] = [];
    const hiddenSurfaces: HTMLElement[] = [];
    let child: HTMLElement = node;
    for (let parent = node.parentElement; parent; parent = parent.parentElement) {
      for (const sibling of parent.children) {
        if (sibling !== child && sibling instanceof HTMLElement) {
          sibling.setAttribute('data-player-fullscreen-hidden', '');
          hiddenSurfaces.push(sibling);
        }
      }
      if (parent === body) break;
      parent.setAttribute('data-player-fullscreen-ancestor', '');
      ancestors.push(parent);
      child = parent;
    }

    // Preserve Next's router state and URL; only add a temporary local entry.
    const token = `${Date.now()}-${Math.random()}`;
    history.pushState({ ...history.state, [HISTORY_KEY]: token }, '');
    const ownsEntry = () => history.state?.[HISTORY_KEY] === token;
    const close = (fromHistory = false) => {
      if (closing) return;
      closing = true;
      pseudoRef.current = false;
      if (!fromHistory && ownsEntry()) history.back();
      setPseudoFullscreen(false);
    };
    closeRef.current = () => close();
    const onPop = () => close(true);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); close(); }
    };
    const onBack = () => close();
    const sync = () => {
      const height = window.visualViewport?.height || window.innerHeight;
      root.style.setProperty('--animebox-player-viewport-height', `${height}px`);
      for (const side of ['top', 'right', 'bottom', 'left'] as const) {
        const safe = (tg?.safeAreaInset?.[side] || 0) + (tg?.contentSafeAreaInset?.[side] || 0);
        node.style.setProperty(`--player-safe-${side}`, `${safe}px`);
      }
      // Telegram locks the CURRENT orientation, never request a portrait lock on entry.
      if (tg8 && !wasLocked && window.innerWidth > window.innerHeight && !orientationOwned) {
        safely(() => { tg?.lockOrientation?.(); orientationOwned = true; });
      }
    };
    const onTelegramFullscreen = () => {
      sync();
      if (tg?.isFullscreen) observedFullscreen = true;
      else if (observedFullscreen && !wasFullscreen) close();
    };
    const onForeground = () => {
      if (document.visibilityState !== 'visible') return;
      safely(() => tg?.expand());
      sync();
    };
    body.style.overflow = 'hidden';
    body.style.overscrollBehavior = 'none';
    root.style.overflow = 'hidden';
    root.classList.add('animebox-player-telegram-fullscreen');
    sync();

    // The top layer escapes transformed/clipped ancestors without moving the iframe.
    // Older WebViews use the marked-ancestor CSS fallback instead.
    if (typeof node.showPopover === 'function') {
      try { node.setAttribute('popover', 'manual'); node.showPopover(); }
      catch { node.removeAttribute('popover'); }
    }
    window.addEventListener('popstate', onPop);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', sync);
    window.addEventListener('orientationchange', sync);
    window.visualViewport?.addEventListener('resize', sync);
    document.addEventListener('visibilitychange', onForeground);
    for (const event of ['viewportChanged', 'safeAreaChanged', 'contentSafeAreaChanged', 'activated']) tg?.onEvent?.(event, sync);
    tg?.onEvent?.('fullscreenChanged', onTelegramFullscreen);
    // fullscreenFailed deliberately keeps CSS fallback active.
    safely(() => tg?.expand());
    if (swipes && hadSwipes) safely(() => tg?.disableVerticalSwipes?.());
    if (tg8 && !wasFullscreen) safely(() => tg?.requestFullscreen?.());
    if (supports(tg, '6.1')) {
      safely(() => tg?.BackButton?.show());
      tg?.BackButton?.onClick(onBack);
    }
    if (!wasLocked) {
      try { orientation?.lock?.('landscape').then(() => {
        if (disposed) { orientation.unlock(); return; }
        screenOwned = true;
        sync();
      }).catch(() => { /* WebView/iOS may deny rotation; manual rotation still works. */ }); } catch { /* Older WebViews may throw synchronously. */ }
    }

    return () => {
      disposed = true;
      pseudoRef.current = false;
      safely(() => node.hidePopover?.());
      node.removeAttribute('popover');
      root.classList.remove('animebox-player-telegram-fullscreen');
      root.style.removeProperty('--animebox-player-viewport-height');
      ancestors.forEach(parent => parent.removeAttribute('data-player-fullscreen-ancestor'));
      hiddenSurfaces.forEach(surface => surface.removeAttribute('data-player-fullscreen-hidden'));
      [body.style.overflow, body.style.overscrollBehavior, root.style.overflow] = previousOverflow;
      for (const side of ['top', 'right', 'bottom', 'left']) node.style.removeProperty(`--player-safe-${side}`);
      window.removeEventListener('popstate', onPop);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', sync);
      window.removeEventListener('orientationchange', sync);
      window.visualViewport?.removeEventListener('resize', sync);
      document.removeEventListener('visibilitychange', onForeground);
      for (const event of ['viewportChanged', 'safeAreaChanged', 'contentSafeAreaChanged', 'activated']) tg?.offEvent?.(event, sync);
      tg?.offEvent?.('fullscreenChanged', onTelegramFullscreen);
      tg?.BackButton?.offClick(onBack);
      if (!backWasVisible) safely(() => tg?.BackButton?.hide());
      if (orientationOwned) safely(() => tg?.unlockOrientation?.());
      if (swipes && hadSwipes) safely(() => tg?.enableVerticalSwipes?.());
      if (tg8 && !wasFullscreen) safely(() => tg?.exitFullscreen?.());
      if (screenOwned) {
        // Restore the entry orientation if supported, then release our lock.
        try { orientation?.lock?.(previousOrientation).then(() => orientation.unlock()).catch(() => orientation.unlock()); } catch { safely(() => orientation?.unlock()); }
      }
      if (ownsEntry()) {
        const state = { ...history.state };
        delete state[HISTORY_KEY];
        history.replaceState(state, '');
      }
      window.scrollTo(scroll.x, scroll.y);
    };
  }, [pseudoFullscreen, viewport]);

  const toggleFullscreen = useCallback(async () => {
    if (pseudoRef.current) { closeRef.current(); return; }
    if (document.fullscreenElement) {
      await document.exitFullscreen().catch(() => {});
      return;
    }
    const node = viewport.current;
    if (!node) return;
    if (!window.Telegram?.WebApp?.initData && node.requestFullscreen) {
      try { await node.requestFullscreen(); return; } catch { /* CSS fallback */ }
    }
    if (!mounted.current) return;
    pseudoRef.current = true;
    setPseudoFullscreen(true);
  }, [viewport]);

  return { fullscreen, pseudoFullscreen, toggleFullscreen };
}
