# Patch 29.0 — Social-first AnimeBox Homepage

## Product objective
Make Watch Together a first-class reason to return, rather than an obscure secondary nav. Preserve existing personalized continue-watching, the recommendation feed, schedules, and main-thread responsiveness.

## Implemented architecture
- Main homepage remains a Server Component shell with the existing feed/schedule contexts.
- Watch Together lives immediately after the Hero as a server-rendered section with SSR text and direct create/explore links.
- Its public room summaries are client-loaded via dynamic import only when approaching the viewport, never during the first image paint.
- Poll only when the browser tab and section are visible, at most once per 30 seconds; all requests abort on unmount.
- Show up to three joinable actual public rooms. Rank preferred anime IDs above currently watching rooms, then engagement. Guests see general rooms.
- Public listing does not contain a join secret. An authenticated join resolves it on click through the dedicated protected endpoint. The secret is embedded only in the fragment of the destination URL, not analytics.
- Logged-out visitors can explore. Joining offers authentication, directing to Watch Together.
- Empty, degraded, timeout and API errors have realistic copy and a create-room CTA; no fake activity.
- Lightweight AnimeImage thumbnails and static CSS. Zero video iframes, zero peer synchronization, zero room chat on the home page.
- Remove the old legacy personalized room card which attempted to construct a secret URL from a secret-less public listing.

## Acceptance
- Guest, authorized, personal history/no history, empty/full/private/ended rooms, query failure, throttling, timeout, tab resume, keyboard and mobile.
- Run npm run patch29:check, npx tsc --noEmit, npx eslint (changed files), and the project's full CI build.
- Use real-user p75 Web Vitals (LCP ≤ 2.5s, INP ≤ 200ms, CLS ≤ 0.1) and lab Lighthouse 95+ as targets, not promises. No source autoplay/previews.
- Next stages: scheduled communal screenings and opt-in friend presence, with dedicated experiments and metrics.

## Rollback
Revert the patch's merge; room APIs, membership and Watch Together theater remain untouched.
