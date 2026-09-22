# Patch 12.3 — Home Retention v2

## Goal

Turn the AnimeBox home page into a return surface that reacts to the user's current viewing state without adding a second recommendation system or a new backend pipeline.

## Added

- "Вернуться сегодня" positioning for Continue Watching.
- Server recent-watch sample increased from 4 to 12 titles while the visible Continue Watching rail remains capped at 4.
- A compact retention hub with:
  - a fresh/releasing episode from the user's watched titles;
  - a title with only 1–3 episodes left;
  - a delayed, relevant public Watch Together room for a title already connected to the user's history.
- Relevant room discovery is delayed by 3.2 seconds and only runs for authenticated users with personal anime ids, so it does not compete with Home LCP.
- Mobile retention hub is a horizontal snap rail instead of another stacked dashboard panel.

## Analytics

New product events:
- home_retention_impression
- home_section_view
- home_resume_click
- new_episode_click
- near_completion_click

Existing watch_party_public_join_click is reused for Home room joins.

## Preserved

- Continue Watching attribution and playback-start funnel.
- Existing personal schedule.
- Home Hero LCP loading strategy.
- Mood recommendations and infinite recommendation rail.
- Premium media, streaks, tracker, Telegram Mini App and player logic.

No database migration is required.
