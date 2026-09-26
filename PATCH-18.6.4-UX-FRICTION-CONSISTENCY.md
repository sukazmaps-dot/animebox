# Patch 18.6.4 — UX Friction & Consistency

## Mission

Fix concrete friction visible in everyday AnimeBox use without turning one
person's aesthetic feedback into a site-wide redesign.

## Scope

### Anime navigation continuity

- Keep Next App Router prefetch enabled explicitly on catalog/home anime cards.
- Replace the detached `ANIMEBOX CINEMA` route loader with a skeleton matching
  the actual anime hero geometry.
- Reserve poster, heading, description and controls space during navigation.
- Do not add a client-side prefetch scheduler or new dependency.

### Recommendation actions

The existing home override placed the three preference controls above a
full-width `В список` row. When a rail is partially clipped by the viewport,
the plan action can read like a separate strip under the card.

Patch 18.6.4:
- keeps `В список` inside the card action footer;
- places it before secondary preference controls;
- removes the decorative circle around the plus/check state icon;
- removes the heavy gradient/glow from this secondary action;
- preserves saved/auth/error feedback;
- keeps preference actions because they train Taste Graph.

### Search wording

- `Умный поиск` is removed from user-facing placeholder copy.
- Search intelligence remains unchanged.
- New wording: `Найди аниме по названию...`.

### Player density

- Playback engine and source orchestration are untouched.
- The explanatory paragraph directly below the player is removed because the
  page already repeats title, episode and progress context below.
- A compact episode/title + “Все серии” navigation context remains.

### Telegram Mini App

No speculative redesign. Existing real protections remain required:
- Mini App launch detection;
- fail-closed subscription state only inside the confirmed app;
- logo fallback;
- activated-event membership recheck.

## Explicit non-goals

- no sidebar redesign;
- no recommendation algorithm rewrite;
- no Premium work;
- no Watch Together redesign;
- no hiding all card actions under an ellipsis;
- no new global stylesheet;
- no increase to CSS/JS budgets.

## Acceptance

1. The top bar no longer says “Умный поиск”.
2. Anime-card links retain App Router prefetch.
3. Anime navigation loading looks like the destination page, not a separate
   splash screen.
4. “В список” visually belongs to the recommendation card footer.
5. Secondary feedback controls stay available.
6. Player page no longer explains progress/navigation twice in adjacent blocks.
7. Telegram Mini App safety behavior is unchanged.
8. Node 22 TypeScript, targeted ESLint, regression gates and production build
   remain green.
