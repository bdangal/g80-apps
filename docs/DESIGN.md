# Cluster-inspired M design

## Primary visual reference

The user's factory BMW M instrument-cluster photograph supplied on November 20, 2026 is the primary reference for this refinement. It shows near-black/navy planes, blue perimeter contours on the left, red contours on the right, clipped corners, inset parallel lines, white numeric readings and quieter supporting labels. The asymmetric angular speed/RPM surrounds are translated into a wide infotainment composition, not used as a screenshot background or presented as a pixel-identical factory UI. The photograph is not redistributed in the application.

Additional user-supplied ID8 photos show the My BMW blue diagonal vehicle stage, M Setup's quiet labels/spacing, and the sport display's thin red chamfered hp/lb-ft bars. Those geometries are recreated as local draw operations, not pasted-in angled photographs. Host climate controls, status icons and app rails are not duplicated in this app.

Earlier secondary references were BMW's OS8 M Setup article (https://www.bmw-m.com/en/topics/magazine-article-pool/how-to-configure-m-setup.html) and the G80 curved-display walkthrough https://www.youtube.com/watch?v=ns99wy2oAxM. The supplied cluster photo supersedes them for instrument geometry.

## Shared language

- Logical canvas: **1440×382**, fitted into the renderer's reported appArea. The reference allocation is 2880×764 at y=76; host-owned surrounding UI is not redrawn or removed.
- Near black `#080e18`, navy facets `#0d1624` / `#101d30`, quiet contours `#263b56`, blue `#389cff`, M-red `#eb405c`, white `#f3f6fc`. Amber identifies simulation/validity, not engine-health thresholds.
- One 46px header: app identity with its single red subtitle, page, pagination and compact data status. One 48px bottom navigation strip. Stable content region between them; no vertical app scrolling.
- Midnight Purple remains in the original vehicle artwork, not gauge rings or focus colors. No purple UI, gradients, glow, glass, drop shadows or fabricated M logo.
- The single red 14px “Powered by Balkan Automotive” subtitle sits directly below the app name. No repeated shop credit appears in About, native summaries or page footers. Version and detailed caveats are in About / Settings or the developer view.

## Universal M theme and Balkan page

The Performance page sets the theme for every page: navy diagonal backdrop bands, a blue/dark-blue/red M stripe in the header, blue segmented horseshoe gauges, the red chevron tachometer, and chamfered sport rails. Fuel, temperature and RPM tracks all use those rails: an outlined housing in blue (or M red for oil), a solid fill, ten quiet ticks and a slanted white marker. Large diagonals are scan-converted at one-pixel rows (two-pixel for card facets) so their edges don't show stair steps.

The seventh, last tab is **Balkan Automotive**: the shop's own logo (transparent, 495 px wide, centred where the old flag B was) beside a blue/dark-blue/red M stripe, the shop name, and the uncensored slogan **BRING YOUR FUCKING BMW HERE.**, with FUCKING in M red. The page shows no vehicle data.

## Typography and artwork

No BMW font program or standalone reusable M-logo artwork was supplied. The app does not approximate the M logo with a text character. It uses a locally baked **48px hybrid atlas**: Segoe UI labels and baseline-aligned **Bahnschrift SemiBold tabular numerals** as the readable technical fallback, plus a degree glyph. These are installed Windows faces, not a claim to possess BMW's proprietary font. Larger source glyphs improve primary-reading sharpness versus the previous 32px atlas. Page titles are compact, numeric values 34–77px, units 17–24px, supporting labels 12–17px. The same atlas and glyph metrics drive Canvas preview and GPU draw operations. Actual browser rendering was inspected at 1440×382; no Windows font program is packaged.

The supplied transparent G80 image remains unchanged at 1024×577 and is drawn at **530×298.64**, larger than the previous 445px width. Full image bounds and original proportions are preserved, including mirrors, splitter, Midnight Purple finish, grille and ACC details. It is not tinted, masked or cropped. An ID8-inspired blue parallelogram stage sits behind it, with fine one-pixel scan bands for its high-contrast diagonal edges. The native icon uses original blue/red angular contours rather than a counterfeit brand mark.

## Instruments and page purposes

All instruments share status-aware values, display conversion, precision, scale endpoints and visual interpolation. Pressure/ethanol horseshoe tracks use separated segments, nine precise ticks, numeric minimum/midpoint/maximum labels and a white position marker. RPM uses the factory-photo right-side chevron: 0 at bottom, 5 at the corner, 8 at top, linear vertical spacing, half-thousand ticks, 1/min x 1000, inset M-red contours and a white marker. That tachometer is shared by Performance, Live Pulls and an RPM-selected My Gauges slot. Power/torque use the supplied sport-display photo's thin red chamfered rails, slanted position marker and right-aligned value/unit; zero has no fill. None of these display scales claims the ECU's dynamic redline or warning limits. Only the track interpolates; current numbers update directly. Invalid/stale/disconnected values clear the marker and active segments immediately. Horizontal instruments use 24 slanted segments and a matching position line. Scale bounds are visualization ranges, not diagnostic thresholds.

1. **Overview:** larger complete G80 artwork; speed/oil at left, independent fuel/range at right, odometer below.
2. **Performance:** large actual gauge-pressure instrument; G80 chevron tachometer, speed, sport-display torque bar and boost history when supplied.
3. **Fuel & Ethanol:** prominent E-number and explicitly labeled ethanol concentration; separate fuel-level track and independently supplied range.
4. **Temperatures:** oil, coolant and intake in compact faceted instruments, large numbers and angular scales.
5. **Live Pulls:** G80 chevron tachometer, large actual boost and stacked factory-style torque/power rails, with speed/throttle/gear. It is deliberately not another three-dial page and does not add run logging.
6. **My Gauges:** three configurable angular instruments using the shared components, with selected-slot outline and five-action editor.

Every fuel-remaining presentation also shows a small corn-yellow ethanol companion directly below it: Overview, Fuel & Ethanol and My Gauges when fuel is selected. It reads E-number / % v/v with LIVE only for a valid live ethanol channel, otherwise E-- and an explicit stale/unavailable/disconnected label. Demo does not get a misleading LIVE label. This is display-only; the car's ethanol source is still unmapped.

Units are **US only: mph / PSI gauge / °F / mi / gal / ft / lb-ft / hp**. There is no metric preset. Conversion is display-only, after canonical signal normalization; it includes endpoints and history. Null values remain null. Gauge choices use the existing atomic private storage, with browser localStorage separate; an old saved unit preference is ignored.

The bottom bar has three group buttons (Drive / Track / Garage) and the current group's icon tabs. Track pages use the same chamfered navy plates and blue/red run markers as Live Pulls. The shift light (Performance and Live Pulls) is 10 header segments lit from 5,500 rpm in 150 rpm steps, blue then white then red, all flashing from 7,000 rpm. It is a display cue, not the DME's shift point.

## Navigation ownership and gestures

The previous right-hand rail was drawn by the application, not mandatory BMW chrome. It has been removed. Compact touch page tabs select any page and expand into the space freed by removing redundant page arrows. Wrapping remains available through swipes and native rotary actions. Slot-selection arrows appear only inside the My Gauges editor. Locally drawn 20px monochrome line icons pair labels with a G80 front silhouette, checkered flag, fuel pump, thermometer, live trace and adjustable instruments. Active icons turn blue. These are original functional glyphs, not extracted factory assets; a fault/check-engine lamp is deliberately not used as a fuel-tab label. The five native RHMI media-row controls remain, in the original previous / next / refresh / mode / about order. Their events and current contextual labels still drive rotary focus/push and native fallback. Native BACK/HOME ownership is unchanged; there is no controller grab.

The bottom strip uses a consistent blue inset and fine underline. Native previous/next focus is indicated on its destination page tab, not a duplicate arrow button. The other three native focus owners keep their compact action targets. Touch does not move native focus. The editor remaps arrows to slot selection and the remaining actions to change/done/reset. About remaps refresh to display units. Body swipes work across non-editing My Gauges too; vertical gestures, cancellations and drags starting in navigation do not activate actions.

Native component/raw duplicate notifications are paired by action index and opposite origin within 80ms, using a bounded queue so overlapping pairs do not add/drop activations. Same-origin, direct and touch presses are not rate-limited. Actual firmware timing and physical controls still need in-car validation.

## Presentation and truthful states

`/` is canvas-only presentation; `/developer` or `/?developer=1` exposes controller simulation, state fixtures, diagnostics and explanations. D toggles that developer wrapper. Presentation never changes the selected data mode. The browser starts DEMO; the installed app still starts disconnected live.

A page-wide DEMO badge replaces repeated field-level demo labels. Mixed live signals retain individual LIVE / EST. LIVE / STALE / UNAVAILABLE / DISCONNECTED labels. Synthetic connected fixtures always show **TEST FIXTURE / NOT VEHICLE** inside the canvas, even with developer controls hidden. Calculated power remains EST., not dyno/wheel power. No new vehicle mappings or substitute readings were added.

Rendering uses the existing opaque rectangles, lines, bitmap text and images. Convex facets are scan-converted to rectangle bands (one-pixel detail for the blue vehicle stage, coarse low-contrast facets elsewhere), so Canvas and GPU use identical supported operations. Font tint images are cached in the preview. Rendering is capped at 12 FPS with ~160ms track easing; telemetry publication does not submit extra frames. Actual head-unit CPU/GPU performance remains unmeasured.

Clean browser captures for all 15 pages in demo and disconnected states, plus the demo fault scan, editor, settings and validity fixtures, are in `screenshots/index.html`. They are not in-car screenshots.
