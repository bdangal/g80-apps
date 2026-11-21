# Source and artwork notices

This repository is GPL-3.0-or-later. Bishal's M3 App is an independent personal app, not a BMW product.

## Telemetry reference

The API and signal-mapping research references IterioDev's ID8 Car Data 1.4.1, published as a source archive in IterioDev/car-apps at e69201c827a6e398217af430f162a3aa85789d6b. Required upstream notice for that reference: Copyright (c) 2026 IterioDev (https://github.com/IterioDev). Its application is under its own PolyForm Strict terms; it is not copied, relabeled, bundled or redistributed as part of this GPL repository. Bishal's M3 App's acquisition scheduler, decoder, lifecycle guards and UI are independently implemented using the documented API/protocol and mapping facts. No upstream application/renderer/assets or BMW SDK are included. Exact references and evidence boundaries are in docs/DATA.md.

## idrive7-apps (MIT)

The Fault Scanner request/reply handling, ECU names, brake-test trigger rules and the CDS2 / TPMS / EnvironmentalInformation / BasicDataSet signal names and scalings follow cauliflowermossgrape/idrive7-apps at a948390f (`kit/runtime/diag.js`, `kit/runtime/ecus.js`, `apps/brake_test`, `apps/car_vitals`). Their notice:

MIT License. Copyright (c) 2026 cauliflowermossgrape. Copyright (c) 2026 小白151 (GitHub: JackieZ123430), Chinese translation. Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions: The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software. THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

Their `dtc_db.pack` fault-text database is BMW data and is not used.

## Documented reference

The native ID8 RHMI layout, entry-point lifecycle and package metadata are adapted/reduced from Robert Nisipeanu's MGU Store:
https://github.com/robertnisipeanu/mgu-store/tree/3ecfafd4b6b2492c1776f53e3b74add5653c5c61/apps/robertn_store

`apps/bishal_garage/src/mgu_render_client.js` is copied unchanged from that commit's `native/mgu-render/js/mgu_render_client.js`. Its original header retains the attribution to cauliflowermossgrape and IterioDev. The enclosing upstream repository is GPL-3.0-or-later; the client also identifies its MIT ancestry. Package `manifest.json` and `permissions.json` retain the upstream lifecycle declarations. Other source, layout generation, garage artwork and mock values were added for this project.

`artwork/balkan-logo.*` is the Balkan Automotive logo supplied by the user (150x150 JPEG), cropped, upscaled to 495x116, white background keyed to transparency and black ink recoloured white by `tools/import-logo.ps1`.

`artwork/m-panel.*` is the faceted blue panel (bg.png) exported by the user from the Figma Community file "BMW iDrive 8 fully customizable", with its black background keyed to transparency by `tools/import-panel.ps1`. Check that file's Community license before publishing.

The purple G80 M3 front-view image was supplied by the user for use in this application. Optimized PNG/RGBA copies preserve its transparency; this repository does not assert ownership of the image or its embedded BMW trademarks. The app icon and dashboard layout are original artwork. The text atlas is bitmap artwork baked with Windows' installed Segoe UI for labels and baseline-aligned Bahnschrift SemiBold tabular numerals. No Windows font program is copied or embedded. `tools/bake-font.ps1` reproduces it locally; committed bitmap assets mean development needs no font installation or rebaking.

No BMW SDK source, donor bundle, SSH key, token, vehicle identifier or native executable is included in the repository or source artifact. The head unit supplies its own SDK at installation time. Runtime-linked OAP artifacts contain donor material and must remain private.

`tools/vendor/oap_link.js` and `tools/vendor/oap_pack.js` are copied unchanged from the same pinned MGU Store commit under GPL-3.0-or-later. They are build/linking tools, not BMW SDK files. The full corresponding source is included. No donor is bundled.
