'use strict';
const assert = require('assert');
const Vehicle = require('../apps/bishal_garage/src/vehicle');
const Data = require('../apps/bishal_garage/src/data');
function rig(build) {
  let at = 100000, seq = 0; const timers = new Map(), frames = [];
  const options = { now: () => at, setTimeout: (fn, ms) => { const id = ++seq; timers.set(id, { fn, at: at + ms }); return id; }, clearTimeout: (id) => timers.delete(id) };
  const v = new Vehicle.VehicleData({ buildAndInitTypedProxy: build || (() => Promise.reject(new Error('absent'))) }, (f) => frames.push(f), options);
  async function flush() { for (let i = 0; i < 30; i++) await Promise.resolve(); }
  async function advance(ms) {
    const end = at + ms;
    for (let n = 0; n < 1000; n++) {
      const next = Array.from(timers.entries()).filter((t) => t[1].at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      at = next[1].at; timers.delete(next[0]); next[1].fn(); await flush();
    }
    at = end; await flush();
  }
  return { v, frames, timers, now: () => at, flush, advance };
}
function reply(pid, data, target) { const bytes = Array(9).fill(0); bytes[6] = target === undefined ? 0x12 : target; return { errorCode: 'NO_ERROR', udsResponse: bytes.concat([0x41, pid], data) }; }
function ask(r, pid) { r.v.pending = { pid, timer: -1, started: r.now() }; }
function reading(value, unit, at) { return { value, unit, timestamp: at, verified: true, basis: 'engine' }; }
module.exports = async function (test) {
  await test('BMW adapter polls exact ID8 getters and stops reads when hidden', async () => {
    let reads = 0, torqueRaw = 3047;
    const r = rig((iface, instance) => {
      assert.strictEqual(instance, iface.includes('InternalTasu') ? 'SystemFunctionsInternalTasuInst1' : '1');
      if (iface.endsWith('.CDS')) return Promise.resolve({ statusEngineSpeed2: { getValue: () => { reads++; return Promise.resolve({ actualValueRPMEngineCrankshaft: 16000 }); } }, statusEngineTemperature: { getValue: () => Promise.resolve({ temperatureEngineOilDrive: 148, temperatureEngineDrive: 138 }) } });
      if (iface.endsWith('.Vehicle2')) return Promise.resolve({ statusCarSpeed2: { getValue: () => Promise.resolve({ speedVehicleCentreOfGravity: 6400 }) } });
      if (iface.endsWith('.FES')) return Promise.resolve({ statusActualValueTorque2: { getValue: () => Promise.resolve({ actualValueTorqueCrankshaft: torqueRaw }) } });
      return Promise.reject(new Error('not offered'));
    });
    r.v.setActive(true); r.v.start(); await r.flush();
    const s = Data.resolve(r.v.frame(), r.now()).signals;
    assert.strictEqual(s.rpm.value, 4000); assert.strictEqual(s.oil.value, 100); assert.strictEqual(s.coolant.value, 90);
    assert(Math.abs(s.speed.value - 62.1371192237334) < 1e-8); assert.strictEqual(s.torque.value, 500 * 0.7375621492772656);
    assert(s.power.estimated); assert(Math.abs(s.power.value - (500 * 4000 / 9549.3 * 1.3410220895950277)) < 1e-8);
    assert.strictEqual(s.power.freshness, 'receive-time');
    torqueRaw = 4095; await r.advance(100);
    assert.strictEqual(r.v.frame().signals.torque, null, 'Invalid torque sentinel must not produce horsepower');
    assert.strictEqual(r.v.frame().signals.power, undefined);
    r.v.setActive(false); const before = reads; await r.advance(1000); assert.strictEqual(reads, before); assert(!r.v.frame().connected);
    r.v.close(); assert.strictEqual(r.timers.size, 0);
  });
  await test('BMW native sentinels and ambiguous Park gear never become numbers', () => {
    const r = rig(); r.v.setActive(true);
    r.v.nativeValue('rpm', 65535, 65535, 0.25, 0, 'rpm', 'test', r.now()); assert.strictEqual(r.v.frame().signals.rpm, null);
    assert.strictEqual(Vehicle.gear({ statusActualGearDrive: 'N_OR_P', statusActualStageDrive: 'P' }), null);
    assert.strictEqual(Vehicle.gear({ statusActualGearDrive: 'N_OR_P', statusActualStageDrive: 'N' }), 0);
    assert.strictEqual(Vehicle.gear({ statusActualGearDrive: 'G8' }), 8);
    assert.strictEqual(Vehicle.gear({ statusActualGearDrive: 3 }), 1);
    r.v.close();
  });
  await test('BMW read-only TASU sends only service01 supported PID requests', async () => {
    const requests = []; let deliver;
    const r = rig((iface) => iface.includes('InternalTasu') ? Promise.resolve({
      sendTasuResponse: { subscribe: (fn) => { deliver = fn; return Promise.resolve(); } },
      sendTasuRequest: (req) => { requests.push(req); return Promise.resolve({ TasuErrorEnum: 'NO_ERROR' }); }
    }) : Promise.reject(new Error('absent')));
    r.v.setActive(true); r.v.start(); await r.flush();
    assert.strictEqual(requests.length, 1); assert.strictEqual(requests[0].udsData[0], 0);
    deliver(reply(0, [0, 0x10, 0, 0])); // PID0C only
    await r.advance(60); assert.strictEqual(requests[1].udsData[0], 0x0C);
    deliver(reply(0x0C, [0x3E, 0x80])); assert.strictEqual(r.v.frame().signals.rpm.value, 4000);
    requests.forEach((q) => { assert.strictEqual(q.serviceID, 1, 'Adapter must never send diagnostic writes'); assert.strictEqual(q.targetAddress, 0x12); assert.strictEqual(q.sourceAddress, 0xF2); });
    r.v.close(); const count = requests.length; await r.advance(5000); assert.strictEqual(requests.length, count); assert.strictEqual(r.timers.size, 0);
  });
  await test('BMW OBD ignores wrong ECU PID truncated and unrelated service replies', () => {
    const r = rig(); r.v.setActive(true); ask(r, 0x0C);
    r.v.response(reply(0x0C, [0x3E, 0x80], 0x18)); assert(r.v.pending);
    r.v.response(reply(0x0D, [50])); assert(r.v.pending);
    r.v.response(reply(0x0C, [0x3E])); assert(r.v.pending);
    const wrong = reply(0x0C, [0x3E, 0x80]); wrong.udsResponse[9] = 0x62; r.v.response(wrong); assert(r.v.pending);
    r.v.response(reply(0x0C, [0x3E, 0x80])); assert.strictEqual(r.v.obd.rpm.value, 4000); assert(!r.v.pending);
    r.v.close();
  });
  await test('BMW boost uses actual sensor not commanded pressure with fresh ambient', () => {
    const r = rig(); r.v.setActive(true); ask(r, 0x70);
    r.v.response(reply(0x70, [3, 0x32, 0, 0x25, 0x80, 0, 0, 0, 0, 0])); // commanded400, actual300 kPa
    ask(r, 0x33); r.v.response(reply(0x33, [100]));
    const d = Data.resolve(r.v.frame(), r.now());
    assert(Math.abs(d.signals.boost.value - 200 * Data.PSI_PER_KPA) < 1e-8, 'Commanded pressure must not be rendered as actual boost');
    assert.strictEqual(d.history.length, 1);
    r.v.obd.ambient.timestamp -= 1500; assert.strictEqual(r.v.frame().signals.boost, undefined);
    ask(r, 0x0B); r.v.response(reply(0x0B, [255])); assert.strictEqual(r.v.obd.pressure, null, 'Saturated MAP must be unavailable');
    r.v.close();
  });
  await test('BMW support scan retries after a temporary timeout', async () => {
    const requests = [];
    const r = rig(); r.v.tasu = { sendTasuRequest: (q) => { requests.push(q); return Promise.resolve({ TasuErrorEnum: 'NO_ERROR' }); } };
    r.v.setActive(true); r.v.obdLoop(); await r.flush();
    await r.advance(6500);
    assert.strictEqual(requests.length, 2, 'Support scan must recover after timeout');
    assert.strictEqual(requests[1].udsData[0], 0); r.v.close();
  });
  await test('BMW a getter started before hide cannot publish after reopen', async () => {
    let resolveOld;
    const r = rig((iface) => iface.endsWith('.CDS') ? Promise.resolve({ statusEngineSpeed2: { getValue: () => new Promise((resolve) => { resolveOld = resolve; }) } }) : Promise.reject(new Error('absent')));
    r.v.setActive(true); r.v.start(); await r.flush();
    r.v.setActive(false); r.v.setActive(true); resolveOld({ actualValueRPMEngineCrankshaft: 16000 }); await r.flush();
    assert.strictEqual(r.v.frame().signals.rpm, undefined, 'Pre-hide getter must not enter a new active session');
    r.v.close();
  });
  await test('BMW discovery survives hide during initial and continuation scans', async () => {
    for (const pid of [0, 0x20, 0x40, 0x60, 0x80]) {
      const requests = []; const r = rig(); r.v.tasu = { sendTasuRequest: (q) => { requests.push(q.udsData[0]); return Promise.resolve({ TasuErrorEnum: 'NO_ERROR' }); } };
      r.v.scan = [pid]; r.v.setActive(true); r.v.obdLoop(); await r.flush();
      r.v.setActive(false); r.v.setActive(true); await r.advance(5000);
      assert.deepStrictEqual(requests, [pid, pid], 'Interrupted scan must survive hide'); r.v.close();
    }
  });
  await test('BMW queued TASU request is cancelled on hide and close before microtasks run', async () => {
    for (const stop of ['hide', 'close']) {
      const requests = []; const r = rig(); r.v.tasu = { sendTasuRequest: (q) => { requests.push(q); return Promise.resolve({ TasuErrorEnum: 'NO_ERROR' }); } };
      r.v.setActive(true); r.v.obdLoop(); if (stop === 'hide') r.v.setActive(false); else r.v.close();
      await r.flush(); assert.strictEqual(requests.length, 0, 'Read sent after lifecycle cancellation'); r.v.close();
    }
  });
  await test('BMW power estimate needs synchronized fresh torque and RPM', async () => {
    const r = rig(); r.v.setActive(true); r.v.lastReply = r.now();
    r.v.native.rpm = reading(6000, 'rpm', r.now()); r.v.native.torque = reading(500, 'Nm', r.now() - 251);
    assert.strictEqual(r.v.frame().signals.power, undefined, 'Asynchronous torque must not generate horsepower');
    r.v.native.torque.timestamp = r.now(); assert(r.v.frame().signals.power.estimated);
    await r.advance(3100); assert.strictEqual(r.v.frame().signals.power, undefined);
    assert.strictEqual(Data.resolve(r.v.frame(), r.now()).signals.rpm.status, 'stale');
    await r.advance(2000); assert.strictEqual(r.v.frame().connected, false);
    r.v.close();
  });
};
