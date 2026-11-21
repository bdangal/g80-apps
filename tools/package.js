'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const gate = require('./validate');
const archive = require('./archive');
function build(options) {
  options = options || {};
  if (options.github && !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(options.github)) throw new Error('--github needs owner/repository');
  const base = options.github ? 'https://github.com/' + options.github + '/releases/download/' + encodeURIComponent(options.tag || 'catalog') + '/' : '';
  const result = gate.validate(), m = result.manifest;
  const out = path.join(gate.root, 'dist');
  fs.mkdirSync(out, { recursive: true });
  const name = m.id + '@' + m.version + '.tgz';
  const bytes = archive.pack(result.files), unpacked = archive.unpack(bytes);
  gate.check(Object.keys(unpacked).length === Object.keys(result.files).length, 'Archive round trip member mismatch');
  Object.keys(result.files).forEach((file) => gate.check(result.files[file].equals(unpacked[file]), 'Archive round trip content mismatch'));
  fs.writeFileSync(path.join(out, name), bytes);
  const hash = crypto.createHash('sha256').update(bytes).digest('hex');
  const icon = 'garage_icon.png';
  fs.copyFileSync(path.join(gate.appDir, 'package/rhmiData/variantGroups/Common/images', icon), path.join(out, icon));
  const iconHash = crypto.createHash('sha256').update(fs.readFileSync(path.join(out, icon))).digest('hex');
  const catalog = { schema: 2, components: [{ id: m.id, kind: 'app', title: m.title, description: m.description,
    author: 'Bishal Garage', version: m.version, build: 'unit', mguHmi: ['ID8'], requires: m.requires, mguNeeds: ['renderer'],
    uninstallable: true, icon: icon, iconSha256: iconHash, artifact: { name: name, size: bytes.length, sha256: hash, url: base + name } }] };
  fs.writeFileSync(path.join(out, 'catalog.json'), JSON.stringify(catalog, null, 2) + '\n');
  fs.writeFileSync(path.join(out, 'SHA256SUMS'), hash + '  ' + name + '\n');
  console.log('PASS: source archive round trip, ' + Object.keys(unpacked).length + ' allowlisted files');
  console.log(name + '  ' + bytes.length + ' bytes  sha256:' + hash);
  console.log('Source package ONLY. Publish with catalog build:unit or use the repo branch; not a standalone OAP release asset.');
  return path.join(out, name);
}
if (require.main === module) { try {
  const args = process.argv.slice(2), gh = args.indexOf('--github'), tag = args.indexOf('--tag');
  if ((gh >= 0 && !args[gh + 1]) || (tag >= 0 && !args[tag + 1])) throw new Error('Missing option value');
  build({ github: gh >= 0 ? args[gh + 1] : null, tag: tag >= 0 ? args[tag + 1] : null }); } catch (err) { console.error('build: ' + err.message); process.exitCode = 1; } }
module.exports = build;
