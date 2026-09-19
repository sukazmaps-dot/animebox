import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const panelPath = path.join(root, 'components/watch-party/WatchPartyPanel.tsx');
const cssPath = path.join(root, 'components/watch-party/WatchPartyPanel.module.css');

function load(file) {
  if (!fs.existsSync(file)) throw new Error(`File not found: ${file}`);
  return fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
}

function replaceOnce(source, before, after, label) {
  const first = source.indexOf(before);
  if (first < 0) throw new Error(`Patch marker not found: ${label}`);
  return source.slice(0, first) + after + source.slice(first + before.length);
}

let panel = load(panelPath);
let css = load(cssPath);

if (panel.includes("openWatchPartyRelay")) {
  console.log('Watch Together relay fallback already applied.');
  process.exit(0);
}

panel = replaceOnce(
  panel,
  "} from '@/lib/watch-party-network-client';\n",
  "} from '@/lib/watch-party-network-client';\n" +
    "import {\n" +
    "  openWatchPartyRelay,\n" +
    "  type WatchPartyRelay,\n" +
    "} from '@/lib/watch-party-relay-client';\n",
  'relay import',
);

panel = replaceOnce(
  panel,
  "const MAX_RECONNECT_ATTEMPTS = 7;\n",
  "const MAX_RECONNECT_ATTEMPTS = 7;\n" +
    "const SERVER_RELAY_FALLBACK_MS = 3_500;\n",
  'relay fallback constant',
);

panel = replaceOnce(
  panel,
  "  const requestedIdentityIdsRef = useRef(new Set<string>());\n",
  "  const requestedIdentityIdsRef = useRef(new Set<string>());\n" +
    "  const relayRef = useRef<WatchPartyRelay | null>(null);\n" +
    "  const relayFallbackTimerRef = useRef<number | null>(null);\n" +
    "  const guestWelcomedRef = useRef(false);\n" +
    "  const guestTransportRef = useRef<'p2p' | 'server' | null>(null);\n" +
    "  const relayHostGuestIdsRef = useRef(new Set<string>());\n",
  'relay refs',
);

panel = replaceOnce(
  panel,
  "  const broadcast = useCallback((packet: WatchPartyPacket) => {\n" +
    "    for (const connection of hostConnectionsRef.current.values()) {\n" +
    "      send(connection, packet);\n" +
    "    }\n" +
    "  }, [send]);\n",
  "  const broadcast = useCallback((packet: WatchPartyPacket) => {\n" +
    "    for (const connection of hostConnectionsRef.current.values()) {\n" +
    "      send(connection, packet);\n" +
    "    }\n\n" +
    "    if (roleRef.current === 'host' && relayRef.current) {\n" +
    "      void relayRef.current.send(packet);\n" +
    "    }\n" +
    "  }, [send]);\n",
  'broadcast relay',
);

panel = replaceOnce(
  panel,
  "  const broadcastParticipants = useCallback(() => {\n" +
    "    const next = [...participantsRef.current.values()];\n" +
    "    publishParticipants(next);\n" +
    "    const packet: WatchPartyPacket = { type: 'PARTICIPANTS', participants: next };\n" +
    "    for (const connection of hostConnectionsRef.current.values()) {\n" +
    "      send(connection, packet);\n" +
    "    }\n" +
    "  }, [publishParticipants, send]);\n",
  "  const broadcastParticipants = useCallback(() => {\n" +
    "    const next = [...participantsRef.current.values()];\n" +
    "    publishParticipants(next);\n" +
    "    const packet: WatchPartyPacket = { type: 'PARTICIPANTS', participants: next };\n" +
    "    broadcast(packet);\n" +
    "  }, [broadcast, publishParticipants]);\n",
  'participants relay',
);

panel = replaceOnce(
  panel,
  "    if (syncTimerRef.current != null) {\n" +
    "      window.clearInterval(syncTimerRef.current);\n" +
    "      syncTimerRef.current = null;\n" +
    "    }\n",
  "    if (syncTimerRef.current != null) {\n" +
    "      window.clearInterval(syncTimerRef.current);\n" +
    "      syncTimerRef.current = null;\n" +
    "    }\n" +
    "    if (relayFallbackTimerRef.current != null) {\n" +
    "      window.clearTimeout(relayFallbackTimerRef.current);\n" +
    "      relayFallbackTimerRef.current = null;\n" +
    "    }\n",
  'clear relay timer',
);

panel = replaceOnce(
  panel,
  "    const peer = peerRef.current;\n" +
    "    peerRef.current = null;\n" +
    "    if (peer && !peer.destroyed) peer.destroy();\n",
  "    const peer = peerRef.current;\n" +
    "    peerRef.current = null;\n" +
    "    if (peer && !peer.destroyed) peer.destroy();\n" +
    "    const relay = relayRef.current;\n" +
    "    relayRef.current = null;\n" +
    "    if (relay) void relay.close();\n" +
    "    relayHostGuestIdsRef.current.clear();\n" +
    "    guestWelcomedRef.current = false;\n" +
    "    guestTransportRef.current = null;\n",
  'destroy relay',
);

panel = replaceOnce(
  panel,
  "  const scheduleGuestReconnectRef = useRef<() => void>(() => undefined);\n",
  "  const scheduleGuestReconnectRef = useRef<() => void>(() => undefined);\n\n" +
    "  const ensureHostTimers = useCallback(() => {\n" +
    "    if (roleRef.current !== 'host') return;\n\n" +
    "    if (heartbeatTimerRef.current == null) {\n" +
    "      heartbeatTimerRef.current = window.setInterval(() => {\n" +
    "        broadcast({ type: 'ROOM_HEARTBEAT', sentAt: Date.now() });\n" +
    "      }, HOST_HEARTBEAT_MS);\n" +
    "    }\n\n" +
    "    if (syncTimerRef.current == null) {\n" +
    "      syncTimerRef.current = window.setInterval(() => {\n" +
    "        sendHostSync();\n" +
    "      }, PLAYER_SYNC_MS);\n" +
    "    }\n" +
    "  }, [broadcast, sendHostSync]);\n\n" +
    "  const sendGuestPacket = useCallback((packet: WatchPartyPacket) => {\n" +
    "    if (guestTransportRef.current === 'server' && relayRef.current) {\n" +
    "      void relayRef.current.send(packet);\n" +
    "      return true;\n" +
    "    }\n\n" +
    "    const connection = guestConnectionRef.current;\n" +
    "    return connection?.open ? send(connection, packet) : false;\n" +
    "  }, [send]);\n",
  'relay helpers',
);

// Mark P2P WELCOME as the chosen transport.
panel = replaceOnce(
  panel,
  "        welcomed = true;\n" +
    "        clearAttemptTimers();\n" +
    "        reconnectAttemptRef.current = 0;\n",
  "        if (guestTransportRef.current === 'server') {\n" +
    "          connection.close();\n" +
    "          return;\n" +
    "        }\n" +
    "        welcomed = true;\n" +
    "        guestWelcomedRef.current = true;\n" +
    "        guestTransportRef.current = 'p2p';\n" +
    "        clearAttemptTimers();\n" +
    "        reconnectAttemptRef.current = 0;\n",
  'p2p welcome',
);

panel = replaceOnce(
  panel,
  "      if (intentionalCloseRef.current || hostEndedRef.current || reconnectQueued) return;\n" +
    "      reconnectQueued = true;\n" +
    "      setStatus('reconnecting');\n" +
    "      scheduleGuestReconnectRef.current();\n",
  "      if (\n" +
    "        intentionalCloseRef.current ||\n" +
    "        hostEndedRef.current ||\n" +
    "        reconnectQueued ||\n" +
    "        guestTransportRef.current === 'server'\n" +
    "      ) return;\n" +
    "      reconnectQueued = true;\n" +
    "      setStatus('reconnecting');\n" +
    "      scheduleGuestReconnectRef.current();\n",
  'guest close relay guard',
);

panel = replaceOnce(
  panel,
  "      if (intentionalCloseRef.current || hostEndedRef.current || reconnectQueued) return;\n" +
    "      reconnectQueued = true;\n" +
    "      setStatus('reconnecting');\n" +
    "      scheduleGuestReconnectRef.current();\n",
  "      if (\n" +
    "        intentionalCloseRef.current ||\n" +
    "        hostEndedRef.current ||\n" +
    "        reconnectQueued ||\n" +
    "        guestTransportRef.current === 'server'\n" +
    "      ) return;\n" +
    "      reconnectQueued = true;\n" +
    "      setStatus('reconnecting');\n" +
    "      scheduleGuestReconnectRef.current();\n",
  'guest error relay guard',
);

// Insert server relay fallback in startGuest before PeerJS creation.
panel = replaceOnce(
  panel,
  "    identityRef.current = identity;\n" +
    "    if (intentionalCloseRef.current) return;\n\n" +
    "    const { peer, network } = await createWatchPartyPeer();\n",
  "    identityRef.current = identity;\n" +
    "    if (intentionalCloseRef.current) return;\n\n" +
    "    guestWelcomedRef.current = false;\n" +
    "    guestTransportRef.current = null;\n\n" +
    "    const startServerRelay = async () => {\n" +
    "      if (\n" +
    "        intentionalCloseRef.current ||\n" +
    "        hostEndedRef.current ||\n" +
    "        guestWelcomedRef.current ||\n" +
    "        relayRef.current\n" +
    "      ) return;\n\n" +
    "      try {\n" +
    "        const relay = await openWatchPartyRelay(invite, (packet) => {\n" +
    "          if (intentionalCloseRef.current || hostEndedRef.current) return;\n\n" +
    "          if (packet.type === 'WELCOME') {\n" +
    "            if (packet.roomId !== invite.roomId || packet.protocol !== WATCH_PARTY_PROTOCOL) return;\n" +
    "            if (guestTransportRef.current === 'p2p') return;\n\n" +
    "            guestWelcomedRef.current = true;\n" +
    "            guestTransportRef.current = 'server';\n" +
    "            reconnectAttemptRef.current = 0;\n" +
    "            publishParticipants(packet.participants);\n" +
    "            setNetworkRoute('server');\n" +
    "            setError('');\n" +
    "            setStatus('active');\n" +
    "            guestConnectionRef.current?.close();\n" +
    "            return;\n" +
    "          }\n\n" +
    "          if (guestTransportRef.current !== 'server') return;\n\n" +
    "          if (packet.type === 'PARTICIPANTS') {\n" +
    "            publishParticipants(packet.participants);\n" +
    "            return;\n" +
    "          }\n\n" +
    "          if (packet.type === 'PLAYER_APPLY') {\n" +
    "            if (packet.seq <= lastAppliedSeqRef.current) return;\n" +
    "            lastAppliedSeqRef.current = packet.seq;\n" +
    "            const playing = packet.action === 'play'\n" +
    "              ? true\n" +
    "              : packet.action === 'pause'\n" +
    "                ? false\n" +
    "                : playerStateRef.current?.playing ?? false;\n" +
    "            setLastController(`${packet.actorName}: ${packet.action === 'play' ? '▶ воспроизведение' : packet.action === 'pause' ? '❚❚ пауза' : '↔ перемотка'}`);\n" +
    "            dispatchPlayerCommand({\n" +
    "              action: packet.action,\n" +
    "              episode: packet.episode,\n" +
    "              position: packet.position,\n" +
    "              playing,\n" +
    "              seq: packet.seq,\n" +
    "            });\n" +
    "            return;\n" +
    "          }\n\n" +
    "          if (packet.type === 'PLAYER_SYNC') {\n" +
    "            if (packet.seq < lastAppliedSeqRef.current) return;\n" +
    "            const state = playerStateRef.current;\n" +
    "            const networkAdjusted = packet.playing\n" +
    "              ? packet.position + Math.min(2, Math.max(0, (Date.now() - packet.sentAt) / 1000))\n" +
    "              : packet.position;\n\n" +
    "            if (!state) {\n" +
    "              dispatchPlayerCommand({\n" +
    "                action: packet.playing ? 'play' : 'pause',\n" +
    "                episode: packet.episode,\n" +
    "                position: networkAdjusted,\n" +
    "                playing: packet.playing,\n" +
    "                seq: packet.seq,\n" +
    "              });\n" +
    "              return;\n" +
    "            }\n" +
    "            if (state.episode !== packet.episode) return;\n\n" +
    "            const drift = Math.abs(state.position - networkAdjusted);\n" +
    "            if (state.playing !== packet.playing) {\n" +
    "              dispatchPlayerCommand({\n" +
    "                action: packet.playing ? 'play' : 'pause',\n" +
    "                episode: packet.episode,\n" +
    "                position: networkAdjusted,\n" +
    "                playing: packet.playing,\n" +
    "                seq: packet.seq,\n" +
    "              });\n" +
    "            } else if (drift >= PLAYER_DRIFT_SEEK_SECONDS) {\n" +
    "              dispatchPlayerCommand({\n" +
    "                action: 'seek',\n" +
    "                episode: packet.episode,\n" +
    "                position: networkAdjusted,\n" +
    "                playing: packet.playing,\n" +
    "                seq: packet.seq,\n" +
    "              });\n" +
    "            }\n" +
    "            return;\n" +
    "          }\n\n" +
    "          if (packet.type === 'CHAT_MESSAGE') {\n" +
    "            appendChatMessage(packet.message);\n" +
    "            return;\n" +
    "          }\n\n" +
    "          if (packet.type === 'HOST_ENDED') {\n" +
    "            hostEndedRef.current = true;\n" +
    "            setStatus('ended');\n" +
    "            setError('Хост завершил совместный просмотр.');\n" +
    "            return;\n" +
    "          }\n\n" +
    "          if (packet.type === 'REJECT') {\n" +
    "            hostEndedRef.current = true;\n" +
    "            setStatus('error');\n" +
    "            setError(rejectMessage(packet.reason));\n" +
    "          }\n" +
    "        });\n\n" +
    "        if (intentionalCloseRef.current || hostEndedRef.current || guestWelcomedRef.current) {\n" +
    "          await relay.close();\n" +
    "          return;\n" +
    "        }\n\n" +
    "        relayRef.current = relay;\n" +
    "        setError('WebRTC недоступен — подключаем защищённый серверный relay…');\n\n" +
    "        const hello: WatchPartyPacket = {\n" +
    "          type: 'HELLO',\n" +
    "          protocol: WATCH_PARTY_PROTOCOL,\n" +
    "          roomId: invite.roomId,\n" +
    "          secret: invite.secret,\n" +
    "          participant: {\n" +
    "            id: relay.id,\n" +
    "            userId: identity.userId,\n" +
    "            name: identity.displayName,\n" +
    "            host: false,\n" +
    "            joinedAt: Date.now(),\n" +
    "          },\n" +
    "        };\n\n" +
    "        // Broadcast has no durable queue. Retry HELLO briefly so a host\n" +
    "        // that is finishing its Realtime subscription cannot miss it.\n" +
    "        for (let attempt = 0; attempt < 5 && !guestWelcomedRef.current; attempt += 1) {\n" +
    "          await relay.send(hello);\n" +
    "          if (guestWelcomedRef.current) break;\n" +
    "          await new Promise((resolve) => window.setTimeout(resolve, 1_200));\n" +
    "        }\n" +
    "      } catch {\n" +
    "        if (!guestWelcomedRef.current) {\n" +
    "          setError('Не удалось открыть резервный relay. Продолжаем попытки WebRTC…');\n" +
    "        }\n" +
    "      }\n" +
    "    };\n\n" +
    "    relayFallbackTimerRef.current = window.setTimeout(() => {\n" +
    "      relayFallbackTimerRef.current = null;\n" +
    "      void startServerRelay();\n" +
    "    }, SERVER_RELAY_FALLBACK_MS);\n\n" +
    "    const { peer, network } = await createWatchPartyPeer();\n",
  'guest server relay',
);

// Guest reconnect should stop once server relay won.
panel = replaceOnce(
  panel,
  "      if (intentionalCloseRef.current || hostEndedRef.current || peer.destroyed) return;\n",
  "      if (\n" +
    "        intentionalCloseRef.current ||\n" +
    "        hostEndedRef.current ||\n" +
    "        peer.destroyed ||\n" +
    "        guestTransportRef.current === 'server'\n" +
    "      ) return;\n",
  'guest reconnect server guard',
);

panel = replaceOnce(
  panel,
  "      if (intentionalCloseRef.current || hostEndedRef.current) return;\n" +
    "      setStatus('reconnecting');\n" +
    "      scheduleGuestReconnectRef.current();\n",
  "      if (intentionalCloseRef.current || hostEndedRef.current || guestTransportRef.current === 'server') return;\n" +
    "      setStatus('reconnecting');\n" +
    "      scheduleGuestReconnectRef.current();\n",
  'peer disconnected server guard',
);

panel = replaceOnce(
  panel,
  "      if (intentionalCloseRef.current || hostEndedRef.current) return;\n" +
    "      const type = 'type' in peerError ? String(peerError.type) : '';\n",
  "      if (intentionalCloseRef.current || hostEndedRef.current || guestTransportRef.current === 'server') return;\n" +
    "      const type = 'type' in peerError ? String(peerError.type) : '';\n",
  'peer error server guard',
);

// Start host relay before creating the PeerJS host.
panel = replaceOnce(
  panel,
  "    participantsRef.current.set(hostPeerId, hostParticipant);\n\n" +
    "    peer.on('connection', (connection) => {\n",
  "    participantsRef.current.set(hostPeerId, hostParticipant);\n\n" +
    "    void openWatchPartyRelay(invite, (packet, senderId) => {\n" +
    "      if (intentionalCloseRef.current) return;\n\n" +
    "      if (packet.type === 'HELLO') {\n" +
    "        if (\n" +
    "          packet.protocol !== WATCH_PARTY_PROTOCOL ||\n" +
    "          packet.roomId !== invite.roomId ||\n" +
    "          packet.secret !== invite.secret ||\n" +
    "          packet.participant.host ||\n" +
    "          packet.participant.id !== senderId\n" +
    "        ) {\n" +
    "          void relayRef.current?.send({ type: 'REJECT', reason: 'invalid_room' }, senderId);\n" +
    "          return;\n" +
    "        }\n\n" +
    "        if (\n" +
    "          !participantsRef.current.has(senderId) &&\n" +
    "          participantsRef.current.size >= WATCH_PARTY_MAX_PARTICIPANTS\n" +
    "        ) {\n" +
    "          void relayRef.current?.send({ type: 'REJECT', reason: 'room_full' }, senderId);\n" +
    "          return;\n" +
    "        }\n\n" +
    "        relayHostGuestIdsRef.current.add(senderId);\n" +
    "        participantsRef.current.set(senderId, {\n" +
    "          ...packet.participant,\n" +
    "          id: senderId,\n" +
    "          joinedAt: Date.now(),\n" +
    "        });\n\n" +
    "        const current = [...participantsRef.current.values()];\n" +
    "        void relayRef.current?.send({\n" +
    "          type: 'WELCOME',\n" +
    "          protocol: WATCH_PARTY_PROTOCOL,\n" +
    "          roomId: invite.roomId,\n" +
    "          participants: current,\n" +
    "        }, senderId);\n" +
    "        broadcastParticipants();\n" +
    "        setNetworkRoute('server');\n\n" +
    "        const state = currentPlayerSnapshot();\n" +
    "        if (state) {\n" +
    "          void relayRef.current?.send({\n" +
    "            type: 'PLAYER_SYNC',\n" +
    "            seq: hostSeqRef.current,\n" +
    "            episode: state.episode,\n" +
    "            position: state.position,\n" +
    "            playing: state.playing,\n" +
    "            sentAt: Date.now(),\n" +
    "          }, senderId);\n" +
    "        }\n" +
    "        return;\n" +
    "      }\n\n" +
    "      const participant = participantsRef.current.get(senderId);\n" +
    "      if (!participant || participant.host || !relayHostGuestIdsRef.current.has(senderId)) return;\n\n" +
    "      if (packet.type === 'PLAYER_ACTION') {\n" +
    "        if (packet.episode !== episodeNumber) return;\n" +
    "        sequencePlayerAction(\n" +
    "          {\n" +
    "            actionId: packet.actionId,\n" +
    "            action: packet.action,\n" +
    "            episode: packet.episode,\n" +
    "            position: packet.position,\n" +
    "            playing: packet.action === 'play'\n" +
    "              ? true\n" +
    "              : packet.action === 'pause'\n" +
    "                ? false\n" +
    "                : playerStateRef.current?.playing ?? false,\n" +
    "            observedAt: packet.sentAt,\n" +
    "          },\n" +
    "          { userId: participant.userId, displayName: participant.name },\n" +
    "          true,\n" +
    "        );\n" +
    "        return;\n" +
    "      }\n\n" +
    "      if (packet.type === 'CHAT_SEND') {\n" +
    "        if (chatIdsRef.current.has(packet.id)) return;\n" +
    "        const now = Date.now();\n" +
    "        const previous = hostPeerChatAtRef.current.get(senderId) ?? 0;\n" +
    "        if (now - previous < CHAT_SEND_COOLDOWN_MS) return;\n" +
    "        hostPeerChatAtRef.current.set(senderId, now);\n\n" +
    "        const message: WatchPartyChatMessage = {\n" +
    "          id: packet.id,\n" +
    "          userId: participant.userId,\n" +
    "          name: participant.name,\n" +
    "          host: false,\n" +
    "          text: packet.text,\n" +
    "          sentAt: now,\n" +
    "        };\n" +
    "        appendChatMessage(message);\n" +
    "        broadcast({ type: 'CHAT_MESSAGE', message });\n" +
    "      }\n" +
    "    }).then((relay) => {\n" +
    "      if (intentionalCloseRef.current) {\n" +
    "        void relay.close();\n" +
    "        return;\n" +
    "      }\n" +
    "      relayRef.current = relay;\n" +
    "      publishParticipants([...participantsRef.current.values()]);\n" +
    "      setError('');\n" +
    "      setStatus('active');\n" +
    "      ensureHostTimers();\n" +
    "    }).catch(() => {\n" +
    "      // PeerJS remains the primary path if Supabase Realtime is unavailable.\n" +
    "    });\n\n" +
    "    peer.on('connection', (connection) => {\n",
  'host relay',
);

// Replace duplicate host interval creation with idempotent helper.
panel = replaceOnce(
  panel,
  "      heartbeatTimerRef.current = window.setInterval(() => {\n" +
    "        const packet: WatchPartyPacket = { type: 'ROOM_HEARTBEAT', sentAt: Date.now() };\n" +
    "        for (const connection of hostConnectionsRef.current.values()) send(connection, packet);\n" +
    "      }, HOST_HEARTBEAT_MS);\n" +
    "      syncTimerRef.current = window.setInterval(() => {\n" +
    "        sendHostSync();\n" +
    "      }, PLAYER_SYNC_MS);\n",
  "      ensureHostTimers();\n",
  'host timer helper',
);

// Add dependencies needed by host relay.
panel = replaceOnce(
  panel,
  "    episodeNumber,\n" +
    "    publishParticipants,\n",
  "    currentPlayerSnapshot,\n" +
    "    ensureHostTimers,\n" +
    "    episodeNumber,\n" +
    "    publishParticipants,\n",
  'host relay dependencies',
);

// Use unified guest send for player actions.
panel = replaceOnce(
  panel,
  "      if (roleRef.current === 'guest') {\n" +
    "        const connection = guestConnectionRef.current;\n" +
    "        if (!connection?.open) return;\n" +
    "        send(connection, {\n",
  "      if (roleRef.current === 'guest') {\n" +
    "        sendGuestPacket({\n",
  'guest player relay send start',
);

panel = replaceOnce(
  panel,
  "        });\n" +
    "      }\n" +
    "    }\n\n" +
    "    window.addEventListener(WATCH_PARTY_PLAYER_STATE_EVENT, onPlayerState);\n",
  "        });\n" +
    "      }\n" +
    "    }\n\n" +
    "    window.addEventListener(WATCH_PARTY_PLAYER_STATE_EVENT, onPlayerState);\n",
  'guest player relay send end',
);

panel = replaceOnce(
  panel,
  "  }, [episodeNumber, send, sequencePlayerAction]);\n",
  "  }, [episodeNumber, sendGuestPacket, sequencePlayerAction]);\n",
  'guest player dependencies',
);

// Guest chat can also use server relay.
panel = replaceOnce(
  panel,
  "    const connection = guestConnectionRef.current;\n" +
    "    if (roleRef.current === 'guest' && connection?.open) {\n" +
    "      send(connection, { type: 'CHAT_SEND', id, text, sentAt: now });\n" +
    "    }\n" +
    "  }, [appendChatMessage, broadcast, chatText, send, status]);\n",
  "    if (roleRef.current === 'guest') {\n" +
    "      sendGuestPacket({ type: 'CHAT_SEND', id, text, sentAt: now });\n" +
    "    }\n" +
    "  }, [appendChatMessage, broadcast, chatText, sendGuestPacket, status]);\n",
  'guest chat relay',
);

// Leaving as host should notify both P2P and server-relay guests.
panel = replaceOnce(
  panel,
  "      for (const connection of hostConnectionsRef.current.values()) {\n" +
    "        send(connection, { type: 'HOST_ENDED', reason: 'host_left' });\n" +
    "      }\n",
  "      broadcast({ type: 'HOST_ENDED', reason: 'host_left' });\n",
  'host relay end broadcast',
);

panel = replaceOnce(
  panel,
  "  }, [episodePath, mode, resetParty, send]);\n",
  "  }, [broadcast, episodePath, mode, resetParty]);\n",
  'leave dependencies',
);

// Stop P2P reconnect attempts once server relay is active.
panel = replaceOnce(
  panel,
  "      if (roleRef.current === 'guest') {\n" +
    "        scheduleGuestReconnectRef.current();\n" +
    "      }\n",
  "      if (roleRef.current === 'guest' && guestTransportRef.current !== 'server') {\n" +
    "        scheduleGuestReconnectRef.current();\n" +
    "      }\n",
  'online relay guard',
);

// Network badge: distinguish TURN from server relay.
panel = replaceOnce(
  panel,
  "              title={networkRoute === 'relay'\n" +
    "                ? 'Соединение идёт через TURN relay'\n" +
    "                : networkRoute === 'p2p'\n",
  "              title={networkRoute === 'server'\n" +
    "                ? 'WebRTC заблокирован: команды и чат идут через защищённый серверный WebSocket relay'\n" +
    "                : networkRoute === 'relay'\n" +
    "                  ? 'Соединение идёт через TURN relay'\n" +
    "                  : networkRoute === 'p2p'\n",
  'server relay badge title',
);

panel = replaceOnce(
  panel,
  "              {networkRoute === 'relay'\n" +
    "                ? 'TURN RELAY'\n" +
    "                : networkRoute === 'p2p'\n",
  "              {networkRoute === 'server'\n" +
    "                ? 'WS RELAY'\n" +
    "                : networkRoute === 'relay'\n" +
    "                  ? 'TURN RELAY'\n" +
    "                  : networkRoute === 'p2p'\n",
  'server relay badge label',
);

panel = replaceOnce(
  panel,
  "            Чат и команды плеера идут через WebRTC DataChannel. Видео каждый участник загружает напрямую у провайдера. Максимум {WATCH_PARTY_MAX_PARTICIPANTS} человек.\n",
  "            Чат и команды идут через WebRTC, TURN или защищённый WS relay. Видео каждый участник загружает напрямую у провайдера. Максимум {WATCH_PARTY_MAX_PARTICIPANTS} человек.\n",
  'transport note',
);

const cssAppend = `

/* =========================================================
   WATCH TOGETHER · SERVER RELAY FALLBACK v2.2
   ========================================================= */

.networkRoute[data-route='server'] {
  border-color: rgba(34, 211, 238, 0.22);
  background: rgba(6, 182, 212, 0.08);
  color: rgba(165, 243, 252, 0.92);
}
`;

if (!css.includes('SERVER RELAY FALLBACK v2.2')) {
  css = css.trimEnd() + cssAppend;
}

fs.writeFileSync(panelPath, panel, 'utf8');
fs.writeFileSync(cssPath, css, 'utf8');

console.log('Watch Together server relay fallback v2.2 applied.');
console.log('Run: npm run build');
