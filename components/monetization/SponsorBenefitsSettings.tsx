'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useAuthState } from '@/components/AuthStateProvider';

import AnimeBoxStar from './AnimeBoxStar';
import SponsorBadge from './SponsorBadge';
import { invalidateSponsorMe } from '@/lib/sponsor-me-client';
import {
  SPONSOR_META,
  SPONSOR_THRESHOLDS,
  type SponsorFrame,
  type SponsorNameStyle,
  type SponsorPreferences,
  type SponsorProfileTheme,
  type SponsorTier,
} from '@/lib/sponsor';

type SettingsData = {
  totalStars: number;
  tier: SponsorTier | null;
  preferences: SponsorPreferences;
  benefits: {
    adFree: boolean;
    frames: SponsorFrame[];
    nameStyles: SponsorNameStyle[];
    themes: SponsorProfileTheme[];
  };
};

const FRAME_LABELS: Record<SponsorFrame, string> = {
  tier_default: 'Автоматически по уровню',
  none: 'Без рамки',
  supporter: 'Supporter · фиолетовая',
  premium: 'Premium · неоновая',
  patron: 'Patron · золотая',
};

const NAME_LABELS: Record<SponsorNameStyle, string> = {
  tier_default: 'Автоматически по уровню',
  none: 'Обычный ник',
  supporter: 'Supporter violet',
  premium: 'Premium neon',
  patron: 'Patron gold',
};

const THEME_LABELS: Record<SponsorProfileTheme, string> = {
  default: 'Обычная',
  violet: 'Violet Glass',
  aurora: 'Anime Aurora',
  royal: 'Royal Patron',
};

const NEXT_TIER: Record<SponsorTier, SponsorTier | null> = {
  supporter: 'premium',
  premium: 'patron',
  patron: null,
};

function tierFloor(tier: SponsorTier | null) {
  if (!tier) return 0;
  return SPONSOR_THRESHOLDS[tier];
}

export default function SponsorBenefitsSettings() {
  const { user } = useAuthState();
  const [data, setData] = useState<SettingsData | null>(null);
  const [draft, setDraft] = useState<SponsorPreferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let active = true;
    void fetch('/api/monetization/sponsor/preferences', { cache: 'no-store' })
      .then(async (response) => {
        const payload = (await response.json()) as SettingsData & { error?: string };
        if (!response.ok) throw new Error(payload.error || 'Не удалось загрузить настройки');
        if (!active) return;
        setData(payload);
        setDraft(payload.preferences);
      })
      .catch((loadError) => {
        if (active) setError(loadError instanceof Error ? loadError.message : 'Ошибка загрузки');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const changed = useMemo(
    () => Boolean(data && draft && JSON.stringify(data.preferences) !== JSON.stringify(draft)),
    [data, draft],
  );

  const levelProgress = useMemo(() => {
    if (!data) return null;
    const nextTier = data.tier ? NEXT_TIER[data.tier] : 'supporter';
    if (!nextTier) {
      return { nextTier: null, nextAt: data.totalStars, remaining: 0, percent: 100, floor: SPONSOR_THRESHOLDS.patron };
    }
    const floor = data.tier ? tierFloor(data.tier) : 0;
    const nextAt = SPONSOR_THRESHOLDS[nextTier];
    const range = Math.max(1, nextAt - floor);
    const current = Math.max(0, data.totalStars - floor);
    return {
      nextTier,
      nextAt,
      remaining: Math.max(0, nextAt - data.totalStars),
      percent: Math.max(0, Math.min(100, Math.round((current / range) * 100))),
      floor,
    };
  }, [data]);

  async function save() {
    if (!draft || !data) return;
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      const response = await fetch('/api/monetization/sponsor/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      });
      const payload = (await response.json()) as SettingsData & { error?: string };
      if (!response.ok) throw new Error(payload.error || 'Не удалось сохранить настройки');
      setData(payload);
      setDraft(payload.preferences);
      invalidateSponsorMe(user?.id);
      window.dispatchEvent(new Event('animebox:sponsor-preferences-changed'));
      setSaved(true);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <section className="sponsor-v3-settings-card"><p role="status">Загружаем настройки…</p></section>;
  }

  if (!data || !draft) {
    return (
      <section className="sponsor-v3-settings-card">
        <p role="alert">{error || 'Настройки недоступны.'}</p>
        <Link href="/profile">Вернуться в профиль</Link>
      </section>
    );
  }

  return (
    <div className="sponsor-v3-settings-grid">
      <section className="sponsor-v3-settings-card sponsor-v3-settings-card--summary">
        <div className="sponsor-v3-summary-top">
          <div>
            <span className="sponsor-v2-eyebrow">ТЕКУЩИЙ УРОВЕНЬ</span>
            <div className="sponsor-v3-settings-tier">
              <strong>{data.totalStars.toLocaleString('ru-RU')}</strong>
              <AnimeBoxStar size={28} className="animebox-star-icon--pulse" />
              {data.tier ? <SponsorBadge tier={data.tier} /> : <span className="sponsor-v3-no-tier">Пока без уровня</span>}
            </div>
            <p>
              {data.tier
                ? SPONSOR_META[data.tier].description
                : 'Поддержи AnimeBox на 25 Stars, чтобы открыть первую рамку и спонсорский статус.'}
            </p>
          </div>
          <div className="sponsor-v3-level-emblem" aria-hidden="true">
            <AnimeBoxStar size={34} />
          </div>
        </div>

        {levelProgress && (
          <div className="sponsor-v3-level-progress">
            <div className="sponsor-v3-level-progress__copy">
              {levelProgress.nextTier ? (
                <>
                  <strong>До уровня «{SPONSOR_META[levelProgress.nextTier].shortLabel}»</strong>
                  <span>Ещё {levelProgress.remaining.toLocaleString('ru-RU')} ★ · {data.totalStars.toLocaleString('ru-RU')} / {levelProgress.nextAt.toLocaleString('ru-RU')}</span>
                </>
              ) : (
                <>
                  <strong>Максимальный спонсорский уровень открыт</strong>
                  <span>Спасибо за огромную поддержку AnimeBox.</span>
                </>
              )}
            </div>
            <div className="sponsor-v3-level-progress__track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={levelProgress.percent}>
              <span style={{ width: `${levelProgress.percent}%` }} />
            </div>
          </div>
        )}

        <div className="sponsor-v3-benefit-chips">
          <span data-active={data.benefits.adFree}>Без рекламы {data.benefits.adFree ? '✓' : '🔒'}</span>
          <span>{Math.max(0, data.benefits.frames.length - 2)} рамок</span>
          <span>{data.benefits.themes.length} тем</span>
        </div>
      </section>

      <section className="sponsor-v3-settings-card">
        <h2>Рамка аватара</h2>
        <p>Выбери рамку из уже открытых уровней.</p>
        <div className="sponsor-v3-choice-grid">
          {data.benefits.frames.map((frame) => (
            <button
              type="button"
              key={frame}
              data-selected={draft.selectedFrame === frame}
              aria-pressed={draft.selectedFrame === frame}
              onClick={() => setDraft((current) => current ? { ...current, selectedFrame: frame } : current)}
            >
              {draft.selectedFrame === frame && <span className="sponsor-v3-selected-mark" aria-hidden="true">✓</span>}
              <span className="sponsor-v3-frame-preview" data-frame={frame} aria-hidden="true" />
              <strong>{FRAME_LABELS[frame]}</strong>
            </button>
          ))}
        </div>
      </section>

      <section className="sponsor-v3-settings-card">
        <h2>Стиль ника</h2>
        <p>Оформление применяется к профилю, комментариям и лидерборду.</p>
        <div className="sponsor-v3-choice-grid sponsor-v3-choice-grid--names">
          {data.benefits.nameStyles.map((style) => (
            <button
              type="button"
              key={style}
              data-selected={draft.nameStyle === style}
              aria-pressed={draft.nameStyle === style}
              onClick={() => setDraft((current) => current ? { ...current, nameStyle: style } : current)}
            >
              {draft.nameStyle === style && <span className="sponsor-v3-selected-mark" aria-hidden="true">✓</span>}
              <span className="sponsor-v3-name-preview" data-style={style}>AnimeBox User</span>
              <strong>{NAME_LABELS[style]}</strong>
            </button>
          ))}
        </div>
      </section>

      <section className="sponsor-v3-settings-card">
        <h2>Тема профиля</h2>
        <p>Premium открывает Violet и Aurora, Patron — Royal.</p>
        <div className="sponsor-v3-theme-grid">
          {data.benefits.themes.map((theme) => (
            <button
              type="button"
              key={theme}
              data-theme={theme}
              data-selected={draft.profileTheme === theme}
              aria-pressed={draft.profileTheme === theme}
              onClick={() => setDraft((current) => current ? { ...current, profileTheme: theme } : current)}
            >
              {draft.profileTheme === theme && <span className="sponsor-v3-selected-mark" aria-hidden="true">✓</span>}
              <span className="sponsor-v3-theme-preview" />
              <strong>{THEME_LABELS[theme]}</strong>
            </button>
          ))}
        </div>
      </section>

      <section className="sponsor-v3-settings-card sponsor-v3-privacy-card">
        <div className="sponsor-v3-card-heading">
          <div><h2>Приватность и отображение</h2><p>Ты сам решаешь, что увидят другие пользователи AnimeBox.</p></div>
          <span className="sponsor-v3-private-chip">Приватность</span>
        </div>

        <label className="sponsor-v3-toggle-row">
          <span><strong>Показывать sponsor badge</strong><small>Можно оставить оформление ника и скрыть значок спонсора.</small></span>
          <span className="sponsor-v3-switch">
            <input aria-label="Показывать sponsor badge" type="checkbox" checked={draft.badgeVisible} onChange={(event) => setDraft({ ...draft, badgeVisible: event.target.checked })} />
            <span className="sponsor-v3-switch-track" aria-hidden="true"><span /></span>
          </span>
        </label>

        <label className="sponsor-v3-toggle-row">
          <span><strong>Показывать меня на стене спонсоров</strong><small>Профиль появится в публичном рейтинге только после сохранения.</small></span>
          <span className="sponsor-v3-switch">
            <input aria-label="Показывать меня на стене спонсоров" type="checkbox" checked={draft.wallVisible} onChange={(event) => setDraft({ ...draft, wallVisible: event.target.checked })} />
            <span className="sponsor-v3-switch-track" aria-hidden="true"><span /></span>
          </span>
        </label>

        <label className={`sponsor-v3-toggle-row ${!draft.wallVisible ? 'is-disabled' : ''}`}>
          <span><strong>Показывать количество Stars</strong><small>{draft.wallVisible ? 'Сумма будет видна рядом с твоим местом в рейтинге.' : 'Сначала включи отображение на стене спонсоров.'}</small></span>
          <span className="sponsor-v3-switch">
            <input aria-label="Показывать количество Stars" type="checkbox" checked={draft.showStarAmount} disabled={!draft.wallVisible} onChange={(event) => setDraft({ ...draft, showStarAmount: event.target.checked })} />
            <span className="sponsor-v3-switch-track" aria-hidden="true"><span /></span>
          </span>
        </label>
      </section>

      <div className="sponsor-v3-settings-savebar">
        <div>
          {error && <span className="sponsor-v25-error">{error}</span>}
          {saved && <span className="sponsor-v3-saved">Сохранено ✓</span>}
        </div>
        <button type="button" className="sponsor-v3-save-button" disabled={!changed || saving} onClick={() => void save()}>
          <span>{saving ? 'Сохраняем…' : changed ? 'Сохранить оформление' : 'Изменений нет'}</span>
          {!saving && changed && <span aria-hidden="true">→</span>}
        </button>
      </div>
    </div>
  );
}
