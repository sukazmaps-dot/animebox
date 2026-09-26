import fs from 'node:fs';

const read = (path) =>
  fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const panel = read('components/watch-party/WatchPartyPanel.tsx');
const hub = read('components/watch-party/WatchTogetherHub.tsx');
const relayClient = read('lib/watch-party-relay-client.ts');
const roomServer = read('lib/watch-party-rooms-server.ts');
const roomsRoute = read('app/api/watch-party/rooms/route.ts');
const transferRoute = read(
  'app/api/watch-party/rooms/[roomId]/transfer/route.ts',
);
const productEvents = read('lib/product-event-names.ts');
const protocol = read('lib/watch-party.ts');
const episodePage = read('components/AnimeEpisodePage.tsx');

const failures = [];

if (!panel.includes('const HOST_HEARTBEAT_MS = 20_000')) {
  failures.push('host room heartbeat is not using the 20s presence cadence');
}

if (
  !panel.includes('const GUEST_JOIN_TIMEOUT_MS = 24_000') ||
  !panel.includes('guestJoinTimerRef.current = window.setTimeout') ||
  !panel.includes('Не удалось подтвердить вход в комнату')
) {
  failures.push('guest join can hang without a bounded room-level deadline');
}

const projectedGuestSyncs =
  panel.match(/currentPlayerSnapshot\(\) \?\? playerStateRef\.current/g)?.length ?? 0;
if (projectedGuestSyncs < 2) {
  failures.push('guest drift compares stale player snapshots instead of projected playback time');
}

if (
  !panel.includes('const sendGuestPacketConfirmed = useCallback(async') ||
  !panel.includes('chatSendPendingRef.current = true') ||
  !panel.includes("current === draft ? '' : current") ||
  !panel.includes('Сообщение не отправлено. Текст сохранён')
) {
  failures.push('chat drafts can be lost when guest delivery fails');
}

if (
  hub.includes('await navigator.clipboard.writeText(roomUrl)') ||
  !hub.includes('void navigator.clipboard?.writeText(roomUrl).catch')
) {
  failures.push('room creation still waits for Clipboard API before navigation');
}

if (
  !relayClient.includes('const activeRelayByTopic = new Map') ||
  !relayClient.includes('await previous.close()')
) {
  failures.push('parallel Realtime room subscriptions are no longer serialized');
}

const heartbeatStart = roomServer.indexOf('export async function heartbeatWatchPartyRoom');
const heartbeatEnd = roomServer.indexOf('export async function endWatchPartyRoom');
const heartbeatSource =
  heartbeatStart >= 0 && heartbeatEnd > heartbeatStart
    ? roomServer.slice(heartbeatStart, heartbeatEnd)
    : '';
if (
  !heartbeatSource.includes(".eq('host_user_id', user.id)") ||
  !heartbeatSource.includes(".neq('status', 'ended')") ||
  !heartbeatSource.includes(".select('id')") ||
  !heartbeatSource.includes('if (!updated)')
) {
  failures.push('room heartbeat can race with host transfer or room shutdown');
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
  !productEvents.includes("'watch_party_presence_changed'") ||
  !productEvents.includes("'watch_party_sync_drift'")
) {
  failures.push('Watch Together resilience telemetry names are missing');
}

if (
  !protocol.includes("type: 'EPISODE_CHANGE'") ||
  !protocol.includes("WATCH_PARTY_EPISODE_CHANGE_EVENT") ||
  !panel.includes("type: 'EPISODE_CHANGE'") ||
  !panel.includes('dispatchEpisodeChange') ||
  !episodePage.includes('WATCH_PARTY_EPISODE_CHANGE_EVENT')
) {
  failures.push('Watch Together episode/season route synchronization is incomplete');
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
  '[AnimeBox WT Stability] reconnect, bounded join, drift, chat delivery, host lifecycle and lobby invariants passed.',
);
