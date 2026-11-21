# BMW live data: implementation and evidence

## What changed

`src/vehicle.js` now implements the same **read-only acquisition mechanism** used by the ID8 **Car Data 1.4.1** app: the unit's `someipBuilders.buildAndInitTypedProxy()`, native attribute getters, and supported OBD service-01 PIDs through Harman TASU. `Garage` starts it after RHMI initialization, forwards complete snapshots to `Model.acceptFrame()`, enables reads only while visible in Live mode, and closes its timers on shutdown. No server, phone app, external OBD dongle, key or cloud token is required by this implementation.

**Implemented is not car-verified.** The source pattern and mappings have been checked against public ID8 app code. This particular G80's firmware, interface availability, donor linking and actual returned values have not been exercised here. Channels show `--` until their respective source supplies valid data. There is no automatic demo fallback.

## Reproducible reference

- [IterioDev/car-apps at e69201c827a6e398217af430f162a3aa85789d6b](https://github.com/IterioDev/car-apps/tree/e69201c827a6e398217af430f162a3aa85789d6b)
- [Car Data README](https://github.com/IterioDev/car-apps/blob/e69201c827a6e398217af430f162a3aa85789d6b/apps/iteriodev_cardash/README.md)
- [Published source archive: iteriodev_cardash@1.4.1.tgz](https://github.com/IterioDev/car-apps/blob/e69201c827a6e398217af430f162a3aa85789d6b/apps/iteriodev_cardash/iteriodev_cardash%401.4.1.tgz)

The repository publishes the source **inside the archive**, not at a `src/main.js` GitHub URL. Unpack its source layer to inspect `src/main.js`: `CAL`, `SOURCES`, `connect()`, `connectTasu()`, `obdTick()` and `onTasuResponse()`; PID definitions are in `src/obd.js`. Its root README identifies Car Data 1.2.0+ as ID8-only, and documents emulator/car testing. That is evidence for the reference's environment, not a claim that this app has run on the car.

The native speed/RPM/temperature mappings are also corroborated by the MIT `cauliflowermossgrape/idrive7-apps` live-data signal catalog; that catalog identifies torque as 12-bit with 4095 invalid. This adapter conservatively rejects >=4095 rather than rendering an invalid sentinel as high torque/horsepower. This is signal-level corroboration, **not** reuse of an ID7 UI or a compatibility relabel.

The reference polls getters because some fast signals' subscription notifications did not fire. Its pattern is `buildAndInitTypedProxy(interface, instance, {timeoutMs:10000})`, then `attribute.getValue()` repeatedly; the reference also subscribes. Bishal's M3 App independently implements the API/mapping facts, not a rebranded copy of that application or its renderer/assets. No upstream proprietary app code or BMW SDK is redistributed here.

## Channels and exact mappings

| Reading | Implemented source / decoding | Important limitation |
| --- | --- | --- |
| RPM | `vehicle.CDS`, instance `1`, `statusEngineSpeed2.actualValueRPMEngineCrankshaft × 0.25`; OBD `0C` fallback `(A×256+B)/4` | Native `65535` invalid; getter polled at 100 ms |
| Speed | `vehicle.Vehicle2`, `statusCarSpeed2.speedVehicleCentreOfGravity / 64` km/h; OBD `0D` fallback | Display converted to mph; native `65535` invalid |
| Oil / coolant | CDS `statusEngineTemperature.temperatureEngineOilDrive` / `temperatureEngineDrive`, raw − 48 C; OBD `5C` / `05` fallback (A−40) | Native `255` invalid; native getter polled at 1 s |
| Engine torque | `drivingexcitement.FES.statusActualValueTorque2.actualValueTorqueCrankshaft × 0.5 − 1023.5` Nm; OBD `62` actual % × `63` reference Nm fallback | Native raw values >=4095 invalid (conservative 12-bit torque contract, also excluding 65535); negative torque is unavailable under the current display contract; ECU-reported/model-based, not a dyno |
| Engine horsepower | Torque Nm × RPM / 9549.3 → kW → mechanical hp | **Calculated estimate**, not a measured power feed. Requires both inputs fresh and within 250 ms. UI says **EST. LIVE**; native summary says **EST.** |
| Gear | `infrastructure.VehicleInformation.statusGearboxDrive.statusActualGearDrive` | `R`/1 → reverse, `G1`…`G8` /3…10 → forward gear, selector `N`/3 → neutral. Ambiguous `N_OR_P`/Park remains unavailable; no speed/RPM gear guess |
| Boost | DME OBD `70` actual boost sensor A/B, then `87` actual manifold sensor, then unsaturated `0B`; paired with `33` ambient | Actual-pressure masks only, not commanded pressure. kPa absolute minus synchronized ambient → gauge PSI. Never subtract a guessed 14.7 PSI. `0B=255` is saturated and suppressed. MAP is explicitly a manifold-pressure fallback, not a dedicated charge-pipe sensor |
| Intake air | DME OBD `0F` → A−40 C | Only if supported |
| Throttle | DME OBD `11` → A×100/255 % | **Absolute throttle opening**, not pedal demand. It need not read zero with the engine idling/off; no relative-throttle substitution |
| Ethanol | **Not mapped** | Reference has no verified ethanol feed. A real flex-fuel/tuning-platform content feed is still needed; fuel level/grade is not ethanol |
| Fuel %, range, odometer | **Not mapped** | Reference's tank raw unit is not a verified percentage contract. These remain unavailable rather than guessed |

Interface names above use prefix `de.bmw.infotainment.` unless explicitly `de.bmw.infrastructure.VehicleInformation`. Manifest attributes are restricted to `rs`. Native services connect independently; a missing interface/member does not block the app or the others. Connections retry every 30 s. An event-only gear member subscribes once and expires under the same freshness policy; this intentionally prefers missing gear over an indefinitely cached value.

## TASU transport

Proxy: `com.harman.infotainment.systemfunctions.tasu.tasu.InternalTasu`, instance `SystemFunctionsInternalTasuInst1`. Subscribe to `sendTasuResponse`, call **only** `sendTasuRequest` with tester `0xF2`, DME target `0x12`, `serviceID: 0x01`, `subroutineID: 0`, one PID byte, and `deadlockTime: 0`. There are **no** diagnostic writes, session changes, security access, routines, tune commands, fault clearing or actuator controls.

Before ordinary reads, ask supported-PID bitmaps `00`, then `20/40/60/80` only when the prior bitmap advertises the continuation. Ordinary requests are limited to supported entries in the fixed read-only PID table. One request is in flight; timeout 1500 ms, 60 ms gap after an answer. A refused PID (`7F 01 12/31`) is not polled again during this process. Timeouts retry capability discovery, including after a hide/demo interruption. Missing actual sensors in `70/87` fall through to the next supported source; there is no highest-pressure heuristic.

The published transport layout identifies the replying ECU at response byte `[6]`, UDS service at `[9]` and positive-response PID at `[10]`. Reject wrong ECU/service/PID, short payloads and transport errors. Negative pending response `7F 01 78` waits only until the request timeout. The adapter checks lifecycle/generation immediately before queued SDK reads, not merely when results arrive. Late native results from a previous visible session are ignored.

**Correlation limit:** this TASU broadcast has no demonstrated per-application transaction ID. A coincident identical service/PID read from another app is indistinguishable, and an old matching response after timeout cannot be conclusively attributed. Do not run another diagnostic client simultaneously when validating/logging. No unverified byte offset is used as a pretend transaction identifier.

Pressure and ambient receive times must differ by at most 1 s and both must be fresh; otherwise boost is unavailable/stale. This conservative rule can leave gaps when TASU is slow. It does not repeat the last number as current. Only fresh normalized gauge-pressure samples enter the short boost trace.

## Freshness and provenance

The initial freshness limit is **3000 ms**; transport connection indication expires 5 s after its last accepted reply. Native polling is 100 ms for RPM/speed/torque and 1 s for temperatures, but that is a request cadence, **not a verified ECU sample rate**. Getter returns use `freshness: 'receive-time'`; the public API example provides no ECU timestamp or sequence counter. Identical successful reads renew transport freshness. Consequently, the app detects absent/failed replies, but **cannot prove that a successfully returned native value is not internally cached**. It does not invent source timestamps.

OBD values use response receive time. Derived power uses the older input timestamp, carries `estimated:true`, and disappears when its dependencies are missing, invalid, stale or unsynchronized. Source/member names remain in reading provenance. A valid measured zero is distinct from absent data.

- **Disconnected:** not active, or no accepted reply within 5 s. All displayed readings clear.
- **Unavailable:** service connected but channel missing, refused, unsupported or invalid. Show `--`.
- **Stale:** a retained reading is older than 3 s. Show `-- / STALE`, not the old numeric value.
- **Live / EST. LIVE:** valid response-backed reading, or explicitly calculated power estimate.
- **Demo:** explicit fixed demo samples. No vehicle polling in demo or while hidden.

Current renderer cap is 12 FPS. Numeric readings update directly; only gauge position/fill transitions use lightweight easing. Telemetry callbacks still update the model, not the renderer directly. This is a dashboard, not a high-rate performance logger, dyno, launch controller, pull recorder, G-meter or 0–60 timer. Gauge limits are display scales, not diagnostic thresholds.

## My Gauges

Last page **6 / 6**. Choose three distinct channels from RPM, boost, power, torque, speed, oil, coolant, intake, ethanol, fuel, throttle and gear. Selecting a channel does **not** create an unsupported source.

Tap an angular instrument or select **Customize**. In edit mode the five native controller/touch actions are **Previous slot / Next slot / Change gauge / Done / Reset defaults**. Changes save immediately; Done exits the editor. Defaults are RPM / boost / power. Bad or duplicate settings fall back to defaults.

Fuel-remaining instruments include a subtle corn-yellow ethanol companion, showing the resolved ethanol channel as E-number / % v/v. Only valid live data gets LIVE; missing/stale/disconnected ethanol never retains a numeric value. This adds no vehicle mapping: actual ethanol remains unsupported until a verified source supplies it.

**E50 blend planner (Fuel & Ethanol page).** Inputs are live ethanol % and live fuel level only; stale, unavailable or demo-free live data shows no estimate. It assumes a 15.9 gal G80 tank, flex fuel at E70 and pump gas at E10. Your stations sell E68-70, so E70 is the worst case: the real result lands at or slightly under E50. It shows the flex fuel to add now to reach E50 and a full-tank split of flex plus gas. Above E50 it shows the gas needed to dilute back to E50 and says not to add flex. It relies on the ethanol and fuel-level channels, which are still unmapped on the car, so on the head unit it stays blank until those sources exist.

**Pull timer (Live Pulls page).** 0-60 and 60-130 mph runs are timed from the live vehicle-speed signal (native getter, ~10 Hz, receipt time). Crossings are linearly interpolated between samples. A 0-60 run starts when speed leaves a standstill (under 1 mph). A run is dropped on a sample gap over 1 s, an implausible jump, a lift of more than 2 mph, or a timeout (20 s or 30 s). The last three of each are kept, newest first, until the app closes. Demo mode shows fixed sample times; they never appear in live mode. These are app-side estimates, not certified Dragy/VBOX times.

**New read-only signals** (names and scalings from cauliflowermossgrape/idrive7-apps a948390f, MIT, car_vitals and brake_test; none yet confirmed on this G80):

| Signal | Source | Scaling / handling |
| --- | --- | --- |
| Longitudinal / lateral g | `vehicle.CDS2` `statusLongitudinalAccelerationMassCenter` / `statusLateralAccelerationMassCenter` | raw x 0.002 - 65 m/s², 65535 invalid; offset learned after 2 s at a standstill |
| Tire pressure / target | `vehicle.TPMS` `statusTyrePressure`, `statusTargetTyrePressure`, polled 10 s | 0.1 x raw in the car's own unit (from `vehicle.Vehicle` `statusNewCurrentUnitsStatusExt`, else inferred by plausible range); 65532+ invalid |
| Tire air temperature | `vehicle.TPMS` `statusTyreTemperature` | raw - 40 in the car's temperature unit; outside -40..150 °C dropped |
| Outside air | `EnvironmentalInformation` `ExteriorTemperature` | raw x 0.5 - 40 °C, 255 invalid |
| Gearbox oil | `analytics.BasicDataSet` `basicDataSet.valueTemperatureTransmissionOil` | raw - 48 °C, 255 invalid; some cars don't fill it |

**Fault Scanner (read only).** One functional UDS `19 02 0C` (stored + pending) to all units (`0xDF`) over the same TASU proxy. Replies are accepted only as `59 02` or `7F 19` from the answering unit; `7F 19 78` extends the wait to 10 s; collection ends after 4 s of silence or 25 s. OBD polling pauses for the scan. TASU replies carry no request id, so a 19 02 answer to another app's request at the same moment could be mixed in; the first full answer per unit is kept. Hiding the app mid-scan ends it as "Interrupted, scan again", and Readiness treats an interrupted, failed or empty scan as unknown, never as no faults. `allowed()` in `vehicle.js` throws on anything other than OBD `01` to the DME or `19 02`, so clear (`14`), session (`10`), write (`2E`), IO (`2F`) and routine (`31`) requests cannot be sent. Codes show as 3-byte BMW hex with ACTIVE / WARNING LAMP / PENDING / STORED; there is no BMW fault-text database (its data isn't licensed for redistribution). Unit names come from idrive7-apps `kit/runtime/ecus.js`. Scan parked with the ignition on.

**Brake Test, Drag Timer, Peaks, Pull Graph** (`session.js`). All run from live speed (~10 Hz, receipt time) and live g. Brake: arms above 63 mph, starts at the interpolated 60 mph crossing once deceleration reaches 0.4 g, integrates distance until under 0.5 mph, drops the run if braking falls under 0.1 g for 1.2 s. Drag: 1/8 (660 ft) and 1/4 mile (1,320 ft) from a standstill, trapezoid distance, interpolated ET and trap speed, no reaction time. Any sample gap over 1 s or an implausible jump drops a run. The last three of each are kept until the app closes. Peaks track live values only. Pull Graph keeps the last full-throttle (90%+) pull spanning 1,500+ rpm of EST. power and torque. Demo mode shows fixed sample results, never in live mode.

Display is US only: mph, PSI gauge, °F, miles, gallons, feet, lb-ft and hp. `Model.display` converts values, endpoints and history after canonical normalization, preserving null/status/timestamp/estimated flags. The adapter and Data boundary retain their existing canonical units, including Celsius temperatures.

On the unit, selections and display-unit preset are saved atomically under the app's private `data/gauges.json`, outside its published source tree. Browser preview uses localStorage, not a vehicle file. A save failure is visible as **Save failed / this session only**. No telemetry or identifying vehicle data is persisted.
