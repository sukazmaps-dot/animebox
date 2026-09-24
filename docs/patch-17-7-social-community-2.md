# Patch 17.7 — Social & Community 2.0

## Product goal

Turn AnimeBox social features from isolated utilities into one connected community layer around watching.

## Friends Graph 2.0

- username discovery directly from the Friends screen
- accepted friends can expose a coarse online state
- the Friends screen live-refreshes after mutations
- activity feed shows recent completed episodes, ratings and episode comments

## Privacy

Presence and activity are friends-only. Users can independently disable online visibility and activity visibility to friends.

Presence stores only user id, last-seen timestamp and coarse surface (`site`, `player`, `watch_together`, `chat`). It intentionally stores no location, IP address, device id or user agent.

## Social inbox

- episode-comment replies
- @mentions in episode discussions
- exact comment anchors with post-hydration scroll recovery

## Comment moderation

- report action with spam / abuse / spoiler / scam / other
- one report per user/comment
- shared Community Admin queue
- delete, mute, ban, dismiss and actioned workflows
- existing admin audit and target-role protection

## Community analytics

- global chat messages / 24h
- episode comments / 24h
- active chatters / 24h
- accepted friendships
- online users by the two-minute presence window
- open chat + comment reports
- restricted users

## Reliability / security

- all new social storage is RLS-enabled
- new tables are server/service-role managed
- browser roles receive no direct table access
- presence heartbeat pauses in hidden/offline tabs
- social notification side effects are fail-open for comment publishing
- comment reports and friend discovery are rate-limited
