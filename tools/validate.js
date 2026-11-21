'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const builtin = require('module').builtinModules;
const root = path.resolve(__dirname, '..');
const appDir = path.join(root, 'apps/bishal_garage');
function check(value, message) { if (!value) throw new Error(message); }
function json(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function below(dir, rel) {
  check(typeof rel === 'string' && rel && !rel.includes('\\') && !rel.split('/').some((s) => !s || s === '..' || s === '.') && !path.isAbsolute(rel), 'Unsafe manifest path: ' + rel);
  const result = path.resolve(dir, rel);
  check(result.startsWith(path.resolve(dir) + path.sep), 'Path escaped tree');
  return result;
}
function walk(dir, prefix) {
  let result = [];
  fs.readdirSync(dir).sort().forEach((name) => {
    const file = path.join(dir, name), stat = fs.lstatSync(file), rel = (prefix ? prefix + '/' : '') + name;
    check(!stat.isSymbolicLink(), 'Symlinks are not publishable: ' + rel);
    if (stat.isDirectory()) result = result.concat(walk(file, rel));
    else { check(stat.isFile(), 'Not a regular file: ' + rel); result.push(rel); }
  });
  return result;
}
function validate() {
  const m = json(path.join(appDir, 'mgu-app.json'));
  const tree = below(appDir, m.tree), p = json(path.join(tree, 'package.json'));
  const repo = json(path.join(root, 'mgu-repo.json'));
  const entry = repo.components[0];
  check(repo.schema === 1 && repo.components.length === 1 && entry.kind === 'app' && entry.build === 'unit', 'Expected one repo-tree source app');
  check(entry.path === 'apps/bishal_garage' && entry.id === m.id, 'Repo identity/path mismatch');
  check(m.schema === 1 && m.id === 'bishal_garage' && /^\d+\.\d+\.\d+$/.test(m.version), 'Invalid source identity');
  check(p.name === m.id && p.version === m.version && json(path.join(root, 'package.json')).version === m.version, 'Package version/identity mismatch');
  [entry, m, p].forEach((o) => check(JSON.stringify(o.mguHmi) === '["ID8"]', 'ID8-only declaration required'));
  check(entry.requires['mgu-render'] === m.requires['mgu-render'] && m.mguNeeds.includes('renderer'), 'Renderer dependency must be explicit');
  check(p.main === 'javascript/runner.js' && !fs.existsSync(path.join(tree, p.main)), 'Donor must provide the entry point');
  check(!fs.existsSync(path.join(tree, 'javascript/app.js')), 'Do not publish linked donor code');
  const shrink = json(path.join(tree, 'npm-shrinkwrap.json'));
  check(shrink.name === m.id && shrink.version === m.version && Object.keys(shrink.dependencies).length === 0, 'Unexpected shrinkwrap dependencies');
  const application = json(path.join(tree, 'rhmiData/application.json')).application;
  check(application.name === m.id && application.version === m.version, 'RHMI identity mismatch');
  check(!Object.prototype.hasOwnProperty.call(application, 'appletId'), 'Store allocates ID8 appletId');
  const uuids = [application.uuid, application.stringBundleUuid, application.resourceBundleUuid, application.entryPoints[0].uuid];
  check(new Set(uuids).size === 4 && uuids.every((u) => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(u)), 'Four distinct UUIDv4 identities required');
  check(application.uiDescriptions.length === 1 && JSON.stringify(application.uiDescriptions[0].hmi) === '["ID8"]', 'Actual ID8 UI description required');
  const uiDir = path.join(tree, 'rhmiData/uiDescriptions/ID8');
  const xml = fs.readFileSync(path.join(uiDir, 'application.xml'), 'utf8');
  const ui = json(path.join(uiDir, 'uiDescription.json'));
  check(!/ParentState|id="9"|LT_State_A4A_WelcomeApp|Text1stCol|Text2ndCol|ID7/.test(xml + JSON.stringify(ui)), 'ID7 widget or unsafe ParentState in ID8 UI');
  const ids = [...xml.matchAll(/<(?:container|layoutGroup|component)\b[^>]*\bid="(\d+)"/g)].map((match) => match[1]);
  check(new Set(ids).size === ids.length, 'Duplicate XML object ID');
  check(/<container id="1" type="state" widget="LT_State_Wide_List">/.test(xml), 'Genuine ID8 list state required');
  check(ui.containers['1'].name === 'garage', 'Missing root state');
  const orderedButtons = Object.values(ui.containers['1'].components).filter((c) => c.type === 'button').map((c) => c.name);
  check(JSON.stringify(orderedButtons) === JSON.stringify(['previous', 'next', 'refresh', 'mode', 'about']), 'Native and drawn navigation order differs');
  const components = ui.containers['1'].components;
  const xmlComponents = [...xml.matchAll(/<component id="(\d+)" type="([^"]+)"(?: widget="([^"]+)")?/g)];
  check(xmlComponents.length === Object.keys(components).length, 'XML/JSON component count differs');
  xmlComponents.forEach((match) => {
    const c = components[match[1]];
    check(c && c.type === match[2], 'XML/JSON component mismatch');
    if (c.type === 'button') {
      check(match[3] === 'LT_Button_MediaEntry_1Row' && c.properties.Focusable.value === 3, 'ID8 focusable media row required');
      ['PrimaryText', 'FrequencyText', 'FrequencyVisible', 'IconVisible', 'ProgressVisible', 'IsPlaying'].forEach((cell) => check(c.rows[0][cell], 'Missing ID8 cell ' + cell));
    }
  });
  const image = path.join(tree, 'rhmiData/variantGroups/Common/images', application.entryPoints[0].icon);
  const png = fs.readFileSync(image);
  check(png.subarray(0, 8).toString('hex') === '89504e470d0a1a0a' && png.length <= 131072 && png.readUInt32BE(16) === 140 && png.readUInt32BE(20) === 140, 'Expected 140px PNG icon <=128KiB');
  ['en_GB', 'en_US'].forEach((language) => check(json(path.join(tree, 'rhmiData/variantGroups/Common/texts', language + '.json'))[application.entryPoints[0].textId] === 'Bishal\'s M3 App', 'Missing tile title'));
  const proxies = json(path.join(tree, 'manifest.json')).proxies;
  ['entrypoint2.EntryPoint2', 'entrypoint2.EntryPointManager2', 'remote2.RemoteHmi2', 'remote2.RemoteHmiApplication2', 'resourcemanagement2.ResourceManager2'].forEach((name) => check(proxies['de.bmw.infotainment.hmi.' + name], 'Missing ID8 interface: ' + name));
  // ID8 installs the manifest unchecked; one field or interface the firmware lacks fails installPackage. Match the vehicle proxies of known-good ID8 apps.
  ['vehicle.CDS', 'vehicle.CDS2', 'vehicle.TPMS', 'vehicle.Vehicle', 'vehicle.Vehicle2', 'drivingexcitement.FES'].forEach((name) => check(proxies['de.bmw.infotainment.' + name] === '*', 'ID8 vehicle proxy must be "*": ' + name));
  ['EnvironmentalInformation', 'VehicleInformation'].forEach((name) => check(proxies['de.bmw.infrastructure.' + name] === '*', 'ID8 vehicle proxy must be "*": ' + name));
  check(proxies['com.harman.infotainment.systemfunctions.tasu.tasu.InternalTasu'] === '*', 'ID8 TASU proxy must be "*"');
  check(!proxies['de.bmw.infrastructure.analytics.BasicDataSet'], 'BasicDataSet is not offered to ID8 apps');
  json(path.join(tree, 'permissions.json'));
  const font = json(path.join(tree, 'artwork/font.json'));
  check(fs.statSync(path.join(tree, 'artwork/font.alpha')).size === font.width * font.height, 'Font atlas length mismatch');
  for (let code = 32; code <= 126; code++) check(font.glyphs[String.fromCharCode(code)], 'Missing ASCII glyph ' + code);
  check(JSON.stringify(font.glyphs.A) !== JSON.stringify(font.glyphs.a), 'Font case collision');
  const car = json(path.join(tree, 'artwork/car.json'));
  check(car.width <= 1024 && car.height <= 1024 && fs.statSync(path.join(tree, 'artwork/car.rgba')).size === car.width * car.height * 4, 'Invalid renderer image payload');
  const logo = json(path.join(tree, 'artwork/balkan-logo.json'));
  check(logo.width === 495 && logo.height === 116 && fs.statSync(path.join(tree, 'artwork/balkan-logo.rgba')).size === logo.width * logo.height * 4, 'Invalid Balkan logo payload');
  const panel = json(path.join(tree, 'artwork/m-panel.json'));
  check(panel.width <= 1024 && panel.height <= 1024 && fs.statSync(path.join(tree, 'artwork/m-panel.rgba')).size === panel.width * panel.height * 4, 'Invalid M panel payload');
  const basenames = m.modules.map((file) => './' + path.basename(file));
  check(new Set(basenames).size === basenames.length && m.modules[0] === 'src/garage.js', 'Ambiguous module basename or missing entry module');
  m.modules.forEach((file) => {
    check(file.endsWith('.js'), 'Module must be JavaScript');
    const source = fs.readFileSync(below(appDir, file), 'utf8');
    new vm.Script(source, { filename: file });
    check(!/require\s*\(\s*"/.test(source), 'Linker requires single-quoted imports');
    [...source.matchAll(/require\('([^']+)'\)/g)].forEach((match) => check(basenames.includes(match[1]) || m.sdk.includes(match[1]) || builtin.includes(match[1]), 'Undeclared import ' + match[1]));
  });
  const files = ['mgu-app.json'].concat(m.modules, walk(tree).map((file) => m.tree + '/' + file)).sort();
  const payload = {};
  files.forEach((file) => {
    check(!/(^|\/)(node_modules|oap-sdk|\.git|\.ssh|donor|sdk)(\/|$)|\.(pem|key|p12|pfx|mgu)$|(^|\/)(\.env|id_rsa|id_ed25519)|token|secret/i.test(file), 'Forbidden package file: ' + file);
    const data = fs.readFileSync(below(appDir, file));
    if (/\.(js|json|md)$/.test(file)) check(!/-----BEGIN [A-Z ]*PRIVATE KEY-----|gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}/.test(data.toString()), 'Credential detected');
    payload[file] = data;
  });
  return { manifest: m, files: payload };
}
if (require.main === module) {
  try {
    const result = validate();
    if (process.argv[2]) {
      const packed = require('./archive').unpack(fs.readFileSync(path.resolve(process.argv[2])));
      check(JSON.stringify(Object.keys(packed).sort()) === JSON.stringify(Object.keys(result.files).sort()), 'Archive members differ from source allowlist');
      Object.keys(result.files).forEach((name) => check(result.files[name].equals(packed[name]), 'Archive content differs: ' + name));
    }
    console.log('PASS: ' + result.manifest.id + '@' + result.manifest.version + ', ID8 native layout, ' + Object.keys(result.files).length + ' source members; no SDK or credentials');
  } catch (err) { console.error('validate: ' + err.message); process.exitCode = 1; }
}
module.exports = { validate: validate, check: check, root: root, appDir: appDir };
