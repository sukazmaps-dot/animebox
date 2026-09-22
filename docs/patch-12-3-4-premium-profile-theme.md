# AnimeBox Patch 12.3.4 — Premium Profile Theme Completion

## Goal
Make the active Premium Studio palette control the entire profile page instead of only the hero/identity area.

## Implementation
No new API, entitlement or database logic is added.
The existing `premium-profile-custom` wrapper already owns Premium Studio CSS variables.

This patch adds compatibility aliases:
- --profile-theme-accent
- --profile-theme-primary
- --profile-theme-text
- --profile-theme-surface
- --profile-accent / --profile-accent-rgb

Older profile and streak rules therefore stop falling back to the default AnimeBox violet.

## Themed surfaces
- account progression / level orb;
- XP rail and Premium XP badge;
- streak/challenge shell and task counters;
- profile statistics;
- tracker status strip;
- library rows and actions;
- achievement section, showcase shell and progress rails;
- showcase editor controls/modal;
- bottom/profile actions and focus states.

## Rarity exception
Rare, epic and legendary achievement semantics keep their own rarity borders.
Premium themes the surrounding surface and progress treatment, not the meaning of rarity.

## Mobile
Premium colors remain active on mobile, but large-area glow is not reintroduced.

## Regression boundaries
No changes to:
- Premium entitlement lifecycle;
- Premium Studio persistence;
- animated avatar/banner media;
- crop transforms;
- streak calculation;
- progression calculation;
- player / watch progress;
- Supabase schema.

No migration required.
