'use client';

import Image from 'next/image';

import {
  HOME_MOOD_OPTIONS,
  getRecommendationMoodLabel,
} from '@/lib/recommendation-moods';
import type { TasteMood } from '@/lib/personalization';

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

  return (
    <section
      className="mood-picker"
      aria-labelledby="mood-picker-title"
      aria-busy={busy}
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
                <Image
                  src={mood.icon}
                  alt=""
                  width={38}
                  height={38}
                  className="mood-chip__image"
                  sizes="38px"
                />
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
