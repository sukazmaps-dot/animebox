export const FRIENDS_CHANGED_EVENT = 'animebox:friends-changed';

export function notifyFriendsChanged() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(FRIENDS_CHANGED_EVENT));
}
