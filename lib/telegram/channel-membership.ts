import 'server-only';

import { validateTelegramInitData } from '@/lib/telegram/validate-init-data';

export type TelegramMembershipStatus =
  | 'creator'
  | 'administrator'
  | 'member'
  | 'restricted'
  | 'left'
  | 'kicked'
  | 'unknown';

type TelegramChatMember = {
  status?: TelegramMembershipStatus;
  is_member?: boolean;
};

type TelegramGetChatMemberResponse = {
  ok?: boolean;
  result?: TelegramChatMember;
  description?: string;
  error_code?: number;
};

export class TelegramMembershipError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = 'TelegramMembershipError';
  }
}

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new TelegramMembershipError(
      503,
      'telegram_membership_not_configured',
      `${name} is not configured`,
    );
  }

  return value;
}

export function isSubscribedChatMember(member: TelegramChatMember | null) {
  if (!member?.status) return false;

  if (
    member.status === 'creator' ||
    member.status === 'administrator' ||
    member.status === 'member'
  ) {
    return true;
  }

  // Restricted exists for supergroups. If this gate is later reused for a
  // supergroup, a restricted user still counts as subscribed while is_member.
  if (member.status === 'restricted') {
    return member.is_member === true;
  }

  return false;
}

export async function checkRequiredTelegramMembership(initData: string) {
  const botToken = requiredEnv('TELEGRAM_BOT_TOKEN');
  const requiredChat = requiredEnv('TELEGRAM_REQUIRED_CHANNEL');
  const channelUrl = requiredEnv('TELEGRAM_CHANNEL_URL');

  const validation = validateTelegramInitData(initData, botToken);

  if (!validation.ok) {
    throw new TelegramMembershipError(
      401,
      validation.reason,
      'Telegram initData validation failed',
    );
  }

  const url = new URL(
    `https://api.telegram.org/bot${botToken}/getChatMember`,
  );

  url.searchParams.set('chat_id', requiredChat);
  url.searchParams.set('user_id', String(validation.user.id));

  const response = await fetch(url, {
    method: 'GET',
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
    },
  });

  const payload = (await response
    .json()
    .catch(() => ({}))) as TelegramGetChatMemberResponse;

  if (!response.ok || !payload.ok || !payload.result) {
    console.error('[Telegram membership] getChatMember failed', {
      status: response.status,
      errorCode: payload.error_code,
      description: payload.description,
    });

    throw new TelegramMembershipError(
      502,
      'telegram_membership_check_failed',
      payload.description ?? 'Telegram getChatMember failed',
    );
  }

  const member = payload.result;

  return {
    userId: validation.user.id,
    subscribed: isSubscribedChatMember(member),
    memberStatus: member.status ?? 'unknown',
    channelUrl,
  };
}
