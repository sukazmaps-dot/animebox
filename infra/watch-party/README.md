# AnimeBox Watch Together Network v2

This patch separates the application from the network infrastructure:

- **PeerServer** = signaling only. It does not relay video or chat payloads.
- **TURN** = relay fallback for WebRTC DataChannel when direct P2P is blocked by
  VPN, CGNAT, symmetric NAT or restrictive networks.
- Anime video itself is still loaded independently by every participant from
  the configured player/provider. TURN only carries Watch Together DataChannel
  traffic (chat + play/pause/seek/sync).

## Recommended production topology

```text
youranimebox.com (Vercel)
        |
        | GET /api/watch-party/network
        |
Browser A ---- peer.youranimebox.com:443 ---- Browser B
        \                                   /
         \------ direct WebRTC P2P --------/
          \---- TURN fallback if needed --/
```

For maximum compatibility, expose TURN as:

- `turn:turn.youranimebox.com:3478?transport=udp`
- `turn:turn.youranimebox.com:3478?transport=tcp`
- `turns:turn.youranimebox.com:443?transport=tcp`

`turns:...:443` is useful on networks/VPNs that block UDP or non-standard ports.

### Important port note

A normal HTTPS reverse proxy and coturn cannot both own the same public
`IP:443`. The simplest production setup is:

1. PeerServer on one host/IP (or a platform that supports long-lived WebSocket).
2. coturn on another small VPS/public IP so TURN/TLS can own port 443.

You can also use an L4 TLS multiplexer, but that is more complex.

## 1. PeerServer

From `infra/watch-party/peer-server`:

```bash
docker build -t animebox-peer .
docker run -d \
  --name animebox-peer \
  --restart unless-stopped \
  -p 127.0.0.1:9000:9000 \
  -e PEER_PATH=/peerjs \
  -e PEER_KEY=animebox \
  -e PEER_PROXIED=true \
  animebox-peer
```

Put nginx/Caddy in front of it with HTTPS + WebSocket support. An nginx example
is included in `nginx-peer.conf.example`.

## 2. coturn

Install coturn on the TURN host/VPS and copy
`coturn/turnserver.conf.example` to your real config.

Open:

- TCP/UDP `3478`
- TCP `443` for TURNS
- UDP relay range `49160-49200`

Use a long random `static-auth-secret`. The same value goes into Vercel as
`WATCH_PARTY_TURN_SECRET`.

coturn shared-secret mode generates temporary credentials. AnimeBox never sends
the real shared secret to the browser.

## 3. Vercel environment variables

Recommended:

```env
WATCH_PARTY_SIGNAL_HOST=peer.youranimebox.com
WATCH_PARTY_SIGNAL_PORT=443
WATCH_PARTY_SIGNAL_PATH=/peerjs
WATCH_PARTY_SIGNAL_SECURE=true
WATCH_PARTY_SIGNAL_KEY=animebox

WATCH_PARTY_STUN_URLS=stun:turn.youranimebox.com:3478,stun:stun.l.google.com:19302

WATCH_PARTY_TURN_URLS=turn:turn.youranimebox.com:3478?transport=udp,turn:turn.youranimebox.com:3478?transport=tcp,turns:turn.youranimebox.com:443?transport=tcp
WATCH_PARTY_TURN_SECRET=REPLACE_WITH_THE_SAME_COTURN_SHARED_SECRET
WATCH_PARTY_TURN_TTL_SECONDS=3600

# Debug only. Keep false in production.
WATCH_PARTY_FORCE_RELAY=false
```

If using a managed TURN provider with fixed credentials instead of coturn
shared-secret mode:

```env
WATCH_PARTY_TURN_URLS=...
WATCH_PARTY_TURN_USERNAME=...
WATCH_PARTY_TURN_CREDENTIAL=...
```

Do not set `WATCH_PARTY_TURN_SECRET` in that mode.

## 4. Test

Test four combinations:

1. Same Wi-Fi, no VPN: should usually display `P2P`.
2. Different networks/countries: should connect.
3. One participant behind VPN/mobile network: may display `TURN RELAY`.
4. Set `WATCH_PARTY_FORCE_RELAY=true`, redeploy, create a new room: it MUST
   display `TURN RELAY`. Then immediately return it to `false`.

If force-relay cannot connect, TURN is not reachable/configured correctly.
