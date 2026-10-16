/** Keep mobile editor controls clear of the actual nav and savebar heights. */
export function observeProfileEditorDock(savebar: HTMLElement): () => void {
  const root = savebar.closest<HTMLElement>('.profile-editor-v13');
  if (!root) return () => {};
  const nav = document.querySelector<HTMLElement>('.mobile-nav');
  // The nav owns its safe-area inset; use its rendered height exactly once.
  const measure = () => {
    root.style.setProperty('--profile-editor-savebar-height', `${Math.ceil(savebar.getBoundingClientRect().height)}px`);
    if (nav) root.style.setProperty('--profile-editor-nav-height', `${Math.ceil(nav.getBoundingClientRect().height)}px`);
  };
  measure();
  const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
  observer?.observe(savebar);
  if (nav) observer?.observe(nav);
  window.addEventListener('resize', measure);
  return () => {
    observer?.disconnect();
    window.removeEventListener('resize', measure);
    root.style.removeProperty('--profile-editor-savebar-height');
    root.style.removeProperty('--profile-editor-nav-height');
  };
}
