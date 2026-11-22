'use strict';

const Data = require('./data.js');
const Session = require('./session.js');
// Existing page indices stay stable; new pages are appended and the groups set the visible order.
const pages = ['Overview', 'Performance', 'Fuel & Ethanol', 'Temperatures', 'Live Pulls', 'My Gauges', 'Balkan Automotive',
  'Pull Graph', 'Peaks', 'G-Meter', 'Brake Test', 'Drag Timer', 'M Vitals', 'Readiness', 'Diagnostics', 'Dyno', 'Seats', 'Drive Recorder', 'Turn View'];
const groups = [{ name: 'Drive', pages: [0, 1, 4, 7, 8] }, { name: 'Track', pages: [9, 10, 11, 15, 12] }, { name: 'Cabin', pages: [16, 17, 18] }, { name: 'Garage', pages: [13, 2, 3, 14, 5, 6] }];
const order = groups.reduce(function (list, g) { return list.concat(g.pages); }, []);
const PAGE = { pullGraph: 7, peaks: 8, gmeter: 9, brake: 10, drag: 11, vitals: 12, readiness: 13, diagnostics: 14, dyno: 15, seats: 16, recorder: 17, turnView: 18 };
// Locked features: shown so the layout is final, but nothing here talks to the car until verified on iDrive 8.
const liveAdjust = { tune: 'bootmod3', maps: ['Map 1', 'Map 2', 'Map 3', 'Map 4'], locked: true, reason: 'Not verified on iDrive 8 + bootmod3' };
const cabinApps = {
  16: { title: 'Seats', id: 'iteriodev_seats', by: 'IterioDev', needs: ['Seats app from MGU Store', 'Comfort tool'], does: ['Adjust both front seats on screen', '3 memory presets per seat', 'Passenger "Make room"', 'Easy Exit for seats and steering column'] },
  17: { title: 'Drive Recorder', id: 'oap-driverecorder-next', by: 'IterioDev', needs: ['Drive Recorder app from MGU Store', 'Drive Recorder player tool', 'Car coded for Drive Recorder'], does: ['Records the camera streams directly', '20 s before / 10 s after each saved clip', 'Playback and clip locking', 'USB export'] },
  18: { title: 'Turn View', id: 'iteriodev_turnview', by: 'IterioDev', needs: ['Turn View app from MGU Store', 'Turn View tool', 'Cluster renderer'], does: ['Front camera in a cluster widget or full screen', 'Arrows at upcoming turns', 'Guidance from BMW Maps, CarPlay or Android Auto'] }
};
function groupOf(page) { for (let i = 0; i < groups.length; i++) if (groups[i].pages.indexOf(page) >= 0) return i; return 0; }
function step(page, delta) { return order[(order.indexOf(page) + order.length + delta) % order.length]; }
const customChoices = ['rpm', 'boost', 'power', 'torque', 'speed', 'oil', 'coolant', 'intake', 'ethanol', 'fuel', 'throttle', 'gear'];
const defaults = ['rpm', 'boost', 'power'];
function configure(state, saved) {
  const gauges = Array.isArray(saved) ? saved : saved && saved.gauges;
  state.custom = Array.isArray(gauges) && gauges.length === 3 && new Set(gauges).size === 3 && gauges.every(function (name) { return customChoices.indexOf(name) >= 0; }) ? gauges.slice() : defaults.slice();
  state.dynoBaseline = validRun(saved && !Array.isArray(saved) ? saved.dynoBaseline : null);
}
function validRun(run) {
  const ok = run && typeof run.at === 'number' && Array.isArray(run.curve) && run.curve.length >= 2 && run.curve.length <= 200 && ['peakHp', 'peakHpRpm', 'peakTq', 'peakTqRpm'].every(function (k) { return typeof run[k] === 'number' && isFinite(run[k]); }) &&
    run.curve.every(function (p) { return p && [p.rpm, p.hp, p.lbft].every(function (v) { return typeof v === 'number' && isFinite(v); }); });
  return ok ? { at: run.at, curve: run.curve.map(function (p) { return { rpm: p.rpm, hp: p.hp, lbft: p.lbft }; }), peakHp: run.peakHp, peakHpRpm: run.peakHpRpm, peakTq: run.peakTq, peakTqRpm: run.peakTqRpm } : null;
}
function dynoRuns(state) { return state.mode === 'demo' ? Session.demo.dynoRuns : (state.session || Session.create()).dynoRuns; }
function dynoBaseline(state) { return state.mode === 'demo' ? Session.demo.dynoBaseline : state.dynoBaseline || null; }
function cycleGauge(state) {
  const index = customChoices.indexOf(state.custom[state.customSlot]);
  for (let step = 1; step <= customChoices.length; step++) {
    const name = customChoices[(index + step) % customChoices.length];
    if (state.custom.indexOf(name) < 0) { state.custom[state.customSlot] = name; state.configDirty = true; break; }
  }
}
function create(version, id, mode) {
  return { version: version, id: id || 'local preview', focus: 0, sample: 0, page: 0, refreshes: 0,
    mode: mode === 'demo' ? 'demo' : 'live', info: false, live: Data.disconnected(),
    custom: defaults.slice(), customSlot: 0, editing: false, configDirty: false, preferenceStatus: '', pulls: pullTimer(), session: Session.create(), faults: null, scanRequest: false };
}
const pullRanges = [{ id: '0-60', from: 0, to: 60 }, { id: '60-130', from: 60, to: 130 }];
const demoPulls = { '0-60': [3.62, 3.71, 3.58], '60-130': [8.04, 8.21] };
function pullTimer() { return { last: null, launch: null, roll: null, results: { '0-60': [], '60-130': [] } }; }
function crossing(a, b, mph) { return a.t + (b.t - a.t) * (mph - a.s) / (b.s - a.s); }
// Speed arrives at ~10 Hz receipt time, so a run is only kept while samples are continuous and plausible.
function feedPull(timer, mph, time) {
  const prev = timer.last, cur = { s: mph, t: time };
  if (prev && time <= prev.t) return;
  timer.last = cur;
  if (!prev) { if (mph <= 1) timer.launch = { armed: true }; return; }
  if (time - prev.t > 1000 || Math.abs(mph - prev.s) / (time - prev.t) > 0.04) { timer.launch = mph <= 1 ? { armed: true } : null; timer.roll = null; return; }
  function record(id, start) {
    const seconds = (crossing(prev, cur, id === '0-60' ? 60 : 130) - start) / 1000;
    timer.results[id].unshift({ seconds: seconds, at: time }); timer.results[id] = timer.results[id].slice(0, 3);
  }
  const launch = timer.launch;
  if (mph <= 1) timer.launch = { armed: true };
  else if (launch && launch.armed && prev.s <= 1) timer.launch = { start: crossing(prev, cur, 1), peak: mph };
  else if (launch && launch.start !== undefined) {
    if (mph < launch.peak - 2 || time - launch.start > 20000) timer.launch = null;
    else if (prev.s < 60 && mph >= 60) { record('0-60', launch.start); timer.launch = null; }
    else launch.peak = Math.max(launch.peak, mph);
  }
  const roll = timer.roll;
  if (roll && (mph < roll.peak - 2 || time - roll.start > 30000)) timer.roll = null;
  else if (roll && prev.s < 130 && mph >= 130) { record('60-130', roll.start); timer.roll = null; }
  else if (roll) roll.peak = Math.max(roll.peak, mph);
  if (prev.s < 60 && mph >= 60 && mph < 130) timer.roll = { start: crossing(prev, cur, 60), peak: mph };
}
function pulls(state) {
  if (state.mode === 'demo') return pullRanges.map(function (range) { return { id: range.id, times: demoPulls[range.id].slice(), running: false }; });
  const timer = state.pulls || pullTimer();
  return pullRanges.map(function (range) {
    const run = range.id === '0-60' ? timer.launch : timer.roll;
    return { id: range.id, times: timer.results[range.id].map(function (r) { return r.seconds; }), running: !!(run && run.start !== undefined), armed: !!(run && run.armed) };
  });
}
// E50 blend planner. Flex E70 and gas E10 are upper bounds, so any error lands below the 50% ceiling.
const blendLimits = { target: 50, flex: 70, gas: 10, tankGallons: 15.9 };
function blend(ethanol, fuel) {
  if (typeof ethanol !== 'number' || typeof fuel !== 'number') return null;
  const b = blendLimits, volume = b.tankGallons * fuel / 100, space = b.tankGallons - volume;
  if (ethanol > b.target) {
    const gas = volume * (ethanol - b.target) / (b.target - b.gas);
    return { over: true, gas: gas, space: space, fits: gas <= space };
  }
  const flex = volume * (b.target - ethanol) / (b.flex - b.target);
  const fillFlex = Math.max(0, Math.min(space, (b.target * b.tankGallons - volume * ethanol - space * b.gas) / (b.flex - b.gas)));
  const fillResult = (volume * ethanol + fillFlex * b.flex + (space - fillFlex) * b.gas) / b.tankGallons;
  const fitted = Math.min(flex, space);
  return { over: false, flex: fitted, fits: flex <= space, flexResult: (volume * ethanol + fitted * b.flex) / (volume + fitted), fillFlex: fillFlex, fillGas: space - fillFlex, fillResult: fillResult, space: space };
}
function snapshot(state, now) { return state.mode === 'demo' ? Data.demo(state.sample) : Data.resolve(state.live, now === undefined ? Date.now() : now); }
function blendLines(state, signals) {
  const plan = current(signals.ethanol) && current(signals.fuel) ? blend(signals.ethanol.value, signals.fuel.value) : null;
  if (!plan) return null;
  function v(gallons) { return gallons.toFixed(1) + ' gal'; }
  if (plan.over) return [plan.fits ? 'Add ' + v(plan.gas) + ' gas to drop to E50' : 'Above E50: needs ' + v(plan.gas) + ' gas, tank has ' + v(plan.space), 'Do not add flex fuel'];
  return [plan.fits ? 'Add ' + v(plan.flex) + ' flex now to reach E50' : 'Fill with ' + v(plan.flex) + ' flex: E' + Math.floor(plan.flexResult),
    'Fill-up: ' + v(plan.fillFlex) + ' flex + ' + v(plan.fillGas) + ' gas = E' + Math.floor(plan.fillResult)];
}
function acceptFrame(state, frame, now) {
  now = now === undefined ? Date.now() : now;
  state.live = Data.ingest(state.live, frame, now);
  if (!state.pulls) state.pulls = pullTimer();
  const speed = state.live.connected ? Data.normalizeSignal('speed', state.live.signals.speed, now) : null;
  if (speed && speed.status === 'live') feedPull(state.pulls, speed.value, speed.timestamp);
  else { state.pulls.last = null; state.pulls.launch = null; state.pulls.roll = null; }
  if (!state.session) state.session = Session.create();
  Session.feed(state.session, Data.resolve(state.live, now).signals, now);
  if (frame && frame.faults) state.faults = frame.faults;
}
// The record a page shows: fixed samples in demo, this drive's measurements in live mode.
function records(state) { return state.mode === 'demo' ? Session.demo : state.session || Session.create(); }
const demoFaults = { state: 'done', demo: true, units: [
  { ecu: 0x12, name: 'DME engine', codes: [{ code: '1F2101', status: 'STORED' }] },
  { ecu: 0x29, name: 'DSC brakes', codes: [] },
  { ecu: 0x60, name: 'KOMBI cluster', codes: [{ code: '801C20', status: 'PENDING' }, { code: '8040E9', status: 'STORED' }] }] };
function faults(state) { return state.mode === 'demo' ? (state.demoScanned ? demoFaults : null) : state.faults; }
// Read-only warm-up and setup checks. Thresholds are general guidance for a road car, not BMW limits.
function readiness(state, s) {
  function item(label, ok, warn, detail) { return { label: label, state: ok === null ? 'unknown' : ok ? 'ready' : warn ? 'warming' : 'check', detail: detail }; }
  function temp(name, label, ready) {
    const r = s[name];
    if (!current(r)) return item(label, null, false, 'No reading');
    return item(label, r.value >= ready, true, display(state, name, r).reading.value.toFixed(0) + ' ' + display(state, name, r).unit + ' / ready at ' + display(state, name, { value: ready }).reading.value.toFixed(0));
  }
  const list = [temp('oil', 'Engine oil', 80), temp('coolant', 'Coolant', 75), temp('gearboxOil', 'Gearbox oil', 50)];
  const off = Data.tyres.map(function (c) { return current(s['tyreP' + c]) && current(s['tyreTarget' + c]) ? s['tyreP' + c].value - s['tyreTarget' + c].value : null; });
  const known = off.filter(function (v) { return v !== null; });
  list.push(known.length < 4 ? item('Tire pressures', null, false, 'Needs pressure and target for all four') :
    item('Tire pressures', known.every(function (v) { return Math.abs(v) <= 2; }), false, 'Within 2 psi of target: ' + known.filter(function (v) { return Math.abs(v) <= 2; }).length + ' / 4'));
  const f = faults(state);
  const usable = f && f.state === 'done' && !f.error && f.units.length > 0;
  const active = usable ? f.units.reduce(function (n, u) { return n + u.codes.filter(function (c) { return c.status === 'ACTIVE' || c.status === 'WARNING LAMP'; }).length; }, 0) : null;
  list.push(active === null ? item('Fault memory', null, false, f && f.state === 'done' ? (f.error || 'No unit answered') : 'Not scanned this drive') : item('Fault memory', active === 0, false, active === 0 ? 'No active faults' : active + ' active'));
  return list;
}
function tyreStatus(celsius) {
  if (typeof celsius !== 'number') return null;
  return celsius < 20 ? 'COLD' : celsius < 35 ? 'WARMING' : celsius <= 65 ? 'READY' : 'HOT';
}
function settings(state) { return { gauges: state.custom.slice(), dynoBaseline: state.dynoBaseline || null }; }
function display(state, name, reading) {
  const definition = Data.definitions[name];
  let factor = 1, offset = 0, unit = definition.unit;
  const temperature = definition.unit === 'C';
  if (temperature) { factor = 9 / 5; offset = 32; unit = '\u00b0F'; }
  return { reading: Object.assign({}, reading, { value: reading && typeof reading.value === 'number' ? reading.value * factor + offset : null }),
    unit: unit, min: definition.min * factor + offset, max: definition.max * factor + offset, label: definition.label };
}
function act(state, index) {
  if (index >= 10 && index < 10 + pages.length) { state.page = index - 10; state.info = false; state.editing = false; return; }
  if (index >= 40 && index < 40 + groups.length) { state.page = groups[index - 40].pages[0]; state.info = false; state.editing = false; return; }
  if (index === 2 && !state.info && state.page === PAGE.diagnostics) { if (state.mode === 'demo') state.demoScanned = true; else state.scanRequest = true; return; }
  if (index === 2 && !state.info && state.page === PAGE.peaks && state.mode === 'live') { state.session.peaks = {}; return; }
  // Pin the latest dyno run as the baseline; pinning the same run again clears it.
  if (index === 2 && !state.info && state.page === PAGE.dyno && state.mode === 'live') {
    const latest = dynoRuns(state)[0];
    if (!latest) return;
    state.dynoBaseline = state.dynoBaseline && state.dynoBaseline.at === latest.at ? null : validRun(latest);
    state.configDirty = true; return;
  }
  if (state.info && index === 2) return;
  if (state.page === 5 && !state.info) {
    if (index >= 5 && index <= 7) { state.customSlot = index - 5; state.editing = true; return; }
    if (state.editing) {
      if (index === 0 || index === 1) state.customSlot = (state.customSlot + (index === 0 ? 2 : 1)) % 3;
      if (index === 2) cycleGauge(state);
      if (index === 3) state.editing = false;
      if (index === 4) { state.custom = defaults.slice(); state.configDirty = true; }
      return;
    }
    if (index === 2) { state.editing = true; return; }
  }
  if (index === 0 || index === 1) { state.page = step(state.page, index === 0 ? -1 : 1); state.info = false; state.editing = false; }
  if (index === 2 && state.mode === 'demo') { state.sample = 1 - state.sample; state.refreshes++; }
  if (index === 3) { state.mode = state.mode === 'demo' ? 'live' : 'demo'; state.info = false; }
  if (index === 4) state.info = !state.info;
}
function rows(state) {
  if (state.info) return ['Previous page', 'Next page', 'Units | US: mph, gal, \u00b0F, psi', state.mode === 'demo' ? 'Data mode | Switch to live' : 'Data mode | Enable labeled demo', 'Close About / Settings'];
  if (state.page === 5 && state.editing && !state.info) return ['Previous gauge slot', 'Next gauge slot', 'Change gauge | ' + Data.definitions[state.custom[state.customSlot]].label, 'Done / use my gauges', 'Reset three gauges to defaults'];
  return ['Previous | ' + pages[step(state.page, -1)],
    'Next | ' + pages[step(state.page, 1)],
    state.page === 5 ? 'Customize my gauges | Three slots' : state.page === PAGE.diagnostics ? 'Scan fault memory | Read only' : state.page === PAGE.peaks && state.mode === 'live' ? 'Reset session peaks' :
    state.page === PAGE.dyno && state.mode === 'live' ? (dynoRuns(state)[0] ? 'Pin latest run as baseline' : 'Pin baseline | No run yet') : state.mode === 'demo' ? 'Refresh demo sample | ' + (state.sample + 1) + '/2' : 'Automatic live reads | No manual refresh',
    state.mode === 'demo' ? 'Data mode | Switch to live' : 'Data mode | Enable labeled demo', 'About / version | ' + state.version];
}
function current(reading) { return reading && (reading.status === 'live' || reading.status === 'demo') && typeof reading.value === 'number'; }
function value(reading, decimals) { return current(reading) ? reading.value.toFixed(decimals || 0) : '--'; }
function gearValue(reading) { return current(reading) && reading.value <= 0 ? reading.value === 0 ? 'N' : 'R' : value(reading); }
function field(reading, decimals) { return (reading.estimated && current(reading) ? 'EST. ' : '') + value(reading, decimals) + (current(reading) ? '' : ' [' + reading.status.toUpperCase() + ']'); }
function summary(state, now) {
  const d = snapshot(state, now), s = {}, u = {};
  Object.keys(d.signals).forEach(function (name) { const converted = display(state, name, d.signals[name]); s[name] = converted.reading; u[name] = converted.unit; });
  const prefix = (state.mode === 'demo' ? 'DEMO / NOT VEHICLE DATA' : d.connected ? 'ADAPTER CONNECTED' : 'DISCONNECTED') + ' | ' + groups[groupOf(state.page)].name + ' / ' + pages[state.page] + ' | ';
  if (state.info) return prefix + state.id + ' v' + state.version + ' | US units';
  const ethanol = 'Ethanol ' + field(s.ethanol) + '% / ' + (current(s.ethanol) ? 'E' + Math.round(s.ethanol.value) : 'E--');
  const rec = records(state);
  function runs(list, format) { return list.length ? list.map(format).join(', ') : '--'; }
  if (state.page === PAGE.pullGraph) return prefix + (rec.pullGraph ? 'Last full-throttle pull: ' + rec.pullGraph.samples.length + ' points, peak ' + Math.round(Math.max.apply(null, rec.pullGraph.samples.map(function (p) { return p.hp; }))) + ' hp EST.' : 'No full-throttle pull recorded yet');
  if (state.page === PAGE.peaks) return prefix + Session.peakNames.concat(['lateral', 'accel', 'braking']).map(function (k) {
    if (rec.peaks[k] === undefined) return k + ' --';
    if (k === 'lateral' || k === 'accel' || k === 'braking') return k + ' ' + rec.peaks[k].toFixed(2) + ' g';
    const d = display(state, k, { value: rec.peaks[k], status: 'live' });
    return k + ' ' + d.reading.value.toFixed(k === 'boost' ? 1 : 0) + ' ' + d.unit;
  }).join(' | ');
  if (state.page === PAGE.gmeter) return prefix + 'Longitudinal ' + field(s.gLong, 2) + ' g | Lateral ' + field(s.gLat, 2) + ' g';
  if (state.page === PAGE.brake) return prefix + '60-0 mph: ' + runs(rec.brakeRuns, function (r) { return r.feet.toFixed(1) + ' ft / ' + r.seconds.toFixed(2) + ' s'; });
  if (state.page === PAGE.drag) return prefix + Session.drags.map(function (d) { return d.id + ' mile ' + runs(rec.dragRuns[d.id], function (r) { return r.seconds.toFixed(2) + ' s @ ' + r.trap.toFixed(1) + ' mph'; }); }).join(' | ') +
    ' | ' + Session.splits.map(function (sp) { return sp.id + ' mph ' + runs((rec.splitRuns || {})[sp.id] || [], function (r) { return r.seconds.toFixed(2) + ' s'; }); }).join(' | ');
  if (state.page === PAGE.vitals) return prefix + Data.tyres.map(function (c) { return c + ' ' + field(s['tyreP' + c], 1) + ' ' + u['tyreP' + c] + ' ' + field(s['tyreT' + c]) + ' ' + u['tyreT' + c]; }).join(' | ') + ' | Gearbox ' + field(s.gearboxOil) + ' ' + u.gearboxOil + ' | Outside ' + field(s.ambient) + ' ' + u.ambient;
  if (state.page === PAGE.readiness) return prefix + readiness(state, d.signals).map(function (i) { return i.label + ' ' + i.state.toUpperCase(); }).join(' | ');
  if (state.page === PAGE.diagnostics) { const f = faults(state); return prefix + (!f ? 'Not scanned. Read-only scan, ignition on, parked.' : f.state === 'scanning' ? 'Scanning all units' : f.units.length + ' units answered, ' + f.units.reduce(function (n, x) { return n + x.codes.length; }, 0) + ' codes'); }
  if (state.page === 0) return prefix + 'Speed ' + field(s.speed) + ' ' + u.speed + ' | Fuel ' + field(s.fuel) + '% | ' + ethanol + ' | Range ' + field(s.range) + ' ' + u.range + ' | ODO ' + field(s.odometer) + ' ' + u.range + '';
  if (state.page === 1) return prefix + 'Boost ' + field(s.boost, 1) + ' ' + u.boost + ' | Speed ' + field(s.speed) + ' ' + u.speed + ' | Torque ' + field(s.torque) + ' ' + u.torque + ' | BM3 Live Adjust LOCKED: ' + liveAdjust.reason;
  if (state.page === PAGE.dyno) {
    const run = dynoRuns(state)[0], base = dynoBaseline(state);
    function peaks(r) { return Math.round(r.peakHp) + ' hp @ ' + r.peakHpRpm + ' / ' + Math.round(r.peakTq) + ' lb-ft @ ' + r.peakTqRpm; }
    return prefix + (run ? 'Latest EST. ' + peaks(run) : 'No dyno pull yet') + ' | Baseline ' + (base ? peaks(base) : 'none') + ' | Road-load estimate, not a dyno';
  }
  if (cabinApps[state.page]) { const c = cabinApps[state.page]; return prefix + c.title + ' needs ' + c.needs.join(', ') + ' | Launch not verified: open it from the iDrive app list'; }
  if (state.page === 2) return prefix + 'Ethanol ' + field(s.ethanol) + '% / ' + (current(s.ethanol) ? 'E' + Math.round(s.ethanol.value) : 'E--') + ' | Fuel remaining ' + field(s.fuel) + '% | Range ' + field(s.range) + ' ' + u.range + ' | E50 plan: ' + (blendLines(state, d.signals) || ['needs live ethanol and fuel level']).join(' / ');
  if (state.page === 6) return prefix + 'Shop showcase | Balkan Automotive logo | Balkan Auto, 210 W Main St, Middletown, PA 17057 | Performance installations, car servicing, alignments, vinyl wrap, aftermarket part installs, literally f*ckin\' anything | No vehicle readings on this page';
  if (state.page === 5) return prefix + state.custom.map(function (name) { return Data.definitions[name].label + ' ' + field(s[name], name === 'boost' ? 1 : 0) + ' ' + u[name]; }).join(' | ') + (state.custom.indexOf('fuel') >= 0 ? ' | ' + ethanol : '') + (state.editing ? ' | Editing slot ' + (state.customSlot + 1) : '') + ' | ' + state.preferenceStatus;
  if (state.page === 4) return prefix + 'Engine ' + field(s.power) + ' ' + u.power + ' / ' + field(s.torque) + ' ' + u.torque + ' | ' + field(s.rpm) + ' RPM | Boost ' + field(s.boost, 1) + ' ' + u.boost + ' | Speed ' + field(s.speed) + ' ' + u.speed + ' | Throttle ' + field(s.throttle) + '% | Gear ' + (current(s.gear) ? gearValue(s.gear) : field(s.gear)) + ' | ' + pulls(state).map(function (p) { return p.id + ' mph ' + (p.times.length ? p.times.map(function (t) { return t.toFixed(2) + ' s'; }).join(', ') : '--'); }).join(' | ');
  return prefix + 'Oil ' + field(s.oil) + ' ' + u.oil + ' | Coolant ' + field(s.coolant) + ' ' + u.coolant + ' | Intake ' + field(s.intake) + ' ' + u.intake;
}
module.exports = { liveAdjust: liveAdjust, cabinApps: cabinApps, dynoRuns: dynoRuns, dynoBaseline: dynoBaseline, validRun: validRun, Data: Data, Session: Session, pages: pages, groups: groups, order: order, PAGE: PAGE, groupOf: groupOf, step: step, records: records, faults: faults, readiness: readiness, tyreStatus: tyreStatus, create: create, snapshot: snapshot, acceptFrame: acceptFrame, act: act, rows: rows, summary: summary, current: current, value: value, gearValue: gearValue, configure: configure, settings: settings, pulls: pulls, pullTimer: pullTimer, feedPull: feedPull, blend: blend, blendLimits: blendLimits, blendLines: blendLines, display: display, customChoices: customChoices };
