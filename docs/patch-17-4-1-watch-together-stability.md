# Patch 17.4.1 — Watch Together Stability & Presence

## Goal

Turn the existing Watch Together networking stack into a service-grade room
lifecycle without replacing the current PeerJS + Supabase Realtime architecture.

## Changes

### Reconnect
- Existing P2P -> Realtime standby remains the fast failover path.
- A hard PeerJS `close` now recreates a fresh transport when Realtime is not
  available.
- Returning online can recreate a destroyed PeerJS instance instead of trying to
  reconnect a dead object.
- Successful recovery emits `watch_party_reconnected`.

### Presence / participant counts
- Host heartbeat to the public room registry is now 20 seconds.
- P2P join/leave updates the registered lobby count immediately.
- Supabase Realtime Presence is authoritative for relay guests, so a missed
  initial HELLO cannot leave the room at an incorrect participant count.
- Public lobby refreshes every 12 seconds while visible.
- Public room cache is reduced to a 2 second edge window.
- Stale rooms disappear after 90 seconds without a host heartbeat.

### Host lifecycle
- Manual host transfer still works.
- A host pressing Leave now automatically hands the room to the
  longest-connected guest when one is available.
- The room is ended only when nobody can inherit it.
- Host transfer is protected by same-origin mutation validation and IP rate
  limiting.

### Analytics
- `watch_party_reconnected`
- `watch_party_host_transferred`
- `watch_party_presence_changed`

## Not changed

- Player media is still P2P-independent; Watch Together synchronizes control,
  presence and chat, not the video stream itself.
- Existing room invite URLs and protocol packets stay backwards-compatible.
- No database migration is required for this patch.
