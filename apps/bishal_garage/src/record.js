'use strict';

const tintCache = new WeakMap();
// Tabular digits share one advance; narrow ones such as 1 are centred in that cell instead of leaving a gap after them.
function inset(letter, g) { return letter >= '0' && letter <= '9' ? Math.max(0, (g.advance - (g.w - 3)) / 2) : 0; }
function Recorder(font) {
  this.font = font;
  this.ops = [];
  this.atlases = new Set();
  this.images = new Set();
}
Recorder.prototype.rect = function (x, y, w, h, color, radius) { this.ops.push({ kind: 'rect', x: x, y: y, w: w, h: h, color: color, radius: radius || 0 }); };
Recorder.prototype.line = function (x, y, x2, y2, width, color) { this.ops.push({ kind: 'line', x: x, y: y, x2: x2, y2: y2, width: width, color: color }); };
Recorder.prototype.image = function (id, x, y, w, h) { this.images.add(id); this.ops.push({ kind: 'image', id: id, x: x, y: y, w: w, h: h }); };
Recorder.prototype.arc = function (x, y, radius, width, start, end, color) { this.ops.push({ kind: 'arc', x: x, y: y, radius: radius, width: width, start: start, end: end, color: color }); };
Recorder.prototype.text = function (text, x, y, size, color) {
  this.atlases.add(1);
  this.ops.push({ kind: 'text', text: String(text), x: x, y: y, size: size, color: color });
};
Recorder.prototype.polygon = function (points, color, detail) {
  const step = detail === 1 || detail === 2 ? detail : 4;
  const low = Math.floor(Math.min.apply(null, points.map(function (p) { return p[1]; }))), high = Math.ceil(Math.max.apply(null, points.map(function (p) { return p[1]; })));
  for (let y = low; y < high; y += step) {
    const h = Math.min(step, high - y), scan = y + h / 2, edges = [];
    points.forEach(function (a, i) { const b = points[(i + 1) % points.length]; if ((a[1] <= scan && b[1] > scan) || (b[1] <= scan && a[1] > scan)) edges.push(a[0] + (scan - a[1]) / (b[1] - a[1]) * (b[0] - a[0])); });
    edges.sort(function (a, b) { return a - b; });
    for (let i = 0; i + 1 < edges.length; i += 2) this.rect(edges[i], y, edges[i + 1] - edges[i], h, color);
  }
};
Recorder.prototype.words = function () {
  const out = [], float = new Float32Array(1), bits = new Uint32Array(float.buffer);
  function f(value) { float[0] = value; out.push(bits[0]); }
  function c(color) { out.push(parseInt(color.replace('#', '') + 'ff', 16) >>> 0); }
  const font = this.font;
  this.ops.forEach(function (op) {
    if (op.kind === 'rect') { out.push(4); [op.x, op.y, op.w, op.h, op.radius].forEach(f); c(op.color); }
    if (op.kind === 'line') { out.push(9); [op.x, op.y, op.x2, op.y2, op.width].forEach(f); c(op.color); }
    if (op.kind === 'image') { out.push(18); [op.x, op.y, op.w, op.h, 0].forEach(f); out.push(op.id); }
    if (op.kind === 'arc') { out.push(8); [op.x, op.y, op.radius - op.width, op.radius, op.start, op.end].forEach(f); c(op.color); out.push(0, 0); f(0); f(1); }
    if (op.kind === 'text') {
      out.push(11, 1); c(op.color); out.push(op.text.length);
      let x = op.x;
      const scale = op.size / font.size;
      op.text.split('').forEach(function (letter) {
        const g = font.glyphs[letter] || font.glyphs['?'];
        [x + inset(letter, g) * scale, op.y, g.w * scale, g.h * scale, g.x, g.y, g.x + g.w, g.y + g.h].forEach(f);
        x += g.advance * scale;
      });
    }
  });
  return new Uint32Array(out);
};
Recorder.prototype.canvas = function (ctx, atlas, images) {
  const font = this.font;
  let tinted = tintCache.get(atlas);
  if (!tinted) { tinted = {}; tintCache.set(atlas, tinted); }
  this.ops.forEach(function (op) {
    ctx.fillStyle = op.color;
    if (op.kind === 'rect') { ctx.beginPath(); ctx.roundRect(op.x, op.y, op.w, op.h, op.radius); ctx.fill(); }
    if (op.kind === 'line') { ctx.strokeStyle = op.color; ctx.lineWidth = op.width; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(op.x, op.y); ctx.lineTo(op.x2, op.y2); ctx.stroke(); }
    if (op.kind === 'image' && images && images[op.id]) ctx.drawImage(images[op.id], op.x, op.y, op.w, op.h);
    if (op.kind === 'arc') {
      ctx.beginPath(); ctx.strokeStyle = op.color; ctx.lineWidth = op.width; ctx.lineCap = 'butt';
      ctx.arc(op.x, op.y, op.radius - op.width / 2, (op.start - 90) * Math.PI / 180, (op.end - 90) * Math.PI / 180); ctx.stroke();
    }
    if (op.kind === 'text') {
      let x = op.x;
      const scale = op.size / font.size;
      if (!tinted[op.color]) {
        const image = document.createElement('canvas'); image.width = font.width; image.height = font.height;
        const ink = image.getContext('2d'); ink.drawImage(atlas, 0, 0);
        ink.globalCompositeOperation = 'source-in'; ink.fillStyle = op.color; ink.fillRect(0, 0, image.width, image.height);
        tinted[op.color] = image;
      }
      op.text.split('').forEach(function (letter) {
        const g = font.glyphs[letter] || font.glyphs['?'];
        ctx.drawImage(tinted[op.color], g.x, g.y, g.w, g.h, x + inset(letter, g) * scale, op.y, g.w * scale, g.h * scale);
        x += g.advance * scale;
      });
    }
  });
};
module.exports = Recorder;
