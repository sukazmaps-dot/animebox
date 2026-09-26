'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

const MAX_QUICK_EPISODES = 120;

export default function EpisodeQuickSelector({
  currentEpisode,
  totalEpisodes,
  hasPrev,
  hasNext,
  onPrevious,
  onNext,
  onSelect,
}: {
  currentEpisode: number;
  totalEpisodes: number;
  hasPrev: boolean;
  hasNext: boolean;
  onPrevious: () => void;
  onNext: () => void;
  onSelect: (episode: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const currentRef = useRef<HTMLButtonElement | null>(null);
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

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('keydown', onKeyDown);
    const frame = window.requestAnimationFrame(() => {
      currentRef.current?.scrollIntoView({
        block: 'center',
        inline: 'nearest',
      });
      currentRef.current?.focus({ preventScroll: true });
    });

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      window.cancelAnimationFrame(frame);
    };
  }, [open]);

  const selectEpisode = (episode: number) => {
    setOpen(false);
    if (episode !== currentEpisode) onSelect(episode);
  };

  return (
    <nav className="episode-quick-nav" aria-label="Быстрое переключение серий">
      <button
        type="button"
        className="episode-quick-nav__step"
        disabled={!hasPrev}
        onClick={onPrevious}
        aria-label="Предыдущая серия"
      >
        <span aria-hidden="true">←</span>
        <span>Пред.</span>
      </button>

      <button
        type="button"
        className="episode-quick-nav__current"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <span>Серия {currentEpisode}</span>
        <small>{safeTotal > 1 ? `из ${safeTotal}` : 'текущая'}</small>
        <span aria-hidden="true">⌄</span>
      </button>

      <button
        type="button"
        className="episode-quick-nav__step"
        disabled={!hasNext}
        onClick={onNext}
        aria-label="Следующая серия"
      >
        <span>След.</span>
        <span aria-hidden="true">→</span>
      </button>

      <a className="episode-quick-nav__all" href="#episode-browser">
        Все серии
      </a>

      {open && (
        <>
          <button
            type="button"
            className="episode-quick-nav__backdrop"
            onClick={() => setOpen(false)}
            aria-label="Закрыть выбор серии"
          />

          <section
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

            <div className="episode-quick-nav__grid">
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
              onClick={() => setOpen(false)}
            >
              Открыть полный список серий
            </a>
          </section>
        </>
      )}
    </nav>
  );
}
