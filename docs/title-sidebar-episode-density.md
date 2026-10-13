# Title sidebar and episode controls density

## User-facing result

The title page no longer requires a tab click to reveal episodes. At desktop widths its 260px sidebar contains the poster, metadata, watch/resume, favorites/tracker, personal controls and Watch Together link. The main column contains the title, normalized genre links, readable synopsis, episodes, collapsible franchise, discussion and related titles. On phones the small poster remains beside the title and subsequent sections form one continuous page.

Synopsis is 16px/1.6. Only text longer than 1100 characters or more than three paragraphs collapses; ordinary descriptions render fully. Russian/English genre duplicates are normalized. Guest personal state is one login link; authenticated library/rating controls retain their existing save, clear, error and loading flows. Desktop topbar is 56px on the title route.

The episode page uses 44px source/mode buttons and 48px episode/translation selects with readable graphite surfaces and a purple active source. New inline library/notification variants preserve existing actions, menus, settings, messages and authentication. Progress percentage calculation/events remain unchanged; display is a 4px bar with a native details help control. Progress is directly below the player, personal actions precede Watch Together. Mobile season cards use short visible labels plus metadata and retain full title in accessible labels/tooltips, with a visible neighboring card and no swipe instruction.

## Verification

Local browser fixtures use actual React components and route CSS, replacing only server title data and external API responses. No fixture/config changes are part of the patch. Title checks passed at 360/390/768/1440/1920px: no horizontal page overflow, no content tabs, episodes visible, 16px synopsis, ordinary description fully displayed, poster dimensions preserved. Episode checks at 390px passed: sources and mode buttons >=44px, selects 48px, 44x44 mode controls, inline library/notification labels, 4px progress and no page errors. Screenshots inspected.

Turbopack's local development cache failed during QA; Webpack also encountered pre-existing non-pure CSS module selectors. A fresh temporary Turbopack output directory completed the checks. Production config and tsconfig are restored. Real provider playback, logged-in mutations and Telegram WebView are not exercised by these fixtures.

Release: require TypeScript, targeted lint, full prebuild/production build and GitHub Quality Gate; verify published title and episode pages after Railway SUCCESS. No database migration or new production dependency.
