import {
  createHmac,
  timingSafeEqual,
} from 'node:crypto';

export type TelegramVerifiedUser = {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  photo_url?: string;
  is_premium?: boolean;
};

type ValidationResult =
  | {
      ok: true;
      user: TelegramVerifiedUser;
      authDate: number;
    }
  | {
      ok: false;
      reason:
        | 'missing_hash'
        | 'invalid_hash'
        | 'missing_auth_date'
        | 'expired'
        | 'missing_user'
        | 'invalid_user';
    };

export function validateTelegramInitData(
  initData: string,
  botToken: string,
  maxAgeSeconds = 60 * 60,
): ValidationResult {
  const params = new URLSearchParams(initData);

  const receivedHash = params.get('hash');

  if (!receivedHash) {
    return {
      ok: false,
      reason: 'missing_hash',
    };
  }

  /*
   * hash не входит в строку,
   * которую мы проверяем.
   *
   * Остальные Telegram-поля оставляем.
   */
  params.delete('hash');

  const dataCheckString = Array
    .from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  /*
   * secret_key =
   * HMAC_SHA256(bot_token, key="WebAppData")
   */
  const secretKey = createHmac(
    'sha256',
    'WebAppData',
  )
    .update(botToken)
    .digest();

  /*
   * calculated_hash =
   * HMAC_SHA256(data_check_string, secret_key)
   */
  const calculatedHash = createHmac(
    'sha256',
    secretKey,
  )
    .update(dataCheckString)
    .digest('hex');

  const receivedBuffer = Buffer.from(
    receivedHash,
    'hex',
  );

  const calculatedBuffer = Buffer.from(
    calculatedHash,
    'hex',
  );

  if (
    receivedBuffer.length !==
      calculatedBuffer.length ||
    !timingSafeEqual(
      receivedBuffer,
      calculatedBuffer,
    )
  ) {
    return {
      ok: false,
      reason: 'invalid_hash',
    };
  }

  const authDateRaw = params.get('auth_date');
  const authDate = Number(authDateRaw);

  if (
    !authDateRaw ||
    !Number.isFinite(authDate)
  ) {
    return {
      ok: false,
      reason: 'missing_auth_date',
    };
  }

  const now = Math.floor(Date.now() / 1000);

  /*
   * Не принимаем очень старый initData.
   * + 60 сек допускаем небольшую разницу часов.
   */
  if (
    authDate < now - maxAgeSeconds ||
    authDate > now + 60
  ) {
    return {
      ok: false,
      reason: 'expired',
    };
  }

  const userRaw = params.get('user');

  if (!userRaw) {
    return {
      ok: false,
      reason: 'missing_user',
    };
  }

  try {
    const user =
      JSON.parse(userRaw) as TelegramVerifiedUser;

    if (
      !Number.isSafeInteger(user.id) ||
      user.id <= 0 ||
      typeof user.first_name !== 'string'
    ) {
      return {
        ok: false,
        reason: 'invalid_user',
      };
    }

    return {
      ok: true,
      user,
      authDate,
    };
  } catch {
    return {
      ok: false,
      reason: 'invalid_user',
    };
  }
}