# Patch 16.5.2 — Navigation & Player Scroll Stability

## Goal

Fix two user-reported scroll regressions:

1. On mobile anime detail pages, the page could automatically jump down toward the episode/group area after async episode data finished loading.
2. On desktop episode pages, choosing another episode from the player could move the document below the player.

## Root cause

Both regressions came from `EpisodeList`.

The component used `Element.scrollIntoView()` to:

- center the active episode group tab;
- reveal the current episode after navigation.

`scrollIntoView()` is allowed to scroll every ancestor needed to reveal the target, including the document viewport. Because the episode data is loaded asynchronously, these effects could fire after the page had already rendered and pull the user to the episode block.

## Fix

`EpisodeList` no longer calls `scrollIntoView()`.

Instead:

- the current episode adjusts only the internal episode list `scrollTop`;
- the active episode-group tab adjusts only the horizontal group-track `scrollLeft`;
- season tabs continue to use their own horizontal container scrolling.

The document viewport is never used as part of automatic episode-list alignment.

## Player navigation

Episode changes initiated by `AnimePlayer` now use:

`router.push(path, { scroll: false })`

This preserves the user's current player viewport while switching episodes, including previous/next episode and season transitions.

Links from the anime detail episode list are unchanged, so opening an episode from the detail page still behaves like normal page navigation.

## Regression protection

The quality gate now:

- lints `components/EpisodeList.tsx`;
- asserts that `EpisodeList` contains no `.scrollIntoView(`;
- asserts that player episode navigation uses `scroll: false`.

## UI impact

No visual redesign. This patch changes only scroll ownership and navigation behavior.
