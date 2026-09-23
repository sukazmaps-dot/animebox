# Patch 14.5 — Episode Identity

## Goal

Replace the generic numbered episode grid with a recognisable AnimeBox viewing path while preserving all existing playback, provider and long-series logic.

This patch reuses the existing EpisodeList rather than introducing a second episode navigator.

## Data model

The episode selector now receives all authenticated watch states for a title in one request.

The community episodes endpoint remains backwards-compatible:

- `episodes` still contains completed episode numbers;
- `progress` adds per-episode coverage/resume/completion metadata.

The server reads progress in chunks, so a 500+ episode title does not generate one request per episode.

## Episode states

Each playable episode can display one of four states:

- **Сейчас** — the episode currently open on the watch page;
- **Завершено** — confirmed completion from the watch system;
- **N% просмотрено** — partial confirmed coverage;
- **Серия** — no confirmed progress.

Completed and partial states are derived from the existing AnimeBox watch system rather than a second tracking database.

Live `watch-progress` events update the current episode without requiring a page refresh.

## Desktop

Episodes use a horizontal rail.

The rail:

- keeps the current episode visible;
- auto-centres the current item when possible;
- uses restrained separators instead of rounded cards;
- exposes progress as a thin line;
- keeps artwork-free fallback fast and stable.

## Mobile

The same data becomes a vertical timeline.

Each row is touch-friendly and contains:

- episode number;
- human status;
- optional resume time;
- progress line;
- completion mark.

The old 4-column micro-button grid is overridden.

## Seasons

Season selection remains separate from franchise navigation.

The previous violet gradient/glow season cards are flattened into navigation tabs with an Iris underline.

## Long-running titles

Existing group/chunk logic is preserved.

Only the active episode group is rendered, so titles with hundreds of episodes remain practical.

Group controls are restyled as compact secondary navigation instead of card-like pills.

## Accessibility

Current episode links use `aria-current="page"`.

Every episode link receives a descriptive aria-label such as:

- "12 серия, сейчас смотрите";
- "11 серия, завершена";
- "10 серия, просмотрено 63%".

## Scope

The patch intentionally does not change:

- Kodik UI;
- auto-skip;
- auto-next;
- Watch Together synchronization;
- provider availability;
- comments;
- video sitemap;
- recommendation logic.

It changes the episode selection experience only.

## Follow-up

Real per-episode thumbnails can be added later as progressive enhancement once there is a trustworthy thumbnail source. The selector does not invent unrelated episode imagery.
