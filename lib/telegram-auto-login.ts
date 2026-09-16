export const TELEGRAM_AUTOLOGIN_CHANGED_EVENT =
  'animebox:telegram-autologin-changed';

const STORAGE_KEY =
  'animebox:telegram-autologin-disabled:v1';

function emitChanged(disabled: boolean) {
  if (typeof window === 'undefined') return;

  window.dispatchEvent(
    new CustomEvent(TELEGRAM_AUTOLOGIN_CHANGED_EVENT, {
      detail: { disabled },
    }),
  );
}

export function isTelegramMiniAppRuntime() {
  if (typeof window === 'undefined') return false;

  return Boolean(window.Telegram?.WebApp?.initData);
}

export function isTelegramAutoLoginDisabled() {
  if (typeof window === 'undefined') return false;

  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function disableTelegramAutoLogin() {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(STORAGE_KEY, '1');
  } catch {
    // Some private/restricted WebViews may deny localStorage.
  }

  emitChanged(true);
}

export function enableTelegramAutoLogin() {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Some private/restricted WebViews may deny localStorage.
  }

  emitChanged(false);
}
