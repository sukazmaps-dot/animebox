export const TELEGRAM_CHANNEL_USERNAME = 'yourAnimeBox';
export const TELEGRAM_CHANNEL_HANDLE = '@yourAnimeBox';
export const TELEGRAM_CHANNEL_URL = `https://t.me/${TELEGRAM_CHANNEL_USERNAME}`;

export const TELEGRAM_BOT_USERNAME = 'YourAnimeBoxBot';
export const TELEGRAM_BOT_HANDLE = '@YourAnimeBoxBot';
export const TELEGRAM_BOT_URL = `https://t.me/${TELEGRAM_BOT_USERNAME}`;
export const TELEGRAM_MINI_APP_URL = `${TELEGRAM_BOT_URL}?startapp`;

export function telegramMiniAppUrl(startParam?: string) {
  const value = startParam?.trim();

  return value
    ? `${TELEGRAM_BOT_URL}?startapp=${encodeURIComponent(value)}`
    : TELEGRAM_MINI_APP_URL;
}
