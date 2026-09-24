import fs from 'node:fs';

const read = (path) =>
  fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const panel = read('components/watch-party/WatchPartyPanel.tsx');
const hub = read('components/watch-party/WatchTogetherHub.tsx');
const roomServer = read('lib/watch-party-rooms-server.ts');
const roomsRoute = read('app/api/watch-party/rooms/route.ts');
const transferRoute = read(
  'app/api/watch-party/rooms/[roomId]/transfer/route.ts',
);
const productEvents = read('lib/product-event-names.ts');

const failures = [];

if (!panel.includes('const HOST_HEARTBEAT_MS = 20_000')) {
  failures.push('host room heartbeat is not using the 20s presence cadence');
}

if (
  !panel.includes('Presence is authoritative for the Realtime path') ||
  !panel.includes('relayHostGuestIdsRef.current.add(member.relayId)')
) {
  failures.push('Realtime presence no longer hydrates host participant state');
}

const roomSyncCalls = panel.match(/void syncRegisteredRoom\(\);/g)?.length ?? 0;
if (roomSyncCalls < 4) {
  failures.push('participant changes no longer sync lobby counts immediately');
}

const peerCloseHandlers = panel.match(/peer\.on\('close'/g)?.length ?? 0;
if (peerCloseHandlers < 2) {
  failures.push('guest and host hard-close transport recovery is incomplete');
}

if (
  !panel.includes('if (!peer || peer.destroyed)') ||
  !panel.includes('startGuestRef.current(invite)') ||
  !panel.includes('startHostRef.current(invite)')
) {
  failures.push('network return cannot recreate a destroyed PeerJS transport');
}

if (
  !panel.includes("behavior: 'stay' | 'leave' = 'stay'") ||
  !panel.includes("transferHost(successor, 'leave')") ||
  !panel.includes('longest-connected guest')
) {
  failures.push('graceful host leave no longer hands the room to a guest');
}

if (
  !productEvents.includes("'watch_party_reconnected'") ||
  !productEvents.includes("'watch_party_host_transferred'") ||
  !productEvents.includes("'watch_party_presence_changed'")
) {
  failures.push('Watch Together resilience telemetry names are missing');
}

if (
  !hub.includes('const ROOM_REFRESH_VISIBLE_MS = 20_000') ||
  !hub.includes('const ROOM_REFRESH_MIN_GAP_MS = 4_000') ||
  !hub.includes("cache: 'no-store'")
) {
  failures.push('public room lobby refresh is not presence-oriented');
}

if (
  !roomsRoute.includes('edgeSeconds: 2') ||
  !roomsRoute.includes('staleWhileRevalidateSeconds: 4')
) {
  failures.push('public room presence is cached too aggressively');
}

if (!roomServer.includes('const ROOM_HEARTBEAT_TTL_MS = 90_000')) {
  failures.push('stale public rooms remain visible too long');
}

if (
  !transferRoute.includes('assertBrowserMutationRequest(request)') ||
  !transferRoute.includes("scope: 'watch_host_transfer_ip'")
) {
  failures.push('host transfer endpoint lost mutation/rate-limit protection');
}

if (failures.length) {
  console.error('[AnimeBox WT Stability] Check failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(
  '[AnimeBox WT Stability] reconnect, presence, host lifecycle and lobby invariants passed.',
);
