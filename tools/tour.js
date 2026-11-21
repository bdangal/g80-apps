'use strict';

// Joins same-size screenshots into an animated PNG (APNG) for the README. No dependencies.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const dir = path.join(__dirname, '..', 'docs', 'screenshots');
const pages = ['overview', 'performance', 'live-pulls', 'pull-graph', 'peaks', 'g-meter', 'brake-test', 'drag-timer',
  'm-vitals', 'readiness', 'fuel-ethanol', 'temperatures', 'diagnostics-scanned', 'my-gauges', 'balkan-automotive'];
const delayMs = 2500;

const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
function crc(buf) { let c = 0xFFFFFFFF; for (const b of buf) c = crcTable[(c ^ b) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
function chunk(type, data) {
  const head = Buffer.alloc(8); head.writeUInt32BE(data.length, 0); head.write(type, 4, 'ascii');
  const tail = Buffer.alloc(4); tail.writeUInt32BE(crc(Buffer.concat([head.slice(4), data])), 0);
  return Buffer.concat([head, data, tail]);
}
function read(file) {
  const png = fs.readFileSync(file), out = { idat: [] };
  for (let at = 8; at < png.length;) {
    const len = png.readUInt32BE(at), type = png.toString('ascii', at + 4, at + 8), data = png.slice(at + 8, at + 8 + len);
    if (type === 'IHDR') out.ihdr = data; else if (type === 'IDAT') out.idat.push(data);
    at += 12 + len;
  }
  return out;
}

const frames = pages.map((name) => read(path.join(dir, name + '.png')));
const ihdr = frames[0].ihdr;
frames.forEach((f, i) => { if (!f.ihdr.equals(ihdr)) throw new Error(pages[i] + ' differs in size or format'); });
const width = ihdr.readUInt32BE(0), height = ihdr.readUInt32BE(4);

let seq = 0;
const parts = [Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr)];
const actl = Buffer.alloc(8); actl.writeUInt32BE(frames.length, 0); actl.writeUInt32BE(0, 4); parts.push(chunk('acTL', actl));
frames.forEach((f, i) => {
  const fctl = Buffer.alloc(26);
  fctl.writeUInt32BE(seq++, 0); fctl.writeUInt32BE(width, 4); fctl.writeUInt32BE(height, 8);
  fctl.writeUInt16BE(delayMs, 20); fctl.writeUInt16BE(1000, 22);
  parts.push(chunk('fcTL', fctl));
  // Re-encode as one stream per frame so fdAT chunks stay simple.
  const data = zlib.deflateSync(zlib.inflateSync(Buffer.concat(f.idat)), { level: 9 });
  if (i === 0) parts.push(chunk('IDAT', data));
  else { const s = Buffer.alloc(4); s.writeUInt32BE(seq++, 0); parts.push(chunk('fdAT', Buffer.concat([s, data]))); }
});
parts.push(chunk('IEND', Buffer.alloc(0)));
const out = path.join(dir, 'tour.png');
fs.writeFileSync(out, Buffer.concat(parts));
console.log('Tour: ' + frames.length + ' frames, ' + width + 'x' + height + ', ' + Math.round(fs.statSync(out).size / 1024) + ' KB');
