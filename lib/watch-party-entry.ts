/** Shared client/server invitation contract. The secret remains in the fragment. */
export function canonicalWatchPartyInvite(value: string, origin: string): string | null {
  if (!value || value.length > 2048) return null;
  try {
    const url = new URL(value.trim(), origin);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return null;
    const allowed = url.origin === new URL(origin).origin ||
      ['https://youranimebox.com', 'https://www.youranimebox.com'].includes(url.origin);
    if (!allowed) return null;
    const match = /^\/watch-together\/([^/]+)\/episode\/([1-9]\d{0,5})$/u.exec(url.pathname);
    if (!match || /[\\/\u0000-\u001f\u007f]/u.test(decodeURIComponent(match[1]))) return null;
    const roomIds = url.searchParams.getAll('party');
    const hash = new URLSearchParams(url.hash.slice(1));
    const secrets = hash.getAll('partyKey');
    if (roomIds.length !== 1 || !/^[a-f0-9]{24}$/.test(roomIds[0]) ||
        secrets.length !== 1 || !/^[a-f0-9]{32}$/.test(secrets[0])) return null;
    const theme = url.searchParams.get('partyTheme');
    url.search = '';
    url.searchParams.set('party', roomIds[0]);
    if (theme && /^[a-z_]{1,32}$/.test(theme)) url.searchParams.set('partyTheme', theme);
    url.hash = new URLSearchParams({ partyKey: secrets[0] }).toString();
    return url.toString();
  } catch { return null; }
}

export function normalizeWatchPartyCode(value: string): string | null {
  // Allow the human-readable ABC-234 / ABC 234 forms, not arbitrary URL text.
  if (!/^[A-Za-z2-9\s-]{6,12}$/.test(value.trim())) return null;
  const code = value.trim().replace(/[\s-]/g, '').toUpperCase();
  return /^[A-Z2-9]{6}$/.test(code) ? code : null;
}

export function isWatchPartyJoinSnapshot(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const room = value as Record<string, unknown>;
  return typeof room.roomId === 'string' && /^[a-f0-9]{24}$/.test(room.roomId) &&
    typeof room.joinSecret === 'string' && /^[a-f0-9]{32}$/.test(room.joinSecret) &&
    typeof room.animeSlug === 'string' && room.animeSlug.length > 0 && room.animeSlug.length <= 300 &&
    !/[\\/\u0000-\u001f\u007f]/u.test(room.animeSlug) &&
    Number.isSafeInteger(room.episode) && Number(room.episode) >= 1 && Number(room.episode) <= 999999 &&
    Number.isSafeInteger(room.participantCount) && Number(room.participantCount) >= 0 &&
    Number.isSafeInteger(room.maxParticipants) && Number(room.maxParticipants) >= 1 && Number(room.maxParticipants) <= 50 &&
    ['waiting', 'watching', 'paused', 'voting'].includes(String(room.status));
}
