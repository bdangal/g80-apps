# Validation and acceptance

## Desktop checks performed

Run from the repository root, with Node 18+:

```sh
node tools/generate.js
node tools/validate.js
node tests/run.js
node tests/negative-controls.js
node tools/package.js
node tools/validate.js dist/bishal_garage@0.1.0.tgz
```

The suite covers genuine ID8 XML/JSON consistency and five native controls; identities, UUIDs and versions; no fixed applet ID; source-linker import restrictions; SDK/credential path rejection; reproducible source packing; upstream linker parsing; lifecycle, renamed runtime ID and entry mapping; native focus/push, duplicate event suppression, touch tap/cancel/swipe, vertical/rail drag rejection, visibility and shutdown; explicit live/demo separation; boost unit/reference/ambient handling, vacuum, ethanol independence, timestamps, stale/disconnected handling, temperature conversion, future-timestamp recovery and individual Overview statuses.

Current result: **86 tests passed** and **63 in-memory negative controls rejected**. New coverage includes review fixes (a scan interrupted by hiding or failing never reads as fault-free, response-pending keeps its 10 s wait, first full answer per unit wins, tire-pressure unit fixed once so a flat tire stays low, g offset learned only from fresh standstill speed, US-unit Peaks summary, an upshift keeps the previous gear's pull), the read-only diagnostic guard (clear/session/write/routine requests throw), DTC decoding, fault scan pausing OBD and ignoring other apps' replies, drag 1/8 and 1/4 timing, brake-test trigger and distance, gap/stale rejection, live-only peaks, sample-labelled demo fault codes, shift-light progression, grouped navigation covering every page once, US-only units on every page and summary, the E50 blend planner (conservative E70/E10 bounds, exact E50 landing, partial-fill and over-E50 cases, no estimate from stale readings), the pull timer (interpolated 0-60/60-130, last three kept, data gaps and lift-offs rejected, demo times never shown live), the Figma M panel behind the car, the 7th Balkan Automotive page (last tab, uncensored slogan, flag mosaic), M sport-rail tracks, one-pixel backdrop diagonals, imperial/metric values and endpoints, null-preserving Fahrenheit conversion, saved unit choice/legacy migration, tab hit routing, My Gauges swipes, immediate numbers versus eased indicators, invalid-indicator clearing, tabular digits/degree glyph, bounds/single DEMO badge, rapid native presses/overlapping component-raw pairs canvas-level fixture disclosure and local vector tab icons/checkered flag geometry, a single red sponsor subtitle, and truthful corn-yellow ethanol companions beneath every fuel instrument. G80 tachometer checks cover independent 0/5000/8000 geometry, tick labels, current-zero/over-range markers, immediate numbers versus eased position, retained-state invalidation, and shared layouts. OEM sport-bar tests cover zero/no-fill, EST. power, stale suppression and unit conversion. Vehicle-stage/technical-atlas checks cover proportion, local type and edge detail. The preserved acquisition regressions cover actual-vs-commanded pressure, synchronized ambient, power basis, invalid sentinels, support discovery and lifecycle cancellation. Working source is not modified. The font case-key regression was also checked by actually reverting its dictionary, rebaking and observing `Missing ASCII glyph 65`, then restoring the fixed assets.

All eight runtime modules were syntax-checked with an actual **Node 8.16.2** executable. Tools and tests use desktop Node; they are not head-unit modules. XML was also parsed independently using PowerShell's XML parser. Renderer LINE/RECT/IMAGE and bitmap text payloads and image premultiplication were reviewed against the pinned upstream daemon/client. These are source/protocol checks, not a GPU/head-unit execution claim.

## Browser verification

- Visually inspected the supplied factory cluster photo as primary reference; palette, geometry and typography decisions are in `DESIGN.md`.
- Captured all 15 pages in demo and disconnected states at 1440×382, plus the demo fault scan, editor, settings, stale/unavailable and estimated-power fixtures (40 PNG files, all newer than the latest source change).
- Full car artwork remains inside its proportional image rectangle, clear of text and gauges.
- Shared app canvas is 1440×382. The inspected desktop app region reported equal client/scroll dimensions, with no internal overflow or vertical scrolling.
- Demo/current values and explicit failure states are exercised by browser controls and unit tests. Synthetic live-looking states always carry TEST FIXTURE / NOT VEHICLE inside the canvas, independent of the hidden developer wrapper. Demo → fixture → demo transitions were exercised.
- Settings changed by visible controls persisted across reload; imperial default was restored after testing. Shared native focus/push behavior is mocked in tests. A browser_key probe delivered an empty key string in this panel, so keyboard focus/push was additionally exercised with an explicit DOM KeyboardEvent and focused-button click, not claimed as a successful physical-key tool test.
- Native touch/controller behavior is still mocked until verified on the car. Desktop keyboard/pointer behavior is not a substitute for a physical iDrive check.

Captures: `screenshots/index.html`. They are desktop app-area renders, not in-car screenshots.

## Publishing checks

The source artifact has `mgu-app.json` at its root. It is **not a standalone OAP release asset**. Repo-tree `build:unit` or a catalog carrying `build:unit` invokes the unit's linker. Default generated relative artifact URLs are valid for folder/HTTPS catalogs; public GitHub catalog releases require `--github OWNER/g80-apps --tag catalog`. Private GitHub releases require the documented authenticated asset API URL after upload.

`private/` donor-linked output, SDK/donor folders, credentials, tools and generated dist are ignored. Review the staged Git list before publishing anyway. No remote source is trusted or credentials configured automatically.

## Still not performed

- A real stock ID8 donor-linked build. No donor or BMW SDK is available here.
- Installation/start on this particular 2023 G80 M3 Competition xDrive head unit.
- Physical touch routing, rotary focus/push, BACK/HOME, camera/pop-up foreground behavior or renderer performance measurement.
- Verification of firmware-specific optional SDK status-report methods. Their absence/rejection is handled, but actual SDK execution is unproven.
- **Physical vehicle-data execution/calibration.** Native getters and read-only supported OBD acquisition are implemented and mocked, but not exercised on the actual unit. Source evidence, receive-time freshness limits, shared-TASU correlation limits and still-unmapped metrics are listed in `DATA.md`.

## In-car acceptance checklist

Perform while parked after following the Store's normal installation/restart flow:

- [ ] Source app lists only for ID8, identity `bishal_garage`, version `0.1.0`; existing source/update channel remains correct.
- [ ] Store resolves `mgu-render >=0.3.0`; linked package uses the unit's stock donor, with no SDK fetched from this repository.
- [ ] Tile opens the mapped garage state; app starts **Live / Disconnected** with no invented numeric values.
- [ ] Explicit Data mode selection enables a conspicuously labeled demo; returning to live restores unavailable/disconnected readings, not a cached demo.
- [ ] All six pages fit the reported app area with complete car artwork, visible page name and `n / 6` indicator.
- [ ] All pages show consistent blue/red angular instruments; unsupported power remains `--`; synchronized torque/RPM-derived power is explicitly labeled EST. LIVE, never dyno/wheel power. Check zero/full-scale marker clearance and temperatures in both unit presets.
- [ ] Previous/next wrap, touch body swipes work where routing is supported, and native rotary/push focus remains coherent after touches.
- [ ] Vertical and bottom-navigation drags/cancel do not activate actions; BACK/HOME returns to the HMI without trapping input.
- [ ] HMI popups/camera/covered state remove graphics/input ownership; returning restores them without a stale hide timer.
- [ ] Native fallback shows meaningful state summary/navigation if the renderer is unavailable.
- [ ] My Gauges is last; touch instruments and native five-action editor both work, three distinct selections and display units persist across app restart, reset works, and storage failure is visibly reported.
- [ ] About/version and the single red header subtitle display correctly; closing/reopening/shutdown releases resources.
- [ ] Validate the implemented native getters and OBD channels against independent instrumentation: actual member, unit, reference, invalid sentinels, and receive-time vs ECU sample age. Check native service loss, PID refusal, pressure fallback, and estimated power dependencies. Do not run another diagnostic client concurrently during validation. Verify ethanol from a real ethanol-content source and boost against actual absolute/gauge semantics.

Do not mark unchecked vehicle items passed based on desktop tests.
