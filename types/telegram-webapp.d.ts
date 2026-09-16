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

    viewportHeight: number;
    viewportStableHeight: number;

    ready(): void;
    expand(): void;

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