'use client';

export type TelegramWelcomeSource =
  | 'email'
  | 'google'
  | 'telegram_web'
  | 'telegram_mini_app';

type PendingWelcome = {
  userId: string;
  source: TelegramWelcomeSource;
  createdAt: number;
};

const PENDING_KEY = 'animebox:telegram-welcome-pending:v1';
const SHOWN_PREFIX = 'animebox:telegram-welcome-shown:v1:';
const EVENT_NAME = 'animebox:telegram-welcome-pending';

export function markTelegramWelcomePending(
  userId: string,
  source: TelegramWelcomeSource,
) {
  if (typeof window === 'undefined') return;
  const cleanUserId = userId.trim();
  if (!cleanUserId) return;

  const payload: PendingWelcome = {
    userId: cleanUserId,
    source,
    createdAt: Date.now(),
  };

  try {
    window.sessionStorage.setItem(PENDING_KEY, JSON.stringify(payload));
  } catch {
    return;
  }

  window.dispatchEvent(new CustomEvent(EVENT_NAME));
}

export function readTelegramWelcomePending(): PendingWelcome | null {
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.sessionStorage.getItem(PENDING_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PendingWelcome>;
    if (
      typeof parsed.userId !== 'string' ||
      !parsed.userId.trim() ||
      typeof parsed.source !== 'string' ||
      typeof parsed.createdAt !== 'number'
    ) {
      return null;
    }

    return {
      userId: parsed.userId,
      source: parsed.source as TelegramWelcomeSource,
      createdAt: parsed.createdAt,
    };
  } catch {
    return null;
  }
}

export function clearTelegramWelcomePending() {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(PENDING_KEY);
  } catch {
    // Best-effort UX state only.
  }
}

export function telegramWelcomeAlreadyShown(userId: string) {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(`${SHOWN_PREFIX}${userId}`) === '1';
  } catch {
    return false;
  }
}

export function markTelegramWelcomeShown(userId: string) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(`${SHOWN_PREFIX}${userId}`, '1');
  } catch {
    // Best-effort UX state only.
  }
}

export function subscribeTelegramWelcomePending(listener: () => void) {
  if (typeof window === 'undefined') return () => undefined;
  window.addEventListener(EVENT_NAME, listener);
  return () => window.removeEventListener(EVENT_NAME, listener);
}
