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

export function usernamePolicyKey(value: string) {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .split('')
    .map((character) => CYRILLIC_CONFUSABLES[character] ?? character)
    .join('')
    .replace(/[^a-z0-9]/g, '');
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

export function usernamePolicyError(value: string) {
  const username = value.trim();

  if (username.length < 3 || username.length > 24) {
    return 'Ник должен содержать от 3 до 24 символов.';
  }

  if (isReservedUsername(username)) {
    return 'Этот ник зарезервирован AnimeBox. Выбери другое имя.';
  }

  return null;
}
