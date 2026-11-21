'use strict';

const PSI_PER_KPA = 0.14503773773020923;
const MILES_PER_KM = 0.621371192237334;
const MAX_AGE_MS = 3000;
const definitions = {
  ethanol: { unit: '% v/v', min: 0, max: 100, label: 'Ethanol concentration' },
  fuel: { unit: '%', min: 0, max: 100, label: 'Fuel remaining' },
  boost: { unit: 'PSI gauge', min: -15, max: 35, label: 'Boost pressure' },
  rpm: { unit: 'RPM', min: 0, max: 8000, label: 'Engine speed' },
  speed: { unit: 'mph', min: 0, max: 200, label: 'Vehicle speed' },
  range: { unit: 'mi', min: 0, max: 600, label: 'Estimated range' },
  odometer: { unit: 'mi', min: 0, max: 1000000, label: 'Odometer' },
  oil: { unit: 'C', min: 0, max: 150, label: 'Engine oil' },
  coolant: { unit: 'C', min: 0, max: 130, label: 'Coolant' },
  intake: { unit: 'C', min: 0, max: 80, label: 'Intake air' },
  power: { unit: 'hp', min: 0, max: 900, label: 'Engine power' },
  torque: { unit: 'lb-ft', min: 0, max: 900, label: 'Engine torque' },
  throttle: { unit: '%', min: 0, max: 100, label: 'Throttle opening' },
  gear: { unit: 'gear', min: -1, max: 8, label: 'Selected gear' },
  gLong: { unit: 'g', min: -1.5, max: 1.5, label: 'Longitudinal g' },
  gLat: { unit: 'g', min: -1.5, max: 1.5, label: 'Lateral g' },
  ambient: { unit: 'C', min: -30, max: 50, label: 'Outside air' },
  gearboxOil: { unit: 'C', min: 0, max: 150, label: 'Gearbox oil' }
};
const tyres = ['FL', 'FR', 'RL', 'RR'];
tyres.forEach(function (corner) {
  definitions['tyreP' + corner] = { unit: 'psi', min: 0, max: 60, label: 'Tire pressure ' + corner };
  definitions['tyreTarget' + corner] = { unit: 'psi', min: 0, max: 60, label: 'Target pressure ' + corner };
  definitions['tyreT' + corner] = { unit: 'C', min: -20, max: 120, label: 'Tire air ' + corner };
});
function finite(value) { return typeof value === 'number' && isFinite(value); }
function pressure(value, unit) {
  if (!finite(value)) return null;
  if (unit === 'psi') return value;
  if (unit === 'kPa') return value * PSI_PER_KPA;
  if (unit === 'bar') return value * 100 * PSI_PER_KPA;
  return null;
}
function missing(status, reason) { return { value: null, status: status, reason: reason, timestamp: null }; }
function disconnected() { return { connected: false, source: 'Waiting for BMW SOME/IP and OBD', signals: {}, history: [] }; }
function normalizeSignal(name, input, now) {
  if (input && (input.verified !== true || input.quality === 'invalid')) return missing('unavailable', 'Signal semantics not verified or quality invalid');
  if (!input || !finite(input.value)) return missing('unavailable', 'Signal not supplied');
  if (!finite(input.timestamp) || input.timestamp > now + 1000) return missing('unavailable', 'Missing or invalid timestamp');
  let value = null, stale = now - input.timestamp > MAX_AGE_MS;
  if (name === 'boost') {
    value = pressure(input.value, input.unit);
    if (value === null) return missing('unavailable', 'Unknown pressure unit');
    if (input.reference === 'absolute') {
      const ambient = input.ambient;
      if (!ambient || ambient.verified !== true || ambient.quality === 'invalid' || ambient.reference !== 'absolute' || !finite(ambient.timestamp) || ambient.timestamp > now + 1000 || Math.abs(ambient.timestamp - input.timestamp) > 1000) return missing('unavailable', 'Synchronized ambient absolute pressure required');
      const ambientPsi = pressure(ambient.value, ambient.unit);
      if (ambientPsi === null || ambientPsi <= 0 || value <= 0) return missing('unavailable', 'Invalid absolute pressure');
      value -= ambientPsi;
      stale = stale || now - ambient.timestamp > MAX_AGE_MS;
    } else if (input.reference !== 'gauge') return missing('unavailable', 'Pressure reference not specified');
  } else if (name === 'ethanol' || name === 'fuel' || name === 'throttle') {
    if (input.unit === '%' || (name === 'ethanol' && input.unit === '% v/v')) value = input.value;
    if (value !== null && (value < 0 || value > 100)) value = null;
  } else if (name === 'power' || name === 'torque') {
    if (input.basis !== 'engine') return missing('unavailable', 'Verified engine-basis power or torque required');
    if (name === 'power') {
      if (input.unit === 'hp') value = input.value;
      if (input.unit === 'kW') value = input.value * 1.3410220895950277;
      if (input.unit === 'PS') value = input.value * 0.986320070619457;
    } else {
      if (input.unit === 'lb-ft') value = input.value;
      if (input.unit === 'Nm') value = input.value * 0.7375621492772656;
    }
    if (value !== null && value < 0) value = null;
  } else if (name === 'gLong' || name === 'gLat') {
    if (input.unit === 'g') value = input.value;
    if (input.unit === 'm/s2') value = input.value / 9.80665;
    if (value !== null && Math.abs(value) > 3) value = null;
  } else if (/^tyre(P|Target)/.test(name)) {
    value = pressure(input.value, input.unit);
    if (value !== null && (value < 0 || value > 100)) value = null;
  } else if (name === 'gear') {
    if (input.unit === 'gear' && input.value === Math.floor(input.value) && input.value >= -1 && input.value <= 8) value = input.value;
  } else if (name === 'rpm') {
    if (input.unit === 'rpm' && input.value >= 0) value = input.value;
  } else if (name === 'speed') {
    if (input.unit === 'mph') value = input.value;
    if (input.unit === 'km/h') value = input.value * MILES_PER_KM;
    if (value !== null && value < 0) value = null;
  } else if (name === 'range' || name === 'odometer') {
    if (input.unit === 'mi') value = input.value;
    if (input.unit === 'km') value = input.value * MILES_PER_KM;
    if (value !== null && value < 0) value = null;
  } else {
    if (input.unit === 'C') value = input.value;
    if (input.unit === 'F') value = (input.value - 32) * 5 / 9;
    if (input.unit === 'K') value = input.value - 273.15;
    if (value !== null && value < -273.15) value = null;
    if (value !== null && /^tyreT[A-Z]/.test(name) && (value < -40 || value > 150)) value = null;
  }
  if (!finite(value)) return missing('unavailable', 'Unsupported unit or invalid value');
  return { value: value, status: stale ? 'stale' : 'live', reason: stale ? 'Last update older than 3 s' : input.source || 'Adapter signal', timestamp: input.timestamp, estimated: input.estimated === true, freshness: input.freshness || 'measurement-time' };
}
function resolve(frame, now) {
  const output = { connected: !!(frame && frame.connected), source: frame && frame.source || 'No source', signals: {}, history: [] };
  Object.keys(definitions).forEach(function (name) {
    output.signals[name] = output.connected ? normalizeSignal(name, (frame.signals || {})[name], now) : missing('disconnected', 'Vehicle-data adapter disconnected');
  });
  if (output.connected && output.signals.boost.status === 'live' && Array.isArray(frame.history)) {
    output.history = frame.history.map(function (sample) { return normalizeSignal('boost', sample, now); })
      .filter(function (sample) { return sample.status === 'live'; }).sort(function (a, b) { return a.timestamp - b.timestamp; }).slice(-32);
  }
  return output;
}
function ingest(previous, packet, now) {
  now = now === undefined ? Date.now() : now;
  if (!packet || typeof packet.connected !== 'boolean') throw new Error('Adapter frame needs an explicit connection state');
  const next = { connected: packet.connected, source: packet.source || 'Unnamed adapter', signals: {}, history: packet.history || [] };
  Object.keys(definitions).forEach(function (name) {
    const incoming = (packet.signals || {})[name], old = previous && previous.signals && previous.signals[name];
    const oldValid = old && normalizeSignal(name, old, now).value !== null;
    const incomingValid = incoming && normalizeSignal(name, incoming, now).value !== null;
    next.signals[name] = incomingValid && oldValid && incoming.timestamp < old.timestamp ? old : incoming;
  });
  return next;
}
function demo(sample) {
  const values = sample === 0 ? { fuel: 68, range: 194, odometer: 15447, oil: 92, coolant: 88, intake: 31, ethanol: 44, boost: 18.6, rpm: 4280, speed: 54, power: 392, torque: 481, throttle: 77, gear: 3 } :
    { fuel: 74, range: 215, odometer: 15479, oil: 108, coolant: 96, intake: 42, ethanol: 68, boost: 24.2, rpm: 6120, speed: 76, power: 610, torque: 523, throttle: 98, gear: 4 };
  const extra = sample === 0 ? { gLong: 0.42, gLat: -0.18, ambient: 18, gearboxOil: 71, tyreP: [35.5, 35.0, 38.0, 38.5], tyreT: [28, 29, 31, 30] } :
    { gLong: -0.96, gLat: 0.74, ambient: 21, gearboxOil: 88, tyreP: [37.8, 37.6, 40.2, 40.4], tyreT: [46, 47, 52, 51] };
  ['gLong', 'gLat', 'ambient', 'gearboxOil'].forEach(function (name) { values[name] = extra[name]; });
  tyres.forEach(function (corner, i) { values['tyreP' + corner] = extra.tyreP[i]; values['tyreTarget' + corner] = i < 2 ? 36 : 39; values['tyreT' + corner] = extra.tyreT[i]; });
  const signals = {};
  Object.keys(definitions).forEach(function (name) { signals[name] = { value: values[name], status: 'demo', reason: 'Demonstration only', timestamp: null }; });
  return { connected: false, source: 'DEMO DATA / NOT CONNECTED TO VEHICLE', signals: signals,
    history: [4, 6, 8, 7, 11, 15, 13, 18, 20, values.boost].map(function (value, i) { return { value: value, status: 'demo', timestamp: i }; }) };
}
module.exports = { definitions: definitions, tyres: tyres, MAX_AGE_MS: MAX_AGE_MS, PSI_PER_KPA: PSI_PER_KPA,
  pressure: pressure, disconnected: disconnected, ingest: ingest, normalizeSignal: normalizeSignal, resolve: resolve, demo: demo };
