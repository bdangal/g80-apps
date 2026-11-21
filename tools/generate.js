'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const root = path.resolve(__dirname, '..');
const app = path.join(root, 'apps/bishal_garage');
const manifest = JSON.parse(fs.readFileSync(path.join(app, 'mgu-app.json')));
function write(name, data) {
  const file = path.join(app, name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, typeof data === 'string' || Buffer.isBuffer(data) ? data : JSON.stringify(data, null, 2) + '\n');
}

function crc(bytes) {
  let value = 0xffffffff;
  bytes.forEach(function (b) {
    value ^= b;
    for (let i = 0; i < 8; i++) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0);
  });
  return (value ^ 0xffffffff) >>> 0;
}
function png(w, h, rgba) {
  function chunk(type, data) {
    const name = Buffer.from(type), size = Buffer.alloc(4), sum = Buffer.alloc(4);
    size.writeUInt32BE(data.length); sum.writeUInt32BE(crc(Buffer.concat([name, data])));
    return Buffer.concat([size, name, data, sum]);
  }
  const header = Buffer.alloc(13); header.writeUInt32BE(w); header.writeUInt32BE(h, 4); header[8] = 8; header[9] = 6;
  const scan = Buffer.alloc(h * (w * 4 + 1));
  for (let y = 0; y < h; y++) rgba.copy(scan, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  return Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', header), chunk('IDAT', zlib.deflateSync(scan)), chunk('IEND', Buffer.alloc(0))]);
}

function generate() {
  const id = manifest.id, version = manifest.version;
  write('package/package.json', {
    name: id, version: version, description: manifest.description, main: 'javascript/runner.js',
    author: 'Bishal Garage', license: 'GPL-3.0-or-later', mguHmi: ['ID8'],
    mguNeeds: ['renderer'],
    oapAppSettings: { maxDiskUsage: 26214400, cpuLimit: 20, memoryThresholdKB: 131072,
      priority: 'PRIO_MEDIUM', visibility: 'FOREGROUND', latencyClass: 'FOREGROUND',
      loggingId: 'M3GR', userLoginRequired: false, backgroundPriority: 150, someipManifest: 'manifest.json' },
    files: ['config', 'rhmiData', 'artwork', 'package.json', 'npm-shrinkwrap.json', 'permissions.json', 'manifest.json', 'javascript', 'LICENSE', 'NOTICE.md'],
    engines: { node: '>=8.16.2' }
  });
  write('package/npm-shrinkwrap.json', { name: id, version: version, lockfileVersion: 1, requires: true, dependencies: {} });
  write('package/rhmiData/application.json', { schemaVersion: '1.3.0', application: {
    uuid: '094dbf85-b5aa-4be5-b4ed-4f7e2074056c', type: 'OnlineApp', name: id,
    vendor: 'Bishal Garage', version: version, defaultLanguage: 'en_GB',
    uiDescriptions: [{ applicationFilePath: './uiDescriptions/ID8/application.xml', uiDescriptionFilePath: './uiDescriptions/ID8/uiDescription.json', hmi: ['ID8'] }],
    stringBundleUuid: 'de6c470f-5b22-473a-85cd-fcda3cd331cc', resourceBundleUuid: '083c1844-acf5-4415-85af-e0d2a02ff6b9',
    variantGroups: [{ stringsPath: './variantGroups/Common/texts', resourcesPath: './variantGroups/Common/images', hmi: ['ID8'], brands: ['BMW'] }],
    entryPoints: [{ name: id, uuid: '9348345e-b2e4-42fc-a349-291d291b0909', textId: 'SID_TITLE', icon: 'garage_icon.png',
      insertionStateId: 20974, insertionFocusId: 2, insertionMode: 'INSERT_BELOW', insertionOrder: 0, insertionPriority: 0,
      previewType: 'NONE', bookmarkable: true, private: null, appearance: 'DEFAULT', isGroupHeader: false, insertionGroup: 0 }]
  } });
  const components = {
    '10': { type: 'title', name: 'garageTitle', properties: { Visible: { value: 1, type: 'UInt' } }, rows: [{ Text: { value: 'SID_TITLE', type: 'StringId' } }] },
    '20': { type: 'label', name: 'garageStatus', properties: { Visible: { value: 1, type: 'UInt' }, Focusable: { value: 0, type: 'UInt' } }, rows: [{ Text: { value: 'Waiting for BMW SOME/IP / OBD | v' + version, type: 'Text' } }] }
  };
  const names = ['previous', 'next', 'refresh', 'mode', 'about'];
  const titles = ['Previous page', 'Next page', 'Refresh demo sample', 'Data mode: Live / Demo', 'About Bishal\'s M3 App'];
  names.forEach(function (name, i) {
    components[String(21 + i)] = { type: 'button', name: name,
      properties: { Visible: { value: 1, type: 'UInt' }, Focusable: { value: 3, type: 'UInt' } },
      rows: [{ PrimaryText: { value: titles[i], type: 'Text' }, FrequencyText: { value: '', type: 'Text' },
        FrequencyVisible: { value: false, type: 'Bool' }, IconVisible: { value: false, type: 'Bool' },
        ProgressVisible: { value: false, type: 'Bool' }, IsPlaying: { value: false, type: 'Bool' } }] };
  });
  write('package/rhmiData/uiDescriptions/ID8/uiDescription.json', { schemaVersion: '1.3.0', containers: { '1': { type: 'state', name: 'garage', components: components } } });
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<application>\n  <container id="1" type="state" widget="LT_State_Wide_List">\n    <layoutGroup id="100" name="Titlebar">\n      <component id="10" type="title"><property id="2" value="1"/></component>\n    </layoutGroup>\n    <layoutGroup id="101" name="List">\n      <property id="3" value="1"/>\n      <component id="20" type="label" widget="LT_ScrollLabel"><property id="2" value="1"/><property id="3" value="0"/></component>\n';
  names.forEach(function (name, i) { xml += '      <component id="' + (21 + i) + '" type="button" widget="LT_Button_MediaEntry_1Row"><property id="2" value="1"/><property id="3" value="3"/></component>\n'; });
  write('package/rhmiData/uiDescriptions/ID8/application.xml', xml + '    </layoutGroup>\n  </container>\n</application>\n');
  ['en_GB', 'en_US'].forEach(function (language) { write('package/rhmiData/variantGroups/Common/texts/' + language + '.json', { SID_TITLE: 'Bishal\'s M3 App' }); });
  const rgba = Buffer.alloc(140 * 140 * 4);
  for (let y = 0; y < 140; y++) for (let x = 0; x < 140; x++) {
    const at = (y * 140 + x) * 4;
    const edge = y > 25 && y < 115 && Math.abs(x - (y < 70 ? 32 - (y - 25) * 0.4 : 14 + (y - 70) * 0.4)) < 2;
    const mirrored = y > 25 && y < 115 && Math.abs(140 - x - (y < 70 ? 32 - (y - 25) * 0.4 : 14 + (y - 70) * 0.4)) < 2;
    const line = (y === 25 || y === 114) && x >= 32 && x <= 108;
    const ink = edge ? [56, 156, 255] : mirrored ? [235, 64, 92] : line ? [38, 59, 86] : x > y ? [16, 27, 43] : [8, 14, 24];
    rgba[at] = ink[0]; rgba[at + 1] = ink[1]; rgba[at + 2] = ink[2]; rgba[at + 3] = 255;
  }
  write('package/rhmiData/variantGroups/Common/images/garage_icon.png', png(140, 140, rgba));
  write('package/LICENSE', fs.readFileSync(path.join(root, 'LICENSE')));
  write('package/NOTICE.md', fs.readFileSync(path.join(root, 'NOTICE.md')));
  console.log('Generated ID8 resources for ' + id + '@' + version);
}
if (require.main === module) generate();
module.exports = generate;
