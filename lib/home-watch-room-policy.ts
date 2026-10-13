/** Only safe public room summaries belong on the homepage. No invitation secret. */
export type HomePublicWatchRoom = {
  roomId: string;
  roomCode: string;
  animeId: number | null;
  animeTitle: string;
  coverUrl: string | null;
  episode: number;
  visibility: 'public';
  status: 'waiting' | 'watching' | 'paused' | 'voting';
  participantCount: number;
  maxParticipants: number;
  isFull: false;
  host: { username: string };
};
const ROOM_ID = /^[a-f0-9]{24}$/;
const ROOM_CODE = /^[A-Z2-9]{6}$/;
const STATUSES = new Set(['waiting', 'watching', 'paused', 'voting']);
const validInteger = (value: unknown, min: number, max: number) =>
  Number.isSafeInteger(value) && Number(value) >= min && Number(value) <= max;

export function isHomePublicWatchRoom(value: unknown): value is HomePublicWatchRoom {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const room = value as Record<string, unknown>;
  const host = room.host as Record<string, unknown> | null;
  return typeof room.roomId === 'string' && ROOM_ID.test(room.roomId) &&
    typeof room.roomCode === 'string' && ROOM_CODE.test(room.roomCode) &&
    room.visibility === 'public' &&
    typeof room.animeTitle === 'string' && room.animeTitle.trim().length > 0 &&
    room.animeTitle.length <= 300 &&
    (room.animeId === null || validInteger(room.animeId, 1, 2147483647)) &&
    (room.coverUrl === null || (typeof room.coverUrl === 'string' && room.coverUrl.length < 2048)) &&
    validInteger(room.episode, 1, 999999) &&
    STATUSES.has(String(room.status)) &&
    validInteger(room.participantCount, 0, 50) &&
    validInteger(room.maxParticipants, 1, 50) &&
    Number(room.participantCount) < Number(room.maxParticipants) &&
    room.isFull === false &&
    Boolean(host) && typeof host.username === 'string' &&
    host.username.trim().length > 0;
}

export function selectHomeWatchRooms(
  raw: unknown,
  personalAnimeIds: readonly number[],
): HomePublicWatchRoom[] {
  if (!Array.isArray(raw)) return [];
  const preferred = new Set(personalAnimeIds.filter((id) => validInteger(id, 1, 2147483647)));
  const seen = new Set<string>();
  const rooms: HomePublicWatchRoom[] = [];
  for (const candidate of raw) {
    if (!isHomePublicWatchRoom(candidate) || seen.has(candidate.roomId)) continue;
    seen.add(candidate.roomId);
    rooms.push(candidate);
  }
  return rooms.sort((a, b) => {
    const aPersonal = a.animeId != null && preferred.has(a.animeId) ? 1 : 0;
    const bPersonal = b.animeId != null && preferred.has(b.animeId) ? 1 : 0;
    return bPersonal - aPersonal ||
      Number(b.status === 'watching') - Number(a.status === 'watching') ||
      b.participantCount - a.participantCount ||
      a.roomId.localeCompare(b.roomId);
  }).slice(0, 3);
}
