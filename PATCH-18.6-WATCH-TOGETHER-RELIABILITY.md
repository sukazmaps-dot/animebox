# Patch 18.6 — Watch Together Reliability Final

## Goal

Make Watch Together behave like a production room system instead of a fragile P2P demo: bounded joins, stable reconnects, deterministic playback sync, race-safe host handoff, reliable chat UX and room creation that never hangs behind browser permissions.

## Reliability contract

- A guest must either become active through WebRTC or Realtime within a bounded room-level deadline, or receive an actionable error.
- Late async results from an obsolete transport generation must never revive an old connection.
- Realtime stays subscribed as a hot standby while WebRTC is healthy.
- Only one Realtime relay per room/topic is active per browser tab.
- Playback drift compares host time against the guest's projected current playback position, not a stale observation.
- Host heartbeats are conditional on the caller still being the room host and the room not already being ended.
- Failed guest chat delivery keeps the typed draft intact.
- Room registration and navigation do not wait for Clipboard API permission.
- Host transfer remains compare-and-swap guarded on the server.

## Regression gate

`npm run watch-together-stability:check` now verifies the bounded join deadline, drift projection, chat draft protection, non-blocking clipboard path, relay serialization, race-safe heartbeat, reconnect lifecycle, presence hydration, host transfer and lobby freshness invariants.

## Manual smoke before production

1. Host on desktop, guest on mobile.
2. Join over normal network, then repeat with WebRTC unavailable to force Realtime fallback.
3. Background/foreground the mobile tab and toggle network off/on.
4. Play, pause and seek repeatedly; verify no seek loop and no visible multi-second drift.
5. Send chat while disconnecting; failed message must remain in the input.
6. Transfer host to the guest, then let the old host reconnect.
7. Create a room with Clipboard permission blocked; navigation must happen immediately.
8. Verify public-room participant count and episode update after transfer.

No SQL migration is required by this patch.
