# Episode controls — first UI patch

Scope: normal episode page E1–E6 and completed-title notification action. Room creation, authentication, sync, progress and player source callbacks retain their existing behavior. Watch Together's legacy player controls are deliberately left for patch two.

| Bug | Cause / owner | Change |
| --- | --- | --- |
| E1 | LibraryStatusControl: absolute menu inside isolated player | Portal native dialog in the browser top layer; existing save/removal callbacks and confirmation retained. Escape, outside click, focus return, arrows, Home/End and typeahead. |
| E2 | WatchControls: native translation/source selects | Shared ChoiceSelect with labelled listbox options and top-layer dialog; bottom sheet below 768 px. Source and translation callbacks unchanged. |
| E3 | AnimeNotificationControl and title page: terminal disabled action | Hide completed-title notifications, skip known-finished subscription fetch; ongoing inline notification is an accessible icon button. |
| E4 | WatchControls: crowded source settings and mismatched theater text | Episode / translation / settings / theater icon in one row. Quality explanation stays in settings at 12 px. |
| E5 | Episode page plus EpisodeList both owned a count | EpisodeList owns the single semantic heading and selected-season count. Season labels minimum 12 px in the episode page CSS Module. |
| E6 | WatchPartyPanel inline launcher: 9–12 px labels and small CTA | 14 px primary copy/CTA, 12 px secondary copy, 44 px action, responsive row. Creation callback unchanged. |

New reusable components: `components/ui/ChoiceSelect.tsx`, `FloatingMenu.tsx`, `ChoiceSelect.module.css`. Native dialog's top layer avoids z-index escalation and also works inside fullscreen. Existing status menu presentation moved to AnimeQuickActions.module.css; no new global stylesheet.

## Verification

- Mounted picker regression: keyboard opening, selected state, callback, close; completed notifications render nothing and do not fetch.
- Browser fixture at 1920×1080, 1366×768, 376×869: adversarial overlapping card, real LibraryStatusControl and WatchControls, custom source/voice selection, Escape/focus, no horizontal overflow, unchanged iframe identity.
- Existing compact-controls browser suite: 12 responsive interaction cases with actual route CSS, source/voice/episode actions and iframe continuity. Updated native-select assertions to custom-listbox interactions rather than dropping coverage.
- `tests/patch30-6-visual-contract.cjs` updated intentionally: E3 now requires absence of finished notification action rather than a passive finished status.
- Screenshots below are isolated component fixtures with mocked auth/community responses and a blank iframe, not production playback captures. They demonstrate menu stacking and responsiveness; production Kodik/Telegram and full-page visual QA remain release checks.

| Width | Before | After |
| --- | --- | --- |
| 1920 | [Before](../qa/episode-controls/before-1920.png) | [After](../qa/episode-controls/after-1920.png) |
| 1366 | [Before](../qa/episode-controls/before-1366.png) | [After](../qa/episode-controls/after-1366.png) |
| 376 | [Before](../qa/episode-controls/before-376.png) | [After](../qa/episode-controls/after-376.png) |
