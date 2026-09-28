import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');

const protocol = read('lib/watch-party.ts');
const rooms = read('lib/watch-party-rooms-server.ts');
const panel = read('components/watch-party/WatchPartyPanel.tsx');
const hub = read('components/watch-party/WatchTogetherHub.tsx');
const episode = read('components/AnimeEpisodePage.tsx');
const presence = read('app/api/watch-party/rooms/[roomId]/presence/route.ts');
const resolveRoom = read('app/api/watch-party/rooms/resolve/route.ts');
const claimHost = read('app/api/watch-party/rooms/[roomId]/claim-host/route.ts');
const transfer = read('app/api/watch-party/rooms/[roomId]/transfer/route.ts');
const migration = read(
  'supabase/migrations/20260928024000_patch20_1_watch_together_membership_v1.sql',
);
const productEvents = read('lib/product-event-names.ts');
const syncPolicy = read('lib/watch-party-sync-policy.ts');

const failures = [];

if (
  !migration.includes('create table if not exists public.watch_party_room_members') ||
  !migration.includes('add column if not exists host_epoch') ||
  !migration.includes('watch_party_sync_member') ||
  !migration.includes('watch_party_transfer_host_atomic') ||
  !migration.includes('watch_party_claim_stale_host') ||
  !migration.includes("interval '75 seconds'") ||
  !migration.includes('pg_advisory_xact_lock')
) {
  failures.push('authoritative room membership / host authority SQL is incomplete');
}

if (
  !rooms.includes("admin.rpc('watch_party_sync_member'") ||
  !rooms.includes("admin.rpc('watch_party_transfer_host_atomic'") ||
  !rooms.includes("admin.rpc('watch_party_claim_stale_host'") ||
  !rooms.includes('resolveWatchPartyRoomForJoin') ||
  !rooms.includes('ROOM_MEMBER_TTL_MS = 75_000')
) {
  failures.push('server room authority does not use transactional RPCs');
}

const publicListStart = rooms.indexOf('export async function listPublicWatchPartyRooms');
const publicListEnd = rooms.indexOf('/** Run from the existing authenticated daily cron', publicListStart);
const publicList = publicListStart >= 0 && publicListEnd > publicListStart
  ? rooms.slice(publicListStart, publicListEnd)
  : '';
if (
  !publicList ||
  publicList.includes('joinSecret:') ||
  publicList.includes("'id,join_secret,host_user_id")
) {
  failures.push('public lobby still exposes room join secrets');
}

if (
  !presence.includes('assertBrowserMutationRequest(request)') ||
  !presence.includes('syncWatchPartyRoomMember') ||
  !resolveRoom.includes('resolveWatchPartyRoomForJoin') ||
  !claimHost.includes('claimStaleWatchPartyRoomHost') ||
  !transfer.includes('hostEpoch')
) {
  failures.push('Watch Together authority API surface is incomplete');
}

if (
  !protocol.includes('export const WATCH_PARTY_PROTOCOL = 6') ||
  !protocol.includes('hostEpoch: number') ||
  !panel.includes('packet.hostEpoch')
) {
  failures.push('host transfer protocol is not epoch-versioned');
}

if (
  !panel.includes('const SERVER_PRESENCE_MS = 25_000') ||
  !panel.includes('const PLAYER_SYNC_MS = 8_000') ||
  !panel.includes('decideWatchPartySync') ||
  !syncPolicy.includes('WATCH_PARTY_DRIFT_SEEK_SECONDS = 1.75') ||
  !syncPolicy.includes('WATCH_PARTY_DRIFT_SEEK_COOLDOWN_MS = 6_000') ||
  !panel.includes("syncServerMembership('heartbeat'") ||
  !panel.includes("syncServerMembership('leave')") ||
  !panel.includes('authoritativeParticipantCount')
) {
  failures.push('client presence or bounded sync policy is missing');
}

if (
  !panel.includes("fetch('/api/watch-party/rooms'") ||
  !panel.includes("visibility: 'unlisted'") ||
  !panel.includes('animeId={anime.id}') && episode.includes('animeId={anime.id}') === false
) {
  failures.push('episode-created rooms are not registered server-side');
}

if (
  !episode.includes('animeId={anime.id}') ||
  !episode.includes('coverUrl={poster}')
) {
  failures.push('episode Watch Together launcher does not pass room metadata');
}

const publicRoomTypeStart = hub.indexOf('type PublicWatchPartyRoom = {');
const publicRoomTypeEnd = hub.indexOf('type PublicRoomsResponse', publicRoomTypeStart);
const publicRoomType =
  publicRoomTypeStart >= 0 && publicRoomTypeEnd > publicRoomTypeStart
    ? hub.slice(publicRoomTypeStart, publicRoomTypeEnd)
    : '';

if (
  !publicRoomType ||
  publicRoomType.includes('joinSecret') ||
  !hub.includes('/api/watch-party/rooms/resolve?') ||
  !hub.includes('watch_party_code_joined') ||
  !hub.includes('joinPublicRoom(room)') ||
  !hub.includes('шестизначный код комнаты')
) {
  failures.push('secretless lobby / room-code join UX is incomplete');
}

if (
  !panel.includes('/claim-host') ||
  !panel.includes('tryClaimStaleHost') ||
  !panel.includes('watch_party_host_recovered') ||
  !panel.includes('hostEpochRef.current')
) {
  failures.push('stale host recovery is missing');
}

if (
  !productEvents.includes("'watch_party_code_joined'") ||
  !productEvents.includes("'watch_party_host_recovered'")
) {
  failures.push('Watch Together 2.0 telemetry names are missing');
}

if (
  !panel.includes('roomCodeBadge') ||
  !panel.includes('Код {roomCode}') ||
  !panel.includes("roomVisibility !== 'private'")
) {
  failures.push('shareable room code is not surfaced safely');
}

if (failures.length) {
  console.error('[AnimeBox Patch 20.1] Check failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(
  'PASS: Patch 20.1 authoritative rooms, code joins, host recovery and sync hardening',
);
