# User guide

## Field observer
1. Sign in with the account your administrator created. You see **your assigned point** (e.g. `E01 - ENTRY`) at the top; if you have none, recording is disabled so nothing is saved at the wrong place.
2. When a vehicle passes: tap its **last 3 digits** on the keypad (or type; Persian digits work; or use the voice button, which only fills the field - check it, then record). Exactly three digits are required; keep leading zeros (`042`).
3. Optionally tap the vehicle category (never required; it is remembered as your default).
4. Press **Record**. A green message confirms it. The same suffix twice is allowed (two vehicles can share a suffix); a short warning appears if the same number was entered seconds ago.
5. Wrong entry? Use the trash icon beside it within 10 minutes (supervisors can undo any entry). The entry is marked undone, not erased.
6. **No internet?** Keep recording. Entries are stored on the phone with their real time and the badge shows how many are waiting. They upload automatically when the connection returns. If the server refuses an item (for example, the study was closed) it stays on the list in red with the reason - tell your supervisor.
7. Tips: keep the phone charged, keep the screen on, use the keypad at peak hours.

## Supervisor
* **Dashboard** - totals, entries/exits, matched, match rate, ambiguous, unmatched, mean travel time, volume per interval, category and point distributions.
* **Vehicle matching** - set the feasible travel-time window, optional time range and categories, run. Matches are *probable* journeys. For each **ambiguous** case (same suffix, several possible partners) compare candidates and **Confirm** one or **Reject** a pair; decisions are stored and kept on every re-run.
* **OD matrix and travel time** - counts or shares, travel-time statistics and percentiles, average journey speed per route (only where the route distance is configured).
* **Reports** - Excel, CSV, and a printable report (browser *Print / Save as PDF*).

## Administrator
* **Accounts and categories** - create observers/supervisors, deactivate, reset a password, edit the vehicle category list.
* **Studies and map** - create a study (DRAFT), upload a schematic map (PNG/JPG/SVG up to 1 MB) or use the grid, add ENTRY/EXIT points and drag them into place, enter route distances, assign observers to points (optional time period), then set the study **ACTIVE**. Set it **COMPLETED** to stop recording. Points that already have observations cannot be removed.
* Optional **retention**: observations are deleted automatically that many days after the study date.
* The DEMO study (if present) holds synthetic data and can be reset from the dashboard.

## Good practice for field surveys
Stand with a clear view of the rear plates, cover each lane group, synchronise phone clocks (automatic network time), record every vehicle or a stated sample, and record the study conditions (weather, incidents) in the study description. Always report matching results as *probable* journeys with the ambiguous and unmatched counts next to them.
