# Patch 17.3 — Discovery & Personalization Engine

## Product goal

Move AnimeBox from one generic recommendation row to an explainable, Netflix-style
personalized discovery surface that learns from explicit and behavioral signals.

## Shipped in this patch

- Persistent recommendation feedback per authenticated user:
  - `like_more`
  - `not_interested`
  - `already_watched`
- Taste Graph v5 consumes explicit feedback together with:
  - library state
  - verified episode completion
  - recommendation click / plan / start / completion
- Multi-rail home recommendation deck:
  - strongest matches
  - dominant taste lane
  - short evening picks
  - controlled exploration
- Recommendation analytics attribution now continues through:
  - click
  - playback start
  - 15 minutes watched
  - 30 minutes watched
  - episode completion
- Rail-specific analytics sources allow comparing ranking lanes.
- Client-side local fallback keeps personalization useful for guests.

## Model strategy

This remains a hybrid explainable recommender rather than a black-box model:

1. explicit feedback
2. behavioral Taste Graph
3. content similarity (genres / duration / completion behavior)
4. quality and recency terms
5. controlled exploration
6. diversity reranking

Collaborative filtering is intentionally the next layer after enough interaction
volume exists; the data contracts added here are designed to feed it later.
