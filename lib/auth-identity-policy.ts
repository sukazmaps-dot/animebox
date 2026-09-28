const RESERVED_EXACT_KEYS = new Set([
  'admin',
  'administrator',
  'owner',
  'moderator',
  'mod',
  'support',
  'staff',
  'system',
  'root',
  'official',
  'animebox',
  'youranimebox',
]);

const RESERVED_CYRILLIC = new Set([
  'админ',
  'администратор',
  'владелец',
  'модератор',
  'поддержка',
  'саппорт',
  'система',
  'анимебокс',
]);

const CYRILLIC_CONFUSABLES: Record<string, string> = {
  а: 'a',
  е: 'e',
  о: 'o',
  р: 'p',
  с: 'c',
  х: 'x',
  у: 'y',
  к: 'k',
  т: 't',
  в: 'b',
  н: 'h',
  м: 'm',
  і: 'i',
  ј: 'j',
};

const PROFANITY_CONFUSABLES: Record<string, string> = {
  a: 'а',
  e: 'е',
  o: 'о',
  p: 'р',
  c: 'с',
  y: 'у',
  x: 'х',
  k: 'к',
  m: 'м',
  t: 'т',
  b: 'в',
  '0': 'о',
  '3': 'з',
  '4': 'ч',
  '6': 'б',
};

/**
 * Deliberately compact list of high-confidence username-only patterns.
 *
 * This is not a chat profanity filter. The goal is to keep public identity
 * surfaces (profiles, leaderboard, comments, Watch Together) free from
 * explicit obscenity/abusive labels while keeping false positives low.
 *
 * usernameModerationKey removes separators, so variants such as
 * "х у е с о с", "xуeсос" and punctuation obfuscation are caught too.
 */
const PROHIBITED_USERNAME_PATTERNS = [
  /хуесос/u,
  /(?:хуй|хуе|хуя|хую|хуи)/u,
  /пизд/u,
  /(?:ебан|ебат|ебал|ебло|ебуч|ебнут|заеб|уеб|наеб|выеб|проеб|подеб)/u,
  /(?:бляд|блять|блят)/u,
  /(?:пидор|пидар|педерас)/u,
  /(?:гандон|муд(?:ак|ила|озвон)|шлюх|сучк)/u,
  /педоф(?:ил|айл)/u,
] as const;

export function usernamePolicyKey(value: string) {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .split('')
    .map((character) => CYRILLIC_CONFUSABLES[character] ?? character)
    .join('')
    .replace(/[^a-z0-9]/g, '');
}

export function usernameModerationKey(value: string) {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replaceAll('ё', 'е')
    .split('')
    .map((character) => PROFANITY_CONFUSABLES[character] ?? character)
    .join('')
    .replace(/[^а-яa-z0-9]/gu, '');
}

export function isReservedUsername(value: string) {
  const raw = value.normalize('NFKC').trim().toLowerCase();

  if (!raw) return false;
  if (RESERVED_CYRILLIC.has(raw)) return true;

  const key = usernamePolicyKey(raw);
  if (!key) return false;

  if (RESERVED_EXACT_KEYS.has(key)) return true;
  if (key.includes('animebox')) return true;

  return /^(?:admin|administrator|owner|moderator|mod|support|staff|system|root|official)\d*$/.test(
    key,
  );
}

export function isProhibitedUsername(value: string) {
  const key = usernameModerationKey(value);
  if (!key) return false;

  return PROHIBITED_USERNAME_PATTERNS.some((pattern) => pattern.test(key));
}

export function usernamePolicyError(value: string) {
  const username = value.trim();

  if (username.length < 3 || username.length > 24) {
    return 'Ник должен содержать от 3 до 24 символов.';
  }

  if (isReservedUsername(username)) {
    return 'Этот ник зарезервирован AnimeBox. Выбери другое имя.';
  }

  if (isProhibitedUsername(username)) {
    return 'Ник содержит недопустимое слово. Выбери нейтральное имя.';
  }

  return null;
}

export function generatedUsernameOrFallback(value: string, stableSeed: string) {
  const candidate = value.trim().slice(0, 24);
  if (candidate.length >= 3 && !usernamePolicyError(candidate)) {
    return candidate;
  }

  const suffix = stableSeed
    .replace(/[^a-z0-9]/gi, '')
    .slice(-8);

  return `AnimeFan_${suffix || 'user'}`.slice(0, 24);
}

export function publicUsernameOrFallback(
  value: string | null | undefined,
  stableSeed = '',
) {
  const candidate = value?.trim() ?? '';
  if (
    candidate.length >= 3 &&
    candidate.length <= 24 &&
    !isProhibitedUsername(candidate)
  ) {
    return candidate;
  }

  const suffix = stableSeed
    .replace(/[^a-z0-9]/gi, '')
    .slice(0, 8);

  return suffix ? `AnimeFan_${suffix}` : 'Пользователь';
}
