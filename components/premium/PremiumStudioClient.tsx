'use client';

import Link from 'next/link';
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { createClient } from '@/lib/supabase/client';
import {
  DEFAULT_PREMIUM_STUDIO_SETTINGS,
  PREMIUM_BORDER_STYLES,
  PREMIUM_PROFILE_THEMES,
  PREMIUM_PROFILE_THEME_META,
  contrastRatio,
  isHexColor,
  resolveReadableTextColor,
  premiumStudioCssVariables,
  premiumThemePreset,
  type PremiumBorderStyle,
  type PremiumProfileTheme,
  type PremiumStudioSettings,
} from '@/lib/premium-studio';

type StudioResponse = {
  allowed?: boolean;
  theme?: PremiumProfileTheme;
  settings?: PremiumStudioSettings;
  error?: string;
};

type UploadKind = 'avatar' | 'banner';

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
const MAX_BANNER_BYTES = 12 * 1024 * 1024;
const ALLOWED_MEDIA_TYPES = new Set([
  'image/webp',
  'image/gif',
  'image/png',
  'image/jpeg',
]);

function fileExtension(file: File) {
  const ext = file.name.split('.').pop()?.toLowerCase();
  if (ext && ['webp', 'gif', 'png', 'jpg', 'jpeg'].includes(ext)) return ext;
  if (file.type === 'image/gif') return 'gif';
  if (file.type === 'image/png') return 'png';
  if (file.type === 'image/jpeg') return 'jpg';
  return 'webp';
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function hexToHsv(hex: string) {
  const clean = hex.replace('#', '');
  const r = Number.parseInt(clean.slice(0, 2), 16) / 255;
  const g = Number.parseInt(clean.slice(2, 4), 16) / 255;
  const b = Number.parseInt(clean.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  let h = 0;

  if (delta !== 0) {
    if (max === r) h = 60 * (((g - b) / delta) % 6);
    else if (max === g) h = 60 * ((b - r) / delta + 2);
    else h = 60 * ((r - g) / delta + 4);
  }

  if (h < 0) h += 360;

  return {
    h,
    s: max === 0 ? 0 : (delta / max) * 100,
    v: max * 100,
  };
}

function hsvToHex(h: number, s: number, v: number) {
  const sat = clamp(s, 0, 100) / 100;
  const val = clamp(v, 0, 100) / 100;
  const chroma = val * sat;
  const x = chroma * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = val - chroma;
  let r = 0;
  let g = 0;
  let b = 0;

  if (h < 60) [r, g, b] = [chroma, x, 0];
  else if (h < 120) [r, g, b] = [x, chroma, 0];
  else if (h < 180) [r, g, b] = [0, chroma, x];
  else if (h < 240) [r, g, b] = [0, x, chroma];
  else if (h < 300) [r, g, b] = [x, 0, chroma];
  else [r, g, b] = [chroma, 0, x];

  const toHex = (channel: number) => Math.round((channel + m) * 255)
    .toString(16)
    .padStart(2, '0')
    .toUpperCase();

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function StudioColorField({
  label,
  value,
  hint,
  onChange,
}: {
  label: string;
  value: string;
  hint: string;
  onChange: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const [open, setOpen] = useState(false);
  const fieldRef = useRef<HTMLDivElement>(null);
  const hsv = useMemo(() => hexToHsv(value), [value]);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  useEffect(() => {
    if (!open) return;

    const close = (event: MouseEvent) => {
      if (!fieldRef.current?.contains(event.target as Node)) setOpen(false);
    };

    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  function updateSaturationValue(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.type === 'pointermove' && event.buttons !== 1) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const saturation = clamp(((event.clientX - rect.left) / rect.width) * 100, 0, 100);
    const brightness = clamp(100 - ((event.clientY - rect.top) / rect.height) * 100, 0, 100);
    onChange(hsvToHex(hsv.h, saturation, brightness));
    if (event.type === 'pointerdown') event.currentTarget.setPointerCapture(event.pointerId);
  }

  return (
    <div ref={fieldRef} className={`premium-studio-v12__color-field premium-studio-v16__color-field ${open ? 'is-open' : ''}`}>
      <span>
        <strong>{label}</strong>
        <small>{hint}</small>
      </span>

      <span className="premium-studio-v12__color-controls premium-studio-v16__color-controls">
        <button
          type="button"
          className="premium-studio-v16__swatch"
          style={{ background: value }}
          onClick={() => setOpen((current) => !current)}
          aria-label={`${label}: открыть палитру`}
          aria-expanded={open}
        >
          <i />
        </button>
        <input
          type="text"
          value={draft}
          maxLength={7}
          spellCheck={false}
          onChange={(event) => {
            const next = event.target.value.toUpperCase();
            setDraft(next);
            if (isHexColor(next)) onChange(next);
          }}
          onBlur={() => {
            if (!isHexColor(draft)) setDraft(value);
          }}
          aria-label={`${label}: HEX`}
        />
      </span>

      {open && (
        <span className="premium-studio-v16__picker" role="dialog" aria-label={`${label}: палитра`}>
          <span
            className="premium-studio-v16__sv"
            style={{ backgroundColor: `hsl(${hsv.h} 100% 50%)` }}
            onPointerDown={updateSaturationValue}
            onPointerMove={updateSaturationValue}
          >
            <i
              style={{
                left: `${hsv.s}%`,
                top: `${100 - hsv.v}%`,
                background: value,
              }}
            />
          </span>
          <span className="premium-studio-v16__picker-row">
            <small>Тон</small>
            <input
              type="range"
              min="0"
              max="359"
              value={Math.round(hsv.h)}
              onChange={(event) => onChange(hsvToHex(Number(event.target.value), hsv.s, hsv.v))}
              aria-label={`${label}: оттенок`}
            />
          </span>
          <span className="premium-studio-v16__picker-footer">
            <span>
              <i style={{ background: value }} />
              <strong>{value}</strong>
            </span>
            <button type="button" onClick={() => setOpen(false)}>Готово</button>
          </span>
        </span>
      )}
    </div>
  );
}

export default function PremiumStudioClient({ embedded = false }: { embedded?: boolean }) {
  const supabase = useMemo(() => createClient(), []);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);

  const [settings, setSettings] = useState<PremiumStudioSettings>(
    DEFAULT_PREMIUM_STUDIO_SETTINGS,
  );
  const [savedSettings, setSavedSettings] = useState<PremiumStudioSettings>(
    DEFAULT_PREMIUM_STUDIO_SETTINGS,
  );
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<UploadKind | ''>('');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');
  const [studioSection, setStudioSection] = useState<'appearance' | 'effects' | 'media'>('appearance');

  useEffect(() => {
    let active = true;

    void fetch('/api/premium/studio', { cache: 'no-store' })
      .then(async (response) => {
        const payload = (await response.json()) as StudioResponse;
        if (!response.ok) throw new Error(payload.error || 'Не удалось загрузить Profile Studio');
        if (!active) return;

        const next = payload.settings ?? DEFAULT_PREMIUM_STUDIO_SETTINGS;
        setAllowed(Boolean(payload.allowed));
        setSettings(next);
        setSavedSettings(next);
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

  const dirty = JSON.stringify(settings) !== JSON.stringify(savedSettings);
  const contrast = contrastRatio(settings.textColor, settings.primaryColor);
  const safeTextColor = resolveReadableTextColor(settings.textColor, settings.primaryColor);
  const contrastProtected = safeTextColor !== settings.textColor;
  const cssVars = premiumStudioCssVariables(settings);

  function publicMediaUrl(path: string | null) {
    if (!path) return null;
    return supabase.storage.from('profile-media').getPublicUrl(path).data.publicUrl;
  }

  const avatarUrl = publicMediaUrl(settings.avatarPath) || '/premium/premium-user.webp';
  const bannerUrl = publicMediaUrl(settings.bannerPath);

  async function persistSettings(
    next: PremiumStudioSettings,
    message = 'Настройки сохранены ✓',
  ) {
    setSaving(true);
    setError('');
    setSaved('');

    try {
      const response = await fetch('/api/premium/studio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next),
      });
      const payload = (await response.json()) as StudioResponse;

      if (!response.ok) {
        throw new Error(payload.error || 'Не удалось сохранить Profile Studio');
      }

      const committed = payload.settings ?? next;
      setSettings(committed);
      setSavedSettings(committed);
      setSaved(message);
      window.dispatchEvent(new Event('animebox:premium-studio-updated'));
      return committed;
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Не удалось сохранить Profile Studio',
      );
      throw requestError;
    } finally {
      setSaving(false);
    }
  }

  function applyPreset(theme: PremiumProfileTheme) {
    const preset = premiumThemePreset(theme);
    setSettings((current) => ({
      ...current,
      theme,
      primaryColor: preset.primaryColor,
      accentColor: preset.accentColor,
      textColor: preset.textColor,
    }));
    setSaved('');
  }

  async function uploadMedia(kind: UploadKind, file: File | undefined) {
    if (!file || !allowed || uploading || saving) return;

    setError('');
    setSaved('');

    if (!ALLOWED_MEDIA_TYPES.has(file.type)) {
      setError('Поддерживаются WEBP, animated WEBP, GIF, PNG и JPG.');
      return;
    }

    const maxBytes = kind === 'avatar' ? MAX_AVATAR_BYTES : MAX_BANNER_BYTES;
    if (file.size > maxBytes) {
      setError(
        kind === 'avatar'
          ? 'Premium-аватар должен быть не больше 5 МБ.'
          : 'Premium-баннер должен быть не больше 12 МБ.',
      );
      return;
    }

    setUploading(kind);

    let newPath = '';
    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) throw new Error('Сначала войди в AnimeBox.');

      const extension = fileExtension(file);
      newPath = `${user.id}/premium/${kind}-${Date.now()}.${extension}`;

      const { error: uploadError } = await supabase.storage
        .from('profile-media')
        .upload(newPath, file, {
          cacheControl: '3600',
          upsert: false,
          contentType: file.type,
        });

      if (uploadError) throw uploadError;

      const oldPath = kind === 'avatar' ? settings.avatarPath : settings.bannerPath;
      const next = {
        ...settings,
        ...(kind === 'avatar' ? { avatarPath: newPath } : { bannerPath: newPath }),
      };

      await persistSettings(
        next,
        kind === 'avatar' ? 'Premium-аватар обновлён ✓' : 'Premium-баннер обновлён ✓',
      );

      if (oldPath && oldPath !== newPath && oldPath.includes('/premium/')) {
        void supabase.storage.from('profile-media').remove([oldPath]);
      }
    } catch (requestError) {
      if (newPath) {
        void supabase.storage.from('profile-media').remove([newPath]);
      }
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Не удалось загрузить Premium-медиа.',
      );
    } finally {
      setUploading('');
      if (kind === 'avatar' && avatarInputRef.current) avatarInputRef.current.value = '';
      if (kind === 'banner' && bannerInputRef.current) bannerInputRef.current.value = '';
    }
  }

  async function removeMedia(kind: UploadKind) {
    if (!allowed || saving || uploading) return;

    const oldPath = kind === 'avatar' ? settings.avatarPath : settings.bannerPath;
    if (!oldPath) return;

    const next = {
      ...settings,
      ...(kind === 'avatar' ? { avatarPath: null } : { bannerPath: null }),
    };

    try {
      await persistSettings(next, kind === 'avatar' ? 'Premium-аватар сброшен' : 'Premium-баннер сброшен');
      if (oldPath.includes('/premium/')) {
        void supabase.storage.from('profile-media').remove([oldPath]);
      }
    } catch {
      // persistSettings already surfaces the error.
    }
  }

  if (allowed === null) {
    const state = <div className="premium-studio__state">Загружаем Premium Studio…</div>;
    return embedded ? <div className="premium-studio premium-studio-v12 is-embedded">{state}</div> : <main className="premium-studio premium-studio-v12">{state}</main>;
  }

  if (!allowed) {
    const locked = (
      <section className="premium-studio__locked">
        <img className="premium-studio-v12__lock-icon" src="/premium/premium-user.webp" alt="" />
        <span>PREMIUM STUDIO</span>
        <h1>Собственный профиль и тема плеера</h1>
        <p>
          AnimeBox Premium открывает палитру цветов, Premium-аватар и баннер,
          а также синхронизацию акцента с оболочкой AnimeBox Player.
        </p>
        <Link className="premium-cta premium-cta--primary" href="/premium">
          Открыть AnimeBox Premium
        </Link>
        {error && <small>{error}</small>}
      </section>
    );
    return embedded ? <div className="premium-studio premium-studio-v12 is-embedded">{locked}</div> : <main className="premium-studio premium-studio-v12">{locked}</main>;
  }

  return (
    <div className={`premium-studio premium-studio-v12 ${embedded ? 'is-embedded' : ''}`}>
      {!embedded && <div className="premium-studio__head premium-studio-v12__head">
        <div className="premium-studio-v12__title-wrap">
          <img src="/premium/premium-user.webp" alt="" aria-hidden="true" />
          <div>
            <span>ANIMEBOX PREMIUM</span>
            <h1>Premium Studio</h1>
            <p>
              Настрой профиль под себя: цвета, свечение, анимированный аватар,
              баннер и тему оболочки плеера.
            </p>
          </div>
        </div>
        <Link href="/profile">← В профиль</Link>
      </div>}

      <div className="premium-studio-v15__layout">
        <div className="premium-studio-v15__hero">
          <div className="premium-studio-v15__hero-main">
            <section className="premium-studio-v12__panel premium-studio-v15__panel premium-studio-v15__palette-panel">
              <div className="premium-studio-v12__section-head premium-studio-v15__section-head">
                <div>
                  <h2>Палитра</h2>
                  <p>Три цвета управляют основной атмосферой Premium-профиля и плеера.</p>
                </div>
              </div>

              <div className="premium-studio-v12__color-list premium-studio-v15__color-list">
                <StudioColorField
                  label="Основной цвет"
                  value={settings.primaryColor}
                  hint="Фон карточек, hero-блока и секций профиля"
                  onChange={(primaryColor) => setSettings((current) => ({ ...current, primaryColor }))}
                />
                <StudioColorField
                  label="Акцент"
                  value={settings.accentColor}
                  hint="Кнопки, прогресс, активные элементы и glow"
                  onChange={(accentColor) => setSettings((current) => ({ ...current, accentColor }))}
                />
                <StudioColorField
                  label="Текст и иконки"
                  value={settings.textColor}
                  hint="Текст и иконки поверх фона. Smart Contrast страхует читаемость."
                  onChange={(textColor) => setSettings((current) => ({ ...current, textColor }))}
                />
              </div>

              <div className={`premium-studio-v12__contrast premium-studio-v15__contrast ${contrastProtected ? 'is-warning is-protected' : 'is-good'}`}>
                <div>
                  <strong>{contrastProtected ? 'Smart Contrast включён' : `Контраст ${contrast.toFixed(1)}:1`}</strong>
                  <small>{contrastProtected ? 'AnimeBox защитил читаемость интерфейса.' : 'Текст хорошо читается на выбранном фоне.'}</small>
                </div>
                <span>
                  {contrastProtected
                    ? `Выбранный ${settings.textColor} слишком близок к фону. Для интерфейса автоматически используется ${safeTextColor}.`
                    : 'Выбранный цвет будет применён ко всей Premium-странице профиля и элементам интерфейса.'}
                </span>
              </div>
            </section>
          </div>

          <aside className="premium-studio-v12__preview-wrap premium-studio-v15__preview-wrap">
            <div className="premium-studio-v12__sticky premium-studio-v15__sticky">
              <div className="premium-studio-v12__preview-label premium-studio-v15__preview-label">
                <span>ПРЕДПРОСМОТР</span>
                <small>Так будет выглядеть твоя Premium-тема</small>
              </div>

              <section
                className={`premium-studio-v12__preview premium-studio-v15__preview border-${settings.borderStyle}`}
                style={cssVars as CSSProperties}
              >
                <div className="premium-studio-v12__preview-banner premium-studio-v15__preview-banner">
                  {bannerUrl && <img src={bannerUrl} alt="" aria-hidden="true" />}
                  <div />
                </div>
                <div className="premium-studio-v12__preview-body premium-studio-v15__preview-body">
                  <img className="premium-studio-v12__preview-avatar" src={avatarUrl} alt="" />
                  <div className="premium-studio-v15__preview-copy">
                    <div className="premium-studio-v15__preview-badges">
                      <span>ANIMEBOX PREMIUM</span>
                      <small>ЖИВАЯ ТЕМА</small>
                    </div>
                    <h3>Твой профиль</h3>
                    <p>Палитра применяется ко всей странице профиля, а Smart Contrast не даёт тексту исчезнуть на похожем фоне.</p>
                    <div className="premium-studio-v15__preview-chips">
                      <i>Тема профиля</i>
                      <i>Плеер {settings.syncPlayerTheme ? 'синхронизирован' : 'отдельно'}</i>
                      <i>Свечение {settings.glowStrength}%</i>
                    </div>
                    <div className="premium-studio-v16__preview-stats">
                      <span><b>29ч</b><small>просмотр</small></span>
                      <span><b>51</b><small>серия</small></span>
                      <span><b>7</b><small>в списках</small></span>
                    </div>
                    <div className="premium-studio-v16__preview-library"><i /> <span><strong>Продолжить просмотр</strong><small>Последний тайтл · 18 серия</small></span><b>→</b></div>
                  </div>
                  <button type="button">Акцентная кнопка</button>
                  <div className="premium-studio-v12__fake-progress"><span /></div>
                </div>
              </section>
            </div>
          </aside>
        </div>

        <div className="premium-studio-v16__section-nav" role="tablist" aria-label="Разделы Premium Studio">
          <button type="button" role="tab" aria-selected={studioSection === 'appearance'} className={studioSection === 'appearance' ? 'is-active' : ''} onClick={() => setStudioSection('appearance')}>Оформление</button>
          <button type="button" role="tab" aria-selected={studioSection === 'effects'} className={studioSection === 'effects' ? 'is-active' : ''} onClick={() => setStudioSection('effects')}>Эффекты</button>
          <button type="button" role="tab" aria-selected={studioSection === 'media'} className={studioSection === 'media' ? 'is-active' : ''} onClick={() => setStudioSection('media')}>Медиа</button>
        </div>

        <div className="premium-studio-v15__sections premium-studio-v16__sections">
          {studioSection === 'appearance' && (
            <section className="premium-studio-v12__panel premium-studio-v15__panel premium-studio-v15__panel-wide">
              <div className="premium-studio-v12__section-head premium-studio-v15__section-head">
                <div>
                  <h2>Готовые пресеты</h2>
                  <p>Быстрый старт для стиля — потом цвета можно спокойно докрутить вручную.</p>
                </div>
              </div>

              <div className="premium-studio-v12__presets premium-studio-v15__presets premium-studio-v16__presets">
                {PREMIUM_PROFILE_THEMES.map((id) => {
                  const meta = PREMIUM_PROFILE_THEME_META[id];
                  return (
                    <button key={id} type="button" className={settings.theme === id ? 'is-active' : ''} onClick={() => applyPreset(id)}>
                      <span className="premium-studio-v16__preset-preview" style={{ background: `linear-gradient(120deg, ${meta.primaryColor} 0 48%, ${meta.accentColor} 48% 78%, ${meta.textColor} 78%)` }} />
                      <span>
                        <strong>{meta.label}</strong>
                        <small>{meta.description}</small>
                      </span>
                      {settings.theme === id && <em>Активно</em>}
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {studioSection === 'effects' && (
            <section className="premium-studio-v12__panel premium-studio-v15__panel premium-studio-v15__panel-wide">
              <div className="premium-studio-v12__section-head premium-studio-v15__section-head">
                <div>
                  <h2>Эффекты и оболочка</h2>
                  <p>Свечение, характер рамки и синхронизация темы с AnimeBox Player.</p>
                </div>
              </div>

              <div className="premium-studio-v16__effect-surface">
                <label className="premium-studio-v16__effect-row">
                  <span><strong>Свечение</strong><small>Интенсивность glow вокруг Premium-элементов</small></span>
                  <span className="premium-studio-v16__range-wrap">
                    <input type="range" min="0" max="100" step="1" value={settings.glowStrength} style={{ '--range-value': `${settings.glowStrength}%` } as CSSProperties} onChange={(event) => setSettings((current) => ({ ...current, glowStrength: Number(event.target.value) }))} />
                    <b>{settings.glowStrength}%</b>
                  </span>
                </label>

                <div className="premium-studio-v16__effect-row">
                  <span><strong>Рамка</strong><small>Характер границы Premium-блока</small></span>
                  <div className="premium-studio-v15__segmented" role="radiogroup" aria-label="Стиль рамки Premium-блока">
                    {PREMIUM_BORDER_STYLES.map((style) => (
                      <button key={style} type="button" className={settings.borderStyle === style ? 'is-active' : ''} onClick={() => setSettings((current) => ({ ...current, borderStyle: style }))}>
                        {style === 'soft' ? 'Мягкая' : style === 'sharp' ? 'Резкая' : 'Неон'}
                      </button>
                    ))}
                  </div>
                </div>

                <label className="premium-studio-v16__effect-row is-toggle">
                  <span><strong>Синхронизировать с плеером</strong><small>Accent и Primary применяются к оболочке AnimeBox Player.</small></span>
                  <span className={`premium-studio-v15__switch ${settings.syncPlayerTheme ? 'is-on' : ''}`}>
                    <input type="checkbox" checked={settings.syncPlayerTheme} onChange={(event) => setSettings((current) => ({ ...current, syncPlayerTheme: event.target.checked }))} />
                    <i />
                  </span>
                </label>
              </div>
            </section>
          )}

          {studioSection === 'media' && (
            <section className="premium-studio-v12__panel premium-studio-v15__panel premium-studio-v15__panel-wide">
              <div className="premium-studio-v12__section-head premium-studio-v15__section-head">
                <div>
                  <h2>Premium-медиа</h2>
                  <p>Аватар и баннер могут быть анимированными. WEBP/GIF воспроизводятся автоматически.</p>
                </div>
              </div>

              <div className="premium-studio-v12__media-grid premium-studio-v15__media-grid premium-studio-v16__media-grid">
                <article>
                  <div className="premium-studio-v12__media-preview is-avatar"><img src={avatarUrl} alt="Предпросмотр Premium-аватара" /></div>
                  <div className="premium-studio-v16__media-copy"><strong>Аватар</strong><small>до 5 МБ · WEBP / GIF / PNG / JPG</small></div>
                  <div><button type="button" disabled={Boolean(uploading) || saving} onClick={() => avatarInputRef.current?.click()}>{uploading === 'avatar' ? 'Загрузка…' : 'Заменить аватар'}</button>{settings.avatarPath && <button type="button" className="is-ghost" onClick={() => void removeMedia('avatar')}>Сбросить</button>}</div>
                  <input ref={avatarInputRef} hidden type="file" accept="image/webp,image/gif,image/png,image/jpeg" onChange={(event) => void uploadMedia('avatar', event.target.files?.[0])} />
                </article>
                <article>
                  <div className="premium-studio-v12__media-preview is-banner">{bannerUrl ? <img src={bannerUrl} alt="Предпросмотр Premium-баннера" /> : <span>Premium Banner</span>}</div>
                  <div className="premium-studio-v16__media-copy"><strong>Баннер</strong><small>до 12 МБ · рекомендуется 1500×500</small></div>
                  <div><button type="button" disabled={Boolean(uploading) || saving} onClick={() => bannerInputRef.current?.click()}>{uploading === 'banner' ? 'Загрузка…' : 'Заменить баннер'}</button>{settings.bannerPath && <button type="button" className="is-ghost" onClick={() => void removeMedia('banner')}>Сбросить</button>}</div>
                  <input ref={bannerInputRef} hidden type="file" accept="image/webp,image/gif,image/png,image/jpeg" onChange={(event) => void uploadMedia('banner', event.target.files?.[0])} />
                </article>
              </div>
            </section>
          )}
        </div>
        <div className="premium-studio-v15__dock">
          <div className="premium-studio-v15__dock-status">
            <strong>{dirty ? 'Есть несохранённые изменения' : 'Все изменения сохранены'}</strong>
            <small>{dirty ? 'После сохранения палитра, эффекты и медиа сразу обновят профиль.' : 'Палитра уже синхронизирована с твоим Premium-профилем.'}</small>
          </div>
          <div className="premium-studio-v15__dock-actions premium-studio-v12__actions">
            <button
              type="button"
              className="is-secondary"
              disabled={saving || Boolean(uploading)}
              onClick={() => {
                const preset = premiumThemePreset('default');
                setSettings((current) => ({
                  ...preset,
                  avatarPath: current.avatarPath,
                  bannerPath: current.bannerPath,
                }));
                setSaved('');
              }}
            >
              Сбросить цвета
            </button>
            <button
              type="button"
              className="is-primary"
              disabled={!dirty || saving || Boolean(uploading)}
              onClick={() => void persistSettings(settings).catch(() => undefined)}
            >
              {saving ? 'Сохраняем…' : dirty ? 'Сохранить изменения' : 'Сохранено'}
            </button>
          </div>
        </div>

        {(saved || error) && (
          <div className="premium-studio-v15__messages">
            {saved && <div className="premium-studio__message">{saved}</div>}
            {error && <div className="premium-studio__message is-error">{error}</div>}
          </div>
        )}
      </div>
    </div>
  );
}
