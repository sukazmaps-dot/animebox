import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const failures = [];

function read(path) {
  const full = join(root, path);
  if (!existsSync(full)) {
    failures.push(`${path}: required file is missing.`);
    return '';
  }
  return readFileSync(full, 'utf8');
}

const relay = read('lib/watch-party-relay-client.ts');
const partyPanel = read('components/watch-party/WatchPartyPanel.tsx');
const partyHub = read('components/watch-party/WatchTogetherHub.tsx');
const roomsRoute = read('app/api/watch-party/rooms/route.ts');
const episodeList = read('components/EpisodeList.tsx');
const episodePage = read('components/AnimeEpisodePage.tsx');
const availabilityRoute = read(
  'app/api/anime/[slug]/episode-availability/route.ts',
);
const kodikRoute = read('app/api/players/kodik/route.ts');
const accentCss = read('app/patch15-title-accent.css');
const layout = read('app/layout.tsx');
const forgotPassword = read('app/auth/forgot-password/page.tsx');
const healthApi = read('app/api/admin/production-health/route.ts');
const adminShell = read('components/admin/AdminShell.tsx');
const chatApi = read('app/api/chat/messages/route.ts');
const chatClient = read('components/chat/GlobalChatV11Client.tsx');
const migration = read(
  'supabase/migrations/20260923200000_patch15_scale_stability_v1.sql',
);

for (const [label, source, needle] of [
  ['single relay registry', relay, 'activeRelayByTopic'],
  ['failed realtime cleanup', relay, 'Failed subscriptions must not leak a Realtime channel'],
  ['presence debounce', relay, 'RELAY_PRESENCE_DEBOUNCE_MS'],
  ['player sync relief', partyPanel, 'PLAYER_SYNC_MS = 20_000'],
  ['guest health relief', partyPanel, 'GUEST_HEALTH_CHECK_MS = 15_000'],
  ['visibility-aware lobby polling', partyHub, "document.visibilityState !== 'visible'"],
  ['lobby abort controller', partyHub, 'roomRequestRef'],
  ['public room edge cache', roomsRoute, 'publicApiCacheHeaders'],
  ['verified-only episode links', episodeList, "if (availability?.status !== 'available') return []"],
  ['controlled unknown availability state', episodeList, "availability?.status === 'unknown'"],
  ['post-response SEO sync', availabilityRoute, 'after(async () =>'],
  ['bounded availability deadline', availabilityRoute, 'AbortSignal.timeout(8_000)'],
  ['parallel source fallback', episodePage, 'Promise.allSettled'],
  ['short player source deadline', episodePage, 'controller.abort(), 10_000'],
  ['bounded Kodik source deadline', kodikRoute, 'AbortSignal.timeout(6_500)'],
  ['Kodik post-response SEO cache', kodikRoute, 'after(async () =>'],
  ['title accent inheritance', accentCss, '--ab-accent: var(--anime-page-accent'],
  ['episode hover title accent', accentCss, '.episode-list__item:hover .episode-list__label'],
  ['accent stylesheet loaded', layout, "import './patch15-title-accent.css'"],
  ['recovery callback route', forgotPassword, "'/auth/callback'"],
  ['recovery intent', forgotPassword, "redirectTo.searchParams.set('intent', 'recovery')"],
  ['production health API', healthApi, 'getProductionHealthSnapshot'],
  ['production health admin link', adminShell, "href: '/admin/health'"],
  ['room cleanup RPC', migration, 'cleanup_watch_party_rooms'],
  ['room cleanup cron', migration, 'animebox-watch-party-cleanup'],
  ['production health RPC', migration, 'animebox_production_health_snapshot'],
  ['chat cursor pagination', chatApi, "params.get('cursor')"],
  ['chat realtime cleanup', chatClient, 'supabase.removeChannel(channel)'],
]) {
  if (!source.includes(needle)) {
    failures.push(`Patch 15: missing ${label}.`);
  }
}

const hostHeartbeatMatch = partyPanel.match(
  /HOST_HEARTBEAT_MS\s*=\s*([\d_]+)/,
);
const hostHeartbeatMs = hostHeartbeatMatch
  ? Number(hostHeartbeatMatch[1].replaceAll('_', ''))
  : Number.NaN;

if (
  !Number.isFinite(hostHeartbeatMs) ||
  hostHeartbeatMs < 15_000 ||
  hostHeartbeatMs > 45_000
) {
  failures.push(
    'Patch 15: host heartbeat must stay within the 15-45s scale/reliability window.',
  );
}

if (partyHub.includes('}, 15_000);')) {
  failures.push('Patch 15: legacy 15s public-room polling remains.');
}

if (
  roomsRoute.includes(
    "scope: 'room_list'",
  )
) {
  failures.push(
    'Patch 15: public Watch Together lobby still writes a Postgres rate bucket per GET.',
  );
}

if (episodeList.includes('return metadataEpisodeNumbers')) {
  failures.push(
    'Patch 15: unverified provider state must not recreate playback links from metadata.',
  );
}

if (failures.length) {
  console.error('\n[AnimeBox Patch 15] Check failed:\n');
  for (const failure of failures) console.error(` - ${failure}`);
  console.error('');
  process.exit(1);
}

console.log('[AnimeBox Patch 15] Scale & Stability invariants passed.');
