# Patch 17.4 — Watch Experience & Service Reliability

## Goal

Move AnimeBox from feature-complete viewing toward service-grade viewing:
temporary provider/network failures should not destroy playback or progress,
and the home page should prioritize useful actions without oversized empty UI.

## This delivery

### Home / recommendations
- Larger heart and "already watched" controls.
- Preserves the endless personalized recommendation rail.
- Fixes the legacy desktop CSS rule that stretched footer cards into giant
  one-column surfaces after they were moved out of the right rail.
- Compact 3-column desktop service footer, 2-column tablet, 1-column mobile.
- Correct Telegram analytics placement: `home_footer`.

### Watch reliability
- Local progress remains the crash/offline journal.
- Network loss is presented as a non-blocking synchronization state.
- `online` immediately retries progress sync instead of waiting for the next
  heartbeat interval.
- Invalid/expired watch sessions (404/409/410) are recreated automatically.
- Player displays recovery status without blocking playback.

### Existing core contracts locked by regression check
- Cross-device/server resume.
- Automatic source fallback.
- Next episode and next season navigation.
- Endless recommendation pagination.

## Next tranche inside 17.4

- Watch Together reconnect/host lifecycle hardening.
- participant count / room presence reliability.
- mobile player selector audit.
- provider health telemetry and admin status surface.
