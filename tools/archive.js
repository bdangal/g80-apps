'use strict';

const zlib = require('zlib');

function octal(value, width) {
  return value.toString(8).padStart(width - 1, '0') + '\0';
}

function pack(files) {
  const blocks = [];
  Object.keys(files).sort().forEach(function (name) {
    safeName(name);
    const data = Buffer.from(files[name]);
    const header = Buffer.alloc(512);
    if (Buffer.byteLength(name) > 100) throw new Error('Archive name too long: ' + name);
    header.write(name, 0, 100, 'utf8');
    header.write(octal(420, 8), 100);
    header.write(octal(0, 8), 108);
    header.write(octal(0, 8), 116);
    header.write(octal(data.length, 12), 124);
    header.write(octal(0, 12), 136);
    header.fill(32, 148, 156);
    header.write('0', 156);
    header.write('ustar\0', 257);
    header.write('00', 263);
    const sum = header.reduce(function (a, b) { return a + b; }, 0);
    header.write(sum.toString(8).padStart(6, '0') + '\0 ', 148);
    blocks.push(header, data, Buffer.alloc((512 - data.length % 512) % 512));
  });
  blocks.push(Buffer.alloc(1024));
  return zlib.gzipSync(Buffer.concat(blocks), { level: 9 });
}

function safeName(name) {
  if (!name || name.indexOf('\\') >= 0 || name[0] === '/' || /[:\x00-\x1f]/.test(name) ||
      name.split('/').some(function (part) { return !part || part === '.' || part === '..'; })) {
    throw new Error('Unsafe archive path: ' + name);
  }
}

function unpack(bytes) {
  const raw = zlib.gunzipSync(bytes, { maxOutputLength: 16 * 1024 * 1024 });
  const files = {};
  let offset = 0;
  while (offset + 512 <= raw.length) {
    const h = raw.subarray(offset, offset + 512);
    if (h.every(function (b) { return b === 0; })) return files;
    const name = h.subarray(0, 100).toString().split('\0')[0];
    safeName(name);
    if (Object.prototype.hasOwnProperty.call(files, name)) throw new Error('Duplicate archive member');
    if (h[156] !== 48) throw new Error('Only regular files are accepted');
    const checksum = parseInt(h.subarray(148, 156).toString(), 8);
    let sum = 0;
    h.forEach(function (b, i) { sum += i >= 148 && i < 156 ? 32 : b; });
    if (sum !== checksum) throw new Error('Bad tar checksum');
    const size = parseInt(h.subarray(124, 136).toString(), 8);
    if (!Number.isSafeInteger(size) || size < 0 || offset + 512 + size > raw.length) throw new Error('Bad tar size');
    files[name] = raw.subarray(offset + 512, offset + 512 + size);
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  throw new Error('Missing tar end marker');
}

module.exports = { pack: pack, unpack: unpack };
