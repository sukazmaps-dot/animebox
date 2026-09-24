# Patch 16.6.2 — Readability & 2K Density

## Goal

Fix the "tiny UI on 2K" problem without applying global browser-style zoom.

The patch scales reading hierarchy and usable content width selectively across:

- normal desktop;
- 1440p / wide desktop;
- 2K;
- very wide / 4K;
- Telegram promo surfaces.

Mobile and tablet geometry from Patch 16.6 remains authoritative.

## Typography strategy

AnimeBox no longer treats a 2560px-wide desktop as a 1440px layout surrounded by empty space.

Large viewport contracts increase only the parts that need visual legibility:

- sidebar labels and utility copy;
- anime card titles and metadata;
- section headings;
- Top Anime labels;
- schedule metadata;
- episode comments;
- anime detail description/facts;
- profile widget metadata;
- rating secondary text.

Growth is capped. 4K does not scale indefinitely.

No global transform/zoom is used.

## Content width

Base desktop keeps the existing content width.

At larger viewports the page progressively expands:

- wide desktop: up to 1640px;
- 2K: up to 1800px;
- very wide / 4K: up to 1980px.

The right rail also grows modestly so the main catalogue does not leave an excessive empty canvas.

## Telegram promo fix

The Telegram card now owns its height through content instead of relying on inherited/stretch geometry.

Both variants are covered:

- compact Home placement;
- Watch Together community placement.

Changes:

- `height: fit-content`;
- previous large minimum heights reset;
- vector art receives a bounded content-sized column;
- copy controls the actual vertical size;
- CTA and benefit text become readable;
- mobile uses a compact two-column composition;
- very narrow phones hide the decorative vector art rather than stretching the card.

This addresses the screenshot where the Telegram block occupied a large empty surface while its actual content sat in the upper-left corner.

## 2K readability

At 1920px+ wide with sufficient height:

- sidebar width becomes 252px;
- sidebar text moves to ~13.5px;
- card titles to ~14px;
- metadata to ~11.5px;
- section titles to ~20px;
- comments to ~14.5px;
- content width grows to 1800px;
- topbar/search scale slightly.

The goal is legibility at normal viewing distance, not oversized UI.

## 4K cap

At 2400px+:

- body/secondary readability tokens increase slightly;
- content width caps at 1980px;
- card/comment text grows only one additional step.

This prevents the interface from becoming comically large on 4K displays.

## Quality gate

`readability-density:check` verifies:

- 1440p/wide contract exists;
- 2K contract exists;
- 4K contract exists;
- content width expansion exists;
- comment/card/sidebar readability rules remain;
- Telegram compact/community height reset remains;
- 16.6.2 stays the final CSS override layer.
