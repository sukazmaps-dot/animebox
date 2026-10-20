# Patch 33.1 / Stability 3 — watch progress and Kodik lifecycle

## Production bug evidence (2026-10-20)

1. `components/useWatchSession.ts` returned immediately from a forced heartbeat while another heartbeat was in flight. The last time position (end, visibility, episode transition) could be omitted until a later timer that never runs after navigation.
2. A forced flush arriving while `startSession` was already creating the session also returned without joining that start request.
3. Two callers returning from an asynchronous session start could claim the same heartbeat sequence number.
4. `components/KodikPlayer.tsx` created its message listener and inference timers inside an effect depending on changing React callbacks from `AnimePlayer`. Rerenders therefore removed/reinstalled the subscription and cleared end/pause timers, potentially losing one-shot end detection.
5. React component cleanup sent an `end` immediately even if the last heartbeat was outstanding; the server could reject the heartbeat as belonging to an already-ended session.

## Change boundaries

- `useWatchSession`: retain a generation-tagged in-flight heartbeat completion promise. Normal 20-second ticks never queue extra sync work; forced syncs await the current request, recheck the lifecycle generation, then send the latest position with the next sequence number.
- Join a pending session-start task. Re-check the send lock after asynchronous session startup.
- On route/component teardown while the page is still visible, issue `end` only after the pending heartbeat settles. For hidden/unloading documents, preserve the immediate `keepalive` end because the browser may terminate asynchronous work at any point.
- Kodik: use one provider message listener per iframe/episode lifecycle; update React callbacks via `useLayoutEffect` refs without resubscribing. Preserve source, origin, native skip ownership, autoplay semantics, one-shot ended, and pause inference.
- Retain existing server-side anti-cheat, accepted-watch-time ceilings, strict sequential heartbeat records, multi-device supersession protection, and canonical resume position.
- No database migration, CDN/storage configuration, public API contract, CSS/UI change, or new upstream request.

## Tests and release gates

- `tests/watch-heartbeat-queue.cjs`: mount the real watch hook; delay the first heartbeat, deliver a newer position during it, then demand that both heartbeats persist in sequence 1/2 with positions 3/5 seconds. Verify the end request is single.
- `tests/kodik-opening-ownership.cjs`: rerender KodikPlayer with new time/end callback instances without changing the iframe. Verify exactly one message subscription, no interim teardown, and latest callback ownership.
- Included in existing `watch-service:check` and `opening-skip-safety:check`, respectively; both run from `npm run prebuild`.
- Required before production: green CI/prebuild and TypeScript, lint of changed files, player regression tests and controlled browser QA.

## Manual QA / canary

1. Play a Kodik episode for 30+ seconds, background/foreground the tab or Telegram Mini App, then leave. Reopen and verify latest legitimate resume position.
2. Switch episodes rapidly after seeking; ensure prior episode does not update the new episode, while old session still ends at its own final position.
3. Near the actual Kodik end, update parent UI/state repeatedly. End flow fires once; neither opening/ending hint nor incidental rerenders change iframe episode.
4. Test with simultaneous viewing on two devices. The superseded device must not overwrite newer progress.
5. Introduce simulated 429/409/404/410 and offline failures: never mint extra watch time, never reset sequence on a transient error, and never manufacture a completed episode.

## Residual limitations

Browser process kill, offline termination, and third-party provider silence cannot guarantee delivery. Server-side canonical end only saves resume position and does not fabricate verified coverage. This patch improves sequencing and reduces client-side losses; it does not claim 100% persistence.
