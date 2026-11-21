'use strict';

// Drive-session timers and records, fed from normalized live signals.
// Brake-test triggering follows cauliflowermossgrape/idrive7-apps a948390f brake_test (MIT).
const FT_PER_MILE = 5280;
const MPH_TO_FTS = 5280 / 3600;
const G_FTS2 = 32.174;
const drags = [{ id: '1/8', feet: 660 }, { id: '1/4', feet: 1320 }];
const peakNames = ['boost', 'rpm', 'speed', 'power', 'torque', 'oil', 'coolant', 'intake', 'gearboxOil'];
function create() {
  return { last: null, drag: null, dragRuns: { '1/8': [], '1/4': [] }, brake: { state: 'arm', run: null }, brakeRuns: [],
    pull: null, pullGraph: null, peaks: {}, message: null };
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
function feedDrag(session, mph, t, dt, prev) {
  const run = session.drag;
  if (mph <= 1) { session.drag = { armed: true }; return; }
  if (run && run.armed && prev.mph <= 1) { session.drag = { start: prev.t + (t - prev.t) * (1 - prev.mph) / (mph - prev.mph), feet: 0, peak: mph }; return; }
  if (!run || run.start === undefined) return;
  if (mph < run.peak - 2 || t - run.start > 30000) { session.drag = null; return; }
  run.peak = Math.max(run.peak, mph);
  const before = run.feet;
  run.feet += (prev.mph + mph) / 2 * MPH_TO_FTS * dt;
  drags.forEach(function (d) {
    if (before < d.feet && run.feet >= d.feet) {
      const f = (d.feet - before) / (run.feet - before);
      session.dragRuns[d.id] = keep(session.dragRuns[d.id], { seconds: (prev.t + f * (t - prev.t) - run.start) / 1000, trap: prev.mph + f * (mph - prev.mph), at: t });
    }
  });
  if (run.feet >= 1320) session.drag = null;
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
  const speed = s.speed;
  if (!live(speed)) { session.last = null; session.drag = null; if (session.brake.state === 'braking') session.brake = { state: 'arm', run: null }; return; }
  const prev = session.last, t = speed.timestamp, mph = speed.value;
  if (prev && t <= prev.t) return;
  session.last = { mph: mph, t: t };
  if (!prev) { if (mph <= 1) session.drag = { armed: true }; return; }
  const dt = (t - prev.t) / 1000;
  // A sample gap or an impossible jump (over ~1.8 g) drops runs in progress instead of guessing.
  if (dt > 1 || Math.abs(mph - prev.mph) * MPH_TO_FTS / dt > 1.8 * G_FTS2) {
    session.drag = mph <= 1 ? { armed: true } : null;
    if (session.brake.state === 'braking') session.brake = { state: 'arm', run: null };
    return;
  }
  const gl = s.gLong, decel = live(gl) && Math.abs(gl.timestamp - t) <= 500 ? -gl.value : (prev.mph - mph) * MPH_TO_FTS / dt / G_FTS2;
  feedDrag(session, mph, t, dt, prev);
  feedBrake(session, mph, t, dt, prev, decel);
}
const demo = {
  dragRuns: { '1/8': [{ seconds: 7.38, trap: 98.4 }, { seconds: 7.45, trap: 97.6 }, { seconds: 7.41, trap: 98.1 }], '1/4': [{ seconds: 11.42, trap: 124.6 }, { seconds: 11.51, trap: 123.9 }] },
  brakeRuns: [{ feet: 101.8, seconds: 2.71, peakG: 1.18 }, { feet: 99.6, seconds: 2.66, peakG: 1.21 }, { feet: 98.9, seconds: 2.64, peakG: 1.22 }],
  peaks: { boost: 24.2, rpm: 7120, speed: 131, power: 610, torque: 523, oil: 108, coolant: 96, intake: 42, gearboxOil: 88, lateral: 1.08, accel: 0.71, braking: 1.22 },
  pullGraph: { gear: 3, samples: [] }
};
for (let rpm = 2500; rpm <= 7200; rpm += 150) {
  const lbft = rpm < 5600 ? 520 + (rpm - 2500) * 0.006 : 538 - (rpm - 5600) * 0.11;
  demo.pullGraph.samples.push({ rpm: rpm, lbft: lbft, hp: lbft * rpm / 5252 });
}
module.exports = { create: create, feed: feed, demo: demo, drags: drags, peakNames: peakNames, FT_PER_MILE: FT_PER_MILE };
