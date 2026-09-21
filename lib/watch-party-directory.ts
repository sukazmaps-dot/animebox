export type WatchPartyVisibility = 'private' | 'unlisted' | 'public';
export type WatchPartyRoomStatus = 'waiting' | 'watching' | 'paused' | 'voting' | 'ended';

export type PublicWatchPartyRoom = {
  id: string;
  roomCode: string;
  animeId: number | null;
  animeSlug: string;
  animeTitle: string;
  coverUrl: string | null;
  episode: number;
  status: WatchPartyRoomStatus;
  language: string;
  participantCount: number;
  maxParticipants: number;
  hostUserId: string;
  hostName: string;
  createdAt: string;
  updatedAt: string;
};

export type WatchPartyRoomListResponse = {
  rooms: PublicWatchPartyRoom[];
};

export type WatchPartyJoinResponse = {
  ok: true;
  roomId: string;
  roomUrl: string;
  animeSlug: string;
  animeTitle: string;
  episode: number;
};

export const WATCH_PARTY_PUBLIC_STALE_MS = 90_000;

export function publicRoomStatusLabel(status: WatchPartyRoomStatus) {
  if (status === 'watching') return 'Сейчас смотрят';
  if (status === 'paused') return 'На паузе';
  if (status === 'voting') return 'Голосование';
  if (status === 'ended') return 'Завершена';
  return 'Ждут участников';
}
