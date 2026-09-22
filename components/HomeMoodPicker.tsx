'use client';

import Image from 'next/image';

import type { TasteMood } from '@/lib/personalization';

const MOODS: Array<{
  value: TasteMood;
  label: string;
  hint: string;
  icon: string;
}> = [
  {
    value: 'any',
    label: 'Мой вкус',
    hint: 'По тому, что ты уже смотрел',
    icon: '/brand/emojis/moods/mood-any-cat.webp',
  },
  {
    value: 'comfort',
    label: 'Уют',
    hint: 'Ламповые истории для отдыха',
    icon: '/brand/emojis/moods/mood-cozy-cup.webp',
  },
  {
    value: 'tension',
    label: 'Триллер',
    hint: 'Саспенс, загадки и экшен',
    icon: '/brand/emojis/moods/mood-dark-kitsune.webp',
  },
  {
    value: 'emotion',
    label: 'Драма',
    hint: 'Стекло и сильные сюжеты',
    icon: '/brand/emojis/moods/mood-cry.webp',
  },
  {
    value: 'adventure',
    label: 'Другие миры',
    hint: 'Фэнтези, приключения и экшен',
    icon: '/brand/emojis/moods/mood-hype-fire.webp',
  },
];

export default function HomeMoodPicker({
  value,
  onChange,
}: {
  value: TasteMood;
  onChange: (value: TasteMood) => void;
}) {
  return (
    <section className="mood-picker" aria-labelledby="mood-picker-title">
      <div className="mood-picker__intro">
        <span className="mood-picker__eyebrow">Настроение</span>
        <div>
          <h2 id="mood-picker-title">Какое настроение на вечер?</h2>
          <p>Выбери вайб — подборка перестроится под него.</p>
        </div>
      </div>

      <div className="mood-picker__options" role="radiogroup" aria-label="Настроение для рекомендаций">
        {MOODS.map((mood) => {
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
