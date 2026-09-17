export {};

declare global {
  interface Window {
    Telegram?: {
      WebApp: TelegramWebApp;
    };
  }

  interface TelegramSafeAreaInset {
    top: number;
    bottom: number;
    left: number;
    right: number;
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
    isVerticalSwipesEnabled?: boolean;

    viewportHeight: number;
    viewportStableHeight: number;

    safeAreaInset?: TelegramSafeAreaInset;
    contentSafeAreaInset?: TelegramSafeAreaInset;

    ready(): void;
    expand(): void;

    isVersionAtLeast?: (version: string) => boolean;

    requestFullscreen?: () => void;
    exitFullscreen?: () => void;

    disableVerticalSwipes?: () => void;
    enableVerticalSwipes?: () => void;

    setHeaderColor?: (color: string) => void;
    setBackgroundColor?: (color: string) => void;
    setBottomBarColor?: (color: string) => void;

    openTelegramLink?: (url: string) => void;

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
