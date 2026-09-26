# AnimeBox Patch 18.9 — Premium Profile Identity / Atmosphere

## Product goal

Premium should feel like a personal identity layer, not a bundle of isolated toggles.
The profile must look distinctive within seconds while preserving AnimeBox readability,
performance and the rule that LVL/League frames are earned rather than purchased.

## Identity model

### Cinematic Hero
- Premium banner, avatar, frame, nickname and palette compose one hero scene.
- Hero styles: Cinematic, Spotlight, Clean.
- Avatar receives an ambient aura behind the equipped frame.
- Aura is light only and never creates a second cosmetic frame.

### Atmosphere Engine
Exactly one ambient effect can be active:
- None
- Aurora
- Embers
- Sakura
- Stardust

The engine uses CSS/SVG layers. It does not run a continuous JavaScript animation loop.

### Motion Mode
- Off — no premium motion.
- Soft — calm long-duration movement.
- Live — more visible motion.

Motion Off also selects static earned level-frame assets.
prefers-reduced-motion disables animation independently of the selected mode.

### Entrance
- None
- Fade
- Bloom
- Manga Cut
- Glitch

Entrance is short and can be replayed inside Premium Studio before saving.

### Nickname identity
- None
- Gradient
- Shimmer
- Glow

Only the username gets this effect. Body text remains readable and stable.

### Surfaces
- Glass — translucent blurred surfaces.
- Deep — dense game-style cards.
- Ink — strict dark surfaces without excessive glow.

## Premium Studio 2.0

New Atmosphere tab:
- atmosphere cards with visual thumbnails;
- atmosphere intensity;
- motion mode;
- nickname effect;
- entrance effect + replay;
- hero style;
- surface style.

Existing palette/media controls remain available.

## Adaptive profile palette

The user can derive a palette from:
- Premium avatar;
- Premium banner.

The client:
1. downsamples media to a tiny analysis bitmap;
2. ignores transparent, near-black and near-white noise;
3. groups nearby colors;
4. finds a dominant color and a more saturated accent candidate;
5. builds a dark AnimeBox Primary;
6. builds a bright Accent;
7. uses Smart Contrast for readable text.

The result stays editable manually before saving.

## Animated media crop

The crop editor renders the real IMG source instead of drawing a single frame to canvas.
GIF and Animated WebP therefore continue moving while the user drags and zooms.

## Milestone frame fit

Avatar safe zones:
- LVL 10 — 52%
- LVL 25 — 54%
- LVL 50 — 46%
- LVL 75 — 52%
- LVL 100 — 46%

The avatar must stay entirely inside the visible inner opening of each milestone frame.

## Premium profile presets

Existing presets remain, plus:
- Crimson Oath
- Ocean Glass
- Golden Hour

## Storage

premium_profile_settings adds:
- atmosphere_effect
- atmosphere_intensity
- motion_mode
- entrance_effect
- nickname_effect
- hero_style
- surface_style

All enum-like values are protected by DB CHECK constraints and API whitelist validation.

## Expired Premium

Stored settings remain.
Premium-only palette, motion and atmosphere are not applied without active entitlement.
Existing static media fallback behavior remains intact.

## Performance requirements

- no requestAnimationFrame particle engine;
- CSS/SVG motion only;
- at most 14 atmosphere particles desktop;
- reduced particle count on mobile;
- reduced-motion disables animations;
- Motion Off must have effectively zero ongoing animation cost;
- public profile stays server-rendered.

## Acceptance

- TypeScript passes.
- Targeted lint has zero errors.
- Retention regression checks pass.
- Production build passes.
- Profile editor API accepts old cached clients without new fields.
- New settings persist and render on public profiles.
- Animated crop preview stays animated.
- LVL/League one-frame rule remains unchanged.
