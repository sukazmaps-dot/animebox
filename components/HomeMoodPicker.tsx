'use client';

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { observeNearViewportMedia } from '@/lib/media-warmup-client';
import Icon from '@/components/Icon';
import styles from './HomeMoodPicker.module.css';

import {
  HOME_MOOD_OPTIONS,
  getRecommendationMoodLabel,
} from '@/lib/recommendation-moods';
import type { TasteMood } from '@/lib/personalization';

const MOOD_FALLBACK_GLYPHS: Record<TasteMood, 'spark' | 'home' | 'search' | 'heart' | 'chevron'> = {
  any: 'spark',
  comfort: 'home',
  tension: 'search',
  emotion: 'heart',
  adventure: 'chevron',
};

export default function HomeMoodPicker({
  value,
  onChange,
  busy = false,
  compact = false,
}: {
  value: TasteMood;
  onChange: (value: TasteMood) => void;
  busy?: boolean;
  compact?: boolean;
}) {
  const selectedLabel = getRecommendationMoodLabel(value);
  const [artUnlocked, setArtUnlocked] = useState(false);
  const rootRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || artUnlocked || compact) return;
    return observeNearViewportMedia(root, () => setArtUnlocked(true));
  }, [artUnlocked, compact]);

  const unlockArt = () => {
    if (!compact) setArtUnlocked(true);
  };

  const navigateMoods = (event: KeyboardEvent<HTMLDivElement>) => {
    const directions: Record<string, number> = {
      ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1,
    };
    if (!(event.key in directions) && event.key !== 'Home' && event.key !== 'End') return;
    event.preventDefault();
    const current = HOME_MOOD_OPTIONS.findIndex((mood) => mood.value === value);
    const index = event.key === 'Home' ? 0 : event.key === 'End'
      ? HOME_MOOD_OPTIONS.length - 1
      : (current + directions[event.key] + HOME_MOOD_OPTIONS.length) % HOME_MOOD_OPTIONS.length;
    onChange(HOME_MOOD_OPTIONS[index].value);
    event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]')[index]?.focus();
  };

  return (
    <section
      ref={rootRef}
      className={compact ? styles.compact : 'mood-picker'}
      aria-labelledby="mood-picker-title"
      aria-busy={busy}
      data-mood-art={artUnlocked ? 'ready' : 'deferred'}
      onPointerEnter={unlockArt}
      onPointerDown={unlockArt}
      onFocusCapture={unlockArt}
    >
      <div className={compact ? styles.intro : 'mood-picker__intro'}>
        <span className="mood-picker__eyebrow">Настроение</span>
        <div>
          <h2 id="mood-picker-title">Что хочется посмотреть?</h2>
          <p aria-live="polite">
            {busy
              ? `Подбираем под настроение «${selectedLabel}»…`
              : 'Выбери настроение — подстроим подборку.'}
          </p>
        </div>
      </div>

      <div
        className={compact ? styles.options : 'mood-picker__options'}
        role="radiogroup"
        aria-label="Настроение для рекомендаций"
        onKeyDown={navigateMoods}
      >
        {HOME_MOOD_OPTIONS.map((mood) => {
          const active = value === mood.value;

          return (
            <button
              key={mood.value}
              type="button"
              role="radio"
              aria-checked={active}
              tabIndex={active ? 0 : -1}
              data-mood={mood.value}
              className={compact ? styles.chip : active ? 'mood-chip is-active' : 'mood-chip'}
              onClick={() => onChange(mood.value)}
            >
              {!compact && <span className="mood-chip__icon" aria-hidden="true">
                {artUnlocked ? (
                  // These decorative illustrations are intentionally released
                  // only when the visitor reaches/interacts with the picker.
                  // Compact, content-hashed assets remain low priority so they
                  // do not compete with the Home LCP network window.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={mood.icon}
                    alt=""
                    width={38}
                    height={38}
                    loading="lazy"
                    fetchPriority="low"
                    decoding="async"
                    className="mood-chip__image"
                  />
                ) : (
                  <span
                    className="mood-chip__placeholder"
                  >
                    <Icon name={MOOD_FALLBACK_GLYPHS[mood.value]} size={22} />
                  </span>
                )}
              </span>}

              <span className={compact ? styles.copy : 'mood-chip__copy'}>
                <strong>{mood.label}</strong>
                {!compact && <small>{mood.hint}</small>}
              </span>
              {!compact && <span className="mood-chip__selected" aria-hidden="true">{active ? '✓' : ''}</span>}
            </button>
          );
        })}
      </div>
    </section>
  );
}
