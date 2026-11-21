'use strict';

const Model = require('./model.js');
const Recorder = require('./record.js');
const WIDTH = 1440, HEIGHT = 382;
const color = { white: '#f3f6fc', muted: '#94a4bb', quiet: '#62738b', blue: '#389cff', red: '#eb405c', track: '#24334a', navy: '#101b2b', line: '#263b56', demo: '#d9b675', corn: '#c6b66b', accent: '#ef5076' };
const buttons = [{ x: 16, y: 340, w: 44, h: 36 }, { x: 68, y: 340, w: 44, h: 36 }, { x: 1004, y: 340, w: 136, h: 36 }, { x: 1148, y: 340, w: 132, h: 36 }, { x: 1288, y: 340, w: 136, h: 36 }];
const groupButtons = Model.groups.map(function (g, i) { return { x: 16 + i * 90, y: 340, w: 84, h: 36, label: g.name, action: 40 + i }; });
const icons = ['car', 'flag', 'fuel', 'temperature', 'trace', 'gauges', 'shop', 'graph', 'peak', 'gmeter', 'brake', 'drag', 'tyre', 'check', 'wrench'];
function editing(state) { return state && state.page === 5 && state.editing && !state.info; }
// Sub-tabs of the current group. The My Gauges editor needs the arrow slots, so it drops the group buttons.
function navigationTabs(state) {
  const list = Model.groups[Model.groupOf(state ? state.page : 0)].pages, left = editing(state) ? 128 : 290, step = (996 - left) / list.length;
  return list.map(function (page, i) { return { x: left + i * step, y: 340, w: step - 6, h: 36, label: Model.pages[page], page: page, action: 10 + page }; });
}
function targets(state) {
  const edit = editing(state), list = [];
  buttons.forEach(function (b, i) { if (edit || i >= 2) list.push(Object.assign({ action: i }, b)); });
  if (!edit) groupButtons.forEach(function (b) { list.push(b); });
  return list.concat(navigationTabs(state));
}
const tabs = navigationTabs(null);
function inside(b, x, y) { return x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h; }
function hit(x, y, state) {
  const list = targets(state || { page: 0 });
  for (let i = 0; i < list.length; i++) if (inside(list[i], x, y)) return list[i].action;
  return -1;
}
function customHit(state, x, y) {
  const action = hit(x, y, state);
  if (action >= 0 || state.page !== 5 || state.info || y < 78 || y > 288) return action;
  for (let i = 0; i < 3; i++) if (x >= 28 + i * 464 && x < 460 + i * 464) return 5 + i;
  return -1;
}
function swipe(state, down, x, y) {
  return down && !state.info && !state.editing && down.y >= 48 && down.y < 332 && Math.abs(x - down.x) >= 70 && Math.abs(y - down.y) < 40;
}
function clamp(value) { return Math.max(0, Math.min(1, value)); }
function width(font, text, size) { return String(text).split('').reduce(function (n, c) { return n + (font.glyphs[c] || font.glyphs['?']).advance * size / font.size; }, 0); }
function center(r, font, text, x, y, size, ink) { r.text(text, x - width(font, text, size) / 2, y, size, ink); }
function right(r, font, text, x, y, size, ink) { r.text(text, x - width(font, text, size), y, size, ink); }
function status(reading) { return reading.status === 'demo' ? '' : reading.estimated && Model.current(reading) ? 'EST. LIVE' : reading.status.toUpperCase(); }
function flag(r, reading, x, y) { const label = status(reading); if (label) r.text(label, x, y, 13, reading.status === 'live' ? color.muted : color.demo); }
function ethanolHint(r, reading, x, y, size) {
  const current = Model.current(reading);
  const value = current ? 'E' + Model.value(reading) + ' / ' + Model.value(reading) + '% v/v' : 'E--';
  const source = reading.status === 'demo' ? '' : ' / ' + (reading.status === 'live' ? 'LIVE' : reading.status.toUpperCase());
  r.text('ETHANOL  ' + value + source, x, y, size || 14, color.corn);
}
function path(r, points, ink, weight) { points.slice(1).forEach(function (p, i) { r.line(points[i][0], points[i][1], p[0], p[1], weight || 1, ink); }); }
function facet(r, x, y, w, h) {
  r.polygon([[x + 28, y], [x + w - 28, y], [x + w, y + h / 2], [x + w - 28, y + h], [x + 28, y + h], [x, y + h / 2]], '#0d1624', 2);
  r.polygon([[x + w * 0.62, y], [x + w - 28, y], [x + w, y + h / 2], [x + w * 0.82, y + h]], '#101d30', 2);
  path(r, [[x + w * 0.62, y], [x + w * 0.82, y + h], [x + 28, y + h]], '#1b2a40');
}
function position(points, amount) {
  const lengths = points.slice(1).map(function (p, i) { return Math.sqrt(Math.pow(p[0] - points[i][0], 2) + Math.pow(p[1] - points[i][1], 2)); });
  let remaining = clamp(amount) * lengths.reduce(function (a, b) { return a + b; }, 0);
  for (let i = 0; i < lengths.length; i++) {
    if (remaining <= lengths[i] || i === lengths.length - 1) {
      const a = points[i], b = points[i + 1], t = remaining / lengths[i];
      return { x: a[0] + (b[0] - a[0]) * t, y: a[1] + (b[1] - a[1]) * t, nx: -(b[1] - a[1]) / lengths[i], ny: (b[0] - a[0]) / lengths[i] };
    }
    remaining -= lengths[i];
  }
}
function visual(state, key, reading, min, max, now) {
  if (!state.visuals) state.visuals = {};
  if (!Model.current(reading)) { delete state.visuals[key]; return null; }
  const target = clamp((reading.value - min) / (max - min)), old = state.visuals[key];
  const value = old ? old.value + (target - old.value) * Math.min(1, Math.max(0, now - old.time) / 160) : target;
  state.visuals[key] = { value: value, time: now }; return value;
}
function tachoPoint(x, y, w, h, amount) {
  const value = clamp(amount) * 8, bottom = y + h - 18, top = y + 16, knee = bottom - (bottom - top) * 5 / 8;
  const low = value <= 5, t = low ? value / 5 : (value - 5) / 3;
  const a = low ? [x + w - 96, bottom] : [x + w - 40, knee], b = low ? [x + w - 40, knee] : [x + w - 96, top];
  const dx = b[0] - a[0], dy = b[1] - a[1], length = Math.sqrt(dx * dx + dy * dy);
  return { x: a[0] + dx * t, y: a[1] + dy * t, nx: -dy / length, ny: dx / length };
}
function tachometer(r, font, state, reading, x, y, w, h, now) {
  const bottom = tachoPoint(x, y, w, h, 0), knee = tachoPoint(x, y, w, h, 5 / 8), top = tachoPoint(x, y, w, h, 1);
  // Factory G80 cluster layering: bright outer edge, dark red band, thin inner contour.
  r.polygon([[bottom.x, bottom.y], [knee.x, knee.y], [top.x, top.y], [top.x - 28, top.y], [knee.x - 28, knee.y], [bottom.x - 28, bottom.y]], '#2a0b14', 1);
  path(r, [[x + w - 250, top.y], [top.x, top.y], [knee.x, knee.y], [bottom.x, bottom.y], [x + 12, bottom.y]], color.red, 3);
  path(r, [[x + w - 160, top.y + 30], [top.x - 32, top.y + 30], [knee.x - 32, knee.y], [bottom.x - 32, bottom.y - 30], [x + w - 230, bottom.y - 30]], color.red, 1);
  r.line(x + 12, bottom.y + 9, x + w - 120, bottom.y + 9, 6, '#2a0b14');
  const amount = visual(state, 'rpm.tacho', reading, 0, 8000, now);
  for (let i = 0; i < 8; i++) {
    if (amount !== null && amount > i / 8) {
      const a = tachoPoint(x, y, w, h, i / 8), end = tachoPoint(x, y, w, h, Math.min(amount, (i + 1) / 8));
      r.line(a.x - 10, a.y, end.x - 10, end.y, 8, color.red);
    }
  }
  for (let i = 0; i <= 16; i++) {
    const p = tachoPoint(x, y, w, h, i / 16), length = i % 2 ? 4 : 9;
    r.line(p.x + p.nx * 5, p.y + p.ny * 5, p.x + p.nx * (5 + length), p.y + p.ny * (5 + length), 1, color.muted);
    if (i % 2 === 0) center(r, font, String(i / 2), p.x + p.nx * 30, p.y + p.ny * 30 - 12, 20, '#ff6b7d');
  }
  if (amount !== null) {
    const p = tachoPoint(x, y, w, h, amount);
    r.line(p.x - p.nx * 18, p.y - p.ny * 18, p.x + p.nx * 14, p.y + p.ny * 14, 3, color.white);
  }
  r.text('ENGINE SPEED', x + 28, y + 48, 14, color.muted);
  const number = Model.value(reading), size = h > 210 ? 65 : 54;
  r.text(number, x + 24, y + 70, size, color.white);
  r.text('RPM', x + 34 + width(font, number, size), y + 70 + size * 0.6, 17, color.muted);
  r.text('1/min x 1000', x + w - 238, y - 4, 13, '#ff6b7d');
  flag(r, reading, x + 28, y + 148);
}
function pullTable(r, font, state, x, y) {
  r.text('RECENT PULLS', x, y, 14, color.muted);
  right(r, font, 'NEWEST FIRST', x + 430, y + 2, 11, color.quiet);
  Model.pulls(state).forEach(function (pull, row) {
    const top = y + 28 + row * 66;
    r.polygon([[x + 8, top], [x + 430, top], [x + 422, top + 56], [x, top + 56]], '#0b1a2e', 2);
    r.line(x + 3, top + 56, x + 11, top, 3, row === 0 ? color.blue : color.red);
    r.text(pull.id, x + 20, top + 8, 22, color.white);
    r.text('MPH', x + 20, top + 34, 12, color.muted);
    if (!pull.times.length) r.text(pull.running ? 'TIMING...' : state.mode === 'live' && pull.armed ? 'ARMED' : '--', x + 130, top + 14, 22, pull.running ? color.red : color.quiet);
    pull.times.forEach(function (seconds, i) {
      const left = x + 130 + i * 100, ink = i === 0 ? color.white : color.muted;
      r.text(seconds.toFixed(2), left, top + 10, i === 0 ? 30 : 24, ink);
      r.text('s', left + width(font, seconds.toFixed(2), i === 0 ? 30 : 24) + 4, top + 26, 13, color.muted);
    });
  });
  r.text('Timed from live speed (~10 Hz); not certified', x, y + 158, 11, color.quiet);
}
function sportBar(r, font, state, name, reading, x, y, w, now) {
  const d = Model.display(state, name, reading), v = d.reading, barWidth = w - 154;
  const amount = visual(state, name + '.sport', v, d.min, d.max, now);
  r.text(name === 'power' && v.estimated ? 'EST. ENGINE POWER' : d.label.toUpperCase(), x, y, 13, color.muted);
  r.polygon([[x + 6, y + 32], [x + barWidth, y + 32], [x + barWidth - 6, y + 48], [x, y + 48]], '#251724');
  path(r, [[x + 6, y + 32], [x + barWidth, y + 32], [x + barWidth - 6, y + 48], [x, y + 48], [x + 6, y + 32]], color.red, 1);
  r.line(x + 5, y + 45, x + barWidth - 8, y + 45, 1, color.accent);
  if (amount !== null) {
    const end = (barWidth - 12) * amount;
    if (end > 0) r.polygon([[x + 9, y + 35], [x + 9 + end, y + 35], [x + 5 + end, y + 44], [x + 5, y + 44]], color.red);
    r.line(x + 7 + end, y + 32, x + 2 + end, y + 48, 2, color.white);
  }
  const number = Model.value(v), size = w < 300 ? 27 : 38, valueX = x + barWidth + 14;
  r.text(number, valueX, y + 20, size, color.white);
  r.text(d.unit, valueX + width(font, number, size) + 9, y + 20 + size * 0.6, w < 300 ? 14 : 17, color.white);
  r.text(String(Math.round(d.min)), x, y + 52, 11, color.quiet);
  right(r, font, String(Math.round(d.max)), x + barWidth, y + 52, 11, color.quiet);
  flag(r, v, x, y + 72);
}
function instrument(r, font, state, name, reading, x, y, w, h, ink, now) {
  if (name === 'rpm') return tachometer(r, font, state, reading, x, y, w, h, now);
  if (name === 'power' || name === 'torque') {
    facet(r, x + 8, y + 22, w - 16, h - 31);
    return sportBar(r, font, state, name, reading, x + 15, y + 51, w - 30, now);
  }
  const d = Model.display(state, name, reading), v = d.reading;
  facet(r, x + 25, y + 14, w - 50, h - 30);
  const points = [[x + 38, y + h - 20], [x + 8, y + h / 2], [x + 48, y + 9], [x + w - 48, y + 9], [x + w - 8, y + h / 2], [x + w - 38, y + h - 20]];
  path(r, points, color.track, 2);
  const amount = visual(state, name, v, d.min, d.max, now);
  for (let i = 0; i < 32; i++) {
    const a = position(points, (i + 0.10) / 32), b = position(points, (i + 0.85) / 32);
    r.line(a.x, a.y, b.x, b.y, 4, amount !== null && (i + 0.5) / 32 <= amount ? ink : color.track);
  }
  for (let i = 0; i <= 8; i++) {
    const p = position(points, i / 8), length = i % 2 ? 5 : 10;
    r.line(p.x + p.nx * 6, p.y + p.ny * 6, p.x + p.nx * (6 + length), p.y + p.ny * (6 + length), 1, color.muted);
  }
  if (amount !== null) {
    const p = position(points, amount);
    r.line(p.x - p.nx * 7, p.y - p.ny * 7, p.x + p.nx * 19, p.y + p.ny * 19, 3, color.white);
  }
  const label = name === 'power' && v.estimated ? 'EST. ENGINE POWER' : d.label.toUpperCase();
  center(r, font, label, x + w / 2, y + 32, 16, color.muted);
  const number = name === 'gear' ? Model.gearValue(v) : name === 'ethanol' ? 'E' + Model.value(v) : Model.value(v, name === 'boost' ? 1 : 0);
  center(r, font, number, x + w / 2, y + 59, h > 210 ? 72 : 54, color.white);
  center(r, font, name === 'ethanol' ? '% ETHANOL / VOL' : d.unit, x + w / 2, y + (h > 210 ? 140 : 121), 19, color.muted);
  center(r, font, status(v), x + w / 2, y + h - 49, 13, color.demo);
  const scale = function (n) { return String(Math.round(n)); };
  r.text(scale(d.min), x + 20, y + h - 7, 13, color.muted);
  right(r, font, scale(d.max), x + w - 20, y + h - 7, 13, color.muted);
  center(r, font, scale((d.min + d.max) / 2), x + w / 2, y - 10, 12, color.quiet);
}
function track(r, state, name, reading, x, y, w, ink, now) {
  const d = Model.display(state, name, reading), amount = visual(state, name + '.bar', d.reading, d.min, d.max, now);
  ink = ink || color.blue;
  const rail = [[x + 6, y - 2], [x + w, y - 2], [x + w - 6, y + 14], [x, y + 14]];
  r.polygon(rail, ink === color.red ? '#251724' : '#111f33');
  path(r, rail.concat([rail[0]]), ink, 1);
  for (let i = 1; i < 10; i++) r.line(x + i * w / 10 + 3, y + 14, x + i * w / 10, y + 18, 1, color.quiet);
  if (amount !== null) {
    const end = (w - 12) * amount;
    if (end > 0) r.polygon([[x + 9, y + 1], [x + 9 + end, y + 1], [x + 5 + end, y + 10], [x + 5, y + 10]], ink);
    r.line(x + 7 + end, y - 2, x + 2 + end, y + 14, 2, color.white);
  }
  r.text(String(Math.round(d.min)), x, y + 20, 12, color.quiet);
  right(r, r.font, String(Math.round(d.max)), x + w, y + 20, 12, color.quiet);
}
function metric(r, state, name, reading, x, y, size) {
  const d = Model.display(state, name, reading), v = d.reading;
  r.text(d.label.toUpperCase(), x, y, 14, color.muted);
  const number = name === 'gear' ? Model.gearValue(v) : Model.value(v, name === 'boost' ? 1 : 0);
  r.text(number, x - 2, y + 21, size || 43, color.white);
  const unitX = x + width(r.font, number, size || 43) + 10;
  r.text(d.unit, unitX, y + (size || 43) - 1, 17, color.muted);
  flag(r, v, x, y + (size || 43) + 25);
}
function history(r, font, state, frame, x, y, w, h) {
  r.text('BOOST / RECENT SAMPLES', x, y - 24, 12, color.muted);
  const d = Model.display(state, 'boost', frame.signals.boost), values = frame.history;
  r.line(x, y + h, x + w, y + h, 1, color.track);
  if (values.length < 2) { r.text('History unavailable', x, y + 12, 17, color.quiet); return; }
  const first = values[0].timestamp, span = Math.max(1, values[values.length - 1].timestamp - first);
  values.slice(1).forEach(function (p, i) {
    const a = Model.display(state, 'boost', values[i]).reading, b = Model.display(state, 'boost', p).reading;
    r.line(x + (values[i].timestamp - first) / span * w, y + h * (1 - clamp((a.value - d.min) / (d.max - d.min))), x + (p.timestamp - first) / span * w, y + h * (1 - clamp((b.value - d.min) / (d.max - d.min))), 2, color.blue);
  });
}
function tabIcon(r, name, x, y, ink) {
  function line(points, weight) { path(r, points.map(function (p) { return [x + p[0], y + p[1]]; }), ink, weight || 1.3); }
  if (name === 'car') {
    line([[1, 16], [1, 9], [4, 4], [15, 4], [18, 9], [18, 16], [1, 16]]);
    line([[4, 7], [15, 7]]); line([[3, 11], [6, 11]]); line([[13, 11], [16, 11]]);
    line([[8, 10], [8, 14], [11, 14], [11, 10]]);
  } else if (name === 'flag') {
    line([[2, 19], [2, 1], [18, 1], [18, 12], [3, 12]]);
    for (let row = 0; row < 3; row++) for (let col = 0; col < 4; col++) if ((row + col) % 2 === 0) r.rect(x + 3 + col * 3.5, y + 2 + row * 3, 3.5, 3, ink);
  } else if (name === 'fuel') {
    line([[1, 18], [13, 18], [13, 2], [3, 2], [3, 18]]);
    line([[5, 5], [10, 5], [10, 9], [5, 9], [5, 5]]);
    line([[13, 7], [17, 10], [17, 16], [15, 16], [15, 12]]); line([[15, 4], [18, 7], [18, 10]]);
  } else if (name === 'temperature') {
    line([[6, 12], [6, 3], [8, 1], [10, 3], [10, 12], [13, 15], [12, 18], [8, 20], [4, 18], [3, 15], [6, 12]]);
    line([[8, 7], [8, 16]], 2); line([[13, 4], [17, 4]]); line([[13, 8], [16, 8]]);
  } else if (name === 'shop') {
    line([[3, 2], [3, 18], [13, 18], [17, 15], [17, 12], [13, 10], [16, 8], [16, 5], [13, 2], [3, 2]], 1.7);
    line([[7, 6], [12, 6]]); line([[7, 14], [12, 14]]);
  } else if (name === 'trace') {
    line([[1, 18], [1, 3]]); line([[1, 18], [19, 18]]);
    line([[3, 14], [6, 14], [9, 5], [12, 12], [16, 3], [19, 3]], 1.7);
  } else if (name === 'graph') {
    line([[1, 2], [1, 18], [19, 18]]); line([[3, 15], [8, 9], [13, 6], [18, 7]], 1.7); line([[3, 16], [8, 13], [13, 12], [18, 14]]);
  } else if (name === 'peak') {
    line([[2, 18], [7, 8], [10, 12], [14, 3], [18, 18]], 1.7); line([[11, 3], [17, 3]]);
  } else if (name === 'gmeter') {
    circle(r, x + 10, y + 10, 9, ink, 1.2); circle(r, x + 10, y + 10, 4.5, ink, 1); r.rect(x + 12, y + 4, 4, 4, ink, 2);
  } else if (name === 'brake') {
    circle(r, x + 10, y + 10, 9, ink, 1.4); circle(r, x + 10, y + 10, 3, ink, 1.4); line([[16, 3], [19, 6], [19, 14], [16, 17]], 2.5);
  } else if (name === 'drag') {
    line([[10, 1], [10, 19]]); [4, 9, 14].forEach(function (yy) { r.rect(x + 4, y + yy, 4, 3, ink, 1.5); r.rect(x + 12, y + yy, 4, 3, ink, 1.5); });
  } else if (name === 'tyre') {
    line([[4, 1], [16, 1], [18, 4], [18, 16], [16, 19], [4, 19], [2, 16], [2, 4], [4, 1]], 1.5); [6, 10, 14].forEach(function (yy) { line([[5, yy], [15, yy]]); });
  } else if (name === 'check') {
    line([[2, 10], [7, 16], [18, 3]], 2.2);
  } else if (name === 'wrench') {
    line([[3, 17], [11, 9]], 3); circle(r, x + 14, y + 6, 4.5, ink, 1.6);
  } else {
    [3, 9, 15].forEach(function (left, i) {
      line([[left, 2], [left, 19]]); line([[left - 2, 6 + i * 4], [left + 2, 6 + i * 4]], 2.5);
    });
  }
}
function circle(r, cx, cy, radius, ink, weight) {
  const n = Math.max(16, Math.round(radius * 1.5));
  for (let i = 0; i < n; i++) {
    const a = i / n * Math.PI * 2, b = (i + 1) / n * Math.PI * 2;
    r.line(cx + Math.cos(a) * radius, cy + Math.sin(a) * radius, cx + Math.cos(b) * radius, cy + Math.sin(b) * radius, weight || 1, ink);
  }
}
function navigation(r, font, state) {
  r.rect(0, 334, WIDTH, 48, '#090f19');
  const edit = editing(state);
  const labels = edit ? ['<', '>', 'Change gauge', 'Done', 'Reset'] : ['<', '>', state.info ? 'US units' : state.page === 5 ? 'Customize' : state.page === Model.PAGE.diagnostics ? 'Scan faults' : state.page === Model.PAGE.peaks && state.mode === 'live' ? 'Reset peaks' : state.mode === 'demo' ? 'New sample' : 'Auto reads', state.mode === 'demo' ? 'Go live' : 'Demo mode', state.info ? 'Close settings' : 'Settings'];
  buttons.forEach(function (b, i) {
    if (i < 2 && !edit) return;
    if (i === state.focus) { r.rect(b.x, b.y, b.w, b.h, '#142942'); r.line(b.x + 3, b.y + b.h - 1, b.x + b.w - 3, b.y + b.h - 1, 2, color.blue); }
    center(r, font, labels[i], b.x + b.w / 2, b.y + 6, i < 2 ? 22 : 15, color.white);
  });
  if (!edit) {
    const active = Model.groupOf(state.page);
    groupButtons.forEach(function (b, i) {
      if (i === active) { r.polygon([[b.x + 8, b.y], [b.x + b.w, b.y], [b.x + b.w - 8, b.y + b.h], [b.x, b.y + b.h]], '#18304d', 1); r.line(b.x + 10, b.y + b.h - 1, b.x + b.w - 10, b.y + b.h - 1, 2, color.blue); }
      center(r, font, b.label.toUpperCase(), b.x + b.w / 2, b.y + 9, 14, i === active ? color.white : color.muted);
    });
    r.line(282, 344, 276, 372, 1, color.line);
  }
  const next = !edit && state.focus < 2 ? Model.step(state.page, state.focus === 0 ? -1 : 1) : -1;
  navigationTabs(state).forEach(function (b) {
    if (b.page === next) path(r, [[b.x, b.y + 2], [b.x, b.y + b.h - 1], [b.x + b.w, b.y + b.h - 1], [b.x + b.w, b.y + 2]], color.blue, 1);
    const on = state.page === b.page;
    if (on) { r.rect(b.x, b.y, b.w, b.h, '#132338'); r.line(b.x + 12, b.y, b.x + b.w - 12, b.y, 2, color.accent); }
    const label = b.label === 'Fuel & Ethanol' ? 'Fuel / Ethanol' : b.label === 'Balkan Automotive' ? 'Balkan' : b.label, textWidth = width(font, label, 13);
    const left = b.x + (b.w - textWidth - 25) / 2;
    tabIcon(r, icons[b.page], left, b.y + 8, on ? color.blue : color.muted);
    r.text(label, left + 25, b.y + 9, 13, on ? color.white : color.muted);
  });
}
// Display-only shift light: 10 segments from 5500 rpm, all red and flashing from 7000. Not linked to the DME's own shift point.
const shiftLight = { start: 5500, step: 150, flash: 7000 };
function shiftLights(r, reading, now) {
  const x = 560, y = 16, n = 10, on = Model.current(reading) ? Math.floor((reading.value - shiftLight.start) / shiftLight.step) + 1 : 0;
  const flash = Model.current(reading) && reading.value >= shiftLight.flash;
  for (let i = 0; i < n; i++) {
    const lit = flash ? Math.floor(now / 125) % 2 === 0 : i < on, ink = flash || i >= 7 ? color.red : i >= 4 ? color.white : '#6fc3ff';
    r.polygon([[x + i * 40 + 6, y], [x + i * 40 + 34, y], [x + i * 40 + 28, y + 12], [x + i * 40, y + 12]], lit ? ink : '#18243a');
  }
}
function chip(r, font, label, x, y, state) {
  const ink = state === 'ready' ? '#3fb37f' : state === 'warming' ? color.demo : state === 'check' ? color.red : color.quiet;
  const w = width(font, label, 12) + 18;
  r.polygon([[x + 5, y], [x + w, y], [x + w - 5, y + 20], [x, y + 20]], '#0f1b2c', 1);
  path(r, [[x + 5, y], [x + w, y], [x + w - 5, y + 20], [x, y + 20], [x + 5, y]], ink, 1);
  r.text(label, x + 9, y + 3, 12, ink);
  return w;
}
function value(state, name, v) { return Model.display(state, name, { value: v, status: 'live' }); }
function pullGraph(r, font, state, now) {
  const rec = Model.records(state).pullGraph, gx = 70, gy = 72, gw = 900, gh = 228;
  const powerMax = value(state, 'power', 700).reading.value, torqueMax = value(state, 'torque', 700).reading.value;
  for (let i = 0; i <= 7; i++) {
    const xx = gx + i * gw / 7;
    r.line(xx, gy, xx, gy + gh, 1, '#16253a'); center(r, font, String(1 + i), xx, gy + gh + 6, 13, color.muted);
  }
  for (let i = 0; i <= 4; i++) {
    const yy = gy + gh - i * gh / 4;
    r.line(gx, yy, gx + gw, yy, 1, '#16253a');
    right(r, font, String(Math.round(powerMax * i / 4)), gx - 8, yy - 8, 12, '#ff6b7d');
    r.text(String(Math.round(torqueMax * i / 4)), gx + gw + 8, yy - 8, 12, '#7cc6ff');
  }
  r.text(value(state, 'power', 0).unit.toUpperCase() + ' EST.', gx - 54, gy - 22, 12, '#ff6b7d');
  right(r, font, value(state, 'torque', 0).unit.toUpperCase(), gx + gw + 40, gy - 22, 12, '#7cc6ff');
  r.text('1/min x 1000', gx + gw / 2 - 40, gy + gh + 24, 11, color.quiet);
  const panel = 1040;
  r.text('LAST FULL-THROTTLE PULL', panel, 70, 13, color.muted);
  if (!rec || rec.samples.length < 2) {
    r.text('No pull recorded', panel, 96, 24, color.white);
    r.text('Hold full throttle through', panel, 136, 15, color.muted);
    r.text('1,500+ rpm in one gear.', panel, 158, 15, color.muted);
    r.text('Engine power is EST. from ECU', panel, 268, 12, color.quiet); r.text('torque x RPM, not a dyno.', panel, 286, 12, color.quiet);
    return;
  }
  function px(rpm) { return gx + clamp((rpm - 1000) / 7000) * gw; }
  function plot(key, max, ink, name) {
    rec.samples.slice(1).forEach(function (p, i) {
      const a = rec.samples[i], va = value(state, name, a[key]).reading.value, vb = value(state, name, p[key]).reading.value;
      r.line(px(a.rpm), gy + gh * (1 - clamp(va / max)), px(p.rpm), gy + gh * (1 - clamp(vb / max)), 3, ink);
    });
  }
  plot('lbft', torqueMax, '#389cff', 'torque'); plot('hp', powerMax, color.red, 'power');
  function best(key) { return rec.samples.reduce(function (a, b) { return b[key] > a[key] ? b : a; }); }
  const hp = best('hp'), tq = best('lbft');
  r.text('PEAK POWER (EST.)', panel, 100, 12, color.muted);
  r.text(value(state, 'power', hp.hp).reading.value.toFixed(0), panel, 116, 44, color.white); r.text(value(state, 'power', 0).unit + ' @ ' + Math.round(hp.rpm / 50) * 50, panel + 112, 136, 15, color.muted);
  r.text('PEAK TORQUE', panel, 178, 12, color.muted);
  r.text(value(state, 'torque', tq.lbft).reading.value.toFixed(0), panel, 194, 44, color.white); r.text(value(state, 'torque', 0).unit + ' @ ' + Math.round(tq.rpm / 50) * 50, panel + 112, 214, 15, color.muted);
  r.text((rec.gear ? 'Gear ' + rec.gear + ' / ' : '') + rec.samples.length + ' points / not a dyno', panel, 270, 13, color.quiet);
}
function peaks(r, font, state) {
  const p = Model.records(state).peaks;
  const tiles = [['boost', 'Boost'], ['rpm', 'Engine speed'], ['speed', 'Top speed'], ['power', 'Power EST.'], ['torque', 'Torque'], ['lateral', 'Lateral g'],
    ['accel', 'Accel g'], ['braking', 'Braking g'], ['oil', 'Engine oil'], ['coolant', 'Coolant'], ['intake', 'Intake air'], ['gearboxOil', 'Gearbox oil']];
  tiles.forEach(function (t, i) {
    const x = 30 + (i % 4) * 348, y = 62 + Math.floor(i / 4) * 88, g = t[0] === 'lateral' || t[0] === 'accel' || t[0] === 'braking';
    r.polygon([[x + 10, y], [x + 336, y], [x + 326, y + 78], [x, y + 78]], '#0d1828', 2);
    r.line(x + 2, y + 78, x + 10, y, 3, i < 4 ? color.red : g ? '#6fc3ff' : '#1f5cb0');
    r.text(t[1].toUpperCase(), x + 22, y + 9, 12, color.muted);
    const has = p[t[0]] !== undefined, d = g ? null : Model.display(state, t[0], { value: p[t[0]], status: 'live' });
    const number = !has ? '--' : g ? p[t[0]].toFixed(2) : d.reading.value.toFixed(t[0] === 'boost' ? 1 : 0);
    r.text(number, x + 20, y + 26, 38, has ? color.white : color.quiet);
    r.text(g ? 'g' : d.unit, x + 30 + width(font, number, 38), y + 46, 15, color.muted);
  });
  r.text(state.mode === 'demo' ? 'Sample peaks' : 'This drive, until the app closes. Reset peaks clears them.', 30, 330 - 14, 11, color.quiet);
}
function gMeter(r, font, state, s) {
  const cx = 300, cy = 192, scale = 70, p = Model.records(state).peaks;
  [0.5, 1, 1.5].forEach(function (g) { circle(r, cx, cy, g * scale, g === 1 ? '#2b4566' : '#18263b', g === 1 ? 2 : 1); });
  r.line(cx - 112, cy, cx + 112, cy, 1, '#18263b'); r.line(cx, cy - 112, cx, cy + 112, 1, '#18263b');
  [['0.5', 0.5], ['1.0', 1], ['1.5', 1.5]].forEach(function (l) { r.text(l[0], cx + l[1] * scale * 0.71 + 4, cy - l[1] * scale * 0.71 - 16, 11, color.quiet); });
  center(r, font, 'ACCEL', cx, cy - 1.5 * scale - 20, 11, color.muted); center(r, font, 'BRAKE', cx, cy + 1.5 * scale + 6, 11, color.muted);
  if (p.accel) r.line(cx - 10, cy - p.accel * scale, cx + 10, cy - p.accel * scale, 2, '#3fb37f');
  if (p.braking) r.line(cx - 10, cy + p.braking * scale, cx + 10, cy + p.braking * scale, 2, color.red);
  if (p.lateral) { r.line(cx - p.lateral * scale, cy - 10, cx - p.lateral * scale, cy + 10, 2, '#6fc3ff'); r.line(cx + p.lateral * scale, cy - 10, cx + p.lateral * scale, cy + 10, 2, '#6fc3ff'); }
  const live = Model.current(s.gLat) && Model.current(s.gLong);
  if (live) {
    const dx = Math.max(-1.6, Math.min(1.6, s.gLat.value)) * scale, dy = -Math.max(-1.6, Math.min(1.6, s.gLong.value)) * scale;
    r.line(cx, cy, cx + dx, cy + dy, 2, '#6fc3ff'); r.rect(cx + dx - 9, cy + dy - 9, 18, 18, color.white, 9); r.rect(cx + dx - 5, cy + dy - 5, 10, 10, color.red, 5);
  }
  [['gLat', 'LATERAL', 560, 70], ['gLong', 'LONGITUDINAL', 560, 190]].forEach(function (m) {
    const reading = s[m[0]];
    r.text(m[1], m[2], m[3], 14, color.muted);
    r.text(Model.current(reading) ? Math.abs(reading.value).toFixed(2) : '--', m[2] - 2, m[3] + 22, 64, color.white);
    r.text('g', m[2] + 150, m[3] + 58, 20, color.muted);
    if (Model.current(reading)) r.text(m[0] === 'gLat' ? (reading.value >= 0 ? 'RIGHT' : 'LEFT') : (reading.value >= 0 ? 'ACCEL' : 'BRAKING'), m[2] + 182, m[3] + 62, 14, color.muted);
    flag(r, reading, m[2], m[3] + 96);
  });
  r.text('SESSION PEAKS', 1000, 70, 14, color.muted);
  [['Lateral', p.lateral], ['Acceleration', p.accel], ['Braking', p.braking]].forEach(function (row, i) {
    r.text(row[0], 1000, 100 + i * 54, 16, color.muted);
    right(r, font, row[1] === undefined ? '--' : row[1].toFixed(2) + ' g', 1404, 94 + i * 54, 30, color.white);
  });
  r.text('From the car\'s own acceleration sensor; standstill offset removed.', 1000, 278, 11, color.quiet);
}
function runTable(r, font, title, rows, x, y, w, columns) {
  r.text(title, x, y, 14, color.muted);
  columns.forEach(function (c) { right(r, font, c[0], x + c[1], y + 2, 11, color.quiet); });
  if (!rows.length) { r.text('No runs yet', x, y + 34, 22, color.quiet); return; }
  rows.forEach(function (row, i) {
    const top = y + 26 + i * 58;
    r.polygon([[x + 8, top], [x + w, top], [x + w - 8, top + 50], [x, top + 50]], '#0b1a2e', 2);
    r.line(x + 3, top + 50, x + 11, top, 3, i === 0 ? color.blue : color.red);
    r.text(i === 0 ? 'LATEST' : '#' + (i + 1), x + 20, top + 17, 12, color.muted);
    columns.forEach(function (c, j) { right(r, font, c[2](row), x + c[1], top + 8, j === 0 ? 30 : 22, j === 0 ? color.white : color.muted); });
  });
}
function brakeTest(r, font, state, s) {
  const rec = Model.records(state), b = state.mode === 'demo' ? { state: 'done' } : rec.brake;
  function dist(ft) { return ft.toFixed(1) + ' ft'; }
  r.text('60-0 MPH', 36, 64, 15, color.muted);
  const status = { arm: 'Get above 63 mph', ready: 'Brake hard below 60', braking: 'Measuring...', done: 'Stop recorded' }[b.state] || 'Waiting';
  r.text(status, 34, 88, 34, b.state === 'braking' ? color.red : color.white);
  r.text('Timing starts at 60 mph once deceleration passes 0.4 g', 36, 136, 14, color.muted);
  r.text('and ends when the car stops. Flat, empty road only.', 36, 156, 14, color.muted);
  const runs = rec.brakeRuns || [];
  if (runs.length) {
    const best = runs.reduce(function (a, c) { return c.feet < a.feet ? c : a; });
    r.text('BEST', 36, 196, 13, color.muted); r.text(dist(best.feet), 34, 212, 44, color.white);
    if (runs.length > 1) r.text('FADE ' + (runs[0].feet - best.feet >= 0 ? '+' : '') + dist(runs[0].feet - best.feet).replace(' ', ' ') + ' vs best', 36, 270, 15, runs[0].feet - best.feet > 5 ? color.red : color.muted);
  }
  if (rec.message) r.text(rec.message, 36, 300, 13, color.demo);
  runTable(r, font, 'LAST THREE STOPS', runs, 560, 64, 840, [['DISTANCE', 380, function (x) { return dist(x.feet); }], ['TIME', 600, function (x) { return x.seconds.toFixed(2) + ' s'; }], ['PEAK DECEL', 830, function (x) { return x.peakG.toFixed(2) + ' g'; }]]);
}
function dragTimer(r, font, state) {
  const rec = Model.records(state), run = state.mode === 'live' ? rec.drag : null;
  const status = !run ? 'Stop the car to arm' : run.armed ? 'ARMED / launch when ready' : 'RUNNING ' + Math.round(run.feet) + ' ft';
  r.text(state.mode === 'demo' ? 'Sample runs' : status, 36, 62, 18, run && run.start !== undefined ? color.red : color.white);
  Model.Session.drags.forEach(function (d, i) {
    const x = 36 + i * 690;
    runTable(r, font, d.id.toUpperCase() + ' MILE', rec.dragRuns[d.id] || [], x, 98, 660, [['ET', 330, function (v) { return v.seconds.toFixed(2) + ' s'; }], ['TRAP', 640, function (v) { return v.trap.toFixed(1) + ' mph'; }]]);
  });
  r.text('From the car\'s speed signal (~10 Hz) from a standstill; no reaction time. Not a timing-slip result.', 36, 318, 11, color.quiet);
}
function vitals(r, font, state, s) {
  r.polygon([[220, 66], [360, 66], [392, 110], [392, 270], [360, 314], [220, 314], [188, 270], [188, 110]], '#0d1828', 1);
  path(r, [[220, 66], [360, 66], [392, 110], [392, 270], [360, 314], [220, 314], [188, 270], [188, 110], [220, 66]], '#2b4566', 1);
  center(r, font, 'FRONT', 290, 76, 11, color.quiet);
  Model.Data.tyres.forEach(function (c, i) {
    const x = i % 2 ? 420 : 24, y = i < 2 ? 66 : 196, p = Model.display(state, 'tyreP' + c, s['tyreP' + c]), t = Model.display(state, 'tyreT' + c, s['tyreT' + c]);
    const target = Model.display(state, 'tyreTarget' + c, s['tyreTarget' + c]), warm = Model.current(s['tyreT' + c]) ? Model.tyreStatus(s['tyreT' + c].value) : null;
    const ink = warm === 'COLD' ? '#6fc3ff' : warm === 'WARMING' ? color.demo : warm === 'READY' ? '#3fb37f' : warm === 'HOT' ? color.red : color.quiet;
    r.rect(i % 2 ? 380 : 180, y + 10, 20, 96, '#222f44', 3); r.rect(i % 2 ? 380 : 180, y + 10, 20, 96, ink, 0); r.rect(i % 2 ? 383 : 183, y + 13, 14, 90, '#0d1828', 2);
    r.text(c, x, y, 13, color.muted);
    const pv = Model.value(p.reading, 1);
    r.text(pv, x, y + 16, 40, color.white); r.text(p.unit, x + width(font, pv, 40) + 6, y + 38, 14, color.muted);
    r.text('target ' + Model.value(target.reading, 1), x, y + 64, 12, color.quiet);
    r.text(Model.value(t.reading) + ' ' + t.unit + (warm ? '  ' + warm : ''), x, y + 84, 14, ink);
  });
  ['gearboxOil', 'ambient', 'oil', 'coolant', 'intake'].forEach(function (name, i) {
    metric(r, state, name, s[name], 640 + (i % 3) * 260, 66 + Math.floor(i / 3) * 128, 38);
  });
  const t = function (c) { return value(state, 'tyreTFL', c).reading.value.toFixed(0); }, unit = value(state, 'tyreTFL', 0).unit;
  r.text('Tire temperature is TPMS air temperature, not tread. Warm-up: under ' + t(20) + ' ' + unit + ' cold, ' + t(20) + '-' + t(35) + ' warming, ' + t(35) + '-' + t(65) + ' ready.', 640, 318, 11, color.quiet);
}
function readiness(r, font, state, s) {
  // Items without data don't block the headline; they keep their own NO DATA chip.
  const items = Model.readiness(state, s), has = function (k) { return items.some(function (i) { return i.state === k; }); };
  const worst = has('check') ? 'check' : has('warming') ? 'warming' : has('ready') ? 'ready' : 'unknown';
  r.text('PRE-DRIVE', 36, 64, 14, color.muted);
  r.text({ ready: 'Ready to push', warming: 'Warming up', check: 'Check before driving', unknown: 'Waiting for data' }[worst], 34, 84, 40, worst === 'check' ? color.red : worst === 'ready' ? color.white : color.demo);
  r.text('Take it easy until every item reads READY.', 36, 140, 15, color.muted);
  r.text('Guidance for a road car, not BMW limits.', 36, 162, 13, color.quiet);
  items.forEach(function (item, i) {
    const y = 62 + i * 52;
    r.polygon([[620, y], [1404, y], [1396, y + 44], [612, y + 44]], '#0d1828', 2);
    r.text(item.label, 636, y + 12, 18, color.white);
    r.text(item.detail, 860, y + 14, 14, color.muted);
    chip(r, font, { ready: 'READY', warming: 'WARMING', check: 'CHECK', unknown: 'NO DATA' }[item.state], 1290, y + 12, item.state);
  });
}
function diagnostics(r, font, state) {
  const f = Model.faults(state);
  r.text('FAULT SCANNER / READ ONLY', 36, 62, 14, color.muted);
  if (!f) {
    r.text('Press Scan fault memory', 34, 86, 34, color.white);
    r.text('Reads stored and pending codes from every control unit.', 36, 136, 15, color.muted);
    r.text('Parked, ignition on. Live gauges pause during the scan.', 36, 158, 15, color.muted);
    r.text('Nothing is cleared or changed. Codes are shown without BMW fault texts.', 36, 300, 12, color.quiet);
    return;
  }
  if (f.state === 'scanning') {
    r.text('Scanning all units...', 34, 86, 34, color.white);
    r.text(f.units.length + ' answered so far', 36, 136, 16, color.muted);
    return;
  }
  const codes = f.units.reduce(function (n, u) { return n + u.codes.length; }, 0), withCodes = f.units.filter(function (u) { return u.codes.length; });
  r.text(f.units.length ? codes + (codes === 1 ? ' code' : ' codes') : 'No unit answered', 34, 86, 34, codes ? color.white : color.muted);
  r.text(f.units.length ? f.units.length + ' units answered' + (f.error ? ' / ' + f.error : '') : f.error || 'Ignition on?', 36, 136, 15, color.muted);
  r.text('Codes only: look them up in ISTA or a BMW forum.', 36, 300, 12, color.quiet);
  if (f.demo) r.text('SAMPLE CODES / NOT FROM THIS CAR', 36, 176, 14, color.demo);
  let row = 0;
  withCodes.forEach(function (u) {
    u.codes.forEach(function (c) {
      if (row >= 8) return;
      const x = 520 + (row % 2) * 446, y = 62 + Math.floor(row / 2) * 66;
      r.polygon([[x + 8, y], [x + 436, y], [x + 428, y + 56], [x, y + 56]], '#0d1828', 2);
      r.text(c.code, x + 18, y + 6, 28, color.white);
      r.text(u.name, x + 18, y + 36, 13, color.muted);
      chip(r, font, c.status, x + 300, y + 16, c.status === 'ACTIVE' || c.status === 'WARNING LAMP' ? 'check' : c.status === 'PENDING' ? 'warming' : 'unknown');
      row++;
    });
  });
  if (codes > 8) r.text('+' + (codes - 8) + ' more in the native summary', 520, 330 - 12, 11, color.quiet);
  if (!codes && f.units.length) r.text('No stored or pending faults.', 520, 70, 20, color.white);
}
function shop(r, font) {
  r.polygon([[56, 56], [658, 56], [760, 328], [158, 328]], '#131f30', 1);
  path(r, [[658, 56], [760, 328]], color.red, 2);
  path(r, [[668, 56], [770, 328]], '#1f5cb0', 2);
  path(r, [[678, 56], [780, 328]], '#6fc3ff', 2);
  // User-supplied shop logo, as wide as the old flag B and centred in the same area.
  r.image(2, 114, 133, 495, 116);
  card(r, font, 820, 64, 580, 256);
}
// Business card styled like a BMW M Card: chamfered navy plate, M stripe, address, services.
const shopCard = { name: 'Balkan Auto', address: '210 W Main St, Middletown, PA 17057',
  services: ['Performance installations', 'Car servicing', 'Alignments', 'Vinyl wrap', 'Aftermarket part installs', "Literally f*ckin' anything"] };
function card(r, font, x, y, w, h) {
  const edge = [[x + 22, y], [x + w, y], [x + w, y + h - 22], [x + w - 22, y + h], [x, y + h], [x, y + 22]];
  r.polygon(edge, '#0d1a2c', 1);
  r.polygon([[x + w * 0.58, y], [x + w, y], [x + w, y + h - 22], [x + w - 22, y + h], [x + w * 0.74, y + h]], '#112138', 1);
  path(r, edge.concat([edge[0]]), '#2b4566', 1);
  [['#6fc3ff', 0], ['#1f5cb0', 9], [color.red, 18]].forEach(function (stripe) { r.line(x + 30 + stripe[1], y + 38, x + 40 + stripe[1], y + 14, 5, stripe[0]); });
  r.text(shopCard.name.toUpperCase(), x + 76, y + 10, 34, color.white);
  path(r, [[x + 24, y + 62], [x + w - 24, y + 62]], color.line, 1);
  // Map pin from two lines and a dot: no icon font on the head unit.
  r.line(x + 30, y + 78, x + 36, y + 92, 2, color.red); r.line(x + 42, y + 78, x + 36, y + 92, 2, color.red); r.rect(x + 32, y + 74, 8, 8, color.red, 4);
  r.text(shopCard.address, x + 52, y + 74, 18, color.white);
  r.text('SERVICES', x + 30, y + 114, 12, color.muted);
  shopCard.services.forEach(function (service, i) {
    const column = i < 3 ? 0 : 1, row = i < 3 ? i : i - 3, sx = x + 30 + column * 270, sy = y + 136 + row * 36;
    path(r, [[sx, sy + 5], [sx + 6, sy + 11], [sx, sy + 17]], color.red, 2);
    r.text(service, sx + 16, sy, 18, color.white);
  });
}
function backdrop(r) {
  r.rect(0, 0, WIDTH, HEIGHT, '#080e18');
  r.polygon([[388, 46], [874, 46], [1162, 334], [676, 334]], '#101b2b', 1);
  r.polygon([[728, 46], [1008, 46], [1296, 334], [1016, 334]], '#172437', 1);
  r.polygon([[950, 46], [1058, 46], [1346, 334], [1238, 334]], '#1c2c40', 1);
  path(r, [[916, 46], [1204, 334], [1414, 334]], '#2b3c53');
  path(r, [[392, 46], [680, 334]], '#1b2c42');
}
function draw(state, font, now) {
  now = now === undefined ? Date.now() : now;
  const r = new Recorder(font), frame = Model.snapshot(state, now), s = frame.signals;
  backdrop(r);
  r.rect(0, 0, WIDTH, 46, '#090f19');
  r.text("Bishal\'s M3 App", 24, 0, 23, color.white);
  r.text('Powered by Balkan Automotive', 24, 26, 14, color.red);
  r.line(260, 13, 260, 33, 1, color.line);
  r.text(state.info ? 'About / Settings' : Model.pages[state.page], 280, 12, 19, color.muted);
  const group = Model.groups[Model.groupOf(state.page)];
  right(r, font, group.name.toUpperCase() + '  ' + (group.pages.indexOf(state.page) + 1) + ' / ' + group.pages.length, 1070, 12, 17, color.muted);
  if (!state.info && (state.page === 1 || state.page === 4)) shiftLights(r, s.rpm, now);
  const badge = state.previewFixture ? 'TEST FIXTURE / NOT VEHICLE' : state.mode === 'demo' ? 'DEMO' : frame.connected ? 'LIVE / READ ONLY' : 'DISCONNECTED';
  right(r, font, badge, 1414, 12, 17, state.previewFixture || state.mode === 'demo' || !frame.connected ? color.demo : color.muted);
  [['#6fc3ff', 0], ['#1f5cb0', 7], [color.red, 14]].forEach(function (stripe) { r.line(1084 + stripe[1], 33, 1092 + stripe[1], 13, 4, stripe[0]); });
  r.line(24, 45, 275, 45, 1, color.blue); r.line(1160, 45, 1414, 45, 1, color.accent);
  if (state.info) {
    r.text('Built around your G80.', 36, 69, 32, color.white);
    r.text('M3 Competition xDrive / 2023 / Midnight Purple', 36, 116, 19, color.muted);
    r.text('Bishal\'s M3 App / v' + state.version + ' / ' + state.id, 36, 194, 15, color.muted);
    r.text('Read-only vehicle data. Calculated engine HP is EST., not dyno power.', 36, 234, 16, color.muted);
    r.text('Unavailable sensors stay --. Display scales are not diagnostic thresholds.', 36, 264, 16, color.muted);
    r.text('DISPLAY UNITS', 1032, 80, 15, color.muted);
    r.text('US units', 1030, 109, 32, color.white);
    r.text('mph / PSI / \u00b0F / mi / gal / ft / lb-ft / hp', 1032, 159, 17, color.muted);
    r.text(state.preferenceStatus || 'Saved on this device', 1032, 242, 15, color.muted);
  } else if (state.page === 0) {
    r.text('G80 M3', 32, 65, 34, color.white);
    r.text('COMPETITION xDRIVE', 34, 109, 15, color.muted);
    metric(r, state, 'speed', s.speed, 34, 140, 58);
    metric(r, state, 'oil', s.oil, 34, 236, 36);
    r.image(3, 318, 72, 742, 742 * 332 / 1024);
    r.image(1, 437, 32, 530, 530 * 577 / 1024);
    metric(r, state, 'fuel', s.fuel, 1074, 67, 42);
    ethanolHint(r, s.ethanol, 1074, 157);
    track(r, state, 'fuel', s.fuel, 1074, 185, 320, color.blue, now);
    metric(r, state, 'range', s.range, 1074, 236, 40);
    const odo = Model.display(state, 'odometer', s.odometer);
    center(r, font, 'ODO  ' + Model.value(odo.reading) + ' ' + odo.unit, 689, 314, 15, color.muted);
    flag(r, s.odometer, 780, 316);
  } else if (state.page === 1) {
    instrument(r, font, state, 'boost', s.boost, 30, 76, 480, 231, color.blue, now);
    tachometer(r, font, state, s.rpm, 560, 76, 520, 231, now);
    metric(r, state, 'speed', s.speed, 1140, 65, 51);
    history(r, font, state, frame, 585, 260, 300, 24);
    sportBar(r, font, state, 'torque', s.torque, 1140, 218, 274, now);
  } else if (state.page === 2) {
    instrument(r, font, state, 'ethanol', s.ethanol, 30, 76, 485, 231, color.blue, now);
    r.text('FUEL REMAINING', 596, 69, 17, color.muted);
    const fuel = Model.display(state, 'fuel', s.fuel).reading;
    r.text(Model.value(fuel), 590, 105, 77, color.white); r.text('%', 760, 151, 24, color.muted);
    flag(r, fuel, 596, 204);
    ethanolHint(r, s.ethanol, 596, 232);
    track(r, state, 'fuel', s.fuel, 596, 262, 390, color.blue, now);
    r.text('EMPTY', 596, 306, 12, color.quiet); right(r, font, 'FULL', 986, 306, 12, color.quiet);
    metric(r, state, 'range', s.range, 1090, 81, 61);
    const plan = Model.blendLines(state, s), b = Model.blendLimits;
    r.text('E50 MAX BLEND', 1090, 214, 13, color.corn);
    if (plan) { r.text(plan[0], 1090, 234, 17, color.corn); r.text(plan[1], 1090, 260, 15, color.muted); }
    else { r.text('Needs live ethanol and fuel level', 1090, 234, 16, color.muted); r.text('No estimate without both readings', 1090, 260, 14, color.quiet); }
    r.text('Assumes flex E' + b.flex + ', gas E' + b.gas + ', ' + b.tankGallons + ' gal' + ' tank', 1090, 288, 12, color.quiet);
  } else if (state.page === 3) {
    ['oil', 'coolant', 'intake'].forEach(function (name, i) {
      const x = 36 + i * 468;
      facet(r, x, 70, 426, 230);
      r.text(('0' + (i + 1)).slice(-2), x + 24, 83, 14, color.quiet);
      metric(r, state, name, s[name], x + 48, 109, 65);
      track(r, state, name, s[name], x + 36, 255, 354, i === 0 ? color.red : color.blue, now);
    });
    r.text('DISPLAY SCALES / NOT DIAGNOSTIC THRESHOLDS', 36, 315, 12, color.quiet);
  } else if (state.page === 4) {
    tachometer(r, font, state, s.rpm, 20, 76, 440, 231, now);
    metric(r, state, 'boost', s.boost, 522, 58, 50);
    sportBar(r, font, state, 'power', s.power, 522, 140, 400, now);
    sportBar(r, font, state, 'torque', s.torque, 522, 222, 400, now);
    pullTable(r, font, state, 984, 62);
    metric(r, state, 'speed', s.speed, 984, 246, 34);
    metric(r, state, 'gear', s.gear, 1180, 246, 34);
    r.text('THROTTLE', 1300, 246, 14, color.muted);
    r.text(Model.value(s.throttle) + '%', 1298, 267, 34, color.white); flag(r, s.throttle, 1300, 305);
  } else if (state.page === 6) {
    shop(r, font);
  } else if (state.page === Model.PAGE.pullGraph) { pullGraph(r, font, state, now);
  } else if (state.page === Model.PAGE.peaks) { peaks(r, font, state);
  } else if (state.page === Model.PAGE.gmeter) { gMeter(r, font, state, s);
  } else if (state.page === Model.PAGE.brake) { brakeTest(r, font, state, s);
  } else if (state.page === Model.PAGE.drag) { dragTimer(r, font, state);
  } else if (state.page === Model.PAGE.vitals) { vitals(r, font, state, s);
  } else if (state.page === Model.PAGE.readiness) { readiness(r, font, state, s);
  } else if (state.page === Model.PAGE.diagnostics) { diagnostics(r, font, state);
  } else if (state.page === 5) {
    state.custom.forEach(function (name, i) {
      const x = 28 + i * 464;
      if (state.editing && i === state.customSlot) path(r, [[x, 315], [x, 69], [x + 432, 69], [x + 432, 315]], color.blue, 2);
      instrument(r, font, state, name, s[name], x + 8, 88, 416, 205, i === 2 ? color.red : color.blue, now);
      if (name === 'fuel') ethanolHint(r, s.ethanol, x + 38, 298, 12);
    });
    r.text(state.editing ? 'SLOT ' + (state.customSlot + 1) + ' / 3   |   ARROWS: SLOT   /   CHANGE GAUGE: CHANNEL' : 'TOUCH AN INSTRUMENT TO CUSTOMIZE', 36, 318, 12, color.muted);
    right(r, font, state.preferenceStatus || 'Saved on this device', 1404, 318, 12, color.muted);
  }
  navigation(r, font, state);
  return r;
}
module.exports = { WIDTH: WIDTH, HEIGHT: HEIGHT, buttons: buttons, tabs: tabs, groupButtons: groupButtons, targets: targets, shiftLight: shiftLight, navigationTabs: navigationTabs, editing: editing, hit: hit, customHit: customHit, swipe: swipe, draw: draw, clamp: clamp, color: color, tabIcon: tabIcon, tachometer: tachometer, tachoPoint: tachoPoint, sportBar: sportBar, shopCard: shopCard };
