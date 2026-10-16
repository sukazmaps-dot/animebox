import {DEFAULT_PREMIUM_STUDIO_SETTINGS,PREMIUM_PROFILE_THEMES,PREMIUM_BORDER_STYLES,PREMIUM_PARTICLE_EFFECTS,PREMIUM_ATMOSPHERE_EFFECTS,PREMIUM_MOTION_MODES,PREMIUM_ENTRANCE_EFFECTS,PREMIUM_NICKNAME_EFFECTS,PREMIUM_HERO_STYLES,PREMIUM_SURFACE_STYLES,PREMIUM_PROFILE_LAYOUTS,PREMIUM_BANNER_HEIGHT_MODES,type PremiumStudioSettings} from './premium-studio';
const enums:Record<string,readonly string[]>={theme:PREMIUM_PROFILE_THEMES,borderStyle:PREMIUM_BORDER_STYLES,particleEffect:PREMIUM_PARTICLE_EFFECTS,atmosphereEffect:PREMIUM_ATMOSPHERE_EFFECTS,motionMode:PREMIUM_MOTION_MODES,entranceEffect:PREMIUM_ENTRANCE_EFFECTS,nicknameEffect:PREMIUM_NICKNAME_EFFECTS,heroStyle:PREMIUM_HERO_STYLES,surfaceStyle:PREMIUM_SURFACE_STYLES,profileLayout:PREMIUM_PROFILE_LAYOUTS,bannerHeightMode:PREMIUM_BANNER_HEIGHT_MODES};
export function themeShareData(settings:PremiumStudioSettings) {
  return Object.fromEntries(Object.entries(settings).filter(([key])=>!/path|position|zoom/i.test(key)));
}
export function parseThemeShare(text:string):Partial<PremiumStudioSettings>|null {
  try {
    if(text.length>5000)return null;
    const input=JSON.parse(text) as Record<string,unknown>;
    const result:Record<string,unknown>={};
    for(const [key,value] of Object.entries(input)){
      if(!(key in DEFAULT_PREMIUM_STUDIO_SETTINGS)||/path|position|zoom/i.test(key))continue;
      const original=DEFAULT_PREMIUM_STUDIO_SETTINGS[key as keyof PremiumStudioSettings];
      if(enums[key]){if(typeof value==='string'&&enums[key].includes(value))result[key]=value;}
      else if(/color/i.test(key)){if(typeof value==='string'&&/^#[0-9a-f]{6}$/i.test(value))result[key]=value;}
      else if(typeof original==='boolean'&&typeof value==='boolean')result[key]=value;
      else if(typeof original==='number'&&typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=300)result[key]=value;
    }
    return Object.keys(result).length?result as Partial<PremiumStudioSettings>:null;
  }catch{return null;}
}
