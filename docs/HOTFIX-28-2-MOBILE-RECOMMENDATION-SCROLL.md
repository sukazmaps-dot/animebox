# Hotfix 28.2 — Mobile recommendation momentum

Follow-up to 28.1: keep the virtual DOM window stable during finger-driven scrolling and the inertial tail after touchend. Track touchstart/touchend/touchcancel and passive scroll events independently of React callback rebindings. A single 180ms quiet-period timer ends momentum; every inertial scroll rearms it.

While momentum is active, keep the current window if it covers all visible cards. If a fast fling reaches beyond that window, advance immediately rather than rendering an empty viewport. After settling, refresh the normal overscan window. Never write scrollLeft to restore an anchor.

Touch scrolling prefetches at 2.5 viewport widths before the loaded edge, instead of the default 0.55 viewport threshold. Existing hasMore/loading/latch guards still bound requests. Desktop threshold and existing snap-disabled virtual row policy remain unchanged.

All listeners are passive; no preventDefault or custom drag handler replaces native scrolling. Unmount clears listeners/timer. No API/SQL/ranking changes.

Tests execute the actual ScrollRow component with touch event/timer mocks: stable covered window, inertia after finger release, one rearmed timer, refresh after settling, far-fling window coverage, zero programmatic position writes and cleanup. Tests do not emulate the native iOS/Android scrolling engine; physical-device verification remains pending.
