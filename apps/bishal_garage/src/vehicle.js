'use strict';

// Read-only access pattern: IterioDev/car-apps e69201c, iteriodev_cardash 1.4.1.
const Data = require('./data.js');
const CDS = 'de.bmw.infotainment.vehicle.CDS';
const VEHICLE = 'de.bmw.infotainment.vehicle.Vehicle2';
const FES = 'de.bmw.infotainment.drivingexcitement.FES';
const GEAR = 'de.bmw.infrastructure.VehicleInformation';
const TASU = 'com.harman.infotainment.systemfunctions.tasu.tasu.InternalTasu';
// Signal names and scalings for these follow cauliflowermossgrape/idrive7-apps a948390f (MIT), car_vitals and brake_test.
const CDS2 = 'de.bmw.infotainment.vehicle.CDS2';
const TPMS = 'de.bmw.infotainment.vehicle.TPMS';
const UNITS = 'de.bmw.infotainment.vehicle.Vehicle';
const ENVIRONMENT = 'de.bmw.infrastructure.EnvironmentalInformation';
const BASIC = 'de.bmw.infrastructure.analytics.BasicDataSet';
const ALL_UNITS = 0xDF;
const ECUS = { 0x01: 'ACSM airbag', 0x06: 'ICAM cameras', 0x08: 'SRR corner radar', 0x0D: 'HKFM tailgate', 0x10: 'BDC gateway', 0x12: 'DME engine',
  0x13: 'DME 2', 0x18: 'EGS gearbox', 0x1D: 'TFM fuel tank', 0x20: 'SRR corner radar', 0x21: 'FRR front radar', 0x23: 'SAS assist sensors',
  0x28: 'SRR corner radar', 0x29: 'DSC brakes', 0x2A: 'SRR corner radar', 0x2C: 'USS park sensors', 0x30: 'EPS steering', 0x37: 'RAM audio',
  0x38: 'VTG xDrive', 0x39: 'DSC brake booster', 0x40: 'BDC body', 0x43: 'FLM headlight', 0x44: 'FLM headlight', 0x45: 'DCS driver camera',
  0x56: 'FZD roof', 0x5D: 'KAFAS camera', 0x5E: 'GWS gear selector', 0x60: 'KOMBI cluster', 0x61: 'ATM telematics', 0x63: 'Head unit',
  0x64: 'PDC parking', 0x67: 'ZBE controller', 0x6D: 'SM seat module', 0x76: 'VDP dampers', 0x78: 'IHKA climate' };
// Read-only guard: OBD current data from the DME, and UDS ReadDTCInformation 19 02 only. Nothing that clears, writes or changes session.
function allowed(target, service, data) {
  if (service === 0x01) return target === 0x12 && data.length === 1;
  if (service === 0x19) return data.length === 2 && data[0] === 0x02;
  return false;
}
function dtcStatus(b) {
  if (b & 0x01) return 'ACTIVE';
  if (b & 0x80) return 'WARNING LAMP';
  if (b & 0x04) return 'PENDING';
  if (b & 0x08) return 'STORED';
  return 'HISTORY';
}
function parseDtcs(uds) {
  const out = [];
  for (let i = 3; i + 4 <= uds.length; i += 4) {
    const code = ((uds[i] << 16) | (uds[i + 1] << 8) | uds[i + 2]) >>> 0;
    out.push({ code: ('000000' + code.toString(16).toUpperCase()).slice(-6), status: dtcStatus(uds[i + 3]), raw: uds[i + 3] });
  }
  return out;
}
const PIDS = {
  0x05: { size: 1, name: 'coolant', unit: 'C', decode: function (d) { return d[0] - 40; } },
  0x0B: { size: 1, name: 'pressure', unit: 'kPa', decode: function (d) { return d[0] < 255 ? d[0] : null; } },
  0x0C: { size: 2, name: 'rpm', unit: 'rpm', decode: function (d) { return (d[0] * 256 + d[1]) / 4; } },
  0x0D: { size: 1, name: 'speed', unit: 'km/h', decode: function (d) { return d[0]; } },
  0x0F: { size: 1, name: 'intake', unit: 'C', decode: function (d) { return d[0] - 40; } },
  0x11: { size: 1, name: 'throttle', unit: '%', decode: function (d) { return d[0] * 100 / 255; } },
  0x33: { size: 1, name: 'ambient', unit: 'kPa', decode: function (d) { return d[0]; } },
  0x5C: { size: 1, name: 'oil', unit: 'C', decode: function (d) { return d[0] - 40; } },
  0x62: { size: 1, name: 'torquePercent', unit: '%', decode: function (d) { return d[0] - 125; } },
  0x63: { size: 2, name: 'referenceTorque', unit: 'Nm', decode: function (d) { return d[0] * 256 + d[1]; } },
  0x70: { size: 10, name: 'pressure', unit: 'kPa', decode: function (d) { return d[0] & 2 ? (d[3] * 256 + d[4]) / 32 : d[0] & 8 ? (d[7] * 256 + d[8]) / 32 : null; } },
  0x87: { size: 5, name: 'pressure', unit: 'kPa', decode: function (d) { return d[0] & 1 ? (d[1] * 256 + d[2]) / 32 : null; } }
};
function finite(v) { return typeof v === 'number' && isFinite(v); }
function raw(v, max) { return finite(v) && v >= 0 && v < max; }
function gear(x) {
  if (!x) return null;
  const g = x.statusActualGearDrive, stage = x.statusActualStageDrive;
  if (g === 'R' || g === 1) return -1;
  if (typeof g === 'string' && /^G[1-8]$/.test(g)) return Number(g.slice(1));
  if (Number.isInteger(g) && g >= 3 && g <= 10) return g - 2;
  if (stage === 'N' || stage === 3) return 0;
  return null; // N_OR_P is ambiguous; never turn Park into Neutral.
}
class VehicleData {
  constructor(builders, publish, options) {
    const opts = options || {};
    this.builders = builders; this.publish = publish;
    this.now = opts.now || Date.now;
    this.later = opts.setTimeout || setTimeout; this.cancel = opts.clearTimeout || clearTimeout;
    this.warn = opts.warn || function () {};
    this.active = false; this.closed = false; this.generation = 0; this.timers = new Set(); this.links = {};
    this.native = {}; this.obd = {}; this.history = []; this.supported = new Set(); this.refused = new Set();
    this.scan = [0]; this.cycle = []; this.turn = 0; this.lastReply = null; this.pending = null;
    this.faults = null; this.zero = { gLong: { z: 0, n: 0 }, gLat: { z: 0, n: 0 } }; this.stillSince = 0; this.carUnits = {};
  }
  request(target, service, data) {
    if (!allowed(target, service, data)) throw new Error('Blocked non-read-only diagnostic request ' + service.toString(16));
    return this.tasu.sendTasuRequest({ sourceAddress: 0xF2, targetAddress: target, serviceID: service, subroutineID: 0,
      udsDataLength: data.length, udsData: Buffer.from(data), deadlockTime: 0 });
  }
  // Functional ReadDTCInformation to every unit. OBD polling pauses so the two never share the transport.
  scanFaults() {
    if (this.closed || !this.tasu || (this.faults && this.faults.state === 'scanning')) return false;
    const scan = this.faults = { state: 'scanning', started: this.now(), units: {}, generation: this.generation, deadline: 0 };
    const done = () => {
      if (this.faults !== scan || scan.state !== 'scanning') return;
      this.cancel(scan.idle); this.cancel(scan.hard); this.timers.delete(scan.idle); this.timers.delete(scan.hard);
      scan.state = 'done'; scan.finished = this.now(); this.emit();
    };
    scan.done = done;
    // A unit that said "response pending" keeps its longer wait even if another unit answers meanwhile.
    scan.kick = (ms) => {
      const until = this.now() + ms;
      if (until <= scan.deadline) return;
      this.cancel(scan.idle); this.timers.delete(scan.idle); scan.deadline = until; scan.idle = this.schedule(done, ms);
    };
    scan.hard = this.schedule(done, 25000);
    const start = () => {
      if (this.pending) { this.schedule(start, 50); return; }
      scan.kick(6000);
      Promise.resolve().then(() => this.request(ALL_UNITS, 0x19, [0x02, 0x0C])).then((res) => {
        if (this.faults === scan && res && ['NO_ERROR', 'REQUEST_PENDING'].indexOf(res.TasuErrorEnum) < 0) { scan.error = String(res.TasuErrorEnum); done(); }
      }, (e) => { if (this.faults === scan) { scan.error = String(e.message || e); done(); } });
    };
    start(); this.emit();
    return true;
  }
  faultReply(bytes) {
    const scan = this.faults, uds = bytes.slice(9), ecu = bytes[6];
    if (!scan || scan.state !== 'scanning') return;
    if (uds[0] === 0x7F && uds[1] === 0x19) {
      if (uds[2] === 0x78) { scan.kick(10000); return; }
      if (!scan.units[ecu]) scan.units[ecu] = { ecu: ecu, name: ECUS[ecu] || 'Unit 0x' + ecu.toString(16).toUpperCase(), refused: uds[2], codes: [] };
    } else if (uds[0] === 0x59 && uds[1] === 0x02) {
      // TASU replies carry no request id. The first full answer per unit wins, so a later reply to another app's read can't replace ours.
      const old = scan.units[ecu];
      if (old && !old.refused) return;
      scan.units[ecu] = { ecu: ecu, name: ECUS[ecu] || 'Unit 0x' + ecu.toString(16).toUpperCase(), codes: parseDtcs(uds) };
    } else return;
    this.lastReply = this.now(); scan.kick(4000); this.emit();
  }
  schedule(fn, ms) {
    const timer = this.later(() => { this.timers.delete(timer); if (!this.closed) fn(); }, ms);
    this.timers.add(timer); return timer;
  }
  start() {
    if (this.started || this.closed) return;
    this.started = true;
    this.connect('cds', CDS, '1', [
      ['statusEngineSpeed2', 100, (x, at) => this.nativeValue('rpm', x.actualValueRPMEngineCrankshaft, 65535, 0.25, 0, 'rpm', CDS, at)],
      ['statusEngineTemperature', 1000, (x, at) => {
        this.nativeValue('oil', x.temperatureEngineOilDrive, 255, 1, -48, 'C', CDS, at);
        this.nativeValue('coolant', x.temperatureEngineDrive, 255, 1, -48, 'C', CDS, at);
      }]
    ]);
    this.connect('vehicle', VEHICLE, '1', [['statusCarSpeed2', 100, (x, at) => this.nativeValue('speed', x.speedVehicleCentreOfGravity, 65535, 1 / 64, 0, 'km/h', VEHICLE, at)]]);
    this.connect('fes', FES, '1', [['statusActualValueTorque2', 100, (x, at) => this.nativeValue('torque', x.actualValueTorqueCrankshaft, 4095, 0.5, -1023.5, 'Nm', FES, at)]]);
    this.connect('gear', GEAR, '1', [['statusGearboxDrive', 250, (x, at) => {
      const value = gear(x); this.native.gear = value === null ? null : this.reading(value, 'gear', GEAR, at);
    }]]);
    this.connect('cds2', CDS2, '1', [
      ['statusLongitudinalAccelerationMassCenter', 100, (x, at) => this.acceleration('gLong', x.longitudinalAccelerationCentreOfGravity, at)],
      ['statusLateralAccelerationMassCenter', 100, (x, at) => this.acceleration('gLat', x.lateralAccelerationCentreOfGravity, at)]
    ]);
    this.connect('units', UNITS, '1', [['statusNewCurrentUnitsStatusExt', 10000, (x) => {
      this.carUnits = { pressure: { 1: 'bar', 2: 'kPa', 3: 'psi' }[x.unitOfMeasurementAirPressure], temperature: { 1: 'C', 2: 'F' }[x.unitOfMeasurementTemperature] };
    }]]);
    const corners = [['FL', 'FLH'], ['FR', 'FRH'], ['RL', 'RLH'], ['RR', 'RRH']];
    this.connect('tpms', TPMS, '1', [
      ['statusTyrePressure', 10000, (x, at) => corners.forEach((c) => this.tyrePressure('tyreP' + c[0], x['actualValuePressureTyre' + c[1]], at))],
      ['statusTargetTyrePressure', 10000, (x, at) => corners.forEach((c) => this.tyrePressure('tyreTarget' + c[0], x['targetPressureTyre' + c[1]], at))],
      ['statusTyreTemperature', 10000, (x, at) => corners.forEach((c) => this.nativeValue('tyreT' + c[0], x['actualValueTemperatureTyre' + c[1]], 65535, 1, -40, this.carUnits.temperature || (this.psiSeen ? 'F' : 'C'), TPMS, at))]
    ]);
    this.connect('environment', ENVIRONMENT, '1', [['ExteriorTemperature', 5000, (x, at) => this.nativeValue('ambient', x.temperatureExterior, 255, 0.5, -40, 'C', ENVIRONMENT, at)]]);
    this.connect('basic', BASIC, '1', [['basicDataSet', 2000, (x, at) => this.nativeValue('gearboxOil', x.valueTemperatureTransmissionOil, 255, 1, -48, 'C', BASIC, at)]]);
    this.connect('tasu', TASU, 'SystemFunctionsInternalTasuInst1');
    const tick = () => { this.emit(); this.schedule(tick, 500); }; tick();
  }
  setActive(on) {
    if (this.closed || this.active === on) return;
    this.active = on; this.generation++;
    if (!on) {
      this.native = {}; this.obd = {}; this.history = []; this.lastReply = null;
      if (this.pending) this.finish(false);
      // Replies are ignored while hidden, so an unfinished scan must not read as "no faults".
      if (this.faults && this.faults.state === 'scanning') { this.faults.error = 'Interrupted, scan again'; this.faults.done(); }
    }
    this.emit();
  }
  reading(value, unit, source, at) {
    return { value: value, unit: unit, timestamp: at, verified: true, basis: 'engine', source: source, freshness: 'receive-time' };
  }
  nativeValue(name, value, invalid, scale, offset, unit, source, at) {
    this.native[name] = raw(value, invalid) ? this.reading(value * scale + offset, unit, source, at) : null;
  }
  // An idling car can read 0.6 g on an axis: whatever an axis reads after 2 s at a standstill is its offset.
  acceleration(name, value, at) {
    if (!raw(value, 65535)) { this.native[name] = null; return; }
    const g = (value * 0.002 - 65) / 9.80665, zero = this.zero[name], speed = this.native.speed;
    const still = speed && speed.value < 0.5 && at - speed.timestamp <= 300;
    this.stillSince = still ? this.stillSince || at : 0;
    if (still && at - this.stillSince > 2000 && Math.abs(g) <= 1) { zero.n = Math.min(zero.n + 1, 50); zero.z += (g - zero.z) / zero.n; }
    this.native[name] = this.reading(g - zero.z, 'g', CDS2, at);
  }
  // 0.1 x raw in the car's own pressure unit. Until that unit is known, only one unit gives a plausible tyre pressure.
  tyrePressure(name, value, at) {
    if (!finite(value) || value < 0 || value >= 65532) { this.native[name] = null; return; }
    const v = value * 0.1;
    // Decide the unit once, from a pressure in the normal inflated range, so a flat tyre is never re-read in another unit.
    if (!this.carUnits.pressure && !this.tyreUnit) this.tyreUnit = v >= 1.2 && v <= 4.5 ? 'bar' : v >= 18 && v <= 60 ? 'psi' : v >= 120 && v <= 450 ? 'kPa' : null;
    const unit = this.carUnits.pressure || this.tyreUnit;
    if (unit === 'psi') this.psiSeen = true;
    this.native[name] = unit ? this.reading(v, unit, TPMS, at) : null;
  }
  connect(key, iface, instance, fields) {
    if (this.closed) return;
    const link = this.links[key] = { proxy: null };
    Promise.resolve().then(() => this.closed ? null : this.builders.buildAndInitTypedProxy(iface, instance, { timeoutMs: 10000 }))
      .then((proxy) => {
        if (this.closed) return;
        link.proxy = proxy;
        if (!fields) {
          return Promise.resolve().then(() => proxy.sendTasuResponse.subscribe((ev) => this.response(ev)))
            .then(() => { if (this.closed) return; this.tasu = proxy; this.obdLoop(); });
        }
        fields.forEach((spec) => {
          const attr = proxy[spec[0]];
          if (!attr) return;
          const receive = (x) => {
            if (!this.active || this.closed || !x || typeof x !== 'object') return;
            this.lastReply = this.now(); spec[2](x, this.lastReply); this.emit();
          };
          // Some gear interfaces are event-only. The fast engine getters need polling.
          if (typeof attr.getValue !== 'function') {
            if (typeof attr.subscribe === 'function') Promise.resolve().then(() => attr.subscribe(receive)).catch((e) => this.warn(String(e.message || e)));
            return;
          }
          const poll = () => {
            if (!this.active) { this.schedule(poll, 500); return; }
            const generation = this.generation;
            Promise.resolve().then(() => !this.closed && this.active && generation === this.generation ? attr.getValue() : null).then((x) => { if (generation === this.generation) receive(x); }, () => {})
              .then(() => { if (!this.closed) this.schedule(poll, spec[1]); });
          };
          poll();
        });
      }).catch((e) => {
        if (this.closed) return;
        this.warn(iface + ': ' + String(e.message || e));
        this.schedule(() => this.connect(key, iface, instance, fields), 30000);
      });
  }
  choose(name, at) {
    const n = this.native[name], o = this.obd[name];
    if (n && at - n.timestamp <= Data.MAX_AGE_MS) return n;
    return o && (!n || o.timestamp > n.timestamp) ? o : n;
  }
  frame() {
    const at = this.now(), signals = {};
    ['rpm', 'speed', 'oil', 'coolant', 'torque', 'throttle', 'intake', 'gear'].forEach((name) => { signals[name] = this.choose(name, at); });
    ['gLong', 'gLat', 'ambient', 'gearboxOil'].concat(Data.tyres.reduce((list, c) => list.concat(['tyreP' + c, 'tyreTarget' + c, 'tyreT' + c]), []))
      .forEach((name) => { if (this.native[name]) signals[name] = this.native[name]; });
    const pressure = this.obd.pressure, ambient = this.obd.ambient;
    if (pressure && ambient && Math.abs(pressure.timestamp - ambient.timestamp) <= 1000) {
      signals.boost = Object.assign({}, pressure, { reference: 'absolute', ambient: Object.assign({}, ambient, { reference: 'absolute' }) });
    }
    const torque = signals.torque, rpm = signals.rpm;
    if (torque && rpm && torque.value >= 0 && Math.abs(torque.timestamp - rpm.timestamp) <= 250 && at - torque.timestamp <= Data.MAX_AGE_MS && at - rpm.timestamp <= Data.MAX_AGE_MS) {
      signals.power = Object.assign(this.reading(torque.value * rpm.value / 9549.3, 'kW', 'Calculated from ECU torque and RPM / not dyno', Math.min(torque.timestamp, rpm.timestamp)), { estimated: true });
    }
    const pct = this.obd.torquePercent, ref = this.obd.referenceTorque;
    if ((!torque || at - torque.timestamp > Data.MAX_AGE_MS) && pct && ref && pct.value >= 0 && Math.abs(pct.timestamp - ref.timestamp) <= 1000) {
      signals.torque = this.reading(pct.value * ref.value / 100, 'Nm', 'OBD actual torque percent x reference', Math.min(pct.timestamp, ref.timestamp));
      // The next frame may calculate power only from synchronized source readings.
      if (rpm && at - signals.torque.timestamp <= Data.MAX_AGE_MS && at - rpm.timestamp <= Data.MAX_AGE_MS && Math.abs(signals.torque.timestamp - rpm.timestamp) <= 250) {
        signals.power = Object.assign(this.reading(signals.torque.value * rpm.value / 9549.3, 'kW', 'Calculated from OBD torque and RPM / not dyno', Math.min(signals.torque.timestamp, rpm.timestamp)), { estimated: true });
      }
    }
    const f = this.faults;
    const faults = f ? { state: f.state, started: f.started, finished: f.finished, error: f.error, units: Object.keys(f.units).map((k) => f.units[k]).sort((a, b) => a.ecu - b.ecu) } : null;
    return { connected: this.active && this.lastReply !== null && at - this.lastReply <= 5000, source: 'BMW SOME/IP + read-only OBD', signals: signals, history: this.history.slice(), faults: faults };
  }
  emit() { if (!this.closed) this.publish(this.frame()); }
  plan() {
    const pressure = [0x70, 0x87, 0x0B].find((pid) => this.supported.has(pid) && !this.refused.has(pid));
    const list = pressure !== undefined && this.supported.has(0x33) && !this.refused.has(0x33) ? [pressure, 0x33] : [];
    [0x0C, 0x0D, 0x0F, 0x11, 0x05, 0x5C, 0x62, 0x63].forEach((pid) => { if (this.supported.has(pid) && !this.refused.has(pid)) list.push(pid); });
    return list;
  }
  obdLoop() {
    if (this.closed) return;
    if (!this.active || this.pending || (this.faults && this.faults.state === 'scanning')) { this.schedule(() => this.obdLoop(), 100); return; }
    const pid = this.scan.length ? this.scan.shift() : this.cycle.length ? this.cycle[this.turn++ % this.cycle.length] : undefined;
    if (pid === undefined) { this.schedule(() => this.obdLoop(), 1000); return; }
    const pending = this.pending = { pid: pid, started: this.now() };
    pending.timer = this.schedule(() => this.finish(false), 1500);
    const generation = this.generation;
    Promise.resolve().then(() => {
      if (this.closed || !this.active || generation !== this.generation || this.pending !== pending) return null;
      return this.request(0x12, 0x01, [pid]);
    })
      .then((res) => { if (this.pending === pending && (!res || ['NO_ERROR', 'REQUEST_PENDING'].indexOf(res.TasuErrorEnum) < 0)) this.finish(false); }, () => { if (this.pending === pending) this.finish(false); });
  }
  finish(ok) {
    const p = this.pending; if (!p) return;
    this.pending = null; this.cancel(p.timer); this.timers.delete(p.timer);
    if (!ok && PIDS[p.pid]) {
      const name = PIDS[p.pid].name; this.obd[name] = null;
    }
    const retryScan = !ok && p.pid % 32 === 0 && !this.refused.has(p.pid);
    if (retryScan) this.scan.push(p.pid);
    this.cycle = this.plan(); this.emit();
    this.schedule(() => this.obdLoop(), retryScan ? 5000 : 60);
  }
  response(ev) {
    if (!this.active || this.closed || !ev) return;
    const bytes = Array.from(ev.udsResponse || []);
    if (this.faults && this.faults.state === 'scanning' && ev.errorCode === 'NO_ERROR' && bytes.length >= 12 && bytes[2] !== 0x7F) { this.faultReply(bytes); return; }
    const p = this.pending;
    if (!p) return;
    // Shared TASU broadcasts: accept only the DME and requested PID/service.
    if (bytes.length < 12 || bytes[6] !== 0x12) return;
    if (ev.errorCode !== 'NO_ERROR' || bytes[2] === 0x7F) return;
    if (bytes[9] === 0x7F && bytes[10] === 0x01) {
      if (bytes[11] === 0x78) return;
      if (bytes[11] === 0x12 || bytes[11] === 0x31) this.refused.add(p.pid);
      this.finish(false); return;
    }
    if (bytes[9] !== 0x41 || bytes[10] !== p.pid) return;
    const data = bytes.slice(11), at = this.now();
    if (p.pid % 32 === 0) {
      if (data.length < 4) return;
      for (let bit = 0; bit < 32; bit++) if (data[bit >> 3] & (0x80 >> (bit & 7))) this.supported.add(p.pid + bit + 1);
      if (p.pid < 0x80 && this.supported.has(p.pid + 32)) this.scan.push(p.pid + 32);
    } else {
      const spec = PIDS[p.pid]; if (!spec || data.length < spec.size) return;
      const value = spec.decode(data);
      if (value === null && (p.pid === 0x70 || p.pid === 0x87)) this.refused.add(p.pid);
      this.obd[spec.name] = finite(value) ? this.reading(value, spec.unit, 'DME OBD 01/' + p.pid.toString(16), at) : null;
      if (spec.name === 'ambient') {
        const boost = Data.resolve({ connected: true, signals: this.frame().signals }, at).signals.boost;
        if (boost.status === 'live') this.history.push(this.reading(boost.value, 'psi', 'DME OBD pressure minus ambient', boost.timestamp));
        this.history = this.history.filter((s) => at - s.timestamp <= Data.MAX_AGE_MS).slice(-32);
        this.history.forEach((s) => { s.reference = 'gauge'; });
      }
    }
    this.lastReply = at; this.finish(true);
  }
  close() {
    if (this.closed) return;
    this.active = false; this.emit(); this.closed = true;
    this.timers.forEach((timer) => this.cancel(timer)); this.timers.clear(); this.pending = null;
    // Proxies/subscriptions belong to this process; late callbacks are ignored.
  }
}
module.exports = { VehicleData: VehicleData, PIDS: PIDS, gear: gear, allowed: allowed, parseDtcs: parseDtcs, ECUS: ECUS, interfaces: [CDS, VEHICLE, FES, GEAR, TASU, CDS2, TPMS, UNITS, ENVIRONMENT, BASIC] };
