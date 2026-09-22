# AnimeBox 12.5.3 — Anime page visual layout hotfix

## Issues fixed from screenshots
- Home Hero still showed the decorative "01 / 06" counter after numbering was meant to be removed.
- Season/Episode block used a full-width vertical stack even when a title had one part and one episode.
- content-visibility intrinsic placeholders could reserve hundreds of pixels around the library/franchise sections.
- Personal AnimeBox cards had mismatched visual density, especially the Telegram notification card.
- Franchise categories with one item each stacked vertically and left most of desktop width unused.

## Changes
- Removed Hero numeric counter from JSX.
- EpisodeList gains semantic layout hooks and a desktop two-column composition:
  parts/seasons on the left, episode content on the right.
- Mobile keeps the existing horizontal season rail.
- Personal cards are compacted and the Telegram card uses a 3-column media/copy/action layout.
- Disabled intrinsic placeholder sizing for the affected title-page sections.
- Franchise category groups become a two-column desktop grid; large categories span the full row.
- No API, tracking, episode availability or library logic changed.
