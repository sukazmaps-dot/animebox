export {};

declare global {
  interface Window {
    Telegram?: {
      WebApp: TelegramWebApp;
    };
  }

  interface TelegramWebApp {
    initData: string;

    initDataUnsafe: {
      user?: {
        id: number;
        first_name: string;
        last_name?: string;
        username?: string;
        language_code?: string;
        photo_url?: string;
        allows_write_to_pm?: boolean;
      };

      start_param?: string;
      auth_date?: number;

      [key: string]: unknown;
    };

    version: string;
    platform: string;

    colorScheme: 'light' | 'dark';

    themeParams: Record<
      string,
      string | undefined
    >;

    isExpanded: boolean;
    isFullscreen?: boolean;
    isOrientationLocked?: boolean;

    viewportHeight: number;
    viewportStableHeight: number;

    ready(): void;
    expand(): void;

    requestFullscreen?: () => void;
    exitFullscreen?: () => void;
    lockOrientation?: () => void;
    unlockOrientation?: () => void;
    disableVerticalSwipes?: () => void;
    enableVerticalSwipes?: () => void;

    requestWriteAccess?: (
      callback?: (allowed: boolean) => void,
    ) => void;

    onEvent?: (
      eventType: string,
      callback: (...args: unknown[]) => void
    ) => void;

    offEvent?: (
      eventType: string,
      callback: (...args: unknown[]) => void
    ) => void;
  }
}