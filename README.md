# g80-apps

**Bishal's M3 App** · `bishal_garage` · **0.1.0** · **iDrive 8 only**

A first MGU/OAP app for a **2023 BMW G80 M3 Competition xDrive**, iDrive 8 / BDC3. Factory-cluster-inspired near-black/navy facets, crisp white tabular readings, angular blue/M-red scales and consistent blue focus. Your complete Midnight Purple car artwork is preserved and enlarged. A single red “Powered by Balkan Automotive” subtitle sits beneath the app name. Seven pages: **Overview / Performance / Fuel & Ethanol / Temperatures / Live Pulls / My Gauges / Balkan Automotive** (shop spotlight: "BRING YOUR FUCKING BMW HERE."). Live Pulls combines the G80-style RPM chevron and OEM-inspired red sport-display bars with boost, power, torque, speed, throttle and gear.

**Read-only BMW live acquisition is implemented**, using native SOME/IP getters and DME OBD service-01 reads through TASU, following the published ID8 Car Data app's API pattern. It has **not been executed on this car**. Each reading appears only when its source answers; missing/stale data shows `--`, never demo fallback. Power calculated from ECU torque and RPM is labeled **EST.**, not dyno-measured horsepower. Ethanol, fuel %, range and odometer are still unmapped. No coding, diagnostic writes, tune/actuator controls, internet access, accounts or credentials are implemented. See [docs/DATA.md](docs/DATA.md) for exact interfaces, source provenance and limitations.

**Status:** source-complete starter; desktop tests and packaging checks are available. Not tested on a physical head unit. BDC3 is the vehicle context, not a software interface this app accesses. Firmware/donor-specific SDK linking and the final in-car touch/controller test remain required.

## Real ID8 implementation

Based on the documented [MGU Store app](https://github.com/robertnisipeanu/mgu-store/blob/3ecfafd4b6b2492c1776f53e3b74add5653c5c61/apps/robertn_store/README.md), pinned at `3ecfafd4b6b2492c1776f53e3b74add5653c5c61`. See [docs/REFERENCE.md](docs/REFERENCE.md) for exact source links and decisions.

- Actual `rhmiData/uiDescriptions/ID8` XML and JSON, not an ID7 compatibility relabel.
- ID8 `LT_State_Wide_List` and `LT_Button_MediaEntry_1Row` controls, `PrimaryText` media cells and the `remote2` / `entrypoint2` / `resourcemanagement2` lifecycle interfaces.
- M-inspired graphics use the documented **mgu-render** service in **layer mode**. No ID7 embed template is used. The service is a Store-managed dependency, not an executable installed by this app.
- Native HMI controls own rotary focus, controller push and BACK. Matching focus/action events update the overlay. No controller grab or raw FrontCCU subscription is required. Touch is delivered by the renderer; tap selects and horizontal body swipes change pages outside editing. Vertical drags, bottom-navigation drags and cancels do not activate controls.
- A native ID8 fallback shows the current data-state summary, navigation, demo/live selection and version if the renderer is unavailable. Native fallback colors are chosen by the HMI, not the app.
- IDs at runtime come from `OnlineApp.getAppId()` and manifests, supporting the Store's collision renaming. No applet ID is hardcoded.

## Local development

Install **Node.js 18+** (22 LTS recommended) and Git. No `npm install`, npm dependency, BMW SDK, car access or build credentials are needed for the desktop workflow.

From the repository root:

```sh
node tools/generate.js
node tools/validate.js
node tests/run.js
node tests/negative-controls.js
node tools/package.js
node tools/validate.js dist/bishal_garage@0.1.0.tgz
node tools/serve.js
```

Open **http://127.0.0.1:8080**. `PORT` selects another port. Equivalent npm scripts: `npm run generate`, `npm run validate`, `npm test`, `npm run build`, `npm run preview`.

The desktop preview uses the same model, draw-operation recorder, view and font atlas as the OAP app. The default `/` route is **canvas-only presentation**. Open `/developer` (or `/?developer=1`) for test controls and diagnostics; D toggles that wrapper without changing the data source. Use expanded icon page tabs (no duplicate page arrows), sample/customize, live/demo and Settings actions, or **Up/Down then Enter**. Swipe the data area or use Left/Right to change pages. The desktop preview starts in clearly labeled demo mode; the car starts disconnected. The desktop scenario selector tests disconnected, unavailable and stale states without claiming a vehicle connection. The six pages wrap at either end. Touch selects content without moving the native controller's focus ring; rotary motion remains the owner of that ring. The simulated controller buttons provide the same actions. Escape / Back hides the simulated app; Open app returns. This is not an SDK or HMI emulator.

Runtime source targets **Node 8.16.2** as documented for head-unit builds. Syntax-check `apps/bishal_garage/src/*.js` with that version too when changing runtime code; do not introduce optional chaining, ESM, async iterators or browser-only code into the executed OAP path. `record.js`'s desktop-only `canvas()` method is never called on the car.

### On this workstation

This workspace did not have Node, npm or Git on PATH. Checksum-verified portable tools were placed **outside this repository**, under the parent workspace's `.tools` directory. For this checkout in PowerShell:

```powershell
& '..\.tools\node.exe' tools\generate.js
& '..\.tools\node.exe' tools\validate.js
& '..\.tools\node.exe' tests\run.js
& '..\.tools\node.exe' tools\package.js
& '..\.tools\node.exe' tools\serve.js
& '..\.tools\git\cmd\git.exe' status --short
```

The portable tools are conveniences of this workspace, not files to publish. The repository's normal commands above work on any machine with Node installed.

## Install through MGU Store (recommended: repo tree)

1. Publish this repository as **g80-apps** under your own GitHub account. No account or remote URL is preconfigured here.
2. On the head unit, use a current MGU Store/updater/deploy setup that supports ID8 and source-package builds. Make the Store's official source available so it can resolve **mgu-render >= 0.3.0**. Install that renderer if dependency resolution requests it. An arbitrary other renderer is not a substitute for the `mgu-render/1` API used here.
3. Add `github:<your-owner>/g80-apps` in Store Sources (or enter the equivalent GitHub repository in the UI). Pick **the default branch / branch:main**, not Releases. `mgu-repo.json` lists Bishal's M3 App with `build: "unit"`.
4. Install **Bishal's M3 App**. The unit builds the source against a stock BMW donor already on that head unit. No SDK is fetched from this repo.
5. ID8 app changes may be queued until the next head-unit start. Follow the Store's **Restart pending** instruction; do not assume installation failure because the tile is not immediately visible.
6. Open Bishal's M3 App. Verify the initial disconnected state, version **0.1.0**, M-inspired view, explicit demo selection, controller focus/push, swipe/touch and BACK. Use [docs/VALIDATION.md](docs/VALIDATION.md) for the acceptance checklist.

USB alternative: copy the repository checkout with `mgu-repo.json` at its root into the USB repo layout your installed Store documents. For exact source discovery layouts and channel behavior, use the [current publishing guide](https://github.com/robertnisipeanu/mgu-store/blob/main/docs/PUBLISHING.md), not a guessed USB installer or raw OAP sideload.

## Packaging

`node tools/package.js` validates and writes:

```text
dist/
  bishal_garage@0.1.0.tgz   # SOURCE package, mgu-app.json at archive root
  catalog.json             # schema 2, build:unit, size and SHA-256
  garage_icon.png
  SHA256SUMS
```

**Do not upload that source `.tgz` as a standalone OAP GitHub Release asset.** Its name is correct for the generated **catalog**, where `build: "unit"` instructs the Store to link it. Releases without a catalog expect already-built OAP packages. The simplest publishing route is the repo branch, which needs no artifact upload.

To publish the generated catalog, host all four files together under HTTPS or use the Store's documented USB catalog layout. The renderer must be available through another added source. For a public GitHub `catalog` release, run `node tools/package.js --github YOUR-OWNER/g80-apps --tag catalog`; this writes the required absolute public artifact download URL. Upload the package, icon and catalog to that release together. Private GitHub catalogs need authenticated asset API URLs assigned after asset upload; this tool does not create releases or obtain tokens. Without `--github`, generated relative URLs are for HTTPS-folder/USB catalogs only.

### Optional private local donor build

The pinned upstream, SDK-free linker tools are included under `tools/vendor`. Given a legally obtained **stock ID8 donor** from your own unit:

```sh
node tools/build-oap.js --sdk private/stock-app.tgz
```

A donor `.js` bundle with its adjacent package metadata is also supported upstream. This builds a real OAP package into **`private/oap/`**, with temporary work restricted to **`private/work/`**. No donor is included, so this step has **not** been verified against the car's SDK. The unit's Store build remains the preferred path.

**Never commit or publish donor-linked output.** It contains non-redistributable BMW SDK modules even though the original repository does not. This project deliberately provides no public OAP-release publishing command.

## Repository layout

```text
mgu-repo.json                    Store repo-tree manifest
apps/bishal_garage/mgu-app.json   source/build manifest
apps/bishal_garage/src/          Node-8 runtime, mock model, shared graphics
apps/bishal_garage/package/      staged OAP metadata, genuine ID8 UI, original artwork
preview/                        desktop presentation and controller simulation
tools/                          generation, validation, packaging, private donor build
tests/                          SDK-free lifecycle/input and package tests
docs/                           reference and validation notes
```

Generated RHMI resources, app icon and font artwork are committed because repo-tree `build:unit` does not run a custom resource generator. Edit `tools/generate.js` and `mgu-app.json`, then regenerate before committing. Keep version strings in sync. Font rebaking is optional and Windows-only: `powershell -NoProfile -ExecutionPolicy Bypass -File tools/bake-font.ps1`; committed bitmap files make that unnecessary on other platforms.

## Dashboard pages

| Page | Visuals and units |
| --- | --- |
| 01 Overview | Your complete transparent M3 image, connection/data state, speed, fuel level, range and odometer (mph/mi) |
| 02 Performance | Large actual boost gauge (gauge PSI, including vacuum), G80 chevron tachometer, speed and compact boost history when supplied |
| 03 Fuel & Ethanol | Ethanol percentage and E-number (44% / E44), separate fuel-remaining bar and range |
| 04 Temperatures | Faceted oil, coolant and intake-air instruments, default °F, angular scales and explicit validity |
| 05 Live Pulls | G80 M-red RPM chevron, boost readout, stacked red engine-power/torque sport bars; speed, throttle and gear |
| 06 My Gauges | Three selectable angular instruments; touch or native-controller editor; saved selections |

About/version is a separate information overlay, not a seventh dashboard page. Live acquisition depends on the unit's offered services and DME-supported PIDs; unavailable/disconnected/stale readings show `--`. All app pages fit a 1440×382 logical area, scaled into the renderer's reported ID8 app area (the reference unit reports 2880×764 at y=76). No app-area vertical scrolling is used.

**Live Pulls:** page **5 / 6**. Power is calculated from fresh synchronized ECU torque and RPM, following the reference app, and explicitly marked **EST. LIVE**. It is not calculated from RPM alone, boost, speed or a presumed tune, and is not a wheel/dyno measurement. No run logging, peak hold, acceleration/G measurement or 0–60 timing is implemented. Native fast getters are polled at 100 ms, but source age cannot be proven from a getter without ECU timestamps. Rendering is capped at 12 FPS; only visual tracks ease between readings, never the numeric values. Actual head-unit performance remains unverified.

**My Gauges:** select Previous once from Overview to open page **6 / 6**. Tap an instrument or use **Customize**. The compact action strip then offers **Previous slot / Next slot / Change gauge / Done / Reset defaults**, all operable by touch or iDrive. Choose three distinct channels; selections save immediately in the app's private data directory (browser preview uses localStorage). Unsupported selections still show `--`. Save errors are displayed instead of silently claiming persistence.

**Units:** US only, everywhere: mph, PSI, °F, miles, gallons, feet, lb-ft and hp. There is no metric option; a previously saved metric preference is ignored. Canonical acquisition values are unchanged.

**Navigation:** three groups on the bottom bar, each with its own tabs. **Drive:** Overview, Performance, Live Pulls, Pull Graph, Peaks. **Track:** G-Meter, Brake Test, Drag Timer, M Vitals. **Garage:** Readiness, Fuel & Ethanol, Temperatures, Diagnostics, My Gauges, Balkan Automotive (last). Previous/next and swipes run through all 15 pages in that order.

Demo mode has two deterministic snapshots, not live readings. Refresh changes only the demo sample, never invents data in live mode and never changes the page. Ethanol is **not inferred from fuel level, a fuel-grade label or flex-fuel hardware ownership**. Boost normalization requires declared units/reference and synchronized valid ambient pressure for absolute sources; it never subtracts a guessed atmosphere. Gauge bounds are display scales, not diagnostic or tune limits.

Screenshots of every page and failure-state examples: [docs/screenshots/index.html](docs/screenshots/index.html), or open `/gallery` on the preview server. They are captured desktop app-area renders, **not in-car screenshots**. Real-reference provenance, font fallback and design decisions are in [docs/DESIGN.md](docs/DESIGN.md).

The supplied image is optimized to 1024px with transparency and an unpremultiplied RGBA payload for the renderer. No original attachment location is required at runtime. To replace it on Windows: `powershell -NoProfile -ExecutionPolicy Bypass -File tools/import-car.ps1 -Path YOUR-IMAGE.png`, then validate and rebuild. Check image rights before publishing.

## Source hygiene

`.gitignore` excludes SDK/donor directories, local private builds, node_modules, SSH key names, key containers, tokens, secrets and environment files. Packaging uses a source allowlist and rejects SDK/credential paths and common embedded credentials. Ignore rules cannot prevent `git add -f` or detect every possible secret: review `git diff --cached` and the staged file list before publishing. Put no credentials in the preview or app. The app needs none.

GPL-3.0-or-later, including derived upstream plumbing. See [NOTICE.md](NOTICE.md) and [LICENSE](LICENSE).
