'use client';

import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';

const MAX_QUICK_EPISODES = 120;

export default function EpisodeQuickSelector({
  compact = false,
  currentEpisode,
  totalEpisodes,
  hasPrev,
  hasNext,
  prevLabel = 'Пред.',
  nextLabel = 'Следующая серия',
  onPrevious,
  onNext,
  onSelect,
}: {
  compact?: boolean;
  currentEpisode: number;
  totalEpisodes: number;
  hasPrev: boolean;
  hasNext: boolean;
  prevLabel?: string;
  nextLabel?: string;
  onPrevious: () => void;
  onNext: () => void;
  onSelect: (episode: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const sheetRef = useRef<HTMLElement | null>(null);
  const currentRef = useRef<HTMLButtonElement | null>(null);
  const gridRef = useRef<HTMLDivElement | null>(null);
  const safeTotal = Math.max(currentEpisode, totalEpisodes || 0, 1);

  const visibleEpisodes = useMemo(() => {
    if (safeTotal <= MAX_QUICK_EPISODES) {
      return Array.from({ length: safeTotal }, (_, index) => index + 1);
    }

    const half = Math.floor(MAX_QUICK_EPISODES / 2);
    const maxStart = safeTotal - MAX_QUICK_EPISODES + 1;
    const start = Math.min(
      Math.max(1, currentEpisode - half),
      maxStart,
    );

    return Array.from(
      { length: MAX_QUICK_EPISODES },
      (_, index) => start + index,
    );
  }, [currentEpisode, safeTotal]);

  useEffect(() => {
    if (!open) return;

    const trigger = triggerRef.current;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
      if (event.key === 'Tab') {
        const items = sheetRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href]');
        const first = items?.[0];
        const last = items?.[items.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };

    document.addEventListener('keydown', onKeyDown);
    const frame = window.requestAnimationFrame(() => {
      const grid = gridRef.current;
      const current = currentRef.current;

      if (grid && current) {
        const currentTop = current.offsetTop;
        const currentBottom =
          currentTop + current.offsetHeight;
        const viewportTop = grid.scrollTop;
        const viewportBottom =
          viewportTop + grid.clientHeight;

        if (
          currentTop < viewportTop ||
          currentBottom > viewportBottom
        ) {
          const centeredTop =
            currentTop -
            Math.max(
              0,
              (grid.clientHeight - current.offsetHeight) / 2,
            );

          grid.scrollTo({
            top: Math.max(0, centeredTop),
            behavior: 'auto',
          });
        }
      }

      current?.focus({ preventScroll: true });
    });

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      window.cancelAnimationFrame(frame);
      trigger?.focus({ preventScroll: true });
    };
  }, [open]);

  const selectEpisode = (episode: number) => {
    setOpen(false);
    if (episode !== currentEpisode) onSelect(episode);
  };

  const openFullEpisodeBrowser = (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    setOpen(false);

    const target = document.getElementById('episode-browser');
    if (!target) return;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    target.scrollIntoView({
      behavior: reducedMotion ? 'auto' : 'smooth',
      block: 'start',
    });

    window.history.replaceState(null, '', '#episode-browser');
  };

  return (
    <nav className={compact ? 'episode-quick-compact' : "episode-quick-nav"} aria-label="Быстрое переключение серий">
      {!compact && <button
        type="button"
        className="episode-quick-nav__step episode-quick-nav__previous"
        disabled={!hasPrev}
        onClick={onPrevious}
        aria-label="Предыдущая серия"
      >
        <span aria-hidden="true">←</span>
        <span className="episode-quick-nav__label-full">{prevLabel}</span>
        <span className="episode-quick-nav__label-compact" aria-hidden="true">Пред.</span>
      </button>}

      <div className={compact ? undefined : "episode-quick-nav__center"}>
        <button
          type="button"
          ref={triggerRef}
          className={compact ? 'episode-quick-compact__trigger' : "episode-quick-nav__current"}
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => setOpen(true)}
        >
          <span className="episode-quick-nav__episode-index">{compact ? 'Серии' : `Серия ${currentEpisode}`}</span>
          {!compact && <small className="episode-quick-nav__episode-total">{safeTotal > 1 ? `из ${safeTotal}` : 'текущая'}</small>}
          {compact
            ? <span className="episode-quick-compact__chevron" aria-hidden="true" />
            : <span className="episode-quick-nav__chevron" aria-hidden="true">⌄</span>}
        </button>
      </div>

      {!compact && <button
        type="button"
        className="episode-quick-nav__step episode-quick-nav__next"
        disabled={!hasNext}
        onClick={onNext}
        aria-label="Следующая серия"
      >
        <span className="episode-quick-nav__label-full">{nextLabel}</span>
        <span className="episode-quick-nav__label-compact" aria-hidden="true">След.</span>
        <span aria-hidden="true">→</span>
      </button>}

      {!compact && <a
        className="episode-quick-nav__all"
        href="#episode-browser"
        onClick={openFullEpisodeBrowser}
      >
        Все серии
      </a>}

      {open && (
        <>
          <button
            type="button"
            className="episode-quick-nav__backdrop"
            onClick={() => setOpen(false)}
            aria-label="Закрыть выбор серии"
          />

          <section
            ref={sheetRef}
            data-watch-dialog={compact ? 'true' : undefined}
            className="episode-quick-nav__sheet"
            role="dialog"
            aria-modal="true"
            aria-label="Выбор серии"
          >
            <header className="episode-quick-nav__sheet-head">
              <div>
                <strong>Выбрать серию</strong>
                <span>
                  {visibleEpisodes.length === safeTotal
                    ? `${safeTotal} доступно`
                    : `${visibleEpisodes.length} рядом · всего ${safeTotal}`}
                </span>
              </div>
              <button type="button" onClick={() => setOpen(false)} aria-label="Закрыть">
                ×
              </button>
            </header>

            {compact && <div className="episode-quick-compact__steps">
              <button type="button" disabled={!hasPrev} onClick={() => { setOpen(false); onPrevious(); }} aria-label={prevLabel}>← {prevLabel}</button>
              <button type="button" disabled={!hasNext} onClick={() => { setOpen(false); onNext(); }} aria-label={nextLabel}>{nextLabel} →</button>
            </div>}
            <div
              ref={gridRef}
              className="episode-quick-nav__grid"
            >
              {visibleEpisodes.map((episode) => {
                const active = episode === currentEpisode;
                return (
                  <button
                    key={episode}
                    ref={active ? currentRef : undefined}
                    type="button"
                    aria-current={active ? 'page' : undefined}
                    className={active ? 'is-current' : ''}
                    onClick={() => selectEpisode(episode)}
                  >
                    {episode}
                  </button>
                );
              })}
            </div>

            <a
              className="episode-quick-nav__full"
              href="#episode-browser"
              onClick={openFullEpisodeBrowser}
            >
              Открыть полный список серий
            </a>
          </section>
        </>
      )}
    </nav>
  );
}
