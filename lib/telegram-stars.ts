import 'server-only';

import { randomBytes } from 'node:crypto';

import {
  SUPPORT_STAR_PACKS,
  type SupportStarAmount,
} from '@/lib/monetization';

type TelegramApiResponse<T> = {
  ok: boolean;
  result?: T;
  description?: string;
};

export type ParsedSupportPayload = {
  amount: SupportStarAmount;
  telegramId: number;
  createdAt: number;
};

function isAllowedAmount(value: number): value is SupportStarAmount {
  return SUPPORT_STAR_PACKS.some(
    (pack) => pack.amount === value,
  );
}

async function callTelegramApi<T>(
  botToken: string,
  method: string,
  body: Record<string, unknown>,
): Promise<T> {
  const response = await fetch(
    `https://api.telegram.org/bot${botToken}/${method}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      cache: 'no-store',
    },
  );

  const data = (await response.json()) as TelegramApiResponse<T>;

  if (!response.ok || !data.ok || data.result === undefined) {
    throw new Error(
      data.description ||
        `Telegram ${method} failed with HTTP ${response.status}`,
    );
  }

  return data.result;
}

export function createSupportPayload({
  amount,
  telegramId,
}: {
  amount: SupportStarAmount;
  telegramId?: number | null;
}) {
  const safeTelegramId =
    Number.isSafeInteger(telegramId) && Number(telegramId) > 0
      ? Number(telegramId)
      : 0;

  const createdAt = Math.floor(Date.now() / 1000);
  const nonce = randomBytes(6).toString('hex');

  return `animebox_support:v1:${amount}:${safeTelegramId}:${createdAt}:${nonce}`;
}

export function parseSupportPayload(
  payload: unknown,
): ParsedSupportPayload | null {
  if (typeof payload !== 'string') return null;

  const match = payload.match(
    /^animebox_support:v1:(\d+):(\d+):(\d+):[a-f0-9]{12}$/,
  );

  if (!match) return null;

  const amount = Number(match[1]);
  const telegramId = Number(match[2]);
  const createdAt = Number(match[3]);

  if (
    !isAllowedAmount(amount) ||
    !Number.isSafeInteger(telegramId) ||
    telegramId < 0 ||
    !Number.isSafeInteger(createdAt) ||
    createdAt <= 0
  ) {
    return null;
  }

  return {
    amount,
    telegramId,
    createdAt,
  };
}

export async function createSupportInvoiceLink({
  botToken,
  amount,
  telegramId,
}: {
  botToken: string;
  amount: SupportStarAmount;
  telegramId?: number | null;
}) {
  const payload = createSupportPayload({
    amount,
    telegramId,
  });

  const invoiceUrl = await callTelegramApi<string>(
    botToken,
    'createInvoiceLink',
    {
      title: 'Поддержка AnimeBox',
      description:
        'Добровольная поддержка развития AnimeBox. Платёж не открывает платные функции.',
      payload,
      currency: 'XTR',
      prices: [
        {
          label: 'Поддержка AnimeBox',
          amount,
        },
      ],
    },
  );

  return {
    invoiceUrl,
    payload,
  };
}

export async function answerSupportPreCheckout({
  botToken,
  queryId,
  ok,
  errorMessage,
}: {
  botToken: string;
  queryId: string;
  ok: boolean;
  errorMessage?: string;
}) {
  return callTelegramApi<boolean>(
    botToken,
    'answerPreCheckoutQuery',
    {
      pre_checkout_query_id: queryId,
      ok,
      ...(ok
        ? {}
        : {
            error_message:
              errorMessage ||
              'Не удалось подтвердить платёж AnimeBox. Попробуй ещё раз.',
          }),
    },
  );
}
