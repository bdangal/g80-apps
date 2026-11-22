'use strict';

// Drive-session timers and records, fed from normalized live signals.
// Brake-test triggering follows cauliflowermossgrape/idrive7-apps a948390f brake_test (MIT).
// Drag splits and the virtual dyno follow idrive7-apps e2716cd kit/runtime/run_timer.js and apps/dyno (MIT).
const FT_PER_MILE = 5280;
const MPH_TO_FTS = 5280 / 3600;
const G_FTS2 = 32.174;
const drags = [{ id: '1/8', feet: 660 }, { id: '1/4', feet: 1320 }];
const splits = [{ id: '0-30', from: 0, to: 30 }, { id: '0-60', from: 0, to: 60 }, { id: '0-100', from: 0, to: 100 }, { id: '60-130', from: 60, to: 130 }];
// Mass includes driver and fuel (G80 M3 Competition xDrive EU unladen weight). Sedan drag area as upstream's coupe.
const dyno = { massKg: 1855, cdA: 0.62, rho: 1.2, crr: 0.013, lossPct: 15, bin: 100, minSpan: 1500 };
const peakNames = ['boost', 'rpm', 'speed', 'power', 'torque', 'oil', 'coolant', 'intake', 'gearboxOil'];
function create() {
  const splitRuns = {};
  splits.forEach(function (sp) { splitRuns[sp.id] = []; });
  return { last: null, drag: null, dragRuns: { '1/8': [], '1/4': [] }, splitRuns: splitRuns, lastDrag: null, brake: { state: 'arm', run: null }, brakeRuns: [],
    pull: null, pullGraph: null, dynoPull: null, dynoRuns: [], dynoMessage: null, peaks: {}, message: null };
}
function live(reading) { return reading && reading.status === 'live' && typeof reading.value === 'number'; }
function keep(list, item) { list.unshift(item); return list.slice(0, 3); }
function feedPeaks(session, s) {
  peakNames.forEach(function (name) {
    if (live(s[name]) && (session.peaks[name] === undefined || s[name].value > session.peaks[name])) session.peaks[name] = s[name].value;
  });
  if (live(s.gLat)) session.peaks.lateral = Math.max(session.peaks.lateral || 0, Math.abs(s.gLat.value));
  if (live(s.gLong)) {
    session.peaks.accel = Math.max(session.peaks.accel || 0, s.gLong.value);
    session.peaks.braking = Math.max(session.peaks.braking || 0, -s.gLong.value);
  }
}
// Full-throttle samples of estimated power and torque against RPM; a pull ends when the throttle closes.
function savePull(session, pull, now) {
  const first = pull.samples[0], last = pull.samples[pull.samples.length - 1];
  if (pull.samples.length >= 8 && last.rpm - first.rpm >= 1500) session.pullGraph = { at: now, gear: pull.gear, samples: pull.samples };
}
function feedPullGraph(session, s, now) {
  const wot = live(s.throttle) && s.throttle.value >= 90 && live(s.rpm);
  const pull = session.pull;
  if (wot && live(s.power) && live(s.torque)) {
    const point = { rpm: s.rpm.value, hp: s.power.value, lbft: s.torque.value };
    // An upshift (rpm drop) or a gap ends the current pull; keep it if it qualifies before starting the next gear.
    if (!pull || now - pull.at > 1000 || point.rpm < pull.samples[pull.samples.length - 1].rpm - 300) {
      if (pull) savePull(session, pull, now);
      session.pull = { at: now, samples: [point], gear: live(s.gear) ? s.gear.value : null };
    } else if (point.rpm > pull.samples[pull.samples.length - 1].rpm && pull.samples.length < 200) { pull.samples.push(point); pull.at = now; }
    return;
  }
  if (pull && (!wot || now - pull.at > 1000)) { savePull(session, pull, now); session.pull = null; }
}
// Arms after a full second at a standstill, so a rolling start never counts as a launch.
function finishDrag(session, run, t) {
  if (run.done.length) session.lastDrag = { at: t, trace: run.trace, results: run.done, top: run.peak };
  session.drag = null;
}
function feedDrag(session, mph, t, dt, prev) {
  const run = session.drag;
  if (mph <= 1) {
    if (run && run.start !== undefined) finishDrag(session, run, t);
    if (!session.drag || session.drag.start !== undefined) session.drag = { armed: true, since: prev.mph <= 1 ? prev.t : t };
    return;
  }
  if (run && run.armed && prev.mph <= 1) {
    if (prev.t - run.since < 1000) { session.drag = null; return; }
    const start = prev.t + (t - prev.t) * (1 - prev.mph) / (mph - prev.mph);
    session.drag = { start: start, feet: (1 + mph) / 2 * MPH_TO_FTS * (t - start) / 1000, peak: mph, cross: { 0: start }, done: [], trace: [[0, 0], [(t - start) / 1000, mph]] };
    return;
  }
  if (!run || run.start === undefined) return;
  if (mph < run.peak - 3 || t - run.start > 40000) { finishDrag(session, run, t); return; }
  run.peak = Math.max(run.peak, mph);
  const before = run.feet;
  run.feet += (prev.mph + mph) / 2 * MPH_TO_FTS * dt;
  drags.forEach(function (d) {
    if (before < d.feet && run.feet >= d.feet) {
      const f = (d.feet - before) / (run.feet - before), item = { seconds: (prev.t + f * (t - prev.t) - run.start) / 1000, trap: prev.mph + f * (mph - prev.mph), at: t };
      session.dragRuns[d.id] = keep(session.dragRuns[d.id], item);
      run.done.push({ id: d.id + ' mile', seconds: item.seconds, trap: item.trap });
    }
  });
  [30, 60, 100, 130].forEach(function (v) { if (run.cross[v] === undefined && prev.mph < v && mph >= v) run.cross[v] = prev.t + (v - prev.mph) / (mph - prev.mph) * (t - prev.t); });
  splits.forEach(function (sp) {
    const from = run.cross[sp.from], to = run.cross[sp.to];
    if (from === undefined || to === undefined || run.done.some(function (d) { return d.id === sp.id; })) return;
    const item = { seconds: (to - from) / 1000, at: t };
    session.splitRuns[sp.id] = keep(session.splitRuns[sp.id], item);
    run.done.push({ id: sp.id, seconds: item.seconds });
  });
  const last = run.trace[run.trace.length - 1], at = (t - run.start) / 1000;
  if (at - last[0] >= 0.05) run.trace.push([at, mph]);
  if (run.trace.length > 600) run.trace = run.trace.filter(function (p, i) { return i % 2 === 0; });
  if (run.feet >= 1320 && run.cross[130] !== undefined) finishDrag(session, run, t);
}
// Road-load dyno: wheel power from mass x accel x speed plus aero and rolling drag, scaled up by drivetrain loss.
function analyse(points, now) {
  const bins = {};
  points.forEach(function (p) {
    const key = Math.round(p.rpm / dyno.bin) * dyno.bin, b = bins[key] || (bins[key] = { w: 0, ecu: 0, n: 0, e: 0 });
    b.w += p.w; b.n++; if (p.ecu !== null) { b.ecu += p.ecu; b.e++; }
  });
  const keys = Object.keys(bins).map(Number).sort(function (a, b) { return a - b; });
  const curve = keys.map(function (rpm, i) {
    const near = keys.slice(Math.max(0, i - 2), i + 3).map(function (k) { return bins[k].w / bins[k].n; });
    const watts = near.reduce(function (a, b) { return a + b; }, 0) / near.length;
    return { rpm: rpm, hp: watts / 745.7, lbft: Math.max(0, watts / (rpm * Math.PI / 30)) * 0.7375621, ecu: bins[rpm].e ? bins[rpm].ecu / bins[rpm].e : null };
  });
  const hp = curve.reduce(function (a, b) { return b.hp > a.hp ? b : a; }), tq = curve.reduce(function (a, b) { return b.lbft > a.lbft ? b : a; });
  return { at: now, curve: curve, peakHp: hp.hp, peakHpRpm: hp.rpm, peakTq: tq.lbft, peakTqRpm: tq.rpm, wheelHp: hp.hp * (1 - dyno.lossPct / 100) };
}
function feedDyno(session, s, now) {
  const hard = live(s.gLong) && live(s.speed) && live(s.rpm) && s.gLong.value > 0.12 && s.speed.value > 9.3 && s.rpm.value > 1200;
  let pull = session.dynoPull;
  if (hard) {
    if (!pull) pull = session.dynoPull = { segments: [], last: 0, quiet: 0 };
    pull.quiet = 0;
    if (now - pull.last < 40) return;
    pull.last = now;
    const m = dyno.massKg, v = s.speed.value * 0.44704, a = s.gLong.value * 9.80665, k = s.rpm.value / s.speed.value;
    const wheel = m * a * v + 0.5 * dyno.rho * dyno.cdA * v * v * v + dyno.crr * m * 9.80665 * v;
    // A jump in the rpm/speed ratio means a gear change; each gear is its own segment.
    let seg = pull.segments[pull.segments.length - 1];
    if (!seg || Math.abs(k - seg.k) / seg.k > 0.04) { seg = { k: k, points: [] }; pull.segments.push(seg); } else seg.k += (k - seg.k) * 0.1;
    if (seg.points.length < 400) seg.points.push({ rpm: s.rpm.value, w: wheel / (1 - dyno.lossPct / 100), ecu: live(s.torque) ? s.torque.value : null });
    return;
  }
  if (!pull) return;
  if (!pull.quiet) pull.quiet = now;
  if (now - pull.quiet < 500) return;
  session.dynoPull = null;
  const usable = pull.segments.filter(function (seg) {
    const rpms = seg.points.map(function (p) { return p.rpm; });
    return seg.points.length > 15 && Math.max.apply(null, rpms) - Math.min.apply(null, rpms) >= dyno.minSpan;
  }).sort(function (a, b) { return a.k - b.k; });
  if (!usable.length) { session.dynoMessage = 'Pull too short: hold one gear for 1,500+ rpm'; return; }
  session.dynoRuns = keep(session.dynoRuns, analyse(usable[0].points, now));
  session.dynoMessage = null;
}
function feedBrake(session, mph, t, dt, prev, decel) {
  const b = session.brake;
  if (b.state === 'braking') {
    const run = b.run;
    run.feet += (prev.mph + mph) / 2 * MPH_TO_FTS * dt;
    if (decel !== null) run.peakG = Math.max(run.peakG, decel);
    if (decel !== null && decel < 0.1) { run.released = run.released || t; } else run.released = 0;
    if (mph < 0.5) {
      session.brakeRuns = keep(session.brakeRuns, { feet: run.feet, seconds: (t - run.start) / 1000, peakG: run.peakG, at: t });
      session.brake = { state: 'done', run: null };
    } else if (run.released && t - run.released > 1200) { session.brake = { state: 'arm', run: null }; session.message = 'Brake released, stop not counted'; }
    return;
  }
  if (mph > 63) b.state = 'ready';
  else if (b.state === 'ready' && mph < 57) b.state = 'arm';
  if (b.state === 'done' && mph > 5) b.state = mph > 63 ? 'ready' : 'arm';
  if (b.state === 'ready' && prev.mph >= 60 && mph < 60 && decel !== null && decel >= 0.4) {
    const f = (prev.mph - 60) / (prev.mph - mph), start = prev.t + f * (t - prev.t);
    session.brake = { state: 'braking', run: { start: start, feet: (60 + mph) / 2 * MPH_TO_FTS * (t - start) / 1000, peakG: decel, released: 0 } };
    session.message = null;
  }
}
// Called for every adapter frame; timers advance only on a new live speed sample.
function feed(session, s, now) {
  feedPeaks(session, s);
  feedPullGraph(session, s, now);
  feedDyno(session, s, now);
  const speed = s.speed;
  if (!live(speed)) { session.last = null; session.drag = null; if (session.brake.state === 'braking') session.brake = { state: 'arm', run: null }; return; }
  const prev = session.last, t = speed.timestamp, mph = speed.value;
  if (prev && t <= prev.t) return;
  session.last = { mph: mph, t: t };
  if (!prev) { if (mph <= 1) session.drag = { armed: true, since: t }; return; }
  const dt = (t - prev.t) / 1000;
  // A sample gap or an impossible jump (over ~1.8 g) drops runs in progress instead of guessing.
  if (dt > 1 || Math.abs(mph - prev.mph) * MPH_TO_FTS / dt > 1.8 * G_FTS2) {
    session.drag = mph <= 1 ? { armed: true, since: t } : null;
    if (session.brake.state === 'braking') session.brake = { state: 'arm', run: null };
    return;
  }
  const gl = s.gLong, decel = live(gl) && Math.abs(gl.timestamp - t) <= 500 ? -gl.value : (prev.mph - mph) * MPH_TO_FTS / dt / G_FTS2;
  feedDrag(session, mph, t, dt, prev);
  feedBrake(session, mph, t, dt, prev, decel);
}
const demo = {
  dragRuns: { '1/8': [{ seconds: 7.38, trap: 98.4 }, { seconds: 7.45, trap: 97.6 }, { seconds: 7.41, trap: 98.1 }], '1/4': [{ seconds: 11.42, trap: 124.6 }, { seconds: 11.51, trap: 123.9 }] },
  splitRuns: { '0-30': [{ seconds: 1.52 }], '0-60': [{ seconds: 3.18 }, { seconds: 3.24 }], '0-100': [{ seconds: 7.21 }], '60-130': [{ seconds: 7.86 }] },
  lastDrag: null,
  dynoRuns: [], dynoBaseline: null,
  brakeRuns: [{ feet: 101.8, seconds: 2.71, peakG: 1.18 }, { feet: 99.6, seconds: 2.66, peakG: 1.21 }, { feet: 98.9, seconds: 2.64, peakG: 1.22 }],
  peaks: { boost: 24.2, rpm: 7120, speed: 131, power: 610, torque: 523, oil: 108, coolant: 96, intake: 42, gearboxOil: 88, lateral: 1.08, accel: 0.71, braking: 1.22 },
  pullGraph: { gear: 3, samples: [] }
};
for (let rpm = 2500; rpm <= 7200; rpm += 150) {
  const lbft = rpm < 5600 ? 520 + (rpm - 2500) * 0.006 : 538 - (rpm - 5600) * 0.11;
  demo.pullGraph.samples.push({ rpm: rpm, lbft: lbft, hp: lbft * rpm / 5252 });
}
demo.lastDrag = { at: 0, top: 126, results: [], trace: [] };
for (let t = 0; t <= 11.6; t += 0.2) demo.lastDrag.trace.push([t, 126 * (1 - Math.exp(-t / 5.1)) + Math.min(t, 0.6) * 4]);
// Sample dyno curves: the latest run and a slightly weaker pinned baseline.
function demoRun(scale, at) {
  return analyse(demo.pullGraph.samples.filter(function (p) { return p.rpm >= 3000; }).map(function (p) { return { rpm: p.rpm, w: p.hp * 745.7 * scale, ecu: p.lbft }; }), at);
}
demo.dynoRuns = [demoRun(0.98, 2), demoRun(0.95, 1)];
demo.dynoBaseline = demoRun(0.93, 0);
module.exports = { create: create, feed: feed, demo: demo, drags: drags, splits: splits, dyno: dyno, analyse: analyse, peakNames: peakNames, FT_PER_MILE: FT_PER_MILE };
