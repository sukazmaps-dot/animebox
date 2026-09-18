export const AUTH_CHANGED_EVENT = 'animebox:auth-changed';

export type AuthProfileSnapshot = {
  id: string;
  username: string | null;
  avatar_path: string | null;
  display_avatar_path?: string | null;
};

export type AuthChangedDetail = {
  userId?: string;
  profile?: Partial<AuthProfileSnapshot> | null;
};

export function notifyAuthChanged(detail: AuthChangedDetail = {}) {
  if (typeof window === 'undefined') return;

  window.dispatchEvent(
    new CustomEvent<AuthChangedDetail>(AUTH_CHANGED_EVENT, {
      detail,
    }),
  );
}
