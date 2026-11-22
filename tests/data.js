'use strict';
const assert = require('assert');
const Data = require('../apps/bishal_garage/src/data');
const Model = require('../apps/bishal_garage/src/model');
const View = require('../apps/bishal_garage/src/view');
const font = require('../apps/bishal_garage/package/artwork/font.json');
const now = 100000;
function signal(value, unit, extra) { return Object.assign({ value: value, unit: unit, timestamp: now, verified: true, source: 'TEST FIXTURE / NOT VEHICLE' }, extra || {}); }
function close(actual, expected) { assert(Math.abs(actual - expected) < 0.000001, actual + ' != ' + expected); }
module.exports = async function (test) {
  await test('default vehicle mode is disconnected and never falls back to demo', () => {
    const s = Model.create('0.1.0'); assert.strictEqual(s.mode, 'live');
    Object.values(Model.snapshot(s, now).signals).forEach((reading) => { assert.strictEqual(reading.status, 'disconnected'); assert.strictEqual(reading.value, null); });
    Model.act(s, 2); assert.strictEqual(s.refreshes, 0); assert(Model.summary(s).includes('DISCONNECTED'));
    Model.act(s, 3); assert.strictEqual(s.mode, 'demo'); assert(Model.summary(s).includes('DEMO / NOT VEHICLE DATA'));
    Model.act(s, 3); assert.strictEqual(Model.snapshot(s, now).signals.boost.value, null);
  });
  await test('boost kPa/bar/PSI conversion preserves gauge reference and vacuum', () => {
    close(Data.normalizeSignal('boost', signal(100, 'kPa', { reference: 'gauge' }), now).value, 14.503773773020923);
    close(Data.normalizeSignal('boost', signal(1, 'bar', { reference: 'gauge' }), now).value, 14.503773773020923);
    close(Data.normalizeSignal('boost', signal(-4, 'psi', { reference: 'gauge' }), now).value, -4);
    const ambient = signal(95, 'kPa', { reference: 'absolute' });
    close(Data.normalizeSignal('boost', signal(195, 'kPa', { reference: 'absolute', ambient: ambient }), now).value, 14.503773773020923);
    close(Data.normalizeSignal('boost', signal(85, 'kPa', { reference: 'absolute', ambient: ambient }), now).value, -1.4503773773020923);
  });
  await test('unknown pressure reference or missing ambient is unavailable', () => {
    assert.strictEqual(Data.normalizeSignal('boost', signal(20, 'psi'), now).status, 'unavailable');
    assert.strictEqual(Data.normalizeSignal('boost', signal(200, 'kPa', { reference: 'absolute' }), now).value, null);
    assert.strictEqual(Data.normalizeSignal('boost', signal(200, 'kPa', { reference: 'absolute', ambient: signal(100, 'kPa', { reference: 'absolute', timestamp: now - 2000 }) }), now).status, 'unavailable');
    assert.strictEqual(Data.normalizeSignal('boost', signal(200, 'unknown', { reference: 'gauge' }), now).value, null);
  });
  await test('ethanol is not inferred from fuel level and requires verified measurement', () => {
    const s = Model.create('0.1.0');
    Model.acceptFrame(s, { connected: true, source: 'TEST FIXTURE', signals: { fuel: signal(44, '%'), ethanol: signal(44, '%', { verified: false }) } });
    const d = Model.snapshot(s, now); assert.strictEqual(d.signals.fuel.value, 44); assert.strictEqual(d.signals.ethanol.value, null);
    s.page = 2; assert(Model.summary(s, now).includes('E--')); assert(!Model.summary(s, now).includes('E44'));
    s.live.signals.ethanol = signal(44, '% v/v'); assert(Model.summary(s, now).includes('44% / E44'));
    assert.strictEqual(Data.normalizeSignal('ethanol', signal(101, '%'), now).status, 'unavailable');
    assert.strictEqual(Data.normalizeSignal('ethanol', signal(NaN, '%'), now).value, null);
  });
  await test('stale values are explicit and not rendered as current numeric readings', () => {
    const s = Model.create('0.1.0'); s.page = 1;
    Model.acceptFrame(s, { connected: true, source: 'TEST FIXTURE', signals: { boost: signal(20, 'psi', { reference: 'gauge' }) } });
    const expired = now + Data.MAX_AGE_MS + 1;
    assert.strictEqual(Model.snapshot(s, expired).signals.boost.status, 'stale');
    assert(Model.summary(s, expired).includes('Boost -- [STALE] PSI'));
    const labels = View.draw(s, font, expired).ops.filter((op) => op.kind === 'text').map((op) => op.text);
    assert(labels.includes('STALE')); assert(!labels.includes('20.0'));
    s.live.connected = false; assert.strictEqual(Model.snapshot(s, now).signals.boost.status, 'disconnected');
    assert.strictEqual(Model.snapshot(s, now).signals.boost.value, null);
  });
  await test('timestamps, cached measurements and out-of-order samples preserve freshness', () => {
    assert.strictEqual(Data.normalizeSignal('speed', signal(30, 'mph', { timestamp: undefined }), now).status, 'unavailable');
    assert.strictEqual(Data.normalizeSignal('speed', signal(30, 'mph', { timestamp: now + 2000 }), now).status, 'unavailable');
    const s = Model.create('0.1.0');
    Model.acceptFrame(s, { connected: true, signals: { speed: signal(40, 'mph') } });
    Model.acceptFrame(s, { connected: true, signals: { speed: signal(60, 'mph', { timestamp: now - 1000 }) } });
    assert.strictEqual(Model.snapshot(s, now).signals.speed.value, 40);
    Model.acceptFrame(s, { connected: true, signals: { speed: signal(40, 'mph') } });
    assert.strictEqual(Model.snapshot(s, now + Data.MAX_AGE_MS + 1).signals.speed.status, 'stale');
    assert.throws(() => Model.acceptFrame(s, {}), /connection state/);
  });
  await test('speed, distance, temperature units and real zero remain distinguishable from missing', () => {
    close(Data.normalizeSignal('speed', signal(100, 'km/h'), now).value, 62.1371192237334);
    close(Data.normalizeSignal('range', signal(100, 'km'), now).value, 62.1371192237334);
    close(Data.normalizeSignal('oil', signal(212, 'F'), now).value, 100);
    close(Data.normalizeSignal('coolant', signal(373.15, 'K'), now).value, 100);
    assert.strictEqual(Data.normalizeSignal('speed', signal(0, 'mph'), now).value, 0);
    assert.strictEqual(Data.normalizeSignal('speed', signal(-1, 'mph'), now).value, null);
  });
  await test('invalid ambient quality cannot produce live boost', () => {
    const ambient = signal(100, 'kPa', { reference: 'absolute', quality: 'invalid' });
    const result = Data.normalizeSignal('boost', signal(200, 'kPa', { reference: 'absolute', ambient: ambient }), now);
    assert.strictEqual(result.status, 'unavailable', 'Invalid ambient was accepted into live boost'); assert.strictEqual(result.value, null);
  });
  await test('future timestamp cannot poison later valid updates', () => {
    const s = Model.create('0.1.0');
    Model.acceptFrame(s, { connected: true, signals: { speed: signal(99, 'mph', { timestamp: now + 3600000 }) } }, now);
    Model.acceptFrame(s, { connected: true, signals: { speed: signal(30, 'mph') } }, now);
    assert.strictEqual(Model.snapshot(s, now).signals.speed.value, 30, 'Future cache blocked recovery');
  });
  await test('temperatures below absolute zero are unavailable, not clamped to display scale', () => {
    assert.strictEqual(Data.normalizeSignal('oil', signal(-1, 'K'), now).status, 'unavailable', 'Impossible temperature accepted');
    close(Data.normalizeSignal('oil', signal(-10, 'C'), now).value, -10);
    close(Data.normalizeSignal('oil', signal(180, 'C'), now).value, 180);
  });
  await test('Overview exposes each fuel, range and odometer data status', () => {
    const s = Model.create('0.1.0');
    Model.acceptFrame(s, { connected: true, signals: { fuel: signal(68, '%'), range: signal(200, 'mi', { timestamp: now - 5000 }), odometer: signal(1234, 'mi', { timestamp: now - 5000 }) } }, now);
    const labels = View.draw(s, font, now).ops.filter((op) => op.kind === 'text').map((op) => op.text);
    assert.strictEqual(labels.filter((text) => text === 'STALE').length, 2, 'Range and odometer need separate STALE labels');
    assert(labels.includes('LIVE'), 'Fuel needs its own data-state label'); assert(Model.summary(s, now).includes('ODO -- [STALE]'));
  });
  await test('Live Pulls converts declared engine power and torque units', () => {
    close(Data.normalizeSignal('power', signal(100, 'kW', { basis: 'engine' }), now).value, 134.10220895950277);
    close(Data.normalizeSignal('power', signal(100, 'PS', { basis: 'engine' }), now).value, 98.6320070619457);
    close(Data.normalizeSignal('power', signal(500, 'hp', { basis: 'engine' }), now).value, 500);
    close(Data.normalizeSignal('torque', signal(650, 'Nm', { basis: 'engine' }), now).value, 479.4153970302226);
    close(Data.normalizeSignal('torque', signal(450, 'lb-ft', { basis: 'engine' }), now).value, 450);
    assert.strictEqual(Data.normalizeSignal('power', signal(-1, 'hp', { basis: 'engine' }), now).status, 'unavailable');
  });
  await test('Live Pulls requires engine basis and never infers horsepower from RPM', () => {
    ['power', 'torque'].forEach((name) => {
      const unit = name === 'power' ? 'hp' : 'lb-ft';
      assert.strictEqual(Data.normalizeSignal(name, signal(500, unit), now).status, 'unavailable', 'Undeclared power basis accepted');
      assert.strictEqual(Data.normalizeSignal(name, signal(500, unit, { basis: 'wheel' }), now).status, 'unavailable', 'Wheel power mislabeled as engine');
      assert.strictEqual(Data.normalizeSignal(name, signal(500, unit, { basis: 'engine', verified: false }), now).status, 'unavailable');
    });
    const s = Model.create('0.1.0'); s.page = 4;
    Model.acceptFrame(s, { connected: true, signals: { rpm: signal(6000, 'rpm'), torque: signal(500, 'lb-ft', { basis: 'engine' }) } }, now);
    assert.strictEqual(Model.snapshot(s, now).signals.power.value, null); assert(Model.summary(s, now).includes('Engine -- [UNAVAILABLE] hp'));
  });
  await test('Live Pulls throttle and gearbox handle valid zero, neutral and reverse', () => {
    assert.strictEqual(Data.normalizeSignal('throttle', signal(101, '%'), now).status, 'unavailable');
    assert.strictEqual(Data.normalizeSignal('throttle', signal(0, '%'), now).value, 0);
    [-2, 9, 1.5].forEach((value) => assert.strictEqual(Data.normalizeSignal('gear', signal(value, 'gear'), now).status, 'unavailable'));
    assert.strictEqual(Model.gearValue(Data.normalizeSignal('gear', signal(0, 'gear'), now)), 'N');
    assert.strictEqual(Model.gearValue(Data.normalizeSignal('gear', signal(-1, 'gear'), now)), 'R');
  });
  await test('Live Pulls fifth page has angular M instruments and honest stale states', () => {
    const s = Model.create('0.1.0', 'test', 'demo'); Model.act(s, 14); assert.strictEqual(s.page, 4);
    const frame = View.draw(s, font, now), labels = frame.ops.filter((op) => op.kind === 'text').map((op) => op.text);
    assert.strictEqual(Model.pages.length, 19); assert(labels.includes('DRIVE  3 / 5')); assert(labels.includes('ENGINE POWER'));
    assert(labels.includes("Bishal's M3 App"));
    assert.strictEqual(frame.ops.filter((op) => op.kind === 'arc').length, 0, 'Circular progress gauges must not return');
    assert(!frame.ops.some((op) => op.color === '#b778ff'), 'Purple belongs in vehicle artwork');
    assert(frame.ops.some((op) => op.kind === 'line' && op.color === '#eb405c'), 'Missing M-red engine scale');
    Model.act(s, 1); assert.strictEqual(s.page, Model.PAGE.pullGraph); Model.act(s, 15); assert.strictEqual(s.page, 5); Model.act(s, 1); assert.strictEqual(s.page, 6); Model.act(s, 1); assert.strictEqual(s.page, 0); Model.act(s, 14); Model.act(s, 3);
    assert(Model.summary(s, now).includes('DISCONNECTED')); assert(!Model.summary(s, now).includes('392 hp'));
    const stale = signal(392, 'hp', { basis: 'engine', timestamp: now - 5000 });
    Model.acceptFrame(s, { connected: true, signals: { power: stale } }, now);
    const oldLabels = View.draw(s, font, now).ops.filter((op) => op.kind === 'text').map((op) => op.text);
    assert(oldLabels.includes('STALE')); assert(!oldLabels.includes('392')); assert(Model.summary(s, now).includes('Engine -- [STALE] hp'));
  });
  await test('Angular instrument endpoint labels sit below the track and match pressure units', () => {
    const s = Model.create('0.1.0', 'test', 'demo'); s.page = 1;
    const labels = View.draw(s, font, now).ops.filter((op) => op.kind === 'text' && op.y === 300 && op.size === 13);
    assert(labels.some((op) => op.text === '-15'), 'Minimum scale label missing');
    assert(labels.some((op) => op.text === '35'), 'Maximum scale label missing');
  });
  await test('history only uses fresh verified gauge-pressure samples', () => {
    const frame = { connected: true, signals: { boost: signal(10, 'psi', { reference: 'gauge' }) }, history: [
      signal(2, 'psi', { reference: 'gauge', timestamp: now - 5000 }), signal(3, 'psi', { reference: 'gauge', timestamp: now - 1000 }),
      signal(10, 'psi', { reference: 'gauge' }), signal(99, 'psi', { timestamp: now - 1000 }) ] };
    const d = Data.resolve(frame, now); assert.strictEqual(d.history.length, 2); assert.strictEqual(d.history[0].value, 3);
    assert.strictEqual(Data.resolve(frame, now + 4000).history.length, 0);
  });
};
