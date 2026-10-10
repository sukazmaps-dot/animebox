import 'server-only';

import { optionalServerSecret } from '@/lib/env/server';
import type { TelegramWebhookStatus } from '@/types/telegram-webhook';

const WEBHOOK_URL = 'https://youranimebox.com/api/telegram/webhook';
const REQUIRED_UPDATES = ['message', 'pre_checkout_query', 'subscription'];

type WebhookInfo = {
  url?: string;
  pending_update_count?: number;
  last_error_date?: number;
  last_error_message?: string;
  allowed_updates?: string[];
};

export class TelegramWebhookError extends Error {}

function configuration() {
  const token = optionalServerSecret('TELEGRAM_BOT_TOKEN');
  const secret = optionalServerSecret('TELEGRAM_WEBHOOK_SECRET');
  return { token, secret, secretValid: Boolean(secret && /^[A-Za-z0-9_-]{1,256}$/.test(secret)) };
}

function redact(value: string, config: ReturnType<typeof configuration>) {
  let result = value;
  for (const secret of [config.token, config.secret]) {
    if (secret) {
      result = result.split(secret).join('[hidden]');
      result = result.split(encodeURIComponent(secret)).join('[hidden]');
    }
  }
  return result.replace(/bot\d+:[A-Za-z0-9_-]+/g, 'bot[hidden]').slice(0, 500);
}

async function telegramApi<T>(token: string, method: string, body: object = {}): Promise<T> {
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new TelegramWebhookError(`Telegram API: HTTP ${response.status}.`);
    const data = await response.json();
    if (data?.ok !== true || data.result == null) {
      throw new TelegramWebhookError('Telegram API не подтвердил выполнение запроса.');
    }
    return data.result as T;
  } catch (error) {
    // Fetch exceptions can contain the URL with the bot token. Never expose it.
    if (error instanceof TelegramWebhookError) throw error;
    throw new TelegramWebhookError('Не удалось связаться с Telegram API.');
  }
}

function summarize(info: WebhookInfo, config: ReturnType<typeof configuration>): TelegramWebhookStatus {
  const allowed = Array.isArray(info.allowed_updates)
    ? info.allowed_updates.filter((value): value is string => typeof value === 'string')
    : [];
  const timestamp = Number(info.last_error_date);
  return {
    tokenConfigured: Boolean(config.token),
    secretConfigured: Boolean(config.secret),
    secretValid: config.secretValid,
    expectedUrl: WEBHOOK_URL,
    currentUrl: typeof info.url === 'string' ? redact(info.url, config) : null,
    urlMatches: info.url === WEBHOOK_URL,
    pendingUpdates: Number.isSafeInteger(info.pending_update_count) ? Number(info.pending_update_count) : 0,
    lastErrorAt: Number.isFinite(timestamp) && timestamp > 0 && timestamp < 1e11
      ? new Date(timestamp * 1000).toISOString() : null,
    lastError: typeof info.last_error_message === 'string' ? redact(info.last_error_message, config) : null,
    allowedUpdates: allowed,
    // An empty list uses Telegram's default, which includes these update types.
    requiredUpdatesEnabled: !allowed.length || REQUIRED_UPDATES.every((type) => allowed.includes(type)),
  };
}

export async function getTelegramWebhookStatus(): Promise<TelegramWebhookStatus> {
  const config = configuration();
  if (!config.token) return summarize({}, config);
  const info = await telegramApi<WebhookInfo>(config.token, 'getWebhookInfo');
  return summarize(info, config);
}

export async function repairTelegramWebhook(): Promise<TelegramWebhookStatus> {
  const config = configuration();
  if (!config.token || !config.secret) {
    throw new TelegramWebhookError('На сервере нужны TELEGRAM_BOT_TOKEN и TELEGRAM_WEBHOOK_SECRET.');
  }
  if (!config.secretValid) {
    throw new TelegramWebhookError('TELEGRAM_WEBHOOK_SECRET должен содержать 1–256 символов A–Z, a–z, 0–9, _ или -.');
  }
  const before = await telegramApi<WebhookInfo>(config.token, 'getWebhookInfo');
  try {
    // An empty authenticated update is acknowledged without messages/payments.
    const probe = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Telegram-Bot-Api-Secret-Token': config.secret,
      },
      body: '{}',
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(10_000),
    });
    if (!probe.ok || (await probe.json())?.ok !== true) {
      throw new TelegramWebhookError(`Обработчик webhook не прошёл проверку (HTTP ${probe.status}). Проверь настройки сервера и Cloudflare.`);
    }
  } catch (error) {
    if (error instanceof TelegramWebhookError) throw error;
    throw new TelegramWebhookError('Канонический обработчик webhook недоступен или перенаправляет запрос.');
  }
  const allowedUpdates = Array.isArray(before.allowed_updates) && before.allowed_updates.length
    ? [...new Set([...before.allowed_updates, ...REQUIRED_UPDATES])]
    : []; // Preserve default delivery instead of narrowing to required types.
  const installed = await telegramApi<boolean>(config.token, 'setWebhook', {
    url: WEBHOOK_URL,
    secret_token: config.secret,
    allowed_updates: allowedUpdates,
    drop_pending_updates: false,
  });
  if (installed !== true) throw new TelegramWebhookError('Telegram не подтвердил установку webhook.');
  const status = summarize(await telegramApi<WebhookInfo>(config.token, 'getWebhookInfo'), config);
  if (!status.urlMatches || !status.requiredUpdatesEnabled) {
    throw new TelegramWebhookError('Проверка настроек webhook после установки не прошла.');
  }
  return status;
}
