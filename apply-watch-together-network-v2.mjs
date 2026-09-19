import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const panelPath = path.join(root, 'components/watch-party/WatchPartyPanel.tsx');
const cssPath = path.join(root, 'components/watch-party/WatchPartyPanel.module.css');

function load(file) {
  if (!fs.existsSync(file)) {
    throw new Error(`File not found: ${file}`);
  }
  return fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
}

function replaceOnce(source, before, after, label) {
  const first = source.indexOf(before);
  if (first < 0) throw new Error(`Patch marker not found: ${label}`);
  if (source.indexOf(before, first + before.length) >= 0) {
    throw new Error(`Patch marker is ambiguous: ${label}`);
  }
  return source.slice(0, first) + after + source.slice(first + before.length);
}

let panel = load(panelPath);
let css = load(cssPath);

panel = replaceOnce(
  panel,
  "import type { DataConnection, Peer as PeerInstance } from 'peerjs';\n",
  "import type { DataConnection, Peer as PeerInstance } from 'peerjs';\n" +
    "import {\n" +
    "  createWatchPartyPeer,\n" +
    "  describeWatchPartyPeerError,\n" +
    "  detectWatchPartyRoute,\n" +
    "  type WatchPartyNetworkRoute,\n" +
    "} from '@/lib/watch-party-network-client';\n",
  'network import',
);

panel = replaceOnce(
  panel,
  "  const [roomIdentities, setRoomIdentities] = useState<Record<string, RoomPublicIdentity>>({});\n",
  "  const [roomIdentities, setRoomIdentities] = useState<Record<string, RoomPublicIdentity>>({});\n" +
    "  const [networkRoute, setNetworkRoute] = useState<WatchPartyNetworkRoute>('unknown');\n" +
    "  const [signalingMode, setSignalingMode] = useState<'peerjs-cloud' | 'self-hosted'>('peerjs-cloud');\n",
  'network state',
);

panel = replaceOnce(
  panel,
  "function formatPlayerTime(seconds: number | null | undefined) {\n" +
    "  const safe = Math.max(0, Number.isFinite(seconds) ? Number(seconds) : 0);\n" +
    "  const minutes = Math.floor(safe / 60);\n" +
    "  const rest = Math.floor(safe % 60);\n" +
    "  return `${minutes}:${String(rest).padStart(2, '0')}`;\n" +
    "}\n",
  "function formatPlayerTime(seconds: number | null | undefined) {\n" +
    "  const safe = Math.max(0, Number.isFinite(seconds) ? Number(seconds) : 0);\n" +
    "  const minutes = Math.floor(safe / 60);\n" +
    "  const rest = Math.floor(safe % 60);\n" +
    "  return `${minutes}:${String(rest).padStart(2, '0')}`;\n" +
    "}\n\n" +
    "function inspectWatchPartyRoute(\n" +
    "  connection: DataConnection,\n" +
    "  report: (route: WatchPartyNetworkRoute) => void,\n" +
    ") {\n" +
    "  window.setTimeout(() => {\n" +
    "    void detectWatchPartyRoute(connection).then((route) => {\n" +
    "      if (route !== 'unknown') report(route);\n" +
    "    });\n" +
    "  }, 650);\n" +
    "}\n",
  'route inspector',
);

panel = replaceOnce(
  panel,
  "    setLastController('');\n    setStatus('idle');\n",
  "    setLastController('');\n" +
    "    setNetworkRoute('unknown');\n" +
    "    setSignalingMode('peerjs-cloud');\n" +
    "    setStatus('idle');\n",
  'reset network state',
);

panel = replaceOnce(
  panel,
  "    const { Peer } = await import('peerjs');\n" +
    "    const peer = new Peer({ debug: 1 });\n" +
    "    peerRef.current = peer;\n",
  "    const { peer, network } = await createWatchPartyPeer();\n" +
    "    setSignalingMode(network.signalingMode);\n" +
    "    setNetworkRoute('unknown');\n" +
    "    peerRef.current = peer;\n",
  'guest peer creation',
);

panel = replaceOnce(
  panel,
  "    connection.on('open', () => {\n" +
    "      window.clearTimeout(negotiationTimer);\n",
  "    connection.on('open', () => {\n" +
    "      window.clearTimeout(negotiationTimer);\n" +
    "      inspectWatchPartyRoute(connection, (route) => {\n" +
    "        setNetworkRoute((current) => current === 'relay' ? current : route);\n" +
    "      });\n",
  'guest route detection',
);

panel = replaceOnce(
  panel,
  "      setStatus('error');\n" +
    "      setError('Не удалось установить соединение. Попробуй обновить страницу.');\n",
  "      setStatus('error');\n" +
    "      setError(describeWatchPartyPeerError(peerError, network));\n",
  'guest network error',
);

panel = replaceOnce(
  panel,
  "    const { Peer } = await import('peerjs');\n" +
    "    const hostPeerId = watchPartyHostPeerId(invite.roomId);\n" +
    "    const peer = new Peer(hostPeerId, { debug: 1 });\n" +
    "    peerRef.current = peer;\n",
  "    const hostPeerId = watchPartyHostPeerId(invite.roomId);\n" +
    "    const { peer, network } = await createWatchPartyPeer(hostPeerId);\n" +
    "    setSignalingMode(network.signalingMode);\n" +
    "    setNetworkRoute('unknown');\n" +
    "    peerRef.current = peer;\n",
  'host peer creation',
);

panel = replaceOnce(
  panel,
  "      connection.on('open', () => {\n" +
    "        window.clearTimeout(negotiationTimer);\n",
  "      connection.on('open', () => {\n" +
    "        window.clearTimeout(negotiationTimer);\n" +
    "        inspectWatchPartyRoute(connection, (route) => {\n" +
    "          setNetworkRoute((current) => current === 'relay' ? current : route);\n" +
    "        });\n",
  'host route detection',
);

panel = replaceOnce(
  panel,
  "        setStatus('error');\n" +
    "        setError('Связь с PeerJS Cloud потеряна. Обнови страницу, чтобы вернуть комнату.');\n",
  "        setStatus('error');\n" +
    "        setError('Связь с сервером Watch Together потеряна. Обнови страницу, чтобы вернуть комнату.');\n",
  'host disconnect copy',
);

panel = replaceOnce(
  panel,
  "      setStatus('error');\n" +
    "      setError('Не удалось создать комнату. Попробуй ещё раз.');\n",
  "      setStatus('error');\n" +
    "      setError(describeWatchPartyPeerError(peerError, network));\n",
  'host network error',
);

panel = replaceOnce(
  panel,
  "  useEffect(() => {\n" +
    "    return () => {\n" +
    "      intentionalCloseRef.current = true;\n" +
    "      destroyTransport();\n" +
    "    };\n" +
    "  }, [destroyTransport]);\n",
  "  useEffect(() => {\n" +
    "    const onOffline = () => {\n" +
    "      if (roleRef.current) {\n" +
    "        setStatus('reconnecting');\n" +
    "        setError('Интернет-соединение потеряно. Ждём восстановления сети…');\n" +
    "      }\n" +
    "    };\n\n" +
    "    const onOnline = () => {\n" +
    "      if (intentionalCloseRef.current || hostEndedRef.current) return;\n" +
    "      setError('');\n\n" +
    "      const peer = peerRef.current;\n" +
    "      if (peer?.disconnected && !peer.destroyed) {\n" +
    "        try {\n" +
    "          peer.reconnect();\n" +
    "        } catch {\n" +
    "          // Guest reconnect below can still recreate the DataConnection.\n" +
    "        }\n" +
    "      }\n\n" +
    "      if (roleRef.current === 'guest') {\n" +
    "        scheduleGuestReconnectRef.current();\n" +
    "      }\n" +
    "    };\n\n" +
    "    window.addEventListener('offline', onOffline);\n" +
    "    window.addEventListener('online', onOnline);\n" +
    "    return () => {\n" +
    "      window.removeEventListener('offline', onOffline);\n" +
    "      window.removeEventListener('online', onOnline);\n" +
    "    };\n" +
    "  }, []);\n\n" +
    "  useEffect(() => {\n" +
    "    return () => {\n" +
    "      intentionalCloseRef.current = true;\n" +
    "      destroyTransport();\n" +
    "    };\n" +
    "  }, [destroyTransport]);\n",
  'online/offline recovery',
);

panel = replaceOnce(
  panel,
  "          <span className={styles.role}>{role === 'host' ? 'HOST' : 'GUEST'}</span>\n",
  "          <div className={styles.connectionBadges}>\n" +
    "            <span\n" +
    "              className={styles.networkRoute}\n" +
    "              data-route={networkRoute}\n" +
    "              title={networkRoute === 'relay'\n" +
    "                ? 'Соединение идёт через TURN relay'\n" +
    "                : networkRoute === 'p2p'\n" +
    "                  ? 'Прямое WebRTC P2P соединение'\n" +
    "                  : signalingMode === 'self-hosted'\n" +
    "                    ? 'AnimeBox signaling подключён, ICE маршрут определяется'\n" +
    "                    : 'Используется резервный PeerJS Cloud signaling'}\n" +
    "            >\n" +
    "              {networkRoute === 'relay'\n" +
    "                ? 'TURN RELAY'\n" +
    "                : networkRoute === 'p2p'\n" +
    "                  ? 'P2P'\n" +
    "                  : signalingMode === 'self-hosted'\n" +
    "                    ? 'ICE'\n" +
    "                    : 'CLOUD'}\n" +
    "            </span>\n" +
    "            <span className={styles.role}>{role === 'host' ? 'HOST' : 'GUEST'}</span>\n" +
    "          </div>\n",
  'network badge',
);

const cssAppend = `

/* =========================================================
   WATCH TOGETHER · NETWORK v2
   ========================================================= */

.connectionBadges {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 6px;
}

.networkRoute {
  display: inline-flex;
  min-height: 24px;
  align-items: center;
  justify-content: center;
  padding: 0 8px;
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.025);
  color: rgba(205, 214, 236, 0.52);
  font-size: 7px;
  font-weight: 900;
  letter-spacing: 0.07em;
  white-space: nowrap;
}

.networkRoute[data-route='p2p'] {
  border-color: rgba(85, 214, 160, 0.16);
  background: rgba(85, 214, 160, 0.055);
  color: rgba(130, 238, 190, 0.8);
}

.networkRoute[data-route='relay'] {
  border-color: rgba(96, 165, 250, 0.2);
  background: rgba(59, 130, 246, 0.07);
  color: rgba(147, 197, 253, 0.9);
}

.theaterPanel .networkRoute,
.theaterPanel .role {
  min-height: 22px;
  font-size: 7px;
}

@media (max-width: 700px) and (orientation: portrait) {
  .connectionBadges {
    gap: 4px;
  }

  .theaterPanel .networkRoute {
    min-height: 20px;
    padding-inline: 6px;
    font-size: 6px;
  }
}
`;

if (!css.includes('WATCH TOGETHER · NETWORK v2')) {
  css = css.trimEnd() + cssAppend;
}

fs.writeFileSync(panelPath, panel, 'utf8');
fs.writeFileSync(cssPath, css, 'utf8');

console.log('Watch Together Network v2 applied successfully.');
console.log('Now run: npm run build');
