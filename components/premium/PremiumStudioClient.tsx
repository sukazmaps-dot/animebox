'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { createClient } from '@/lib/supabase/client';
import { useAuthState } from '@/components/AuthStateProvider';
import { notifyAuthChanged } from '@/lib/auth-events';
import { notifyProfileAppearanceChanged } from '@/lib/profile-live-sync';
import {
  discardPrivateProfileMedia,
  profileMediaFetchWithTimeout,
  uploadPrivateProfileMedia,
  type PendingProfileMediaUpload,
} from '@/lib/profile-media-upload-client';
import PremiumMediaCropEditor from '@/components/premium/PremiumMediaCropEditor';
import PremiumStudioLivePreview from '@/components/premium/PremiumStudioLivePreview';
import Icon from '@/components/Icon';
import { deriveAdaptiveProfilePalette } from '@/lib/adaptive-profile-theme-client';
import {
  DEFAULT_PREMIUM_STUDIO_SETTINGS,
  PREMIUM_ATMOSPHERE_EFFECTS,
  PREMIUM_BORDER_STYLES,
  PREMIUM_ENTRANCE_EFFECTS,
  PREMIUM_HERO_STYLES,
  PREMIUM_MOTION_MODES,
  PREMIUM_PARTICLE_EFFECTS,
  PREMIUM_NICKNAME_EFFECTS,
  PREMIUM_PROFILE_LAYOUTS,
  PREMIUM_PROFILE_THEMES,
  PREMIUM_SCENE_PRESETS,
  PREMIUM_SCENE_PRESET_META,
  PREMIUM_SURFACE_STYLES,
  PREMIUM_PROFILE_THEME_META,
  applyPremiumScenePreset,
  contrastRatio,
  isHexColor,
  resolveReadableTextColor,
  premiumMediaStyle,
  premiumThemePreset,
  type PremiumAtmosphereEffect,
  type PremiumEntranceEffect,
  type PremiumHeroStyle,
  type PremiumMediaTransform,
  type PremiumMotionMode,
  type PremiumNicknameEffect,
  type PremiumProfileLayout,
  type PremiumProfileTheme,
  type PremiumScenePreset,
  type PremiumStudioSettings,
  type PremiumSurfaceStyle,
} from '@/lib/premium-studio';

type StudioResponse = {
  allowed?: boolean;
  theme?: PremiumProfileTheme;
  settings?: PremiumStudioSettings;
  error?: string;
};

export type PremiumStudioHandle = {
  getDraft: () => PremiumStudioSettings;
  markSaved: (settings?: PremiumStudioSettings) => void;
  isDirty: () => boolean;
};

type PremiumStudioClientProps = {
  embedded?: boolean;
  hideDock?: boolean;
  initialSettings?: PremiumStudioSettings | null;
  initialAllowed?: boolean | null;
  onDirtyChange?: (dirty: boolean) => void;
  onBusyChange?: (busy: boolean) => void;
  onSettingsCommitted?: (settings: PremiumStudioSettings) => void;
};

type UploadKind = 'avatar' | 'banner';

const ATMOSPHERE_META: Record<PremiumAtmosphereEffect, { label: string; hint: string }> = {
  none: { label: 'Без эффекта', hint: 'Чистый Premium-профиль без частиц.' },
  aurora: { label: 'Aurora', hint: 'Мягкие цветовые облака и глубина.' },
  embers: { label: 'Embers', hint: 'Тёплые искры и энергетический след.' },
  sakura: { label: 'Sakura', hint: 'Лёгкие лепестки в атмосфере профиля.' },
  stardust: { label: 'Stardust', hint: 'Мелкие светящиеся звёздные частицы.' },
};

const ENTRANCE_META: Record<PremiumEntranceEffect, string> = {
  none: 'Без intro',
  fade: 'Fade',
  bloom: 'Bloom',
  manga: 'Manga Cut',
  glitch: 'Glitch',
};

const NICKNAME_META: Record<PremiumNicknameEffect, string> = {
  none: 'Обычный',
  gradient: 'Gradient',
  shimmer: 'Shimmer',
  glow: 'Glow',
  manga: 'Manga Cut',
  glitch: 'Glitch',
};

const HERO_META: Record<PremiumHeroStyle, string> = {
  cinematic: 'Cinematic',
  spotlight: 'Spotlight',
  clean: 'Clean',
};

const SURFACE_META: Record<PremiumSurfaceStyle, string> = {
  glass: 'Glass',
  deep: 'Deep',
  ink: 'Ink',
};

const PROFILE_LAYOUT_META: Record<PremiumProfileLayout, { label: string; hint: string }> = {
  classic: { label: 'Classic', hint: 'Знакомая композиция AnimeBox.' },
  cinema: { label: 'Cinema', hint: 'Больше внимания баннеру и hero.' },
  collector: { label: 'Collector', hint: 'Плотнее витрина и коллекционные блоки.' },
  minimal: { label: 'Minimal', hint: 'Чистая сцена без визуального шума.' },
};

type PremiumPreviewContext = 'profile' | 'mini' | 'comment' | 'watch-party';

const MOTION_META: Record<PremiumMotionMode, string> = {
  off: 'Off',
  soft: 'Soft',
  live: 'Live',
};

type MediaEditorState = {
  kind: UploadKind;
  mode: 'upload' | 'edit';
  src: string;
  file?: File;
  transform: PremiumMediaTransform;
};

const PREMIUM_AVATAR_RECOMMENDED_BYTES = 4 * 1024 * 1024;
const MAX_AVATAR_BYTES = 8 * 1024 * 1024;
const MAX_BANNER_BYTES = 6 * 1024 * 1024;
const MIN_PREMIUM_AVATAR_DIMENSION = 256;
const MAX_AVATAR_SOURCE_DIMENSION = 1024;
const MAX_BANNER_SOURCE_WIDTH = 2400;
const MAX_BANNER_SOURCE_HEIGHT = 1200;
const ALLOWED_MEDIA_TYPES = new Set([
  'image/webp',
  'image/gif',
  'image/png',
  'image/jpeg',
]);



async function staticWebpFallback(file: File, kind: UploadKind) {
  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(file);

    /*
     * Preserve the source aspect ratio instead of permanently center-cropping
     * the first frame. Crop/zoom/position are stored as six tiny numbers and
     * applied at render time, so animated media stays animated and the static
     * fallback can use the same framing after Premium expires.
     */
    const maxWidth = kind === 'avatar' ? 512 : 1500;
    const maxHeight = kind === 'avatar' ? 512 : 900;
    const resize = Math.min(1, maxWidth / bitmap.width, maxHeight / bitmap.height);
    const targetWidth = Math.max(1, Math.round(bitmap.width * resize));
    const targetHeight = Math.max(1, Math.round(bitmap.height * resize));
    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;

    const context = canvas.getContext('2d', { alpha: true });
    if (!context) throw new Error('Canvas недоступен.');

    context.drawImage(bitmap, 0, 0, targetWidth, targetHeight);

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (value) => value ? resolve(value) : reject(new Error('Не удалось создать статический WEBP.')),
        'image/webp',
        kind === 'avatar' ? 0.84 : 0.80,
      );
    });

    return {
      blob,
      sourceWidth: bitmap.width,
      sourceHeight: bitmap.height,
    };
  } finally {
    bitmap?.close();
  }
}


async function readImageDimensions(file: File) {
  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(file);
    return { width: bitmap.width, height: bitmap.height };
  } finally {
    bitmap?.close();
  }
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
    const frame = window.requestAnimationFrame(() => setDraft(value));
    return () => window.cancelAnimationFrame(frame);
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

const PremiumStudioClient = forwardRef<PremiumStudioHandle, PremiumStudioClientProps>(function PremiumStudioClient({
  embedded = false,
  hideDock = false,
  initialSettings = null,
  initialAllowed = null,
  onDirtyChange,
  onBusyChange,
  onSettingsCommitted,
}, ref) {
  const router = useRouter();
  const {
    user,
    profile: authProfile,
    refresh: refreshAuth,
  } = useAuthState();
  const supabase = useMemo(() => createClient(), []);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);
  const mediaObjectUrlRef = useRef<string | null>(null);

  const [settings, setSettings] = useState<PremiumStudioSettings>(
    () => initialSettings ?? DEFAULT_PREMIUM_STUDIO_SETTINGS,
  );
  const [savedSettings, setSavedSettings] = useState<PremiumStudioSettings>(
    () => initialSettings ?? DEFAULT_PREMIUM_STUDIO_SETTINGS,
  );
  const [allowed, setAllowed] = useState<boolean | null>(
    () => initialSettings ? Boolean(initialAllowed) : null,
  );
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<UploadKind | ''>('');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');
  const [mediaWarning, setMediaWarning] = useState('');
  const [paletteLoading, setPaletteLoading] = useState<'avatar' | 'banner' | ''>('');
  const [previewEpoch, setPreviewEpoch] = useState(0);
  const [previewContext, setPreviewContext] = useState<PremiumPreviewContext>('profile');
  const [mobilePreviewOpen, setMobilePreviewOpen] = useState(false);
  const [studioSection, setStudioSection] = useState<'appearance' | 'atmosphere' | 'effects' | 'media'>('appearance');
  const [mediaEditor, setMediaEditor] = useState<MediaEditorState | null>(null);
  const mediaEditorOpen = Boolean(mediaEditor);

  useEffect(() => {
    if (initialSettings) return;

    let active = true;

    void fetch('/api/profile/editor', { cache: 'no-store' })
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
  }, [initialAllowed, initialSettings]);

  useEffect(() => {
    if (!mobilePreviewOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobilePreviewOpen(false);
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [mobilePreviewOpen]);

  useEffect(() => {
    if (!mediaEditorOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (mediaObjectUrlRef.current) {
        URL.revokeObjectURL(mediaObjectUrlRef.current);
        mediaObjectUrlRef.current = null;
      }
      setMediaEditor(null);
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [mediaEditorOpen]);

  useEffect(() => () => {
    if (mediaObjectUrlRef.current) URL.revokeObjectURL(mediaObjectUrlRef.current);
  }, []);

  const dirty = JSON.stringify(settings) !== JSON.stringify(savedSettings);

  useImperativeHandle(ref, () => ({
    getDraft: () => settings,
    markSaved: (nextSettings = settings) => {
      setSettings(nextSettings);
      setSavedSettings(nextSettings);
      setSaved('Настройки сохранены ✓');
    },
    isDirty: () => dirty,
  }), [dirty, settings]);

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  useEffect(() => {
    onBusyChange?.(saving || Boolean(uploading));
  }, [onBusyChange, saving, uploading]);
  const contrast = contrastRatio(settings.textColor, settings.primaryColor);
  const safeTextColor = resolveReadableTextColor(settings.textColor, settings.primaryColor);
  const contrastProtected = safeTextColor !== settings.textColor;

  function publicMediaUrl(path: string | null) {
    if (!path) return null;
    return supabase.storage.from('profile-media').getPublicUrl(path).data.publicUrl;
  }

  const avatarUrl = publicMediaUrl(settings.avatarPath || settings.avatarStaticPath);
  const bannerUrl = publicMediaUrl(settings.bannerPath || settings.bannerStaticPath);
  const avatarTransform = {
    x: settings.avatarPositionX,
    y: settings.avatarPositionY,
    zoom: settings.avatarZoom,
  };
  const bannerTransform = {
    x: settings.bannerPositionX,
    y: settings.bannerPositionY,
    zoom: settings.bannerZoom,
  };

  async function persistSettings(
    next: PremiumStudioSettings,
    message = 'Настройки сохранены ✓',
    pendingMedia: PendingProfileMediaUpload[] = [],
  ) {
    setSaving(true);
    setError('');
    setSaved('');

    try {
      const response = await profileMediaFetchWithTimeout('/api/profile/editor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studio: next, ...(pendingMedia.length ? { pendingMedia } : {}) }),
      }, 20_000);
      const payload = (await response.json()) as StudioResponse;

      if (!response.ok) {
        throw new Error(payload.error || 'Не удалось сохранить Profile Studio');
      }

      const committed = payload.settings ?? next;
      setSettings(committed);
      setSavedSettings(committed);
      setSaved(message);
      onSettingsCommitted?.(committed);

      if (user?.id) {
        const premiumAvatarPath =
          committed.avatarPath ||
          committed.avatarStaticPath ||
          null;

        notifyAuthChanged({
          userId: user.id,
          profile: {
            id: user.id,
            username: authProfile?.username ?? null,
            avatar_path: authProfile?.avatar_path ?? null,
            display_avatar_path:
              premiumAvatarPath ??
              authProfile?.avatar_path ??
              null,
            display_avatar_transform:
              premiumAvatarPath
                ? {
                    x: committed.avatarPositionX,
                    y: committed.avatarPositionY,
                    zoom: committed.avatarZoom,
                  }
                : null,
          },
        });

        notifyProfileAppearanceChanged(user.id);
        void refreshAuth();
      }

      window.dispatchEvent(new Event('animebox:premium-studio-updated'));
      router.refresh();
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
      particleEffect: preset.particleEffect,
    }));
    setSaved('');
  }

  function applyScenePreset(scene: PremiumScenePreset) {
    setSettings((current) => applyPremiumScenePreset(scene, current));
    setSaved('');
    setPreviewEpoch((value) => value + 1);
  }

  async function applyAdaptivePalette(source: 'avatar' | 'banner') {
    const url = source === 'banner' ? bannerUrl : avatarUrl;

    if (!url) {
      setError(
        source === 'banner'
          ? 'Сначала загрузи Premium-баннер, чтобы подобрать палитру по нему.'
          : 'Сначала загрузи Premium-аватар, чтобы подобрать палитру по нему.',
      );
      return;
    }

    setPaletteLoading(source);
    setError('');
    setSaved('');

    try {
      const palette = await deriveAdaptiveProfilePalette(url);
      setSettings((current) => ({
        ...current,
        primaryColor: palette.primaryColor,
        accentColor: palette.accentColor,
        textColor: palette.textColor,
      }));
      setSaved(
        source === 'banner'
          ? 'Палитра подобрана по баннеру — сохрани изменения.'
          : 'Палитра подобрана по аватару — сохрани изменения.',
      );
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Не удалось подобрать палитру автоматически.',
      );
    } finally {
      setPaletteLoading('');
    }
  }

  function resetMediaInput(kind: UploadKind) {
    if (kind === 'avatar' && avatarInputRef.current) avatarInputRef.current.value = '';
    if (kind === 'banner' && bannerInputRef.current) bannerInputRef.current.value = '';
  }

  function releasePendingMediaUrl() {
    if (!mediaObjectUrlRef.current) return;
    URL.revokeObjectURL(mediaObjectUrlRef.current);
    mediaObjectUrlRef.current = null;
  }

  function closeMediaEditor() {
    const kind = mediaEditor?.kind;
    releasePendingMediaUrl();
    setMediaEditor(null);
    if (kind) resetMediaInput(kind);
  }

  async function prepareMediaUpload(kind: UploadKind, file: File | undefined) {
    if (!file || !allowed || uploading || saving) return;

    setError('');
    setSaved('');
    setMediaWarning('');

    if (!ALLOWED_MEDIA_TYPES.has(file.type)) {
      setError('Поддерживаются WEBP, animated WEBP, GIF, PNG и JPG.');
      resetMediaInput(kind);
      return;
    }

    const maxBytes = kind === 'avatar' ? MAX_AVATAR_BYTES : MAX_BANNER_BYTES;
    if (file.size > maxBytes) {
      setError(
        kind === 'avatar'
          ? 'Premium-аватар должен быть не больше 8 МБ.'
          : 'Premium-баннер должен быть не больше 6 МБ — большие анимации сильно нагружают мобильные устройства.',
      );
      resetMediaInput(kind);
      return;
    }

    try {
      const dimensions = await readImageDimensions(file);
      if (kind === 'avatar' && (
        dimensions.width < MIN_PREMIUM_AVATAR_DIMENSION ||
        dimensions.height < MIN_PREMIUM_AVATAR_DIMENSION
      )) {
        throw new Error(
          `Premium-аватар должен быть не меньше ${MIN_PREMIUM_AVATAR_DIMENSION}×${MIN_PREMIUM_AVATAR_DIMENSION}px.`,
        );
      }
      if (kind === 'avatar' && (
        dimensions.width > MAX_AVATAR_SOURCE_DIMENSION ||
        dimensions.height > MAX_AVATAR_SOURCE_DIMENSION
      )) {
        throw new Error(
          `Premium-аватар должен быть максимум ${MAX_AVATAR_SOURCE_DIMENSION}×${MAX_AVATAR_SOURCE_DIMENSION}px.`,
        );
      }
      if (kind === 'avatar' && file.size > PREMIUM_AVATAR_RECOMMENDED_BYTES) {
        setMediaWarning('Тяжёлая анимация: для более быстрой загрузки рекомендуем Premium-аватар до 4 МБ.');
      }
      if (kind === 'banner' && (
        dimensions.width > MAX_BANNER_SOURCE_WIDTH ||
        dimensions.height > MAX_BANNER_SOURCE_HEIGHT
      )) {
        throw new Error(
          `Premium-баннер должен быть максимум ${MAX_BANNER_SOURCE_WIDTH}×${MAX_BANNER_SOURCE_HEIGHT}px.`,
        );
      }

      releasePendingMediaUrl();
      const src = URL.createObjectURL(file);
      mediaObjectUrlRef.current = src;
      setMediaEditor({
        kind,
        mode: 'upload',
        src,
        file,
        transform: { x: 50, y: 50, zoom: 1 },
      });
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Не удалось открыть изображение для настройки.',
      );
      resetMediaInput(kind);
    }
  }

  function editExistingMedia(kind: UploadKind) {
    const src = kind === 'avatar' ? avatarUrl : bannerUrl;
    if (!src) return;

    releasePendingMediaUrl();
    setMediaEditor({
      kind,
      mode: 'edit',
      src,
      transform: kind === 'avatar' ? avatarTransform : bannerTransform,
    });
  }

  async function uploadMedia(
    kind: UploadKind,
    file: File | undefined,
    transform: PremiumMediaTransform,
  ): Promise<boolean> {
    if (!file || !allowed || uploading || saving) return false;

    setError('');
    setSaved('');
    setMediaWarning('');

    if (!ALLOWED_MEDIA_TYPES.has(file.type)) {
      setError('Поддерживаются WEBP, animated WEBP, GIF, PNG и JPG.');
      return false;
    }

    const maxBytes = kind === 'avatar' ? MAX_AVATAR_BYTES : MAX_BANNER_BYTES;
    if (file.size > maxBytes) {
      setError(
        kind === 'avatar'
          ? 'Premium-аватар должен быть не больше 8 МБ.'
          : 'Premium-баннер должен быть не больше 6 МБ — большие анимации сильно нагружают мобильные устройства.',
      );
      return false;
    }

    setUploading(kind);
    const pendingMedia: PendingProfileMediaUpload[] = [];

    try {
      const fallback = await staticWebpFallback(file, kind);
      const staticBlob = fallback.blob;

      if (kind === 'avatar' && (
        fallback.sourceWidth < MIN_PREMIUM_AVATAR_DIMENSION ||
        fallback.sourceHeight < MIN_PREMIUM_AVATAR_DIMENSION
      )) {
        throw new Error(
          `Premium-аватар должен быть не меньше ${MIN_PREMIUM_AVATAR_DIMENSION}×${MIN_PREMIUM_AVATAR_DIMENSION}px.`,
        );
      }
      if (kind === 'avatar' && (
        fallback.sourceWidth > MAX_AVATAR_SOURCE_DIMENSION ||
        fallback.sourceHeight > MAX_AVATAR_SOURCE_DIMENSION
      )) {
        throw new Error(
          `Premium-аватар должен быть максимум ${MAX_AVATAR_SOURCE_DIMENSION}×${MAX_AVATAR_SOURCE_DIMENSION}px.`,
        );
      }

      if (kind === 'banner' && (
        fallback.sourceWidth > MAX_BANNER_SOURCE_WIDTH ||
        fallback.sourceHeight > MAX_BANNER_SOURCE_HEIGHT
      )) {
        throw new Error(
          `Premium-баннер должен быть максимум ${MAX_BANNER_SOURCE_WIDTH}×${MAX_BANNER_SOURCE_HEIGHT}px.`,
        );
      }

      const originalUpload = await uploadPrivateProfileMedia({
        scope: 'premium',
        kind,
        variant: 'original',
        body: file,
      });
      pendingMedia.push(originalUpload);

      const staticUpload = await uploadPrivateProfileMedia({
        scope: 'premium',
        kind,
        variant: 'static',
        body: staticBlob,
        mimeType: 'image/webp',
      });
      pendingMedia.push(staticUpload);

      const oldPath = kind === 'avatar' ? settings.avatarPath : settings.bannerPath;
      const oldStaticPath = kind === 'avatar' ? settings.avatarStaticPath : settings.bannerStaticPath;
      const next = {
        ...settings,
        ...(kind === 'avatar'
          ? {
              avatarPath: originalUpload.publicPath,
              avatarStaticPath: staticUpload.publicPath,
              avatarPositionX: transform.x,
              avatarPositionY: transform.y,
              avatarZoom: transform.zoom,
            }
          : {
              bannerPath: originalUpload.publicPath,
              bannerStaticPath: staticUpload.publicPath,
              bannerPositionX: transform.x,
              bannerPositionY: transform.y,
              bannerZoom: transform.zoom,
            }),
      };

      await persistSettings(
        next,
        kind === 'avatar' ? 'Premium-аватар обновлён ✓' : 'Premium-баннер обновлён ✓',
        pendingMedia,
      );

      const obsolete = [oldPath, oldStaticPath]
        .filter((path): path is string => Boolean(path && path.includes('/premium/')))
        .filter((path) => path !== originalUpload.publicPath && path !== staticUpload.publicPath);
      if (obsolete.length) {
        void supabase.storage.from('profile-media').remove([...new Set(obsolete)]);
      }
      return true;
    } catch (requestError) {
      if (pendingMedia.length) {
        await discardPrivateProfileMedia(pendingMedia);
      }
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Не удалось загрузить Premium-медиа.',
      );
      return false;
    } finally {
      setUploading('');
      if (kind === 'avatar' && avatarInputRef.current) avatarInputRef.current.value = '';
      if (kind === 'banner' && bannerInputRef.current) bannerInputRef.current.value = '';
    }
  }

  async function confirmMediaEditor() {
    const editor = mediaEditor;
    if (!editor || saving || uploading) return;

    if (editor.mode === 'upload') {
      const uploaded = await uploadMedia(editor.kind, editor.file, editor.transform);
      if (uploaded) closeMediaEditor();
      return;
    }

    setSettings((current) => ({
      ...current,
      ...(editor.kind === 'avatar'
        ? {
            avatarPositionX: editor.transform.x,
            avatarPositionY: editor.transform.y,
            avatarZoom: editor.transform.zoom,
          }
        : {
            bannerPositionX: editor.transform.x,
            bannerPositionY: editor.transform.y,
            bannerZoom: editor.transform.zoom,
          }),
    }));
    setSaved('');
    closeMediaEditor();
  }

  async function removeMedia(kind: UploadKind) {
    if (!allowed || saving || uploading) return;

    const oldPath = kind === 'avatar' ? settings.avatarPath : settings.bannerPath;
    const oldStaticPath = kind === 'avatar' ? settings.avatarStaticPath : settings.bannerStaticPath;
    if (!oldPath && !oldStaticPath) return;

    const next = {
      ...settings,
      ...(kind === 'avatar'
        ? {
            avatarPath: null,
            avatarStaticPath: null,
            avatarPositionX: 50,
            avatarPositionY: 50,
            avatarZoom: 1,
          }
        : {
            bannerPath: null,
            bannerStaticPath: null,
            bannerPositionX: 50,
            bannerPositionY: 50,
            bannerZoom: 1,
          }),
    };

    try {
      await persistSettings(next, kind === 'avatar' ? 'Premium-аватар сброшен' : 'Premium-баннер сброшен');
      const obsolete = [oldPath, oldStaticPath]
        .filter((path): path is string => Boolean(path && path.includes('/premium/')));
      if (obsolete.length) {
        void supabase.storage.from('profile-media').remove([...new Set(obsolete)]);
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
      <section className="premium-studio-v23__demo">
        <div className="premium-studio-v23__demo-copy">
          <span>PREMIUM STUDIO · DEMO</span>
          <h1>Собери Profile Scene до покупки</h1>
          <p>
            Выбери атмосферу и посмотри, как Premium будет выглядеть в профиле,
            mini-profile, комментариях и Watch Together. Предпросмотр бесплатный —
            Premium нужен только для сохранения и публичного применения Scene.
          </p>
        </div>

        <div className="premium-studio-v23__demo-scenes">
          {PREMIUM_SCENE_PRESETS.map((scene) => {
            const meta = PREMIUM_SCENE_PRESET_META[scene];
            return (
              <button
                key={scene}
                type="button"
                onClick={() => applyScenePreset(scene)}
              >
                <i
                  style={{
                    background: `linear-gradient(135deg, ${meta.primaryColor}, ${meta.accentColor})`,
                  }}
                />
                <span>
                  <strong>{meta.label}</strong>
                  <small>{meta.description}</small>
                </span>
              </button>
            );
          })}
        </div>

        <div className="premium-studio-v23__demo-preview">
          <div className="premium-studio-v23__preview-tabs" role="tablist" aria-label="Контекст Premium demo">
            {([
              ['profile', 'Профиль'],
              ['mini', 'Мини'],
              ['comment', 'Комментарий'],
              ['watch-party', 'Комната'],
            ] as const).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={previewContext === id}
                className={previewContext === id ? 'is-active' : ''}
                onClick={() => setPreviewContext(id)}
              >
                {label}
              </button>
            ))}
          </div>

          <PremiumStudioLivePreview
            key={`demo:${previewEpoch}:${previewContext}`}
            settings={settings}
            avatarUrl={avatarUrl}
            bannerUrl={bannerUrl}
            avatarTransform={avatarTransform}
            bannerTransform={bannerTransform}
            context={previewContext}
          />
        </div>

        <div className="premium-studio-v23__demo-actions">
          <div>
            <Icon name="crown" size={22} weight="regular" />
            <span>
              <strong>Хочешь сохранить эту Scene?</strong>
              <small>Настройки останутся только в предпросмотре, пока Premium не активен.</small>
            </span>
          </div>
          <Link className="premium-cta premium-cta--primary" href="/premium#premium-plans">
            Сохранить с Premium
          </Link>
        </div>

        {error && <small className="premium-studio-v23__demo-error">{error}</small>}
      </section>
    );
    return embedded ? <div className="premium-studio premium-studio-v12 is-embedded">{locked}</div> : <main className="premium-studio premium-studio-v12">{locked}</main>;
  }

  return (
    <div className={`premium-studio premium-studio-v12 ${embedded ? 'is-embedded' : ''}`}>
      {!embedded && <div className="premium-studio__head premium-studio-v12__head">
        <div className="premium-studio-v12__title-wrap">
          <Icon name="crown" size={54} weight="regular" />
          <div>
            <span>ANIMEBOX PREMIUM</span>
            <h1>Premium Studio</h1>
            <p>
              Собери Profile Scene: атмосфера, палитра, layout, эффекты, медиа
              и единый стиль для социальных поверхностей AnimeBox.
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

              <div className="premium-studio-v21__adaptive">
                <div>
                  <strong>Автоподбор палитры</strong>
                  <small>AnimeBox берёт оттенки из медиа и строит тёмный фон, яркий accent и безопасный цвет текста.</small>
                </div>
                <div>
                  <button
                    type="button"
                    disabled={Boolean(paletteLoading) || Boolean(uploading) || saving}
                    onClick={() => void applyAdaptivePalette('avatar')}
                  >
                    {paletteLoading === 'avatar' ? 'Подбираем…' : 'По аватару'}
                  </button>
                  <button
                    type="button"
                    className="is-accent"
                    disabled={Boolean(paletteLoading) || Boolean(uploading) || saving}
                    onClick={() => void applyAdaptivePalette('banner')}
                  >
                    {paletteLoading === 'banner' ? 'Подбираем…' : 'По баннеру'}
                  </button>
                </div>
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
              <div className="premium-studio-v12__preview-label premium-studio-v15__preview-label premium-studio-v23__preview-head">
                <div>
                  <span>LIVE PREVIEW</span>
                  <small>Одна Scene — разная интенсивность в разных местах AnimeBox</small>
                </div>
                <div className="premium-studio-v23__preview-tabs" role="tablist" aria-label="Контекст предпросмотра">
                  {([
                    ['profile', 'Профиль'],
                    ['mini', 'Мини'],
                    ['comment', 'Комментарий'],
                    ['watch-party', 'Комната'],
                  ] as const).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      role="tab"
                      aria-selected={previewContext === id}
                      className={previewContext === id ? 'is-active' : ''}
                      onClick={() => setPreviewContext(id)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <PremiumStudioLivePreview
                key={`${previewEpoch}:${previewContext}`}
                settings={settings}
                avatarUrl={avatarUrl}
                bannerUrl={bannerUrl}
                avatarTransform={avatarTransform}
                bannerTransform={bannerTransform}
                context={previewContext}
              />
            </div>
          </aside>
        </div>

        <div className="premium-studio-v16__section-nav" role="tablist" aria-label="Разделы Premium Studio">
          <button type="button" role="tab" aria-selected={studioSection === 'appearance'} className={studioSection === 'appearance' ? 'is-active' : ''} onClick={() => setStudioSection('appearance')}>Оформление</button>
          <button type="button" role="tab" aria-selected={studioSection === 'atmosphere'} className={studioSection === 'atmosphere' ? 'is-active' : ''} onClick={() => setStudioSection('atmosphere')}>Атмосфера</button>
          <button type="button" role="tab" aria-selected={studioSection === 'effects'} className={studioSection === 'effects' ? 'is-active' : ''} onClick={() => setStudioSection('effects')}>Эффекты</button>
          <button type="button" role="tab" aria-selected={studioSection === 'media'} className={studioSection === 'media' ? 'is-active' : ''} onClick={() => setStudioSection('media')}>Медиа</button>
        </div>

        <div className="premium-studio-v15__sections premium-studio-v16__sections">
          {studioSection === 'appearance' && (
            <section className="premium-studio-v12__panel premium-studio-v15__panel premium-studio-v15__panel-wide">
              <div className="premium-studio-v12__section-head premium-studio-v15__section-head">
                <div>
                  <h2>Profile Scenes</h2>
                  <p>Scene сразу собирает палитру, атмосферу, поверхности и движение. После выбора всё можно докрутить вручную.</p>
                </div>
              </div>

              <div className="premium-studio-v23__scene-grid">
                {PREMIUM_SCENE_PRESETS.map((id) => {
                  const meta = PREMIUM_SCENE_PRESET_META[id];
                  return (
                    <button
                      key={id}
                      type="button"
                      data-scene={id}
                      onClick={() => applyScenePreset(id)}
                    >
                      <span
                        className="premium-studio-v23__scene-swatch"
                        style={{ background: `linear-gradient(135deg, ${meta.primaryColor}, ${meta.accentColor})` }}
                      />
                      <span>
                        <strong>{meta.label}</strong>
                        <small>{meta.description}</small>
                      </span>
                      <em>Scene</em>
                    </button>
                  );
                })}
              </div>

              <div className="premium-studio-v23__layout-block">
                <div>
                  <strong>Композиция профиля</strong>
                  <small>Выбери структуру страницы без drag-and-drop и произвольного CSS.</small>
                </div>
                <div className="premium-studio-v23__layout-grid">
                  {PREMIUM_PROFILE_LAYOUTS.map((layout) => {
                    const meta = PROFILE_LAYOUT_META[layout];
                    return (
                      <button
                        key={layout}
                        type="button"
                        className={settings.profileLayout === layout ? 'is-active' : ''}
                        onClick={() => setSettings((current) => ({ ...current, profileLayout: layout }))}
                      >
                        <strong>{meta.label}</strong>
                        <small>{meta.hint}</small>
                      </button>
                    );
                  })}
                </div>
              </div>

              <details className="premium-studio-v23__legacy-palettes">
                <summary>Дополнительные палитры</summary>
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
                      </button>
                    );
                  })}
                </div>
              </details>
            </section>
          )}

          {studioSection === 'atmosphere' && (
            <section className="premium-studio-v12__panel premium-studio-v15__panel premium-studio-v15__panel-wide premium-studio-v21__identity-panel">
              <div className="premium-studio-v12__section-head premium-studio-v15__section-head">
                <div>
                  <h2>Атмосфера профиля</h2>
                  <p>Один ambient-эффект, единый режим движения и характер появления профиля. Всё сразу видно в предпросмотре.</p>
                </div>
              </div>

              <div className="premium-studio-v21__atmosphere-grid">
                {PREMIUM_ATMOSPHERE_EFFECTS.map((effect) => {
                  const meta = ATMOSPHERE_META[effect];
                  return (
                    <button
                      key={effect}
                      type="button"
                      className={settings.atmosphereEffect === effect ? 'is-active' : ''}
                      data-effect={effect}
                      onClick={() => setSettings((current) => ({ ...current, atmosphereEffect: effect }))}
                    >
                      <span className="premium-studio-v21__effect-orb" />
                      <strong>{meta.label}</strong>
                      <small>{meta.hint}</small>
                    </button>
                  );
                })}
              </div>

              <div className="premium-studio-v21__identity-controls">
                <label className="premium-studio-v16__effect-row">
                  <span><strong>Интенсивность атмосферы</strong><small>Контролирует заметность ambient glow и частиц.</small></span>
                  <span className="premium-studio-v16__range-wrap">
                    <input
                      type="range"
                      min="0"
                      max="100"
                      step="1"
                      value={settings.atmosphereIntensity}
                      onChange={(event) => setSettings((current) => ({ ...current, atmosphereIntensity: Number(event.target.value) }))}
                    />
                    <b>{settings.atmosphereIntensity}%</b>
                  </span>
                </label>

                <div className="premium-studio-v16__effect-row">
                  <span><strong>Движение</strong><small>Off экономит максимум ресурсов, Soft — дорогая спокойная анимация, Live — самый заметный режим.</small></span>
                  <div className="premium-studio-v15__segmented">
                    {PREMIUM_MOTION_MODES.map((mode) => (
                      <button key={mode} type="button" className={settings.motionMode === mode ? 'is-active' : ''} onClick={() => setSettings((current) => ({ ...current, motionMode: mode }))}>
                        {MOTION_META[mode]}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="premium-studio-v16__effect-row">
                  <span><strong>Эффект ника</strong><small>Выделяет username, не превращая весь интерфейс в неон.</small></span>
                  <div className="premium-studio-v15__segmented">
                    {PREMIUM_NICKNAME_EFFECTS.map((effect) => (
                      <button key={effect} type="button" className={settings.nicknameEffect === effect ? 'is-active' : ''} onClick={() => setSettings((current) => ({ ...current, nicknameEffect: effect }))}>
                        {NICKNAME_META[effect]}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="premium-studio-v16__effect-row">
                  <span><strong>Вход в профиль</strong><small>Короткая intro-анимация только при открытии страницы.</small></span>
                  <div className="premium-studio-v15__segmented">
                    {PREMIUM_ENTRANCE_EFFECTS.map((effect) => (
                      <button key={effect} type="button" className={settings.entranceEffect === effect ? 'is-active' : ''} onClick={() => setSettings((current) => ({ ...current, entranceEffect: effect }))}>
                        {ENTRANCE_META[effect]}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="premium-studio-v21__replay-row">
                  <span><strong>Предпросмотр входа</strong><small>Перезапусти intro без сохранения страницы.</small></span>
                  <button type="button" onClick={() => setPreviewEpoch((value) => value + 1)}>
                    Проиграть intro
                  </button>
                </div>

                <div className="premium-studio-v16__effect-row">
                  <span><strong>Hero</strong><small>Как баннер и identity-блок собираются в верхней части профиля.</small></span>
                  <div className="premium-studio-v15__segmented">
                    {PREMIUM_HERO_STYLES.map((style) => (
                      <button key={style} type="button" className={settings.heroStyle === style ? 'is-active' : ''} onClick={() => setSettings((current) => ({ ...current, heroStyle: style }))}>
                        {HERO_META[style]}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="premium-studio-v16__effect-row">
                  <span><strong>Поверхности</strong><small>Glass — глубина и blur, Deep — плотный игровой UI, Ink — строгий тёмный профиль.</small></span>
                  <div className="premium-studio-v15__segmented">
                    {PREMIUM_SURFACE_STYLES.map((style) => (
                      <button key={style} type="button" className={settings.surfaceStyle === style ? 'is-active' : ''} onClick={() => setSettings((current) => ({ ...current, surfaceStyle: style }))}>
                        {SURFACE_META[style]}
                      </button>
                    ))}
                  </div>
                </div>
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

                <div className="premium-studio-v16__effect-row">
                  <span><strong>Частицы профиля</strong><small>Лёгкий дополнительный слой виден в профиле и mini-profile без canvas.</small></span>
                  <div className="premium-studio-v15__segmented premium-studio-v18__particle-options" role="radiogroup" aria-label="Эффект частиц">
                    {PREMIUM_PARTICLE_EFFECTS.map((effect) => (
                      <button
                        key={effect}
                        type="button"
                        className={settings.particleEffect === effect ? 'is-active' : ''}
                        onClick={() => setSettings((current) => ({ ...current, particleEffect: effect }))}
                      >
                        {effect === 'none' ? 'Нет' : effect === 'nebula' ? 'Nebula' : effect === 'sakura' ? 'Sakura' : 'Stars'}
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
                  <p>Сначала выбери файл. AnimeBox сразу откроет удобный редактор: для аватара — квадратный кадр, для баннера — подгонку под широкую область профиля.</p>
                </div>
              </div>

              <div className="premium-studio-v12__media-grid premium-studio-v15__media-grid premium-studio-v16__media-grid premium-studio-v19__media-grid">
                <article className="premium-studio-v19__media-card">
                  <div className="premium-studio-v12__media-preview is-avatar">
                    {avatarUrl ? (
                      <img
                        src={avatarUrl}
                        alt="Предпросмотр Premium-аватара"
                        style={premiumMediaStyle(avatarTransform) as CSSProperties}
                      />
                    ) : (
                      <span className="premium-studio-v20__media-avatar-placeholder" aria-hidden="true">
                        <svg viewBox="0 0 64 64" focusable="false">
                          <circle cx="32" cy="24" r="10" />
                          <path d="M14 54c2-12 9-18 18-18s16 6 18 18" />
                        </svg>
                      </span>
                    )}
                  </div>
                  <div className="premium-studio-v16__media-copy"><strong>Аватар</strong><small>Animated WebP / GIF / WebP / PNG / JPG · до 8 МБ · минимум 256×256</small></div>
                  <p className="premium-studio-v19__media-hint">После выбора файла откроется кадрирование 1:1. Рекомендуем Animated WebP и файл до 4 МБ — так профиль загружается быстрее.</p>
                  {mediaWarning && <p className="premium-studio-v19__media-warning">{mediaWarning}</p>}
                  <div className="premium-studio-v19__media-actions">
                    <button type="button" disabled={Boolean(uploading) || saving} onClick={() => avatarInputRef.current?.click()}>{uploading === 'avatar' ? 'Загрузка…' : settings.avatarPath || settings.avatarStaticPath ? 'Заменить аватар' : 'Загрузить аватар'}</button>
                    {(settings.avatarPath || settings.avatarStaticPath) && <button type="button" className="is-ghost" onClick={() => editExistingMedia('avatar')}>Изменить кадр</button>}
                    {(settings.avatarPath || settings.avatarStaticPath) && <button type="button" className="is-ghost is-danger" onClick={() => void removeMedia('avatar')}>Сбросить</button>}
                  </div>
                  <input ref={avatarInputRef} hidden type="file" accept="image/webp,image/gif,image/png,image/jpeg" onChange={(event) => void prepareMediaUpload('avatar', event.target.files?.[0])} />
                </article>

                <article className="premium-studio-v19__media-card">
                  <div className="premium-studio-v12__media-preview is-banner">{bannerUrl ? <img src={bannerUrl} alt="Предпросмотр Premium-баннера" style={premiumMediaStyle(bannerTransform) as CSSProperties} /> : <span>Premium Banner</span>}</div>
                  <div className="premium-studio-v16__media-copy"><strong>Баннер</strong><small>до 6 МБ · исходник до 2400×1200</small></div>
                  <p className="premium-studio-v19__media-hint">Для баннера не нужен «кроп» как у аватара: после загрузки ты подгоняешь изображение под реальную широкую рамку профиля.</p>
                  <div className="premium-studio-v19__media-actions">
                    <button type="button" disabled={Boolean(uploading) || saving} onClick={() => bannerInputRef.current?.click()}>{uploading === 'banner' ? 'Загрузка…' : settings.bannerPath || settings.bannerStaticPath ? 'Заменить баннер' : 'Загрузить баннер'}</button>
                    {bannerUrl && <button type="button" className="is-ghost" onClick={() => editExistingMedia('banner')}>Подогнать баннер</button>}
                    {(settings.bannerPath || settings.bannerStaticPath) && <button type="button" className="is-ghost is-danger" onClick={() => void removeMedia('banner')}>Сбросить</button>}
                  </div>
                  <input ref={bannerInputRef} hidden type="file" accept="image/webp,image/gif,image/png,image/jpeg" onChange={(event) => void prepareMediaUpload('banner', event.target.files?.[0])} />
                </article>
              </div>
            </section>
          )}
        </div>
        {!hideDock && (
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
                  ...current,
                  theme: preset.theme,
                  primaryColor: preset.primaryColor,
                  accentColor: preset.accentColor,
                  textColor: preset.textColor,
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
        )}

        {(saved || error) && (
          <div className="premium-studio-v15__messages">
            {saved && <div className="premium-studio__message">{saved}</div>}
            {error && <div className="premium-studio__message is-error">{error}</div>}
          </div>
        )}
      </div>

      <button
        type="button"
        className="premium-studio-v22__preview-fab"
        onClick={() => setMobilePreviewOpen(true)}
        aria-label="Открыть живой предпросмотр Premium-профиля"
      >
        <span className="premium-studio-v22__preview-fab-avatar">
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt=""
              aria-hidden="true"
              style={premiumMediaStyle(avatarTransform) as CSSProperties}
            />
          ) : (
            <span aria-hidden="true">P</span>
          )}
        </span>
        <span className="premium-studio-v22__preview-fab-eye" aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <path d="M2.5 12s3.4-6 9.5-6 9.5 6 9.5 6-3.4 6-9.5 6-9.5-6-9.5-6Z" />
            <circle cx="12" cy="12" r="2.8" />
          </svg>
        </span>
        {dirty && <i className="premium-studio-v22__preview-fab-dot" aria-hidden="true" />}
      </button>

      {mobilePreviewOpen && typeof document !== 'undefined'
        ? createPortal(
            <div
              className="premium-studio-v22__preview-sheet-layer"
              role="presentation"
              onMouseDown={(event) => {
                if (event.currentTarget === event.target) setMobilePreviewOpen(false);
              }}
            >
              <section
                className="premium-studio-v22__preview-sheet"
                role="dialog"
                aria-modal="true"
                aria-label="Предпросмотр Premium-профиля"
              >
                <div className="premium-studio-v22__preview-sheet-handle" aria-hidden="true" />
                <header className="premium-studio-v22__preview-sheet-head">
                  <div>
                    <span>LIVE PREVIEW</span>
                    <strong>Предпросмотр профиля</strong>
                  </div>
                  <button
                    type="button"
                    onClick={() => setMobilePreviewOpen(false)}
                    aria-label="Закрыть предпросмотр"
                  >
                    ×
                  </button>
                </header>

                <div className="premium-studio-v22__preview-sheet-body">
                  <PremiumStudioLivePreview
                    key={`mobile-${previewEpoch}`}
                    settings={settings}
                    avatarUrl={avatarUrl}
                    bannerUrl={bannerUrl}
                    avatarTransform={avatarTransform}
                    bannerTransform={bannerTransform}
                    context={previewContext}
                  />
                </div>

                <footer className="premium-studio-v22__preview-sheet-actions">
                  <button
                    type="button"
                    className="is-secondary"
                    onClick={() => setMobilePreviewOpen(false)}
                  >
                    Продолжить настройку
                  </button>
                  {!hideDock && (
                    <button
                      type="button"
                      className="is-primary"
                      disabled={!dirty || saving || Boolean(uploading)}
                      onClick={() =>
                        void persistSettings(settings)
                          .then(() => setMobilePreviewOpen(false))
                          .catch(() => undefined)
                      }
                    >
                      {saving ? 'Сохраняем…' : dirty ? 'Сохранить' : 'Сохранено'}
                    </button>
                  )}
                </footer>
              </section>
            </div>,
            document.body,
          )
        : null}

      {mediaEditor && (
        <div
          className="premium-media-editor-modal"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !uploading && !saving) closeMediaEditor();
          }}
        >
          <section
            className={`premium-media-editor-modal__dialog ${mediaEditor.kind === 'banner' ? 'is-banner' : 'is-avatar'}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="premium-media-editor-title"
          >
            <div className="premium-media-editor-modal__top">
              <div>
                <span>{mediaEditor.kind === 'avatar' ? 'PREMIUM AVATAR' : 'PREMIUM BANNER'}</span>
                <h2 id="premium-media-editor-title">
                  {mediaEditor.kind === 'avatar' ? 'Настрой кадр аватара' : 'Подгони баннер под профиль'}
                </h2>
                <p>
                  {mediaEditor.kind === 'avatar'
                    ? 'Аватар будет круглым, но редактируем квадрат 1:1 — оригинальная GIF/Animated WebP анимация сохраняется, а AnimeBox отдельно создаёт статический WebP fallback.'
                    : 'Это не отдельный кроп-файл: широкая рамка показывает реальную область баннера. Оригинал и анимация сохраняются.'}
                </p>
                {mediaEditor.kind === 'avatar' && mediaWarning && (
                  <p className="premium-studio-v19__media-warning">{mediaWarning}</p>
                )}
              </div>
              <button type="button" className="premium-media-editor-modal__close" onClick={closeMediaEditor} disabled={Boolean(uploading) || saving} aria-label="Закрыть редактор">×</button>
            </div>

            <PremiumMediaCropEditor
              kind={mediaEditor.kind}
              src={mediaEditor.src}
              value={mediaEditor.transform}
              onChange={(transform) => setMediaEditor((current) => current ? { ...current, transform } : current)}
            />

            <div className="premium-media-editor-modal__actions">
              <button type="button" className="is-secondary" onClick={closeMediaEditor} disabled={Boolean(uploading) || saving}>Отмена</button>
              <button type="button" className="is-primary" onClick={() => void confirmMediaEditor()} disabled={Boolean(uploading) || saving}>
                {uploading === mediaEditor.kind
                  ? 'Загрузка…'
                  : mediaEditor.mode === 'upload'
                    ? mediaEditor.kind === 'avatar' ? 'Сохранить аватар' : 'Сохранить баннер'
                    : mediaEditor.kind === 'avatar' ? 'Применить кадр' : 'Применить подгонку'}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
});

export default PremiumStudioClient;
