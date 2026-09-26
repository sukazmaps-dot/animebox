# AnimeBox Patch 18.9.2 — Mobile Premium Studio & Social Mini Profile

## Goal

Make Premium customization usable on a narrow phone without losing the desktop editor,
and make Premium identity visible wherever users interact socially.

## Mobile Premium Studio

### Floating live preview
On screens below 768px:
- the inline desktop preview is removed from document flow;
- a fixed FAB stays above the mobile navigation;
- the FAB uses the current avatar and a compact eye badge;
- unsaved changes add a small accent dot.

### BottomSheet preview
Tapping the FAB opens a modal BottomSheet:
- live Premium profile preview;
- atmosphere, palette, hero, surface and nickname changes update immediately;
- Escape, backdrop and explicit close button close the sheet;
- body scroll is locked while open;
- Continue editing and Save actions are available;
- reduced-motion removes entrance transitions.

The desktop preview and mobile sheet use the same PremiumStudioLivePreview component.

### Compact controls
Below 768px:
- atmosphere cards become a horizontal snap carousel;
- segmented controls stay on one line and scroll horizontally;
- Studio tabs can scroll horizontally;
- effect rows stack their label and controls vertically;
- settings remain full-width.

## Milestone avatar fit

The previous LVL 50 / LVL 100 safe-zone was too small.

Final target:
- LVL 10: 52%
- LVL 25: 54%
- LVL 50: 56%
- LVL 75: 52%
- LVL 100: 56%

The same geometry is used by the full profile, editor and mini-profile.

## Shared Premium mini-profile

ProfilePreview is the canonical social profile card.

Premium mini-profile supports:
- selected profile palette;
- atmosphere effect;
- atmosphere intensity;
- Motion Off / Soft / Live;
- entrance personality;
- nickname Gradient / Shimmer / Glow;
- compact Hero personality;
- compact Surface personality;
- avatar aura;
- static media and static milestone frame when Motion is Off;
- reduced-motion fallback.

The mini card intentionally uses fewer particles than the full profile.

## Chat integration

### Global Chat
Avatar, username and known @mentions open ProfilePreview rather than immediately
navigating away from the conversation.

The full profile remains available through Профиль → inside the mini card.

### Watch Together
Watch Together already uses the shared ProfilePreview for participants, chat avatars
and chat usernames. The 18.9.2 Premium mini-profile upgrade therefore applies there
without another profile implementation.

### Comments
Episode/community comments already use the same ProfilePreview; they receive the same
identity effects automatically.

## Performance

- no new requestAnimationFrame loop;
- mini-profile particles capped below the full profile density;
- mobile mini-profile uses even fewer particles;
- Motion Off disables persistent animation;
- prefers-reduced-motion disables atmosphere motion;
- profile preview data keeps a 60-second client cache.

## Acceptance

- TypeScript passes;
- targeted lint has zero errors;
- product/retention regression passes;
- production build passes;
- 399px Premium Studio never requires scrolling back to the top to inspect changes;
- mobile atmosphere choices no longer create a tall vertical list;
- global chat profile clicks keep the user in chat;
- Watch Together and comments share the upgraded mini-profile;
- LVL 50 avatar visually fills the inner Crimson Sigil opening without crossing the ring.