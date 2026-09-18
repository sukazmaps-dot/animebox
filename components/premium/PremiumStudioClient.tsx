'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import {
  PREMIUM_PROFILE_THEMES,
  PREMIUM_PROFILE_THEME_META,
  type PremiumProfileTheme,
} from '@/lib/premium-studio';

type StudioResponse = {
  allowed?: boolean;
  theme?: PremiumProfileTheme;
  error?: string;
};

export default function PremiumStudioClient() {
  const [theme, setTheme] = useState<PremiumProfileTheme>('default');
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [saving, setSaving] = useState<PremiumProfileTheme | ''>('');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');

  useEffect(() => {
    let active = true;

    void fetch('/api/premium/studio', { cache: 'no-store' })
      .then(async (response) => {
        const payload = (await response.json()) as StudioResponse;
        if (!response.ok) throw new Error(payload.error || 'Не удалось загрузить Profile Studio');
        if (!active) return;
        setAllowed(Boolean(payload.allowed));
        setTheme(payload.theme ?? 'default');
      })
      .catch((requestError) => {
        if (!active) return;
        setAllowed(false);
        setError(
          requestError instanceof Error
            ? requestError.message
            : 'Не удалось загрузить Profile Studio',
        );
      });

    return () => {
      active = false;
    };
  }, []);

  async function saveTheme(nextTheme: PremiumProfileTheme) {
    if (!allowed || saving) return;

    setSaving(nextTheme);
    setError('');
    setSaved('');

    try {
      const response = await fetch('/api/premium/studio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ theme: nextTheme }),
      });
      const payload = (await response.json()) as StudioResponse;

      if (!response.ok) {
        throw new Error(payload.error || 'Не удалось сохранить тему');
      }

      setTheme(nextTheme);
      setSaved('Тема сохранена ✓');
      window.dispatchEvent(new Event('animebox:premium-studio-updated'));
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Не удалось сохранить тему',
      );
    } finally {
      setSaving('');
    }
  }

  if (allowed === null) {
    return (
      <main className="premium-studio">
        <div className="premium-studio__state">Загружаем Profile Studio…</div>
      </main>
    );
  }

  if (!allowed) {
    return (
      <main className="premium-studio">
        <section className="premium-studio__locked">
          <span>PROFILE STUDIO</span>
          <h1>Персонализация профиля — часть AnimeBox Premium</h1>
          <p>
            Premium открывает готовые темы профиля. Произвольный CSS не используется:
            все варианты проходят через безопасные пресеты AnimeBox.
          </p>
          <Link className="premium-cta premium-cta--primary" href="/premium">
            Открыть AnimeBox Premium
          </Link>
          {error && <small>{error}</small>}
        </section>
      </main>
    );
  }

  return (
    <main className="premium-studio">
      <div className="premium-studio__head">
        <div>
          <span>ANIMEBOX PREMIUM</span>
          <h1>Profile Studio</h1>
          <p>Выбери готовое оформление — оно будет видно и в публичном профиле.</p>
        </div>
        <Link href="/profile">← В профиль</Link>
      </div>

      <section className="premium-studio__themes">
        {PREMIUM_PROFILE_THEMES.map((id) => {
          const meta = PREMIUM_PROFILE_THEME_META[id];
          const selected = theme === id;

          return (
            <article
              key={id}
              className={`premium-studio-theme premium-studio-theme--${id} ${
                selected ? 'is-selected' : ''
              }`}
            >
              <div className="premium-studio-theme__preview">
                <span />
                <strong>AnimeBox</strong>
                <small>Premium Profile</small>
              </div>

              <div>
                <h2>{meta.label}</h2>
                <p>{meta.description}</p>
              </div>

              <button
                type="button"
                disabled={Boolean(saving) || selected}
                onClick={() => void saveTheme(id)}
              >
                {selected
                  ? 'Выбрано'
                  : saving === id
                    ? 'Сохраняем…'
                    : 'Применить'}
              </button>
            </article>
          );
        })}
      </section>

      {saved && <div className="premium-studio__message">{saved}</div>}
      {error && <div className="premium-studio__message is-error">{error}</div>}
    </main>
  );
}
