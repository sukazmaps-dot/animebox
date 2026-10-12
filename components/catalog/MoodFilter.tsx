'use client';

import Image from 'next/image';
import { useEffect, useId, useRef, useState } from 'react';

import {
  CATALOG_MOODS,
  type CatalogMood,
} from '@/lib/catalog-moods';

import styles from './MoodFilter.module.css';

type MoodFilterProps = {
  value: CatalogMood;
  onChange: (value: CatalogMood) => void;
};

export default function MoodFilter({ value, onChange }: MoodFilterProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const listId = useId();

  useEffect(() => {
    if (!open) return;
    const measure = () => {
      const menu = dropdownRef.current;
      if (!menu) return;
      const viewportBottom = window.visualViewport
        ? window.visualViewport.offsetTop + window.visualViewport.height
        : window.innerHeight;
      const bottomNavigation = document.querySelector('.mobile-nav, .mobile-bottom-nav, .bottom-nav, [data-mobile-nav]');
      const bottom = bottomNavigation?.getBoundingClientRect().top ?? viewportBottom - 80;
      const available = Math.min(bottom, viewportBottom) - menu.getBoundingClientRect().top - 12;
      menu.style.setProperty('--mood-menu-available-height', `${Math.max(44, available)}px`);
    };
    measure();
    dropdownRef.current?.querySelector<HTMLButtonElement>('[aria-selected="true"]')?.focus({ preventScroll: true });
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, { passive: true });
    window.visualViewport?.addEventListener('resize', measure);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure);
      window.visualViewport?.removeEventListener('resize', measure);
    };
  }, [open]);

  const selected = CATALOG_MOODS.find((mood) => mood.id === value) ?? CATALOG_MOODS[0];

  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && rootRef.current?.contains(document.activeElement)) {
        setOpen(false);
        triggerRef.current?.focus({ preventScroll: true });
      }
    }

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  return (
    <div ref={rootRef} className={styles.root}>
      <button
        ref={triggerRef}
        type="button"
        className={`${styles.trigger} ${value !== 'any' ? styles.triggerActive : ''}`}
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        <span className={styles.emoji} aria-hidden="true">
          <Image
            src={selected.icon}
            unoptimized
            alt=""
            width={24}
            height={24}
            className={styles.emojiImage}
            sizes="24px"
          />
        </span>

        <span className={styles.label}>{selected.label}</span>

        <span className={`${styles.chevron} ${open ? styles.chevronOpen : ''}`} aria-hidden="true">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M6 9L12 15L18 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </button>

      <div
        id={listId}
        ref={dropdownRef}
        inert={!open}
        onKeyDown={(event) => {
          if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
          event.preventDefault();
          const options = Array.from(dropdownRef.current?.querySelectorAll<HTMLButtonElement>('[role="option"]') ?? []);
          const index = options.indexOf(document.activeElement as HTMLButtonElement);
          const next = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 :
            (index + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length;
          options[next]?.focus();
        }}
        className={`${styles.dropdown} ${open ? styles.dropdownOpen : ''}`}
        role="listbox"
        aria-label="Под настроение"
      >
        <div className={styles.header}>
          <strong>Под настроение</strong>
          <span>Атмосфера важнее формального жанра</span>
        </div>

        <div className={styles.options}>
          {CATALOG_MOODS.map((mood) => {
            const active = mood.id === value;

            return (
              <button
                key={mood.id}
                type="button"
                role="option"
                aria-selected={active}
                className={`${styles.option} ${active ? styles.optionActive : ''}`}
                onClick={() => {
                  onChange(mood.id);
                  setOpen(false);
                  triggerRef.current?.focus({ preventScroll: true });
                }}
              >
                <span className={styles.optionEmoji} aria-hidden="true">
                  <Image
                    src={mood.icon}
                    unoptimized
                    alt=""
                    width={30}
                    height={30}
                    className={styles.optionEmojiImage}
                    sizes="30px"
                  />
                </span>

                <span>{mood.label}</span>
                {active && <span className={styles.check} aria-hidden="true">✓</span>}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
