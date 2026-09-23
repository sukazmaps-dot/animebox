# Patch 14.1.1 — Anti-AI Design Pass

## Goal

Reduce the visual patterns that make AnimeBox feel like a generated premium SaaS dashboard.

This patch does not redesign product flows. It changes presentation grammar on top of the 14.1 Visual Foundation so later 14.x patches inherit a more distinctive baseline.

## What is being removed

The pass specifically targets:

- every feature living inside a rounded glowing card;
- violet glow being used as a default separator;
- large decorative radial gradients with no product meaning;
- pill-shaped controls everywhere;
- uppercase micro-labels with exaggerated letter spacing;
- repeated symmetric feature-card grids;
- glossy poster shine and decorative "AI premium" treatments.

## Home shortcuts

The four Home shortcuts are now an editorial navigation strip.

They use separators, type hierarchy and arrows instead of four independent rounded feature cards.

On phones the strip becomes a restrained 2×2 utility grid without floating-card styling.

## Activation surface

The guest/personalization activation block is no longer a neon conversion banner.

It now uses:

- normal page separators;
- quieter step rows;
- no decorative blurred orb;
- neutral secondary actions;
- Iris only for the primary action/state.

## Mood picker

Mood selection is treated as a tool.

The active state is a simple Iris rail and subtle wash instead of a glowing selected card.

## Retention hub

"Твой вечер" becomes an editorial rail instead of several glass cards inside another card.

Each signal is separated structurally, and hover feedback no longer relies on glow or floating motion.

## Anime cards

Poster art remains the primary visual object.

The patch removes decorative shine, suppresses unnecessary badge shadows and flattens recommendation-match chrome.

## Microcopy

Several dashboard-style all-caps labels were changed to normal human sentence case:

- Твой AnimeBox
- Собери свой AnimeBox
- Твой вечер
- Новая серия
- Сегодня
- Финиш рядом
- Смотрят сейчас

CSS also prevents these surfaces from reintroducing forced uppercase styling.

## What stays

AnimeBox keeps:

- the dark Ink canvas;
- Iris as its identity/action color;
- anime artwork as the strongest visual element;
- feature surfaces where a large surface is actually justified;
- clear status color for semantic states.

The goal is not minimalism for its own sake. It is a recognisable product hierarchy rather than a collection of generated decorative cards.

## Next

14.2 will apply the same grammar to the mobile shell and navigation rather than introducing a second design language.
