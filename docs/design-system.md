# AnimeBox Design System v1

AnimeBox should look like one product, not a collection of individually decorated screens.

## Product visual ratio

- 70% quiet dark surfaces
- 20% brand violet accents
- 10% special effects

The accent is used to establish hierarchy, not to decorate every container.

## Core tokens

Runtime tokens live in `app/globals.css`:

- `--ab-bg`
- `--ab-surface-1`
- `--ab-surface-2`
- `--ab-surface-3`
- `--ab-border`
- `--ab-border-strong`
- `--ab-text`
- `--ab-muted`
- `--ab-accent`
- `--ab-accent-soft`
- `--ab-success`
- `--ab-warning`
- `--ab-danger`
- `--ab-radius-sm` = 8px
- `--ab-radius-md` = 12px
- `--ab-radius-lg` = 18px
- `--ab-radius-xl` = 24px

Do not introduce a new almost-identical shade or radius when a token already expresses the role.

## Surfaces

Default card:
- flat `--ab-surface-1`
- 1px `--ab-border`
- 12px radius
- no glow
- no decorative radial gradient

Nested card:
- `--ab-surface-2`
- subtle border only when separation is necessary

Large hero:
- may use artwork/backdrop supplied by actual anime content
- should not add a decorative purple orb simply to fill space
- prefer an accent rail, image, data or typography

## Special effects

Glow is reserved for:
- Legendary achievement
- Premium-specific state
- leaderboard first place
- achievement/level unlock celebration
- focused primary action when necessary

Do not add glow to ordinary cards, filters, empty states, navigation or every hover.

## Typography

Use:
- body: 400–500
- controls: 600–650
- headings: 700–760
- display numbers only: up to 800

Avoid 900/950 as the default UI weight.

Small section labels should read naturally. Do not put an uppercase English eyebrow above every page title.

Good:
- `AnimeBox · Задания`
- `Ежедневные`
- `История сезонов`

Avoid:
- `ANIMEBOX EXPERIENCE`
- `PREMIUM PROGRESSION SYSTEM`
- generic marketing copy above functional screens

## Radius scale

Only use:
- 8px — buttons, tabs, compact controls
- 12px — cards and nested panels
- 18px — major sections and heroes
- 24px — rare oversized containers/modal shells

Pills are only for semantic badges: Premium, rank, status, season title. Filters should normally be tabs or compact rectangular controls.

## Motion

Motion must communicate state.

Allowed:
- card hover: translateY(-2px)
- progress changes
- tab transitions
- modal entrance
- achievement / level celebration

Avoid:
- scaling every card
- glow growing on every hover
- simultaneous blur + scale + rotate for normal controls

Respect `prefers-reduced-motion`.

## Brand motif

AnimeBox uses a short violet accent rail as its recurring structural motif:
- section headings
- selected navigation
- important content panels

Prefer this rail over decorative purple clouds or random gradients.

## Copy

Functional copy beats generic marketing copy.

Prefer:
- `Продолжить просмотр`
- `3 серии до завершения`
- `Серия появится в плеере — пришлём уведомление`

Avoid:
- `Погрузись в уникальный мир персонального опыта`

## Exceptions

A visually rich treatment is justified when the state itself is rare:
- Legendary unlock
- Top-1 podium
- Premium profile treatment
- launch/event campaign

The exception should feel special because the rest of the product is restrained.

## Review checklist for every new UI patch

Before merging:
1. Does this introduce a new color/radius instead of using tokens?
2. Is a radial gradient actually carrying meaning?
3. Is this badge semantically a badge, or just text inside a pill?
4. Would the hierarchy still work with all glow removed?
5. Is the copy specific to the user's task?
6. Does mobile preserve the same hierarchy?
7. Are empty/loading/error states handled?
8. Does the page have its own composition rather than repeating hero → stats → tabs → card grid without reason?
