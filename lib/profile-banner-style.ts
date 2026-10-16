/** Allowlisted profile banner fills. No raw CSS supplied by a user reaches this renderer. */
export type BannerStyle = 'solid' | 'soft' | 'sunset' | 'glow';
export const DEFAULT_BANNER_COLOR = '#70618c';
export const DEFAULT_BANNER_STYLE: BannerStyle = 'soft';
export const FREE_BANNER_STYLES: readonly BannerStyle[] = ['solid', 'soft'];
export function validBannerColor(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value);
}
export function isBannerStyle(value: unknown): value is BannerStyle {
  return value === 'solid' || value === 'soft' || value === 'sunset' || value === 'glow';
}
export function normalizeBannerStyle(value: unknown): BannerStyle {
  return isBannerStyle(value) ? value : DEFAULT_BANNER_STYLE;
}
/** Paid fills are stored safely but shown as a free gradient after subscription expiry. */
export function visibleBannerStyle(value: unknown, premiumActive: boolean): BannerStyle {
  const style = normalizeBannerStyle(value);
  return premiumActive || FREE_BANNER_STYLES.includes(style) ? style : DEFAULT_BANNER_STYLE;
}
export function bannerStyleBackground(value: unknown, style: unknown = DEFAULT_BANNER_STYLE): string {
  const color = validBannerColor(value) ? value.toLowerCase() : DEFAULT_BANNER_COLOR;
  switch (normalizeBannerStyle(style)) {
    case 'solid': return color;
    case 'sunset': return `linear-gradient(126deg, ${color} 0%, #f09b87 56%, #e4baab 100%)`;
    case 'glow': return `radial-gradient(circle at 73% 22%, color-mix(in srgb, ${color} 72%, #ffffff), ${color} 75%)`;
    default: return `linear-gradient(125deg, color-mix(in srgb, ${color} 88%, #ffffff), ${color} 75%, color-mix(in srgb, ${color} 72%, #171329))`;
  }
}
export const BANNER_COLOR_PRESETS: readonly { label: string; color: string; style: BannerStyle; premium?: boolean }[] = [
  {label:'Лаванда',color:'#70618c',style:'soft'},
  {label:'Графит',color:'#272a3d',style:'solid'},
  {label:'Сакура',color:'#db91ae',style:'soft'},
  {label:'Лазурь',color:'#558ab5',style:'soft'},
  {label:'Сирень',color:'#9b80c5',style:'solid'},
  {label:'Изумруд',color:'#4e957e',style:'soft'},
  {label:'Закатный песок',color:'#cd906a',style:'solid'},
  {label:'Ночная синева',color:'#39446d',style:'soft'},
  {label:'Серебро',color:'#b9c1d1',style:'solid'},
  {label:'Вишня',color:'#ab5472',style:'soft'},
  {label:'Аврора',color:'#8060b8',style:'glow',premium:true},
  {label:'Солнечный закат',color:'#bb6596',style:'sunset',premium:true},
];
