'use strict';

const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const Module = require('module');
const controls = [
  { name: 'drag-standstill-arm', target: 'session.js', filter: 'drag timer measures', old: 'if (prev.t - run.since < 1000) { session.drag = null; return; }', replacement: '', error: 'A brief stop armed the timer' },
  { name: 'dyno-drivetrain-loss', target: 'session.js', filter: 'virtual dyno', old: 'w: wheel / (1 - dyno.lossPct / 100)', replacement: 'w: wheel', error: 'Road-load power wrong' },
  { name: 'dyno-unpin', target: 'model.js', filter: 'virtual dyno', old: 'state.dynoBaseline && state.dynoBaseline.at === latest.at ? null : validRun(latest)', replacement: 'validRun(latest)', error: 'Pinning the same run again must unpin' },
  { name: 'performance-no-rpm', target: 'view.js', filter: 'Performance drops the RPM', old: "    metric(r, state, 'speed', s.speed, 560, 60, 48);", replacement: "    tachometer(r, font, state, s.rpm, 560, 76, 520, 231, now);", error: 'Performance still draws the RPM cluster' },
  { name: 'balkan-logo', target: 'view.js', filter: 'Balkan showcase shows', old: 'r.image(2, 114, 133, 495, 116);', replacement: '', error: 'Balkan logo missing' },
  { name: 'balkan-summary', target: 'model.js', filter: 'Balkan showcase shows', old: "if (state.page === 6) return prefix + 'Shop showcase", replacement: "if (false) return prefix + 'Shop showcase", error: 'Showcase native summary missing' },
  { name: 'grouped-tab-layout', target: 'view.js', filter: 'grouped tabs have disjoint', old: '(996 - left) / list.length', replacement: '170', error: 'Tab overlaps native action strip' },
  { name: 'native-logo-texture', filter: 'native renderer registers the Balkan', old: '[2, logoImage]', replacement: '[2, image]', error: 'Native logo texture missing' },
  { name: 'rapid-native-input', filter: 'native rapid independent', old: 'delivery.origin !== origin', replacement: 'true', error: 'Independent repeated presses were dropped' },
  { name: 'overlapping-native-pairs', filter: 'native rapid independent', old: 'pending.slice(-32)', replacement: 'pending.slice(-1)', error: 'Overlapping paired deliveries executed an extra action' },
  { name: 'flag-icon', target: 'view.js', filter: 'tab icons share local', old: '(row + col) % 2 === 0', replacement: 'false', error: 'Checkered flag pattern missing' },
  { name: 'single-sponsor-subtitle', target: 'view.js', filter: 'sponsor appears only once', old: 'Powered by Balkan Automotive', replacement: 'Built by Balkan Automotive in PA', error: 'Header must contain one exact sponsor subtitle' },
  { name: 'ethanol-companion', target: 'view.js', filter: 'every fuel instrument has', old: "r.text('ETHANOL  ' + value + source, x, y, size || 14, color.corn);", replacement: '', error: 'Fuel instrument missing ethanol companion' },
  { name: 'no-page-arrows', target: 'view.js', filter: 'page arrows are removed', old: 'if (i < 2 && !edit) return;', replacement: '', error: 'Redundant page arrows still rendered' },
  { name: 'tachometer-invalid-marker', target: 'view.js', filter: 'G80 RPM chevron', old: 'if (amount !== null) {\n    const p = tachoPoint', replacement: 'if (true) {\n    const p = tachoPoint', error: 'Invalid RPM retained a marker' },
  { name: 'tachometer-number', target: 'view.js', filter: 'G80 RPM chevron', old: 'const number = Model.value(reading), size = h > 210 ? 65 : 54;', replacement: "const number = '0', size = h > 210 ? 65 : 54;", error: 'RPM readout or scale unit missing' },
  { name: 'tachometer-scale', target: 'view.js', filter: 'G80 RPM chevron', old: 'knee = bottom - (bottom - top) * 5 / 8;', replacement: 'knee = bottom - (bottom - top) * 4 / 8;', error: 'RPM vertical scale not linear' },
  { name: 'sport-estimate', target: 'view.js', filter: 'OEM sport bars preserve', old: 'reading.estimated && Model.current(reading)', replacement: 'false', error: 'Estimated power label missing' },
  { name: 'oem-vehicle-stage', target: 'view.js', filter: 'OEM vehicle stage and', old: 'r.image(3, 318, 72,', replacement: 'r.image(4, 318, 72,', error: 'Figma M panel must sit behind the car' },
  { name: 'shop-card', target: 'view.js', filter: 'Balkan page shows the shop', old: "'Vinyl wrap', ", replacement: '', error: 'Business card line missing: Vinyl wrap' },
  { name: 'smooth-backdrop', target: 'view.js', filter: 'shared rails and large', old: "[1016, 334]], '#172437', 1);", replacement: "[1016, 334]], '#172437');", error: 'Backdrop diagonal too coarse' },
  { name: 'sport-rail', target: 'view.js', filter: 'shared rails and large', old: "r.polygon(rail, ink === color.red ? '#251724' : '#111f33');", replacement: '', error: 'Oil rail missing M-red housing' },
  { name: 'blend-conservative', target: 'model.js', filter: 'E50 blend planner', old: 'flex: 70, gas: 10,', replacement: 'flex: 85, gas: 10,', error: 'Flex gallons to E50 wrong' },
  { name: 'blend-live-only', target: 'model.js', filter: 'E50 blend planner', old: 'current(signals.ethanol) && current(signals.fuel) ? ', replacement: 'signals.ethanol && signals.fuel ? ', error: 'Planner must not guess without live readings' },
  { name: 'pull-gap', target: 'model.js', filter: 'pull timer records', old: 'if (time - prev.t > 1000 ||', replacement: 'if (', error: 'Data gap produced a fake run' },
  { name: 'pull-history', target: 'model.js', filter: 'pull timer records', old: 'timer.results[id].slice(0, 3)', replacement: 'timer.results[id].slice(0, 4)', error: 'Must keep the last three 0-60 runs' },
  { name: 'diag-guard', target: 'vehicle.js', filter: 'diagnostic guard allows', old: "if (service === 0x19) return data.length === 2 && data[0] === 0x02;", replacement: 'if (service !== 0x01) return true;', error: 'Write or clear request allowed' },
  { name: 'scan-pauses-obd', target: 'vehicle.js', filter: 'fault scan pauses OBD', old: " || (this.faults && this.faults.state === 'scanning')) { this.schedule(() => this.obdLoop(), 100); return; }", replacement: ") { this.schedule(() => this.obdLoop(), 100); return; }", error: 'OBD request sent during fault scan' },
  { name: 'scan-echo', target: 'vehicle.js', filter: 'fault scan pauses OBD', old: "} else if (uds[0] === 0x59 && uds[1] === 0x02) {", replacement: "} else if (uds[0] === 0x59 || uds[0] === 0x62) {", error: 'Expected values to be strictly deep-equal' },
  { name: 'drag-gap', target: 'session.js', filter: 'session timers drop runs', old: 'if (dt > 1 ||', replacement: 'if (', error: 'Gap produced a drag run' },
  { name: 'brake-trigger', target: 'session.js', filter: 'brake test needs real', old: 'decel !== null && decel >= 0.4', replacement: 'true', error: 'Coasting started a stop' },
  { name: 'peaks-live', target: 'session.js', filter: 'session peaks track', old: "function live(reading) { return reading && reading.status === 'live' && typeof reading.value === 'number'; }", replacement: "function live(reading) { return reading && typeof reading.value === 'number'; }", error: 'Stale boost raised the peak' },
  { name: 'demo-faults-label', target: 'view.js', filter: 'grouped pages: demo faults', old: "if (f.demo) r.text('SAMPLE CODES / NOT FROM THIS CAR'", replacement: "if (false) r.text('SAMPLE CODES / NOT FROM THIS CAR'", error: 'Demo fault codes not labeled' },
  { name: 'scan-hidden', target: 'vehicle.js', filter: 'review fixes: interrupted', old: "this.faults.error = 'Interrupted, scan again'; ", replacement: '', error: 'Hidden mid-scan finished without an error' },
  { name: 'readiness-empty-scan', target: 'model.js', filter: 'review fixes: interrupted', old: "&& !f.error && f.units.length > 0;", replacement: ';', error: 'Failed or empty scan reported as no faults' },
  { name: 'pending-deadline', target: 'vehicle.js', filter: 'review fixes: response pending', old: 'if (until <= scan.deadline) return;', replacement: '', error: 'Pending wait was cut short' },
  { name: 'first-answer', target: 'vehicle.js', filter: 'review fixes: response pending', old: 'if (old && !old.refused) return;', replacement: '', error: 'A later foreign reply replaced our answer' },
  { name: 'tyre-unit-once', target: 'vehicle.js', filter: 'review fixes: tire unit', old: "const unit = this.carUnits.pressure || this.tyreUnit;", replacement: "const unit = this.carUnits.pressure || (v >= 0.5 && v <= 6 ? 'bar' : this.tyreUnit);", error: 'Flat tire re-read in another unit' },
  { name: 'fresh-standstill', target: 'vehicle.js', filter: 'review fixes: g offset', old: ' && at - speed.timestamp <= 300;', replacement: ';', error: 'Stale speed zeroed a real 0.5 g' },
  { name: 'upshift-pull', target: 'session.js', filter: 'review fixes: Peaks summary', old: '      if (pull) savePull(session, pull, now);\n', replacement: '', error: 'Upshift discarded the previous gear pull' },
  { name: 'presentation-fixture', target: 'view.js', filter: 'presentation fixtures always', old: "state.previewFixture ? 'TEST FIXTURE / NOT VEHICLE' : ", replacement: '', error: 'Fixture disclaimer hidden in developer controls' },
  { name: 'touch-focus', filter: 'touch selection preserves', old: 'if (!touch && index < names.length) this.state.focus = index;', replacement: 'if (index < names.length) this.state.focus = index;', error: 'Touch moved the controller ring without native focus' },
  { name: 'stale-hide', filter: 'foreground restore cancels', old: 'if (visible) clearTimeout(this.hideTimer);', replacement: '', error: 'Pending hide survived a newer foreground signal' },
  { name: 'sync-init', filter: 'background start needs', old: "Promise.resolve().then(() => this.setup()).catch((err) => this.fail(err))", replacement: "this.setup().catch((err) => this.fail(err))", error: 'Manager did not hand over this app entry point' },
  { name: 'invalid-ambient', target: 'data.js', filter: 'invalid ambient quality', old: "ambient.quality === 'invalid' || ", replacement: '', error: 'Invalid ambient was accepted into live boost' },
  { name: 'impossible-temperature', target: 'data.js', filter: 'temperatures below absolute zero', old: 'if (value !== null && value < -273.15) value = null;', replacement: '', error: 'Impossible temperature accepted' },
  { name: 'future-ordering', target: 'data.js', filter: 'future timestamp cannot poison', old: 'incomingValid && oldValid && incoming.timestamp < old.timestamp', replacement: 'incoming && old && finite(incoming.timestamp) && finite(old.timestamp) && incoming.timestamp < old.timestamp', error: 'Future cache blocked recovery' },
  { name: 'overview-status', target: 'view.js', filter: 'Overview exposes each', old: 'flag(r, s.odometer, 780, 316);', replacement: '', error: 'Range and odometer need separate STALE labels' },
  { name: 'power-basis', target: 'data.js', filter: 'Live Pulls requires engine basis', old: "if (input.basis !== 'engine')", replacement: 'if (false)', error: 'Undeclared power basis accepted' },
  { name: 'red-engine-scale', target: 'view.js', filter: 'Live Pulls fifth page', old: "red: '#eb405c'", replacement: "red: '#24334a'", error: 'Missing M-red engine scale' },
  { name: 'angular-scale-labels', target: 'view.js', filter: 'Angular instrument endpoint', old: 'r.text(scale(d.min), x + 20, y + h - 7, 13, color.muted);', replacement: '', error: 'Minimum scale label missing' },
  { name: 'fahrenheit-conversion', target: 'model.js', filter: 'display defaults to Fahrenheit', old: 'factor = 9 / 5; offset = 32;', replacement: 'factor = 1; offset = 0;', error: 'Fahrenheit conversion missing' },
  { name: 'null-temperature', target: 'model.js', filter: 'display defaults to Fahrenheit', old: "reading && typeof reading.value === 'number'", replacement: 'reading', error: 'Unavailable temperature became a numeric reading' },
  { name: 'us-units', target: 'model.js', filter: 'every displayed unit is US', old: "  if (temperature) { factor = 9 / 5; offset = 32; unit = '\\u00b0F'; }", replacement: "  if (temperature) unit = '\\u00b0C';", error: 'Non-US unit shown for oil' },
  { name: 'touch-tabs', target: 'model.js', filter: 'touch tabs and swipes', old: 'state.page = index - 10;', replacement: 'state.page = 0;', error: 'Touch tab did not select page' },
  { name: 'numeric-responsive', target: 'view.js', filter: 'visual interpolation never', old: 'Model.value(v, name ===', replacement: 'Model.value(Object.assign({}, v, { value: 0 }), name ===', error: 'Numeric reading was interpolated' },
  { name: 'invalid-indicator', target: 'view.js', filter: 'visual interpolation never', old: 'delete state.visuals[key];', replacement: '', error: 'Invalid reading retained a position indicator' },
  { name: 'my-gauges-swipe', target: 'view.js', filter: 'touch tabs and swipes', old: 'down && !state.info', replacement: 'down && down.index < 0 && !state.info', error: 'Gauge hit area blocked swipe' },
  { name: 'obd-actual-pressure', target: 'vehicle.js', filter: 'BMW boost uses actual sensor', old: '(d[3] * 256 + d[4]) / 32', replacement: '(d[1] * 256 + d[2]) / 32', error: 'Commanded pressure must not be rendered as actual boost' },
  { name: 'support-scan-retry', target: 'vehicle.js', filter: 'BMW support scan retries', old: 'if (retryScan) this.scan.push(p.pid);', replacement: '', error: 'Support scan must recover after timeout' },
  { name: 'getter-generation', target: 'vehicle.js', filter: 'BMW a getter started before hide', old: 'if (generation === this.generation) receive(x);', replacement: 'receive(x);', error: 'Pre-hide getter must not enter a new active session' },
  { name: 'custom-duplicates', target: 'model.js', filter: 'My Gauges settings reject', old: 'new Set(gauges).size === 3 && ', replacement: '', error: 'Invalid custom selection accepted' },
  { name: 'interrupted-scan', target: 'vehicle.js', filter: 'BMW discovery survives hide', old: 'if (retryScan) this.scan.push(p.pid);', replacement: 'if (retryScan && this.active) this.scan.push(p.pid);', error: 'Interrupted scan must survive hide' },
  { name: 'queued-read', target: 'vehicle.js', filter: 'BMW queued TASU request', old: 'if (this.closed || !this.active || generation !== this.generation || this.pending !== pending) return null;', replacement: '', error: 'Read sent after lifecycle cancellation' },
  { name: 'torque-sentinel', target: 'vehicle.js', filter: 'BMW adapter polls exact', old: 'x.actualValueTorqueCrankshaft, 4095, 0.5', replacement: 'x.actualValueTorqueCrankshaft, 65535, 0.5', error: 'Invalid torque sentinel must not produce horsepower' },
  { name: 'telemetry-frame-cadence', filter: 'garage gates vehicle reads', old: 'if (!this.stopping) Model.acceptFrame(this.state, frame);', replacement: 'if (!this.stopping) { Model.acceptFrame(this.state, frame); this.render(); }', error: 'Telemetry must not bypass the renderer cadence' },
  { name: 'catalog-url', filter: 'GitHub catalog mode', old: 'url: base + name', replacement: 'url: name', error: 'Invalid URL' }
];
if (process.argv[2] === '--child') {
  const control = controls.find((item) => item.name === process.argv[3]);
  if (!control) throw new Error('Unknown negative control');
  process.env.TEST_FILTER = control.filter;
  function mutate(source) {
    if (!source.includes(control.old)) throw new Error('Mutation anchor missing');
    return source.replace(control.old, control.replacement);
  }
  if (control.name === 'catalog-url' || control.target) {
    const target = control.target ? path.resolve(__dirname, '../apps/bishal_garage/src', control.target) : path.resolve(__dirname, '../tools/package.js');
    const compile = Module.prototype._compile;
    Module.prototype._compile = function (source, filename) {
      return compile.call(this, filename === target ? mutate(source) : source, filename);
    };
  } else {
    const read = fs.readFileSync;
    fs.readFileSync = function (file, options) {
      const source = read.call(this, file, options);
      return path.resolve(String(file)) === path.resolve(__dirname, '../apps/bishal_garage/src/garage.js') && typeof source === 'string' ? mutate(source) : source;
    };
  }
  require('./run');
} else {
  let failed = false;
  controls.forEach((control) => {
    const result = cp.spawnSync(process.execPath, [__filename, '--child', control.name], { encoding: 'utf8', cwd: path.resolve(__dirname, '..') });
    const output = result.stdout + result.stderr;
    if (result.status === 0 || !output.includes(control.error)) {
      failed = true; console.error('Negative control did not fail as intended: ' + control.name + '\n' + output);
    } else console.log('PASS negative control ' + control.name + ': reverting the fix fails the regression test (' + control.error + ')');
  });
  if (failed) process.exitCode = 1;
  else console.log(controls.length + ' in-memory reversions rejected. Working source files were not changed.');
}
