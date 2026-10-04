# Hotfix 28.1 — Recommendation Rail Momentum

Reported behavior: rapid horizontal scrolling can make the recommendation rail jump backwards.

Code inspection found two sources of involuntary position changes: virtual windows remove/insert native snap targets during a gesture, and updateVirtualWindow writes scrollLeft when the measured card stride changes. A third vulnerable point is the first appended page crossing the DOM virtualization threshold before geometry has been measured.

Changes:

- Rows configured for virtualization disable native scroll snapping and scroll anchoring for their entire mounted lifetime, including before the first paginated append.
- Native touch/trackpad momentum owns scrollLeft: geometry measurement no longer adjusts the offset.
- Card geometry is measured before virtualization activates, so crossing the threshold can render spacers using an existing width.
- Arrow clicks use an accumulated absolute target for successive clicks in the same direction. A deliberate pointer/wheel/keyboard interaction clears the arrow target; reversal uses the actual current position.
- Existing pagination, bounded DOM window, append-only recommendation identity and per-rail request ownership are preserved.

Acceptance: fast forward gestures do not produce programmatic backwards writes; appending past 36 cards retains spacer geometry; repeated forward arrow clicks accumulate their destination; intentional backwards navigation remains available; reduced-motion and normal rows remain compatible.

Regression test runs the actual ScrollRow component with a mocked track and hook lifecycle. It checks measurement/append/width changes without scrollLeft writes, stable styling before virtualization, first virtual spacer generation and two rapid arrow targets (640 -> 1280). New test is wired after the required first release consolidation gate.

Limits: the component regression test does not simulate a browser's native inertial scrolling engine. Device-level swipe verification remains a separate check; do not claim it passed from this test alone. No API, SQL or recommendation scoring change.
