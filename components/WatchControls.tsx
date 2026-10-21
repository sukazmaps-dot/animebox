'use client';

import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import styles from './WatchControls.module.css';

type Choice = { id: string; label: string };
type ChoiceSelectProps = {
  label: string;
  dataKey: string;
  value: string;
  options: Choice[];
  onChange: (id: string) => void;
};

function ChoiceSelect({ label, dataKey, value, options, onChange }: ChoiceSelectProps) {
  const [open, setOpen] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [position, setPosition] = useState({ top: 80, left: 12, width: 240 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const typeahead = useRef({ value: '', at: 0 });
  const id = useId();
  const selected = options.find((option) => option.id === value);
  const selectedIndex = Math.max(0, options.findIndex((option) => option.id === value));

  useEffect(() => {
    if (!open) return;

    const updatePosition = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      const phone = window.matchMedia('(max-width: 640px)').matches;
      setMobile(phone);
      if (phone || !rect) return;

      const width = Math.min(Math.max(rect.width, 220), window.innerWidth - 16);
      const left = Math.min(Math.max(8, rect.left), window.innerWidth - width - 8);
      const estimatedHeight = Math.min(360, Math.max(112, options.length * 48 + 16));
      let top = rect.bottom + 6;
      if (top + estimatedHeight > window.innerHeight - 8 && rect.top > estimatedHeight + 8) {
        top = rect.top - estimatedHeight - 6;
      }
      top = Math.max(8, Math.min(top, window.innerHeight - 112));
      setPosition({ top, left, width });
    };

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onDocumentKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      triggerRef.current?.focus({ preventScroll: true });
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onDocumentKeyDown);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onDocumentKeyDown);
    };
  }, [open, options.length]);

  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => {
      menuRef.current?.querySelector<HTMLElement>('[role="option"][aria-selected="true"]')?.focus({
        preventScroll: true,
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [open, selectedIndex]);

  const close = (returnFocus = true) => {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus({ preventScroll: true });
  };

  const choose = (option: Choice) => {
    onChange(option.id);
    close();
  };

  const focusOption = (index: number) => {
    const nodes = Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="option"]') ?? []);
    if (!nodes.length) return;
    const bounded = Math.max(0, Math.min(index, nodes.length - 1));
    nodes[bounded].focus({ preventScroll: true });
    nodes[bounded].scrollIntoView({ block: 'nearest' });
  };

  const onMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const nodes = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('[role="option"]'));
    if (!nodes.length) return;
    const focused = nodes.indexOf(document.activeElement as HTMLElement);
    const currentIndex = focused >= 0 ? focused : selectedIndex;

    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close();
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      focusOption(currentIndex + (event.key === 'ArrowDown' ? 1 : -1));
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      focusOption(event.key === 'Home' ? 0 : nodes.length - 1);
    } else if (event.key === 'Enter' || event.key === ' ') {
      const focusedOption = nodes[focused];
      if (focusedOption) {
        event.preventDefault();
        const option = options[focused];
        if (option) choose(option);
      }
    } else if (
      event.key.length === 1 &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey
    ) {
      const now = Date.now();
      typeahead.current = {
        value: now - typeahead.current.at > 700
          ? event.key.toLocaleLowerCase('ru')
          : typeahead.current.value + event.key.toLocaleLowerCase('ru'),
        at: now,
      };
      const match = options.findIndex((option) =>
        option.label.toLocaleLowerCase('ru').startsWith(typeahead.current.value),
      );
      if (match >= 0) {
        event.preventDefault();
        focusOption(match);
      }
    }
  };

  const optionNodes = options.map((option, index) => (
    <div
      key={option.id}
      id={id + '-option-' + index}
      role="option"
      aria-selected={option.id === value}
      tabIndex={0}
      data-choice-option
      className={styles.choiceOption}
      onClick={() => choose(option)}
    >
      <span>{option.label}</span>
      {option.id === value && <span className={styles.choiceCheck} aria-hidden="true">✓</span>}
    </div>
  ));

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={styles.choiceTrigger}
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={id}
        data-choice-trigger={dataKey}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (!open && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        <span className={styles.choiceCopy}>
          <span className={styles.choiceLabel}>{label}</span>
          <span className={styles.choiceValue} title={selected?.label || 'Выбрать'}>
            {selected?.label || 'Выбрать'}
          </span>
        </span>
        <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className={styles.chevron}>
          <path d="m6 8 4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && typeof document !== 'undefined' && createPortal(
        mobile ? (
          <div
            className={styles.sheetBackdrop}
            data-choice-layer
            onPointerDown={(event) => {
              if (event.target === event.currentTarget) close(false);
            }}
          >
            <section className={styles.sheet} aria-label={label}>
              <header className={styles.sheetHeader}>
                <strong>{label}</strong>
                <button type="button" aria-label={'Закрыть список: ' + label} onClick={() => close()}>
                  ×
                </button>
              </header>
              <div ref={menuRef} id={id} role="listbox" aria-label={label} className={styles.choiceList} onKeyDown={onMenuKeyDown}>
                {optionNodes}
              </div>
            </section>
          </div>
        ) : (
          <div
            ref={menuRef}
            id={id}
            role="listbox"
            aria-label={label}
            data-choice-layer
            className={styles.choicePopup}
            style={position}
            onKeyDown={onMenuKeyDown}
          >
            {optionNodes}
          </div>
        ),
        document.body,
      )}
    </>
  );
}

export default function WatchControls({
  identity, episodes, secondary, translationLabel, translation, translations,
  onTranslation, source, sources, onSource, quality, theater, onTheater,
}: {
  identity: ReactNode;
  episodes: ReactNode;
  secondary: ReactNode;
  translationLabel: string;
  translation: string;
  translations: Choice[];
  onTranslation: (id: string) => void;
  source: string;
  sources: Choice[];
  onSource: (id: string) => void;
  quality: string;
  theater: boolean;
  onTheater: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [position, setPosition] = useState({ top: 80, left: 12, width: 320 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement | null>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;

    const updatePosition = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      const phone = window.matchMedia('(max-width: 640px)').matches;
      setMobile(phone);
      if (phone || !rect) return;

      const width = Math.min(320, window.innerWidth - 24);
      const left = Math.min(
        Math.max(12, rect.right - width),
        window.innerWidth - width - 12,
      );
      const estimatedHeight = Math.min(340, window.innerHeight - 24);
      let top = rect.bottom + 8;
      if (top + estimatedHeight > window.innerHeight - 8 && rect.top > estimatedHeight + 8) {
        top = rect.top - estimatedHeight - 8;
      }
      top = Math.max(8, Math.min(top, window.innerHeight - 160));
      setPosition({ top, left, width });
    };

    const close = (event: KeyboardEvent | PointerEvent) => {
      if (event instanceof KeyboardEvent) {
        if (event.key !== 'Escape') return;
        setOpen(false);
        triggerRef.current?.focus({ preventScroll: true });
      } else if (event.target instanceof Node) {
        const target = event.target;
        if (
          panelRef.current?.contains(target) ||
          triggerRef.current?.contains(target) ||
          (target instanceof Element && target.closest('[data-choice-layer]'))
        ) return;
        setOpen(false);
      }
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    document.addEventListener('keydown', close);
    document.addEventListener('pointerdown', close);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
      document.removeEventListener('keydown', close);
      document.removeEventListener('pointerdown', close);
    };
  }, [open]);

  const sourceOptions = [
    { id: 'auto', label: 'Авто' },
    ...sources,
  ];

  const settingsPanel = (
    <>
      <div className={styles.panelHeader}>
        <div>
          <strong>Источник и качество</strong>
          <span>Настройки воспроизведения</span>
        </div>
        <button
          type="button"
          className={styles.panelClose}
          aria-label="Закрыть настройки просмотра"
          onClick={() => {
            setOpen(false);
            triggerRef.current?.focus({ preventScroll: true });
          }}
        >
          ×
        </button>
      </div>
      <div className={styles.sourceBlock}>
        <ChoiceSelect
          label="Источник видео"
          dataKey="source"
          value={source}
          options={sourceOptions}
          onChange={onSource}
        />
        <p className={styles.quality}>{quality}</p>
      </div>
      <div className={styles.panelActions}>
        <button
          type="button"
          data-player-action="theater"
          aria-label={theater ? 'Выключить режим кинотеатра' : 'Включить режим кинотеатра'}
          aria-pressed={theater}
          title={theater ? 'Выйти из кинотеатра' : 'Кинотеатр'}
          className={styles.theater}
          onClick={() => {
            setOpen(false);
            onTheater();
          }}
        >
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.7" />
            <path d="M8 5v3M12 5v3M16 5v3M8 16v3M12 16v3M16 16v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <span>Кинотеатр</span>
        </button>
      </div>
    </>
  );

  return (
    <div className={styles.controls} data-watch-controls>
      {identity}
      <div className={styles.toolbar}>
        {episodes}
        {translations.length > 0 ? (
          <ChoiceSelect
            label={translationLabel}
            dataKey="translation"
            value={translation}
            options={translations}
            onChange={onTranslation}
          />
        ) : <span />}
        <button
          ref={triggerRef}
          type="button"
          className={styles.more}
          aria-label="Источник и качество"
          aria-expanded={open}
          aria-controls={panelId}
          data-watch-settings-trigger
          title="Источник и качество"
          onClick={() => setOpen((value) => !value)}
        >
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M12 8.2a3.8 3.8 0 1 0 0 7.6 3.8 3.8 0 0 0 0-7.6Z" stroke="currentColor" strokeWidth="1.7" />
            <path d="m19.2 13.8 1.2.9-1.4 2.4-1.5-.6a7.8 7.8 0 0 1-1.8 1l-.2 1.6h-2.8l-.3-1.6a7.8 7.8 0 0 1-1.8-1l-1.5.6-1.4-2.4 1.2-.9a7.1 7.1 0 0 1 0-2l-1.2-.9 1.4-2.4 1.5.6a7.8 7.8 0 0 1 1.8-1l.3-1.6h2.8l.2 1.6a7.8 7.8 0 0 1 1.8 1l1.5-.6 1.4 2.4-1.2.9a7.1 7.1 0 0 1 0 2Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      <div className={styles.secondary}>{secondary}</div>

      {open && typeof document !== 'undefined' && createPortal(
        mobile ? (
          <div
            className={styles.sheetBackdrop}
            data-watch-settings-overlay
            onPointerDown={(event) => {
              if (event.target === event.currentTarget) setOpen(false);
            }}
          >
            <section ref={panelRef} id={panelId} aria-label="Источник и качество" data-watch-settings-panel className={styles.panel + ' ' + styles.panelSheet}>
              {settingsPanel}
            </section>
          </div>
        ) : (
          <section
            ref={panelRef}
            id={panelId}
            aria-label="Источник и качество"
            data-watch-settings-panel
            className={styles.panel}
            style={position}
          >
            {settingsPanel}
          </section>
        ),
        document.body,
      )}
    </div>
  );
}
