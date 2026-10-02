'use client';

import { useState } from 'react';

import {
  HOME_MOOD_OPTIONS,
  getRecommendationMoodLabel,
} from '@/lib/recommendation-moods';
import type { TasteMood } from '@/lib/personalization';

const MOOD_FALLBACK_GLYPHS: Record<TasteMood, string> = {
  any: '✦',
  comfort: '☕',
  tension: '◆',
  emotion: '◇',
  adventure: '🔥',
};

export default function HomeMoodPicker({
  value,
  onChange,
  busy = false,
}: {
  value: TasteMood;
  onChange: (value: TasteMood) => void;
  busy?: boolean;
}) {
  const selectedLabel = getRecommendationMoodLabel(value);
  const [artUnlocked, setArtUnlocked] = useState(false);

  const unlockArt = () => {
    setArtUnlocked(true);
  };

  return (
    <section
      className="mood-picker"
      aria-labelledby="mood-picker-title"
      aria-busy={busy}
      data-mood-art={artUnlocked ? 'ready' : 'deferred'}
      onPointerEnter={unlockArt}
      onPointerDown={unlockArt}
      onFocusCapture={unlockArt}
    >
      <div className="mood-picker__intro">
        <span className="mood-picker__eyebrow">Настроение</span>
        <div>
          <h2 id="mood-picker-title">Какое настроение на вечер?</h2>
          <p aria-live="polite">
            {busy
              ? `Подбираем под настроение «${selectedLabel}»…`
              : 'Выбери настроение — подстроим подборку.'}
          </p>
        </div>
      </div>

      <div
        className="mood-picker__options"
        role="radiogroup"
        aria-label="Настроение для рекомендаций"
      >
        {HOME_MOOD_OPTIONS.map((mood) => {
          const active = value === mood.value;

          return (
            <button
              key={mood.value}
              type="button"
              role="radio"
              aria-checked={active}
              className={active ? 'mood-chip is-active' : 'mood-chip'}
              onClick={() => onChange(mood.value)}
            >
              <span className="mood-chip__icon" aria-hidden="true">
                {artUnlocked ? (
                  // These decorative illustrations are intentionally released
                  // only when the visitor reaches/interacts with the picker.
                  // The source assets are much larger than their ~27–32px slot
                  // and must never compete with the Home LCP network window.
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
                    className="grid h-[27px] w-[27px] place-items-center text-[18px] leading-none text-white/80"
                  >
                    {MOOD_FALLBACK_GLYPHS[mood.value]}
                  </span>
                )}
              </span>

              <span className="mood-chip__copy">
                <strong>{mood.label}</strong>
                <small>{mood.hint}</small>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
