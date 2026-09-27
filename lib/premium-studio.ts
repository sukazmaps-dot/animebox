export const PREMIUM_PROFILE_THEMES = [
  'default',
  'violet',
  'midnight',
  'sakura',
  'crimson',
  'ocean',
  'gold',
] as const;

export type PremiumProfileTheme = (typeof PREMIUM_PROFILE_THEMES)[number];

export const PREMIUM_BORDER_STYLES = ['soft', 'neon', 'sharp'] as const;
export type PremiumBorderStyle = (typeof PREMIUM_BORDER_STYLES)[number];

export const PREMIUM_ATMOSPHERE_EFFECTS = [
  'none',
  'aurora',
  'embers',
  'sakura',
  'stardust',
] as const;
export type PremiumAtmosphereEffect = (typeof PREMIUM_ATMOSPHERE_EFFECTS)[number];

export const PREMIUM_MOTION_MODES = ['off', 'soft', 'live'] as const;
export type PremiumMotionMode = (typeof PREMIUM_MOTION_MODES)[number];

export const PREMIUM_ENTRANCE_EFFECTS = [
  'none',
  'fade',
  'bloom',
  'manga',
  'glitch',
] as const;
export type PremiumEntranceEffect = (typeof PREMIUM_ENTRANCE_EFFECTS)[number];

export const PREMIUM_NICKNAME_EFFECTS = [
  'none',
  'gradient',
  'shimmer',
  'glow',
] as const;
export type PremiumNicknameEffect = (typeof PREMIUM_NICKNAME_EFFECTS)[number];

export const PREMIUM_HERO_STYLES = ['cinematic', 'spotlight', 'clean'] as const;
export type PremiumHeroStyle = (typeof PREMIUM_HERO_STYLES)[number];

export const PREMIUM_SURFACE_STYLES = ['glass', 'deep', 'ink'] as const;
export type PremiumSurfaceStyle = (typeof PREMIUM_SURFACE_STYLES)[number];

export type PremiumMediaTransform = {
  x: number;
  y: number;
  zoom: number;
};

export type PremiumStudioSettings = {
  theme: PremiumProfileTheme;
  primaryColor: string;
  accentColor: string;
  textColor: string;
  glowStrength: number;
  borderStyle: PremiumBorderStyle;
  avatarPath: string | null;
  avatarStaticPath: string | null;
  avatarPositionX: number;
  avatarPositionY: number;
  avatarZoom: number;
  bannerPath: string | null;
  bannerStaticPath: string | null;
  bannerPositionX: number;
  bannerPositionY: number;
  bannerZoom: number;
  syncPlayerTheme: boolean;
  atmosphereEffect: PremiumAtmosphereEffect;
  atmosphereIntensity: number;
  motionMode: PremiumMotionMode;
  entranceEffect: PremiumEntranceEffect;
  nicknameEffect: PremiumNicknameEffect;
  heroStyle: PremiumHeroStyle;
  surfaceStyle: PremiumSurfaceStyle;
};

export const DEFAULT_PREMIUM_STUDIO_SETTINGS: PremiumStudioSettings = {
  theme: 'default',
  primaryColor: '#101426',
  accentColor: '#7C4DFF',
  textColor: '#F5F3FF',
  glowStrength: 36,
  borderStyle: 'neon',
  avatarPath: null,
  avatarStaticPath: null,
  avatarPositionX: 50,
  avatarPositionY: 50,
  avatarZoom: 1,
  bannerPath: null,
  bannerStaticPath: null,
  bannerPositionX: 50,
  bannerPositionY: 50,
  bannerZoom: 1,
  syncPlayerTheme: true,
  atmosphereEffect: 'aurora',
  atmosphereIntensity: 48,
  motionMode: 'soft',
  entranceEffect: 'bloom',
  nicknameEffect: 'gradient',
  heroStyle: 'cinematic',
  surfaceStyle: 'glass',
};

export const PREMIUM_PROFILE_THEME_META: Record<
  PremiumProfileTheme,
  {
    label: string;
    description: string;
    primaryColor: string;
    accentColor: string;
    textColor: string;
  }
> = {
  default: {
    label: 'AnimeBox',
    description: 'Базовое тёмное оформление AnimeBox.',
    primaryColor: '#101426',
    accentColor: '#7C4DFF',
    textColor: '#F5F3FF',
  },
  violet: {
    label: 'Violet Nebula',
    description: 'Глубокий фиолетовый профиль с космическим свечением.',
    primaryColor: '#171026',
    accentColor: '#B35CFF',
    textColor: '#FFF7FF',
  },
  midnight: {
    label: 'Midnight',
    description: 'Холодный ночной профиль с синим неоновым акцентом.',
    primaryColor: '#081426',
    accentColor: '#4F8CFF',
    textColor: '#F3F8FF',
  },
  sakura: {
    label: 'Sakura Night',
    description: 'Тёмная сакура с мягкими розово-фиолетовыми акцентами.',
    primaryColor: '#24101E',
    accentColor: '#FF6FAF',
    textColor: '#FFF4F9',
  },
  crimson: {
    label: 'Crimson Oath',
    description: 'Глубокий багровый профиль с контрастным красным свечением.',
    primaryColor: '#1D0B12',
    accentColor: '#FF4E6A',
    textColor: '#FFF4F6',
  },
  ocean: {
    label: 'Ocean Glass',
    description: 'Холодное стекло, бирюзово-синий свет и чистая глубина.',
    primaryColor: '#071821',
    accentColor: '#52D9E8',
    textColor: '#F0FDFF',
  },
  gold: {
    label: 'Golden Hour',
    description: 'Тёмное золото и тёплый premium-акцент без дешёвого блеска.',
    primaryColor: '#1B150A',
    accentColor: '#F2C461',
    textColor: '#FFF9E9',
  },
};

const HEX_COLOR_RE = /^#[0-9A-Fa-f]{6}$/;

export function isPremiumProfileTheme(value: string): value is PremiumProfileTheme {
  return (PREMIUM_PROFILE_THEMES as readonly string[]).includes(value);
}

export function isPremiumBorderStyle(value: string): value is PremiumBorderStyle {
  return (PREMIUM_BORDER_STYLES as readonly string[]).includes(value);
}

export function isPremiumAtmosphereEffect(value: string): value is PremiumAtmosphereEffect {
  return (PREMIUM_ATMOSPHERE_EFFECTS as readonly string[]).includes(value);
}

export function isPremiumMotionMode(value: string): value is PremiumMotionMode {
  return (PREMIUM_MOTION_MODES as readonly string[]).includes(value);
}

export function isPremiumEntranceEffect(value: string): value is PremiumEntranceEffect {
  return (PREMIUM_ENTRANCE_EFFECTS as readonly string[]).includes(value);
}

export function isPremiumNicknameEffect(value: string): value is PremiumNicknameEffect {
  return (PREMIUM_NICKNAME_EFFECTS as readonly string[]).includes(value);
}

export function isPremiumHeroStyle(value: string): value is PremiumHeroStyle {
  return (PREMIUM_HERO_STYLES as readonly string[]).includes(value);
}

export function isPremiumSurfaceStyle(value: string): value is PremiumSurfaceStyle {
  return (PREMIUM_SURFACE_STYLES as readonly string[]).includes(value);
}

export function isHexColor(value: string): boolean {
  return HEX_COLOR_RE.test(value);
}

function stringOrNull(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function readColor(value: unknown, fallback: string) {
  return typeof value === 'string' && isHexColor(value.trim())
    ? value.trim().toUpperCase()
    : fallback;
}

function readGlow(value: unknown) {
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(number)) return DEFAULT_PREMIUM_STUDIO_SETTINGS.glowStrength;
  return Math.max(0, Math.min(100, Math.round(number)));
}

function readAtmosphereIntensity(value: unknown) {
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(number)) return DEFAULT_PREMIUM_STUDIO_SETTINGS.atmosphereIntensity;
  return Math.max(0, Math.min(100, Math.round(number)));
}

function readPosition(value: unknown, fallback = 50) {
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, Math.min(100, Math.round(number * 10) / 10));
}

function readZoom(value: unknown, fallback = 1) {
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(1, Math.min(3, Math.round(number * 100) / 100));
}

export function studioSettingsFromRow(
  row?: Record<string, unknown> | null,
): PremiumStudioSettings {
  if (!row) return { ...DEFAULT_PREMIUM_STUDIO_SETTINGS };

  const rawTheme = stringOrNull(row.theme) ?? 'default';
  const rawBorder = stringOrNull(row.border_style) ?? 'neon';
  const rawAtmosphere = stringOrNull(row.atmosphere_effect) ?? 'none';
  const rawMotion = stringOrNull(row.motion_mode) ?? 'soft';
  const rawEntrance = stringOrNull(row.entrance_effect) ?? 'fade';
  const rawNickname = stringOrNull(row.nickname_effect) ?? 'none';
  const rawHero = stringOrNull(row.hero_style) ?? 'cinematic';
  const rawSurface = stringOrNull(row.surface_style) ?? 'glass';

  return {
    theme: isPremiumProfileTheme(rawTheme) ? rawTheme : 'default',
    primaryColor: readColor(
      row.primary_color,
      DEFAULT_PREMIUM_STUDIO_SETTINGS.primaryColor,
    ),
    accentColor: readColor(
      row.accent_color,
      DEFAULT_PREMIUM_STUDIO_SETTINGS.accentColor,
    ),
    textColor: readColor(
      row.text_color,
      DEFAULT_PREMIUM_STUDIO_SETTINGS.textColor,
    ),
    glowStrength: readGlow(row.glow_strength),
    borderStyle: isPremiumBorderStyle(rawBorder) ? rawBorder : 'neon',
    avatarPath: stringOrNull(row.avatar_path),
    avatarStaticPath: stringOrNull(row.avatar_static_path),
    avatarPositionX: readPosition(row.avatar_position_x),
    avatarPositionY: readPosition(row.avatar_position_y),
    avatarZoom: readZoom(row.avatar_zoom),
    bannerPath: stringOrNull(row.banner_path),
    bannerStaticPath: stringOrNull(row.banner_static_path),
    bannerPositionX: readPosition(row.banner_position_x),
    bannerPositionY: readPosition(row.banner_position_y),
    bannerZoom: readZoom(row.banner_zoom),
    syncPlayerTheme:
      typeof row.sync_player_theme === 'boolean'
        ? row.sync_player_theme
        : DEFAULT_PREMIUM_STUDIO_SETTINGS.syncPlayerTheme,
    atmosphereEffect: isPremiumAtmosphereEffect(rawAtmosphere) ? rawAtmosphere : 'none',
    atmosphereIntensity: readAtmosphereIntensity(row.atmosphere_intensity),
    motionMode: isPremiumMotionMode(rawMotion) ? rawMotion : 'soft',
    entranceEffect: isPremiumEntranceEffect(rawEntrance) ? rawEntrance : 'fade',
    nicknameEffect: isPremiumNicknameEffect(rawNickname) ? rawNickname : 'none',
    heroStyle: isPremiumHeroStyle(rawHero) ? rawHero : 'cinematic',
    surfaceStyle: isPremiumSurfaceStyle(rawSurface) ? rawSurface : 'glass',
  };
}

export function premiumThemePreset(theme: PremiumProfileTheme): PremiumStudioSettings {
  const meta = PREMIUM_PROFILE_THEME_META[theme];

  return {
    ...DEFAULT_PREMIUM_STUDIO_SETTINGS,
    theme,
    primaryColor: meta.primaryColor,
    accentColor: meta.accentColor,
    textColor: meta.textColor,
  };
}

export function hexToRgb(value: string) {
  if (!isHexColor(value)) return { r: 124, g: 77, b: 255 };
  return {
    r: Number.parseInt(value.slice(1, 3), 16),
    g: Number.parseInt(value.slice(3, 5), 16),
    b: Number.parseInt(value.slice(5, 7), 16),
  };
}

export function hexToRgba(value: string, alpha: number) {
  const { r, g, b } = hexToRgb(value);
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, alpha))})`;
}

function linearChannel(channel: number) {
  const value = channel / 255;
  return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

export function contrastRatio(foreground: string, background: string) {
  const fg = hexToRgb(foreground);
  const bg = hexToRgb(background);
  const fgL =
    0.2126 * linearChannel(fg.r) +
    0.7152 * linearChannel(fg.g) +
    0.0722 * linearChannel(fg.b);
  const bgL =
    0.2126 * linearChannel(bg.r) +
    0.7152 * linearChannel(bg.g) +
    0.0722 * linearChannel(bg.b);

  const lighter = Math.max(fgL, bgL);
  const darker = Math.min(fgL, bgL);
  return (lighter + 0.05) / (darker + 0.05);
}

export function bestContrastColor(background: string) {
  const white = '#FFFFFF';
  const black = '#0A0B10';
  return contrastRatio(white, background) >= contrastRatio(black, background)
    ? white
    : black;
}

export function resolveReadableTextColor(
  requested: string,
  background: string,
  minimumContrast = 4.5,
) {
  if (contrastRatio(requested, background) >= minimumContrast) return requested;
  return bestContrastColor(background);
}

export function premiumStudioCssVariables(settings: PremiumStudioSettings) {
  const accentRgb = hexToRgb(settings.accentColor);
  const requestedTextRgb = hexToRgb(settings.textColor);
  const safeText = resolveReadableTextColor(settings.textColor, settings.primaryColor);
  const safeTextRgb = hexToRgb(safeText);
  const onAccent = resolveReadableTextColor(settings.textColor, settings.accentColor);
  const onAccentRgb = hexToRgb(onAccent);
  const glowAlpha = 0.08 + (settings.glowStrength / 100) * 0.34;
  const glowSoftAlpha = 0.03 + (settings.glowStrength / 100) * 0.13;
  const glowPageAlpha = 0.02 + (settings.glowStrength / 100) * 0.18;
  const atmosphereAlpha =
    settings.atmosphereIntensity <= 0
      ? 0
      : 0.08 + (settings.atmosphereIntensity / 100) * 0.34;
  const atmosphereLiveAlpha =
    settings.atmosphereIntensity <= 0
      ? 0
      : Math.min(0.68, atmosphereAlpha + 0.18);
  const motionDuration =
    settings.motionMode === 'live'
      ? 12
      : settings.motionMode === 'soft'
        ? 22
        : 0;

  return {
    '--ab-premium-primary': settings.primaryColor,
    '--ab-premium-accent': settings.accentColor,
    '--ab-premium-text-selected': settings.textColor,
    '--ab-premium-text-selected-rgb': `${requestedTextRgb.r}, ${requestedTextRgb.g}, ${requestedTextRgb.b}`,
    '--ab-premium-text': safeText,
    '--ab-premium-text-rgb': `${safeTextRgb.r}, ${safeTextRgb.g}, ${safeTextRgb.b}`,
    '--ab-premium-on-accent': onAccent,
    '--ab-premium-on-accent-rgb': `${onAccentRgb.r}, ${onAccentRgb.g}, ${onAccentRgb.b}`,
    '--ab-premium-accent-rgb': `${accentRgb.r}, ${accentRgb.g}, ${accentRgb.b}`,
    '--ab-premium-glow-alpha': String(glowAlpha),
    '--ab-premium-glow-half-alpha': String(glowAlpha * 0.5),
    '--ab-premium-glow-soft-alpha': String(glowSoftAlpha),
    '--ab-premium-glow-page-alpha': String(glowPageAlpha),
    '--ab-premium-glow-strength': String(settings.glowStrength),
    '--ab-premium-atmosphere-alpha': String(atmosphereAlpha),
    '--ab-premium-atmosphere-live-alpha': String(atmosphereLiveAlpha),
    '--ab-premium-atmosphere-intensity': String(settings.atmosphereIntensity),
    '--ab-premium-motion-duration': `${motionDuration}s`,
    '--ab-premium-motion-duration-fast': `${Math.max(0.001, motionDuration * 0.56)}s`,
    '--ab-premium-motion-duration-slow': `${Math.max(0.001, motionDuration * 1.32)}s`,
  };
}

export function premiumMediaTransform(
  settings: PremiumStudioSettings | null | undefined,
  kind: 'avatar' | 'banner',
): PremiumMediaTransform {
  if (!settings) return { x: 50, y: 50, zoom: 1 };

  return kind === 'avatar'
    ? {
        x: settings.avatarPositionX,
        y: settings.avatarPositionY,
        zoom: settings.avatarZoom,
      }
    : {
        x: settings.bannerPositionX,
        y: settings.bannerPositionY,
        zoom: settings.bannerZoom,
      };
}

export function premiumMediaStyle(transform?: PremiumMediaTransform | null) {
  const safe = transform ?? { x: 50, y: 50, zoom: 1 };
  const x = Math.max(0, Math.min(100, safe.x));
  const y = Math.max(0, Math.min(100, safe.y));
  const zoom = Math.max(1, Math.min(3, safe.zoom));

  return {
    objectPosition: `${x}% ${y}%`,
    transform: `scale(${zoom})`,
    transformOrigin: `${x}% ${y}%`,
  };
}

