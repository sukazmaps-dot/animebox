# Patch 18.4.4 — Runtime Effects & Root Shell Cleanup

## Goal

Reduce post-paint browser work that runs globally even when the user is idle, on desktop, in a hidden tab, or offline.

Patch 18.4.2 split the Home page into server/client islands.
Patch 18.4.3 reduced optional initial JavaScript.
Patch 18.4.4 targets the runtime that remains alive after hydration.

## Navbar

The mobile hide/show runtime is now genuinely mobile-only.

Before:

- the scroll listener was attached on desktop too;
- every RAF update could call `document.querySelector()` to discover modal state;
- desktop scrolls still entered the mobile-navigation callback path.

After:

- the scroll/focus runtime attaches only while `(max-width: 760px)` matches;
- it detaches again when the viewport leaves mobile mode;
- the hot path keeps one RAF at most;
- overlay locking is detected through the existing body scroll lock instead of a document-wide selector;
- resize/media-query changes reset state without leaving orphan RAF work.

## Account dropdown

`AuthUserButton` no longer keeps global `mousedown` and `keydown` listeners for the whole session.

Those listeners exist only while the account dropdown is open.

## Background polling

### Presence

The social-presence heartbeat now:

- owns at most one interval;
- has no interval while the tab is hidden;
- has no interval while offline;
- immediately refreshes once when returning visible/online;
- prevents overlapping POSTs.

### Social notification badge

Unread polling now follows the same lifecycle:

- polling exists only for an authenticated user;
- hidden/offline tabs have no active interval;
- one refresh runs when the tab resumes;
- the interval is explicitly stopped on hide/offline/unmount.

### Premium / sponsor membership

Membership keeps its cached state available but avoids network refreshes while hidden/offline.
A visible/online transition performs a fresh authoritative refresh.

## Product analytics

Canonical `page_view` remains immediate.

Secondary route-derived events such as `anime_open` and `chat_open` are scheduled through idle time (or a short bounded fallback) and are skipped if the page is already hidden.

This preserves attribution without adding secondary event work to the critical rendering window.

## Regression gate

`runtime-effects:check` runs during prebuild and enforces:

- root runtime listener-site budget <= 35;
- mobile-only Navbar scroll runtime;
- no document query in the Navbar scroll hot path;
- account dropdown listeners gated by open state;
- visibility-aware presence and notification polling;
- explicit interval shutdown;
- hidden-tab membership guard;
- immediate page_view + deferred secondary analytics.

No database migration is required.
