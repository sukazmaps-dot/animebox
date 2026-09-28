export const ENTITLEMENT_KEYS = [
  'adFree',
  'premiumBadge',
  'profileStudio',
  'animatedAvatar',
  'animatedBanner',
  'extraShowcases',
  'premiumThemes',
  'profileScene',
  'nicknameEffects',
  'premiumFrames',
  'profileLayouts',
  'advancedStats',
  'extendedHistory',
  'watchPartyThemes',
  'watchPartyReactions',
  'earlyAccess',
] as const;

export type EntitlementKey = (typeof ENTITLEMENT_KEYS)[number];
export type Entitlements = Record<EntitlementKey, boolean>;

/**
 * Premium 2.0 feature contract.
 *
 * This is the single source of truth for capabilities granted by a live
 * Premium subscription. Product surfaces should read entitlements instead of
 * checking subscription rows directly.
 */
export const PREMIUM_FEATURE_ENTITLEMENTS: readonly EntitlementKey[] = [
  'adFree',
  'premiumBadge',
  'profileStudio',
  'animatedAvatar',
  'animatedBanner',
  'extraShowcases',
  'premiumThemes',
  'profileScene',
  'nicknameEffects',
  'premiumFrames',
  'profileLayouts',
  'advancedStats',
  'extendedHistory',
  'watchPartyThemes',
  'watchPartyReactions',
  'earlyAccess',
] as const;

export const EMPTY_ENTITLEMENTS: Entitlements = {
  adFree: false,
  premiumBadge: false,
  profileStudio: false,
  animatedAvatar: false,
  animatedBanner: false,
  extraShowcases: false,
  premiumThemes: false,
  profileScene: false,
  nicknameEffects: false,
  premiumFrames: false,
  profileLayouts: false,
  advancedStats: false,
  extendedHistory: false,
  watchPartyThemes: false,
  watchPartyReactions: false,
  earlyAccess: false,
};

export function isEntitlementKey(value: string): value is EntitlementKey {
  return (ENTITLEMENT_KEYS as readonly string[]).includes(value);
}

export function hasEntitlement(
  entitlements: Entitlements | null | undefined,
  entitlement: EntitlementKey,
) {
  return Boolean(entitlements?.[entitlement]);
}
