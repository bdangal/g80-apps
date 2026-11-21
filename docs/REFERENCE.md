# Publishing and ID8 reference

Read the [current PUBLISHING.md](https://github.com/robertnisipeanu/mgu-store/blob/main/docs/PUBLISHING.md) before implementation on 2026-11-20. Recheck it before publishing because upstream evolves.

## Pinned implementation reference

Repository: `robertnisipeanu/mgu-store`

Commit: **3ecfafd4b6b2492c1776f53e3b74add5653c5c61**

- [App README, two sets of screens](https://github.com/robertnisipeanu/mgu-store/blob/3ecfafd4b6b2492c1776f53e3b74add5653c5c61/apps/robertn_store/README.md)
- [Native widget generator](https://github.com/robertnisipeanu/mgu-store/blob/3ecfafd4b6b2492c1776f53e3b74add5653c5c61/apps/robertn_store/tools/gen_rhmi.js)
- [Genuine ID8 XML](https://github.com/robertnisipeanu/mgu-store/blob/3ecfafd4b6b2492c1776f53e3b74add5653c5c61/apps/robertn_store/package/rhmiData/uiDescriptions/ID8/application.xml)
- [ID8 JSON component model](https://github.com/robertnisipeanu/mgu-store/blob/3ecfafd4b6b2492c1776f53e3b74add5653c5c61/apps/robertn_store/package/rhmiData/uiDescriptions/ID8/uiDescription.json)
- [OnlineApp lifecycle and native input binding](https://github.com/robertnisipeanu/mgu-store/blob/3ecfafd4b6b2492c1776f53e3b74add5653c5c61/apps/robertn_store/src/store.js)
- [Renderer client](https://github.com/robertnisipeanu/mgu-store/blob/3ecfafd4b6b2492c1776f53e3b74add5653c5c61/native/mgu-render/js/mgu_render_client.js)
- [Renderer README and ID8 behavior](https://github.com/robertnisipeanu/mgu-store/blob/3ecfafd4b6b2492c1776f53e3b74add5653c5c61/native/mgu-render/README.md)
- [Renderer wire protocol](https://github.com/robertnisipeanu/mgu-store/blob/3ecfafd4b6b2492c1776f53e3b74add5653c5c61/native/mgu-render/PROTOCOL.md)
- [Source linker](https://github.com/robertnisipeanu/mgu-store/blob/3ecfafd4b6b2492c1776f53e3b74add5653c5c61/tools/oap_link.js)

The Store README explicitly documents a separate ID8 widget layout using `LT_State_Wide_List` and `LT_Button_MediaEntry_1Row`, rather than ID7's state and two-column row widgets. The generator has distinct ID7/ID8 mappings. Bishal's M3 App reduces the **ID8 mapping**, uses its typed media cells and retains the ID8 lifecycle proxy declarations. Only ID8 resource descriptions are published. There is no ID7 UI with a changed compatibility label.

## Deliberate constraints

- ID8 gets `layer` graphics, **never** the ID7-only `LT_State_A4A_WelcomeApp` embed template.
- ID8 states have no `ParentState`. The reference documents `INVALID_PARAMETER` with nested ID8 parents and surprising BACK behavior. This starter uses one state and the HMI's history.
- The manager hands over the existing public entry point. Initialize it, map it to the garage root and enable it. Do not overwrite the manager's icon/text resource handles.
- Four UUIDs are unique to this app; the deploy tool allocates its `appletId`. Runtime ID comes from the manager, not a source constant.
- Literal single-quoted CommonJS `require('...')` imports match the documented source linker's scanner. Internal imports use basenames, not source directory hierarchy. Runtime modules target Node 8.16.2.
- Missing staged `javascript/runner.js` is intentional: Store inserts its donor's entry point and links `javascript/app.js`. Shipping a fake browser entry point there would bypass the documented flow.
- `mgu-repo.json` selects `build: "unit"`; `mgu-app.json` is the source/build manifest; the staged `package.json`, SOME/IP manifest, permissions, shrinkwrap and RHMI resources form the OAP tree. A separate custom Store build-script manifest is neither required nor used.
- `mgu-render >=0.3.0` is explicit because the app uses this renderer's own native protocol. A generic renderer capability alone cannot ensure that protocol.
- Five native RHMI rows remain focusable under the graphics, selecting previous page, next page, refresh demo, data mode and About. The HMI processes controller motion and push; focus/action events mirror them into the view. Touch follows down/up hit agreement; horizontal body swipes change pages while vertical/control-rail drags and cancels do not activate controls. Touch changes page/content without moving the controller ring, which remains aligned with native focus. BACK is not intercepted. Native fallback is intentionally not custom-colored.

## Alternative corroborating ID8 example

[IterioDev Live Adjustments](https://github.com/IterioDev/car-apps/blob/e69201c827a6e398217af430f162a3aa85789d6b/apps/iteriodev_liveadjust/README.md) documents ID8-only operation. Its published source contains an ID8 RHMI host and lifecycle wrapper, independently confirming that an ID8 host is different from an ID7 embed state. No Live Adjustments code, diagnostic functions, fixed applet ID or renderer binary is copied here.

The older Store README link to `IterioDev/mgu-app-store` returned 404 during research. The primary reference above is directly accessible and includes the real ID8 source; that unavailable secondary link is not a build dependency.

## Live acquisition reference

The current source now includes independently implemented read-only telemetry using the ID8 Car Data 1.4.1 app's demonstrated API pattern. Its published source is inside `apps/iteriodev_cardash/iteriodev_cardash@1.4.1.tgz` in the pinned IterioDev repository, not a direct `src` path. See [DATA.md](DATA.md) for exact member/scaling/OBD mappings and provenance, including estimated torque/RPM horsepower. No Live Adjustments tune/actuator methods or upstream application code/assets are copied. Manifest entries grant only selected native `rs` attributes and TASU's read transport; the runtime sends service 01 only.

## Evidence boundary

Upstream documentation is the reference, not proof that this reduced application runs on every ID8 firmware. Desktop mock tests establish app logic and requested SDK call ordering only. An actual donor-linked build and the physical head-unit acceptance checklist are still required before claiming verified compatibility with this particular car.
