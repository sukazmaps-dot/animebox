export type TelegramWebhookStatus = {
  tokenConfigured: boolean;
  secretConfigured: boolean;
  secretValid: boolean;
  expectedUrl: string;
  currentUrl: string | null;
  urlMatches: boolean;
  pendingUpdates: number;
  lastErrorAt: string | null;
  lastError: string | null;
  allowedUpdates: string[];
  requiredUpdatesEnabled: boolean;
};
