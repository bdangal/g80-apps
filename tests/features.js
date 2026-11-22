'use strict';
const assert = require('assert');
const Vehicle = require('../apps/bishal_garage/src/vehicle');
const Session = require('../apps/bishal_garage/src/session');
const Model = require('../apps/bishal_garage/src/model');
const View = require('../apps/bishal_garage/src/view');
const font = require('../apps/bishal_garage/package/artwork/font.json');
function live(value, t, unit) { return { value: value, status: 'live', timestamp: t, unit: unit }; }
function frame(bytesAfterHeader, ecu) { const b = Array(9).fill(0); b[6] = ecu; return { errorCode: 'NO_ERROR', udsResponse: b.concat(bytesAfterHeader) }; }
module.exports = async function (test) {
  await test('diagnostic guard allows only OBD 01 to the DME and ReadDTCInformation 19 02', () => {
    assert(Vehicle.allowed(0x12, 0x01, [0x0C]));
    assert(Vehicle.allowed(0xDF, 0x19, [0x02, 0x0C]));
    [[0xDF, 0x14, [0xFF, 0xFF, 0xFF]], [0x12, 0x10, [0x03]], [0x12, 0x2E, [0xF1, 0x90]], [0x12, 0x31, [0x01]], [0x12, 0x04, []], [0xDF, 0x19, [0x04, 0x0C]], [0x29, 0x01, [0x0C]]]
      .forEach((r) => assert(!Vehicle.allowed(r[0], r[1], r[2]), 'Write or clear request allowed: ' + r[1].toString(16)));
    const v = new Vehicle.VehicleData({}, () => {}, {}); v.tasu = { sendTasuRequest: () => Promise.resolve({ TasuErrorEnum: 'NO_ERROR' }) };
    assert.throws(() => v.request(0xDF, 0x14, [0xFF, 0xFF, 0xFF]), /Blocked/);
  });
  await test('fault records decode BMW code and status priority', () => {
    const codes = Vehicle.parseDtcs([0x59, 0x02, 0xFF, 0x1F, 0x21, 0x01, 0x09, 0x80, 0x1C, 0x20, 0x84, 0x80, 0x40, 0xE9, 0x08, 0x00, 0x00, 0x01]);
    assert.deepStrictEqual(codes.map((c) => c.code + ' ' + c.status), ['1F2101 ACTIVE', '801C20 WARNING LAMP', '8040E9 STORED']);
  });
  await test('fault scan pauses OBD, collects every unit and ignores unrelated replies', async () => {
    let at = 1000; const sent = [], timers = [];
    const v = new Vehicle.VehicleData({}, () => {}, { now: () => at, setTimeout: (f, ms) => { const t = { f: f, at: at + ms }; timers.push(t); return t; }, clearTimeout: (t) => { const i = timers.indexOf(t); if (i >= 0) timers.splice(i, 1); } });
    v.active = true; v.tasu = { sendTasuRequest: (req) => { sent.push(req); return Promise.resolve({ TasuErrorEnum: 'NO_ERROR' }); } };
    assert(v.scanFaults()); for (let i = 0; i < 5; i++) await Promise.resolve();
    assert.strictEqual(sent.length, 1); assert.strictEqual(sent[0].targetAddress, 0xDF); assert.deepStrictEqual(Array.from(sent[0].udsData), [0x02, 0x0C]);
    assert(!v.scanFaults(), 'Second scan started while one runs');
    v.obdLoop(); for (let i = 0; i < 5; i++) await Promise.resolve();
    assert.strictEqual(sent.length, 1, 'OBD request sent during fault scan');
    v.response(frame([0x59, 0x02, 0xFF, 0x1F, 0x21, 0x01, 0x08], 0x12));
    v.response(frame([0x59, 0x02, 0xFF], 0x29));
    v.response(frame([0x62, 0xF1, 0x50, 0x01], 0x60));
    v.response(frame([0x7F, 0x19, 0x78], 0x60));
    let f = v.frame().faults; assert.strictEqual(f.state, 'scanning'); assert.deepStrictEqual(f.units.map((u) => u.name), ['DME engine', 'DSC brakes']);
    assert.strictEqual(f.units[0].codes[0].code, '1F2101');
    const idle = timers.filter((t) => t.at - at === 10000).pop(); assert(idle, 'Response pending did not extend the wait'); at = idle.at; idle.f();
    f = v.frame().faults; assert.strictEqual(f.state, 'done'); assert.strictEqual(f.units.length, 2);
  });
  await test('review fixes: interrupted or failed scans are never read as fault-free', async () => {
    let at = 1000; const timers = [];
    const v = new Vehicle.VehicleData({}, () => {}, { now: () => at, setTimeout: (f, ms) => { const t = { f: f, at: at + ms }; timers.push(t); return t; }, clearTimeout: (t) => { const i = timers.indexOf(t); if (i >= 0) timers.splice(i, 1); } });
    v.active = true; v.tasu = { sendTasuRequest: () => Promise.resolve({ TasuErrorEnum: 'NO_ERROR' }) };
    v.scanFaults(); for (let i = 0; i < 5; i++) await Promise.resolve();
    v.setActive(false);
    const f = v.frame().faults; assert.strictEqual(f.state, 'done'); assert(f.error, 'Hidden mid-scan finished without an error');
    const s = Model.create('test'); s.mode = 'live';
    [f, { state: 'done', units: [], error: 'Diagnostic link not ready' }, { state: 'done', units: [] }].forEach((result) => {
      s.faults = result; const item = Model.readiness(s, {}).find((x) => x.label === 'Fault memory');
      assert.strictEqual(item.state, 'unknown', 'Failed or empty scan reported as no faults: ' + item.detail);
    });
  });
  await test('review fixes: response pending keeps its longer wait', async () => {
    let at = 1000; const timers = [];
    const v = new Vehicle.VehicleData({}, () => {}, { now: () => at, setTimeout: (f, ms) => { const t = { f: f, at: at + ms }; timers.push(t); return t; }, clearTimeout: (t) => { const i = timers.indexOf(t); if (i >= 0) timers.splice(i, 1); } });
    v.active = true; v.tasu = { sendTasuRequest: () => Promise.resolve({ TasuErrorEnum: 'NO_ERROR' }) };
    v.scanFaults(); for (let i = 0; i < 5; i++) await Promise.resolve();
    v.response(frame([0x7F, 0x19, 0x78], 0x12)); at += 100;
    v.response(frame([0x59, 0x02, 0xFF], 0x10));
    const next = timers.filter((t) => t.f.name !== 'tick').sort((a, b) => a.at - b.at);
    assert(!next.some((t) => t.at < 1000 + 10000 && t.at > 1000 + 6000) || timers.some((t) => t.at >= 11000), 'Pending wait was cut short');
    at = 5200; timers.filter((t) => t.at <= at).forEach((t) => t.f());
    assert.strictEqual(v.frame().faults.state, 'scanning', 'Pending wait was cut short');
    v.response(frame([0x59, 0x02, 0xFF, 0x1F, 0x21, 0x01, 0x08], 0x12));
    v.response(frame([0x59, 0x02, 0xFF], 0x12));
    assert.strictEqual(v.frame().faults.units.find((u) => u.ecu === 0x12).codes.length, 1, 'A later foreign reply replaced our answer');
  });
  await test('review fixes: tire unit is fixed once so a flat tire stays low', () => {
    const v = new Vehicle.VehicleData({}, () => {}, {});
    v.tyrePressure('tyreTargetFL', 360, 1); v.tyrePressure('tyrePFL', 50, 1);
    assert.strictEqual(v.native.tyrePFL.unit, 'psi', 'Flat tire re-read in another unit'); assert.strictEqual(v.native.tyrePFL.value, 5, 'Flat tire re-read in another unit');
  });
  await test('review fixes: g offset is not learned from a stale standstill', () => {
    const v = new Vehicle.VehicleData({}, () => {}, {});
    v.native.speed = { value: 0, timestamp: 0 };
    const raw = Math.round((0.5 * 9.80665 + 65) / 0.002);
    for (let t = 0; t <= 10000; t += 100) v.acceleration('gLong', raw, t);
    assert(v.native.gLong.value > 0.45, 'Stale speed zeroed a real 0.5 g');
  });
  await test('review fixes: Peaks summary is in US units and an upshift keeps the previous pull', () => {
    const s = Model.create('test', 'test', 'demo'); s.page = Model.PAGE.peaks;
    const text = Model.summary(s); assert(/oil 226 \u00b0F/.test(text), 'Peaks summary not in \u00b0F: ' + text);
    const session = Session.create();
    function pt(rpm, t) { return { throttle: live(100, t), rpm: live(rpm, t), power: live(rpm / 10, t), torque: live(500, t), gear: live(2, t) }; }
    let t = 0; for (let rpm = 3000; rpm <= 7000; rpm += 250) { t += 100; Session.feed(session, pt(rpm, t), t); }
    for (let rpm = 5000; rpm <= 5600; rpm += 200) { t += 100; Session.feed(session, pt(rpm, t), t); }
    assert(session.pullGraph && session.pullGraph.samples[0].rpm === 3000, 'Upshift discarded the previous gear pull');
  });
  await test('drag timer measures 1/8 and 1/4 mile from a standstill and keeps three', () => {
    const s = Session.create();
    for (let run = 0; run < 4; run++) {
      const start = run * 100000; let mph = 0, t = start;
      for (let i = 0; i <= 12; i++) { Session.feed(s, { speed: live(0, t) }, t); t += 100; }
      for (let i = 0; i < 400; i++) { t += 100; mph += 1; Session.feed(s, { speed: live(mph, t) }, t); }
      for (let i = 0; i < 30; i++) { t += 100; mph = Math.max(0, mph - 10); Session.feed(s, { speed: live(mph, t) }, t); }
    }
    assert.strictEqual(s.dragRuns['1/4'].length, 3, 'Must keep the last three quarter-mile runs');
    // Constant 10 mph/s from 1 mph: every speed split is (to - from) / 10 seconds.
    [['0-30', 2.9], ['0-60', 5.9], ['0-100', 9.9], ['60-130', 7]].forEach((x) => assert(Math.abs(s.splitRuns[x[0]][0].seconds - x[1]) < 0.12, 'Split wrong: ' + x[0] + ' ' + s.splitRuns[x[0]][0].seconds));
    assert(s.lastDrag && s.lastDrag.trace.length > 50 && s.lastDrag.trace[s.lastDrag.trace.length - 1][1] > 130, 'Speed trace missing');
    const rolling = Session.create(); let t = 0;
    [0, 0].concat(Array.from({ length: 35 }, (x, i) => i + 1)).forEach((v) => { t += 100; Session.feed(rolling, { speed: live(v, t) }, t); });
    assert.strictEqual(rolling.splitRuns['0-30'].length, 0, 'A brief stop armed the timer');
    // Constant 10 mph/s from 1 mph: distance(ft) = 7.333 * t^2 relative to the 1 mph start.
    const eighth = s.dragRuns['1/8'][0];
    assert(Math.abs(eighth.seconds - Math.sqrt(660 / (10 * 5280 / 3600 / 2))) < 0.15, 'Eighth-mile time wrong: ' + eighth.seconds);
    assert(eighth.trap > 90 && eighth.trap < 100);
  });
  await test('brake test needs real deceleration below 60 mph and records distance', () => {
    const s = Session.create(); let t = 0, mph = 70;
    function step(next, g) { t += 100; mph = next; Session.feed(s, { speed: live(mph, t), gLong: g === undefined ? undefined : live(g, t) }, t); }
    step(70, 0); step(70, 0);
    while (mph > 58) step(mph - 0.3, -0.05);
    assert.notStrictEqual(s.brake.state, 'braking', 'Coasting started a stop');
    step(58, 0); while (mph < 70) step(mph + 1, 0.2);
    assert.strictEqual(s.brake.state, 'ready');
    while (mph > 0) step(Math.max(0, mph - 2.2), -1.0);
    assert.strictEqual(s.brakeRuns.length, 1);
    const run = s.brakeRuns[0];
    // 1 g from 60 mph: about 120 ft and 2.7 s.
    assert(run.feet > 100 && run.feet < 140, 'Stopping distance wrong: ' + run.feet);
    assert(run.peakG >= 1);
  });
  await test('session timers drop runs on data gaps and never use stale samples', () => {
    const s = Session.create();
    for (let t = 0; t <= 1200; t += 100) Session.feed(s, { speed: live(0, t) }, t);
    [[1300, 1.5], [1400, 3], [1500, 4.5], [3600, 30]].forEach((p) => Session.feed(s, { speed: live(p[1], p[0]) }, p[0]));
    for (let t = 3700, mph = 31; t < 13000; t += 100, mph += 0.8) Session.feed(s, { speed: live(mph, t) }, t);
    assert.strictEqual(s.dragRuns['1/8'].length, 0, 'Gap produced a drag run');
    Session.feed(s, { speed: { value: 80, status: 'stale', timestamp: 2600 } }, 2600);
    assert.strictEqual(s.last, null, 'Stale speed kept a run alive');
  });
  await test('session peaks track live values only', () => {
    const s = Session.create();
    Session.feed(s, { boost: live(22, 1), gLat: live(-1.1, 1), gLong: live(-0.9, 1) }, 1);
    Session.feed(s, { boost: { value: 40, status: 'stale' } }, 2);
    assert.strictEqual(s.peaks.boost, 22, 'Stale boost raised the peak');
    assert.strictEqual(s.peaks.lateral, 1.1); assert.strictEqual(s.peaks.braking, 0.9);
  });
  await test('grouped pages: demo faults are labeled as samples and live mode shows only a real scan', () => {
    const s = Model.create('test', 'test', 'demo'); s.page = Model.PAGE.diagnostics;
    Model.act(s, 2);
    let texts = View.draw(s, font).ops.filter((o) => o.kind === 'text').map((o) => o.text);
    assert(texts.includes('SAMPLE CODES / NOT FROM THIS CAR'), 'Demo fault codes not labeled');
    s.mode = 'live'; texts = View.draw(s, font).ops.filter((o) => o.kind === 'text').map((o) => o.text);
    assert(!texts.includes('1F2101'), 'Demo codes shown in live mode');
    Model.act(s, 2); assert(s.scanRequest, 'Scan action did not request a live scan');
  });
  await test('shift light lights from 5500 rpm and is display only', () => {
    function lit(rpm) {
      const s = Model.create('test', 'test', 'demo'); s.page = 1; s.mode = 'live';
      s.live = { connected: true, signals: { rpm: { value: rpm, unit: 'rpm', timestamp: 1000, verified: true } } };
      return View.draw(s, font, 1000).ops.filter((o) => o.kind === 'rect' && o.y >= 16 && o.y < 28 && o.color !== '#18243a' && o.color !== '#090f19').length;
    }
    assert.strictEqual(lit(4000), 0); assert(lit(6200) > 0 && lit(6200) < lit(6900), 'Shift light does not climb with RPM');
  });
  await test('virtual dyno computes road-load power for one gear and pins a saved baseline', () => {
    const s = Session.create(), d = Session.dyno; let t = 0;
    function feed(mph, g, rpm) { t += 50; Session.feed(s, { speed: live(mph, t), gLong: live(g, t), rpm: live(rpm, t) }, t); }
    for (let mph = 30; mph <= 80; mph += 0.4) feed(mph, 0.5, mph * 70);
    for (let i = 0; i < 14; i++) feed(80, 0, 5600);
    assert.strictEqual(s.dynoRuns.length, 1, 'Dyno run not recorded');
    const run = s.dynoRuns[0], v = 80 * 0.44704, m = d.massKg;
    const watts = (m * 0.5 * 9.80665 * v + 0.5 * d.rho * d.cdA * v * v * v + d.crr * m * 9.80665 * v) / (1 - d.lossPct / 100);
    assert(Math.abs(run.peakHp - watts / 745.7) / (watts / 745.7) < 0.03, 'Road-load power wrong: ' + run.peakHp + ' vs ' + watts / 745.7);
    assert(run.peakHpRpm >= 5400 && run.curve.length > 20);
    for (let mph = 30; mph <= 40; mph += 1) feed(mph, 0.5, mph * 70);
    for (let i = 0; i < 14; i++) feed(40, 0, 2800);
    assert.strictEqual(s.dynoRuns.length, 1, 'A pull under 1,500 rpm counted'); assert(/too short/.test(s.dynoMessage));
    const st = Model.create('test', 'test', 'live'); st.session = s; st.page = Model.PAGE.dyno;
    Model.act(st, 2); assert(st.dynoBaseline && st.dynoBaseline.at === run.at && st.configDirty, 'Pin baseline failed');
    const saved = JSON.parse(JSON.stringify(Model.settings(st))), restored = Model.create('test');
    Model.configure(restored, saved); assert.strictEqual(Math.round(restored.dynoBaseline.peakHp), Math.round(run.peakHp), 'Baseline not persisted');
    Model.configure(restored, { gauges: ['rpm', 'boost', 'power'], dynoBaseline: { at: 1, curve: [{ rpm: 'x' }] } }); assert.strictEqual(restored.dynoBaseline, null, 'Malformed baseline accepted');
    Model.act(st, 2); assert.strictEqual(st.dynoBaseline, null, 'Pinning the same run again must unpin');
  });
  await test('Cabin pages list their separate apps with a locked launch and no vehicle actions', () => {
    const s = Model.create('test', 'test', 'demo');
    assert.deepStrictEqual(Model.groups.map((g) => g.name), ['Drive', 'Track', 'Cabin', 'Garage']);
    assert.deepStrictEqual(Model.groups[1].pages, [9, 10, 11, Model.PAGE.dyno, 12]);
    [[Model.PAGE.seats, 'Comfort tool'], [Model.PAGE.recorder, 'Drive Recorder player tool'], [Model.PAGE.turnView, 'Cluster renderer']].forEach((x) => {
      s.page = x[0]; const before = JSON.stringify(Model.settings(s));
      const texts = View.draw(s, font).ops.filter((op) => op.kind === 'text').map((op) => op.text);
      assert(texts.includes(x[1]) && texts.some((tx) => /^OPEN /.test(tx)) && texts.includes('Launching from here is not verified yet.'), 'Cabin page incomplete: ' + Model.pages[x[0]]);
      assert(Model.summary(s).includes('not verified'));
      Model.act(s, 2); assert.strictEqual(JSON.stringify(Model.settings(s)), before);
    });
  });
};
