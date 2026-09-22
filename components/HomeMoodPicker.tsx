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
    label: 'Как обычно',
    hint: 'Баланс твоего вкуса',
    icon: '/brand/emojis/moods/mood-any-cat.webp',
  },
  {
    value: 'comfort',
    label: 'Уют',
    hint: 'Спокойнее и теплее',
    icon: '/brand/emojis/moods/mood-cozy-cup.webp',
  },
  {
    value: 'tension',
    label: 'Напряжение',
    hint: 'Драйв, тайны, риск',
    icon: '/brand/emojis/moods/mood-dark-kitsune.webp',
  },
  {
    value: 'emotion',
    label: 'Эмоции',
    hint: 'Драма и сильные истории',
    icon: '/brand/emojis/moods/mood-cry.webp',
  },
  {
    value: 'adventure',
    label: 'Приключение',
    hint: 'Миры, путь, экшен',
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
        <span className="mood-picker__eyebrow">Сегодня вечером</span>
        <div>
          <h2 id="mood-picker-title">Какой сегодня вечер?</h2>
          <p>Уют, напряжение, эмоции или приключение — выбери свой вайб.</p>
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
