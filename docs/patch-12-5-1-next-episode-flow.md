# AnimeBox 12.5.1 — Next Episode Flow

## Goal
Turn episode completion into an intentional product moment instead of an immediate technical redirect.

## Changes
- Normal playback now opens an AnimeBox end-state when media ends.
- If a next episode/season exists, an 8 second countdown starts.
- Viewer can continue immediately or cancel auto-next and remain on the page.
- Season boundaries continue to use the existing parent navigation, so the same end-state can lead into episode 1 of the next season.
- Watch Together keeps its existing immediate room-controlled end behavior.
- Before showing/navigating the end-state, the player asks the watch session to flush its final heartbeat with keepalive.
- Home Continue Watching now reads the signed-in viewer's scoped local crash journal rather than only guest local progress.

## Integrity
The end screen does not claim that server completion was confirmed.
Server coverage remains authoritative for completed status, progression, achievements and leaderboard time.

## Identity
The end-state uses the 12.4.5 / 12.5 visual grammar:
flat ink surface, small warm editorial marker, 6–10px geometry, one primary action, no violet halo.
