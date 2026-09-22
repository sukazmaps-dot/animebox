# AnimeBox 12.5.2 — Mobile Navigation + Catalog UX

## Feedback addressed
- phone primary navigation hides while scrolling down and returns on up-scroll;
- direction hysteresis prevents unpleasant micro-jitter;
- "Аниме" is renamed to "Каталог";
- Saved titles move inside Catalog;
- genre filtering becomes multi-select;
- Filters now contain genres, release year and ongoing/finished status;
- Mood stays a separate quick filter;
- Home numbering is removed;
- AnimeCard rating moves to the upper-right.

## Mobile navigation
The fixed bottom bar uses scroll travel rather than raw direction changes:
- down >= 34 px -> hide;
- up >= 24 px -> show;
- near page top -> always show;
- tiny 1–2 px movement is ignored.
Animation uses transform/opacity only.

## Catalog
/search now has Catalog and Saved views.
The Saved view reads the existing local favorites storage, so no migration is needed.
Old /favorites bookmarks redirect to /search?view=saved.

## Filters
Catalog supports:
- multiple genres (AND semantics through AniList genre_in);
- exact release year;
- ongoing / finished;
- mood remains outside the Filters drawer.

## Provider/API
AniList list requests now support genre_in, seasonYear and FINISHED.
The Shikimori Cyrillic fallback receives compatible genre/status/year parameters.
