export const ENTITLEMENT_KEYS = [
  'adFree',
  'premiumBadge',
  'profileStudio',
  'animatedAvatar',
  'extraShowcases',
  'premiumThemes',
] as const;

export type EntitlementKey = (typeof ENTITLEMENT_KEYS)[number];
export type Entitlements = Record<EntitlementKey, boolean>;

export const EMPTY_ENTITLEMENTS: Entitlements = {
  adFree: false,
  premiumBadge: false,
  profileStudio: false,
  animatedAvatar: false,
  extraShowcases: false,
  premiumThemes: false,
};

export function isEntitlementKey(value: string): value is EntitlementKey {
  return (ENTITLEMENT_KEYS as readonly string[]).includes(value);
}
