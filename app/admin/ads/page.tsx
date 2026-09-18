'use client';

import { useEffect, useMemo, useState } from 'react';

import {
  AD_PLACEMENT_DEFINITIONS,
  AD_PLACEMENTS,
  type AdPlacement,
  type AdStoredSettings,
} from '@/lib/ads';
import { clearAdConfigCache } from '@/lib/ads-client';

type AdminAdsData = {
  role: 'owner' | 'admin';
  environmentEnabled: boolean;
  provider: string;
  persistenceAvailable: boolean;
  settings: AdStoredSettings;
};

function Switch({
  checked,
  disabled,
  onChange,
  label,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      className={`admin-ad-switch ${checked ? 'is-on' : ''}`}
      onClick={() => onChange(!checked)}
    >
      <span />
    </button>
  );
}

export default function AdsAdminPage() {
  const [data, setData] = useState<AdminAdsData | null>(null);
  const [draft, setDraft] = useState<AdStoredSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    fetch('/api/admin/ads', { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        const body = (await response.json()) as AdminAdsData & { error?: string };
        if (!response.ok) throw new Error(body.error || 'Не удалось загрузить настройки рекламы.');
        setData(body);
        setDraft(body.settings);
      })
      .catch((requestError) => {
        if (!controller.signal.aborted) {
          setError(requestError instanceof Error ? requestError.message : 'Не удалось загрузить настройки рекламы.');
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, []);

  const effectiveEnabled = Boolean(
    data?.environmentEnabled &&
      draft?.enabled &&
      data.provider !== 'none',
  );

  const enabledPlacementCount = useMemo(
    () =>
      draft
        ? AD_PLACEMENTS.filter((placement) => draft.placements[placement]).length
        : 0,
    [draft],
  );

  function setPlacement(placement: AdPlacement, checked: boolean) {
    setDraft((current) =>
      current
        ? {
            ...current,
            placements: {
              ...current.placements,
              [placement]: checked,
            },
          }
        : current,
    );
    setSaved(false);
  }

  async function save() {
    if (!draft) return;
    setSaving(true);
    setError('');
    setSaved(false);

    try {
      const response = await fetch('/api/admin/ads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      });
      const body = (await response.json()) as { error?: string; settings?: AdStoredSettings };
      if (!response.ok) throw new Error(body.error || 'Не удалось сохранить настройки.');

      if (body.settings) setDraft(body.settings);
      setSaved(true);
      clearAdConfigCache();
      window.dispatchEvent(new Event('animebox:ads-config-updated'));
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Не удалось сохранить настройки.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="admin-v1-page admin-ads-page">
      <header className="admin-v1-header">
        <div>
          <span>MONETIZATION · ADS V1</span>
          <h1>Лёгкая реклама</h1>
          <p>Глобальный выключатель, места показа и ограничение частоты без вмешательства в плеер.</p>
        </div>
        <button type="button" disabled={!draft || saving || !data?.persistenceAvailable} onClick={() => void save()}>
          {saving ? 'Сохраняем…' : saved ? 'Сохранено ✓' : 'Сохранить'}
        </button>
      </header>

      {loading && <p className="admin-v1-loading">Загрузка рекламных настроек…</p>}
      {error && <p className="admin-v1-error" role="alert">{error}</p>}

      {data && draft && (
        <>
          {!data.persistenceAvailable && (
            <div className="admin-ad-warning">
              <strong>Нужна SQL-миграция</strong>
              <span>Выполни <code>supabase/ad-system-v1.sql</code> в Supabase SQL Editor. До этого сайт использует безопасный env fallback.</span>
            </div>
          )}

          {!data.environmentEnabled && (
            <div className="admin-ad-warning">
              <strong>Environment kill switch выключен</strong>
              <span>Добавь <code>NEXT_PUBLIC_ADS_ENABLED=true</code> в Vercel. Админ-переключатель не может обойти этот флаг.</span>
            </div>
          )}

          {data.provider === 'none' && (
            <div className="admin-ad-warning is-soft">
              <strong>Рекламный провайдер ещё не подключён</strong>
              <span>Система готова, но слоты не появятся, пока <code>NEXT_PUBLIC_AD_PROVIDER</code> равен <code>none</code>. Для проверки UI можно временно поставить <code>house</code>.</span>
            </div>
          )}

          {data.provider === 'adsterra' && (
            <div className="admin-ad-warning is-soft">
              <strong>Adsterra Native Banner подключён</strong>
              <span>AnimeBox использует только Native Banner. Popunder и Social Bar в код сайта не добавлены.</span>
            </div>
          )}

          <section className="admin-ad-summary">
            <article>
              <span>Состояние</span>
              <strong>{effectiveEnabled ? 'Активно' : 'Отключено'}</strong>
              <small>Учитывает env, runtime toggle и provider.</small>
            </article>
            <article>
              <span>Провайдер</span>
              <strong>{data.provider}</strong>
              <small>Задаётся через окружение.</small>
            </article>
            <article>
              <span>Мест включено</span>
              <strong>{enabledPlacementCount} / {AD_PLACEMENTS.length}</strong>
              <small>Каждое место можно отключить отдельно.</small>
            </article>
          </section>

          <section className="admin-v1-card admin-ad-master">
            <div>
              <span>ГЛОБАЛЬНЫЙ ПОКАЗ</span>
              <h2>Реклама на AnimeBox</h2>
              <p>Мгновенно выключает все рекламные слоты без нового deploy. Sponsor/Patron и staff с ad-free всё равно не видят рекламу.</p>
            </div>
            <Switch
              label="Глобальный показ рекламы"
              checked={draft.enabled}
              disabled={!data.persistenceAvailable}
              onChange={(checked) => {
                setDraft({ ...draft, enabled: checked });
                setSaved(false);
              }}
            />
          </section>

          <section className="admin-ad-controls">
            <label>
              <span>Максимум за сессию</span>
              <strong>{draft.maxAdsPerSession}</strong>
              <input
                type="range"
                min="1"
                max="10"
                value={draft.maxAdsPerSession}
                onChange={(event) => {
                  setDraft({ ...draft, maxAdsPerSession: Number(event.target.value) });
                  setSaved(false);
                }}
              />
              <small>Для лёгкой монетизации рекомендуем 2–3.</small>
            </label>

            <label>
              <span>Пауза между блоками</span>
              <strong>{draft.minSecondsBetweenAds} сек.</strong>
              <input
                type="range"
                min="0"
                max="600"
                step="30"
                value={draft.minSecondsBetweenAds}
                onChange={(event) => {
                  setDraft({ ...draft, minSecondsBetweenAds: Number(event.target.value) });
                  setSaved(false);
                }}
              />
              <small>120 секунд — хороший старт, чтобы реклама не преследовала пользователя.</small>
            </label>
          </section>

          <section className="admin-ad-placements">
            <div className="admin-v1-card-head">
              <div>
                <span>PLACEMENTS</span>
                <h2>Места показа</h2>
              </div>
            </div>

            <div className="admin-ad-placement-grid">
              {AD_PLACEMENTS.map((placement) => {
                const definition = AD_PLACEMENT_DEFINITIONS[placement];
                return (
                  <article key={placement} className={draft.placements[placement] ? 'is-enabled' : ''}>
                    <div>
                      <span>{definition.format}</span>
                      <h3>{definition.label}</h3>
                      <p>{definition.description}</p>
                      <code>{placement}</code>
                    </div>
                    <Switch
                      label={definition.label}
                      checked={draft.placements[placement]}
                      disabled={!data.persistenceAvailable}
                      onChange={(checked) => setPlacement(placement, checked)}
                    />
                  </article>
                );
              })}
            </div>
          </section>
        </>
      )}
    </main>
  );
}
