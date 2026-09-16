import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { createSupabaseAdmin } from '@/lib/supabase/admin';

export class NotificationError extends Error {
  constructor(
    public status: number,
    public code: string,
    message?: string,
  ) {
    super(message ?? code);
    this.name = 'NotificationError';
  }
}

export function notificationResponse(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: {
      'Cache-Control': 'private, no-store',
      Pragma: 'no-cache',
    },
  });
}

export function notificationFailure(error: unknown) {
  if (error instanceof NotificationError) {
    return notificationResponse(
      {
        ok: false,
        error: error.code,
        message: error.message,
      },
      error.status,
    );
  }

  console.error('[Notifications]', error);

  return notificationResponse(
    {
      ok: false,
      error: 'notification_server_error',
      message: 'Не удалось обработать уведомления.',
    },
    500,
  );
}

export async function requireNotificationUser() {
  const client = await createClient();

  const {
    data: { user },
    error,
  } = await client.auth.getUser();

  if (error || !user) {
    throw new NotificationError(401, 'auth_required', 'Войди в аккаунт.');
  }

  return { client, user };
}

export function positiveAnimeId(value: unknown) {
  const id = typeof value === 'number' ? value : Number(value);

  if (!Number.isSafeInteger(id) || id < 1 || id > 2_147_483_647) {
    throw new NotificationError(400, 'invalid_anime_id', 'Некорректный ID аниме.');
  }

  return id;
}

export function safeEpisode(value: unknown) {
  if (value == null || value === '') return 0;

  const episode = typeof value === 'number' ? value : Number(value);

  if (!Number.isSafeInteger(episode) || episode < 0 || episode > 100_000) {
    throw new NotificationError(400, 'invalid_episode', 'Некорректный номер серии.');
  }

  return episode;
}

export function safeSlug(value: unknown, animeId: number) {
  if (typeof value !== 'string') return String(animeId);

  const slug = value.trim();

  if (!slug || slug.length > 180 || !/^[a-z0-9][a-z0-9-]*$/i.test(slug)) {
    return String(animeId);
  }

  return slug;
}

export function safeTitle(value: unknown) {
  if (typeof value !== 'string') return 'Аниме';

  const title = value.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  return title.slice(0, 180) || 'Аниме';
}

export function escapeTelegramHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

type TelegramSendResult = {
  ok?: boolean;
  result?: {
    message_id?: number;
  };
  error_code?: number;
  description?: string;
  parameters?: {
    retry_after?: number;
  };
};

export async function sendTelegramMessage(options: {
  chatId: string;
  text: string;
  webAppUrl?: string;
  buttonText?: string;
}) {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();

  if (!token) {
    throw new NotificationError(
      503,
      'telegram_not_configured',
      'Telegram Bot Token не настроен.',
    );
  }

  const replyMarkup = options.webAppUrl
    ? {
        inline_keyboard: [
          [
            {
              text: options.buttonText ?? 'Открыть AnimeBox',
              web_app: {
                url: options.webAppUrl,
              },
            },
          ],
        ],
      }
    : undefined;

  const response = await fetch(
    `https://api.telegram.org/bot${token}/sendMessage`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      cache: 'no-store',
      body: JSON.stringify({
        chat_id: options.chatId,
        text: options.text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        reply_markup: replyMarkup,
      }),
    },
  );

  const payload = (await response.json().catch(() => ({}))) as TelegramSendResult;

  if (!response.ok || !payload.ok) {
    const description = payload.description ?? `Telegram HTTP ${response.status}`;
    const lower = description.toLowerCase();

    if (
      payload.error_code === 403 ||
      (payload.error_code === 400 &&
        (lower.includes('chat not found') || lower.includes('user not found')))
    ) {
      throw new NotificationError(
        409,
        'telegram_write_access_required',
        'Разреши боту AnimeBox отправлять тебе сообщения в Telegram.',
      );
    }

    if (payload.error_code === 429) {
      throw new NotificationError(
        429,
        'telegram_rate_limited',
        `Telegram временно ограничил отправку${payload.parameters?.retry_after ? ` на ${payload.parameters.retry_after} сек.` : '.'}`,
      );
    }

    throw new NotificationError(
      502,
      'telegram_send_failed',
      'Telegram временно не принял сообщение.',
    );
  }

  return {
    messageId:
      typeof payload.result?.message_id === 'number'
        ? payload.result.message_id
        : null,
  };
}

export async function getTelegramProfile(userId: string) {
  const admin = createSupabaseAdmin();

  const { data, error } = await admin
    .from('profiles')
    .select('id, telegram_id, username')
    .eq('id', userId)
    .maybeSingle();

  if (error) throw error;

  return data;
}
