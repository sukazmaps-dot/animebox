'use client';

export const PROFILE_APPEARANCE_CHANGED_EVENT =
  'animebox:profile-appearance-changed';

export type ProfileAppearanceChangedDetail = {
  userId: string;
  changedAt: number;
};

export function notifyProfileAppearanceChanged(userId: string) {
  if (typeof window === 'undefined') return;

  const cleanUserId = userId.trim();
  if (!cleanUserId) return;

  window.dispatchEvent(
    new CustomEvent<ProfileAppearanceChangedDetail>(
      PROFILE_APPEARANCE_CHANGED_EVENT,
      {
        detail: {
          userId: cleanUserId,
          changedAt: Date.now(),
        },
      },
    ),
  );
}
