# Patch 10 — Watch Together Social UI v1

## Goal

Turn Watch Together from a technically functional sidebar/lobby into a clear social product surface without changing the PeerJS/Realtime transport layer.

## Scope

### 1. Lobby v2
- Keep the hero focused on three entry paths: create, public rooms, invite link.
- Add direct hero CTAs to public rooms and room creation.
- Make LIVE stats visually dominant and easier to scan.
- Improve public room cards: stronger status, occupancy, host identity, episode, join CTA.
- Improve the zero-room state with a real creation CTA.
- Preserve 15-second auto-refresh and current search/sorting logic.

### 2. Room Header v2
- Make room health readable without exposing transport jargon as the primary message.
- Surface participant count and stable-sync state.
- Keep technical route info available as a compact secondary badge/tooltip.
- Make invite action more prominent.

### 3. Participants / Social presence
- Add a dedicated participants section header and count.
- Preserve profile links, Premium/role/sponsor badges and host transfer.
- Keep mobile tabs intact.

### 4. Reactions / Voting / Chat
- Keep existing reaction protocol.
- Redesign next-episode voting into three readable action cards.
- Improve empty chat copy so the room feels intentional instead of unfinished.
- Preserve ephemeral chat behavior and current rate limits.

## Non-goals
- No changes to PeerJS, TURN, Realtime, relay routing, heartbeat or reconnection.
- No friends system.
- No persistent room chat history.
- No new database migration.

## Acceptance criteria
- Desktop theater sidebar remains readable at narrow widths.
- Mobile room tabs remain usable.
- Public lobby has clear create/join/discover flows even with zero rooms.
- Existing Watch Together protocol behavior is unchanged.
- TypeScript, targeted ESLint and production build pass.
