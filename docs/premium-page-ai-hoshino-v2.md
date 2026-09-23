# AnimeBox Premium Page v2 — Ai Hoshino Hero

## Goal
Turn `/premium` into a recognisable AnimeBox premium scene instead of a generic subscription page. The page keeps every existing payment/lifecycle flow intact while adopting the Dark Anime Aurora visual language introduced by the Visual Language patch.

## Visual direction
- Dark navy/black layered surfaces.
- Local violet/pink glow rather than full-page neon.
- One emotional character anchor: the user-provided Ai Hoshino image.
- Vector-only interface decoration: icon cores, luminous spines and CSS sparkles.
- Two CTA families: primary glow and secondary glass, both 44px high.
- Motion vocabulary: transform-only image drift, sparkle pulse, card lift. The hero copy remains completely static so the mascot never pulls text with it.
- `prefers-reduced-motion` / `useReducedMotion` respected.

## Page structure
1. **Premium Hero**
   - Left: product promise, three compact value chips, dynamic CTA, current Premium lifecycle state.
   - Copy emphasises profile personalisation, +20% XP, expanded Watch Together rooms and platform support.
   - Both primary and secondary hero CTAs use the same 44px height.
   - Right: Ai Hoshino hero art, softly blended into violet/pink aura.
2. **Premium Benefits**
   - Six icon-led benefits using AnimeBox Icon Core styling.
   - Muted uppercase section label and layered glass cards (`slate-900/40`, blur, subtle slate border).
3. **Support Story**
   - Explain that Premium helps pay for infrastructure and product development.
   - Keep sponsorship and Premium as separate concepts.
4. **Plans**
   - Preserve Telegram Stars recurring/yearly purchase logic.
   - Add clear disclosure that third-party iframe player ads may remain.
5. **Boosty / payment history / lifecycle**
   - Existing behaviour unchanged.
6. **Final CTA**
   - Premium users go to Premium Studio.
   - Non-premium users go back to the plans section.

## Asset policy
- Final character asset is WebP only: `/public/premium/ai-hoshino-premium-hero.webp`.
- No AI-generated imagery.
- Character art supplied by the user is used as a single hero anchor, not repeated throughout the page.

## Non-goals
- No schema or payment API changes.
- No changes to Telegram Stars invoice creation, Boosty verification or entitlement lifecycle.
- No payment/lifecycle behaviour changes in this visual patch.
