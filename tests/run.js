'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const EventEmitter = require('events');
const gate = require('../tools/validate');
const Model = require('../apps/bishal_garage/src/model');
const View = require('../apps/bishal_garage/src/view');
const archive = require('../tools/archive');
const link = require('../tools/vendor/oap_link');
let passed = 0;
async function test(name, action) { if (process.env.TEST_FILTER && !name.includes(process.env.TEST_FILTER)) return; await action(); passed++; console.log('PASS ' + name); }
const font = JSON.parse(fs.readFileSync(path.join(gate.appDir, 'package/artwork/font.json')));
function fontComplete(f) { for (let i = 32; i <= 126; i++) assert(f.glyphs[String.fromCharCode(i)], 'Missing ASCII glyph ' + i); assert.notDeepStrictEqual(f.glyphs.A, f.glyphs.a); }
function harness(background, noEntry) {
  let now = 1000;
  const calls = [], timers = new Map(), components = {};
  ['garage', 'garageStatus', 'previous', 'next', 'refresh', 'mode', 'about'].forEach((name, i) => {
    const c = new EventEmitter(); c.getId = () => 19 + i; c.values = {};
    c.setValue = (row, cell, value) => { c.values[cell] = value; return Promise.resolve(); };
    c.updateResources = () => Promise.resolve(); components[name] = c;
  });
  const rhmi = new EventEmitter(); rhmi.getByName = (name) => components[name];
  rhmi.mapEntryState = (uuid, root) => { calls.push(['map', uuid, root]); return Promise.resolve(); };
  rhmi.openEntryState = (uuid) => { calls.push(['open', uuid]); return Promise.resolve(); };
  const description = JSON.parse(fs.readFileSync(path.join(gate.appDir, 'package/rhmiData/application.json')));
  class OnlineApp extends EventEmitter {
    constructor() { super(); this.rhmiApplication = background ? null : rhmi; this.packageJson = { version: '0.1.0' }; this.appDescription = description; this.startReason = 'ENTRY_POINT'; }
    start() { calls.push(['start']); return Promise.resolve(); }
    initialized() { calls.push(['initialized']); return Promise.resolve(); }
    getAppId() { return 'bishal_garage2'; }
    getEntryPoints() { return noEntry ? [] : [{ getDescription: () => description.application.entryPoints[0], init: () => { calls.push(['entry.init']); return Promise.resolve(); }, setAvailability: (value) => { calls.push(['availability', value]); return Promise.resolve(); } }]; }
    getLastExecutedEntryPointUuid() { return description.application.entryPoints[0].uuid; }
    registerActive() { calls.push(['active']); return Promise.resolve(); }
    registerHmiVisible() { calls.push(['visible']); return Promise.resolve(); }
    unregisterHmiVisible() { calls.push(['hidden']); return Promise.resolve(); }
    registerInactive() { calls.push(['inactive']); return Promise.resolve(); }
    destroyBundles() { calls.push(['destroy']); return Promise.resolve(); }
  }
  let gpu;
  class RenderClient extends EventEmitter {
    constructor(id, log, options) { super(); this.id = id; this.kit = options.kit; gpu = this; }
    fps() {} mode() {} place(p) { this.placement = p; }
    connect() { this.emit('ready', {}, { modes: ['layer'], appArea: { x: 0, y: 76, w: 2880, h: 764 } }); }
    claim(rects) { this.claims = rects; }
    show(on) { this.shown = on; }
    frame(r) { this.frameCount = (this.frameCount || 0) + 1; this.lastWords = r.words(); }
    close() { this.closed = true; }
  }
  class Clock extends Date { static now() { return now; } }
  const mockFs = { readFileSync: (file, encoding) => fs.readFileSync(path.join(gate.appDir, 'package/artwork', path.basename(file)), encoding) };
  const source = fs.readFileSync(path.join(gate.appDir, 'src/garage.js'), 'utf8');
  const module = { exports: {} };
  const sandbox = { module: module, exports: module.exports, __dirname: path.join(gate.appDir, 'package/javascript'),
    require: (id) => {
      if (id === 'oap-sdk/src/core/OnlineApp.js') return OnlineApp;
      if (id === './mgu_render_client.js') return { RenderClient: RenderClient };
      if (id === './model.js') return Model;
      if (id === './view.js') return View;
      if (id === './vehicle.js') return { VehicleData: class MockVehicle { constructor(builders, publish) { this.publish = publish; } start() {} setActive(on) { this.active = on; } close() { this.closed = true; } } };
      if (id === './preferences.js') return class MockPreferences { load() { return null; } save() { return true; } };
      if (id === 'oap-sdk/src/someip/someipBuilders') return {};
      if (id === 'fs') return mockFs;
      if (id === 'path') return path;
      throw new Error('Unexpected import ' + id);
    },
    Date: Clock, console: { warn: () => {}, error: (text) => calls.push(['error', text]) },
    process: { exit: (code) => calls.push(['exit', code]) },
    setInterval: (f) => { const id = {}; timers.set(id, f); return id; },
    clearInterval: (id) => timers.delete(id), setTimeout: (f) => { const id = {}; timers.set(id, f); return id; }, clearTimeout: (id) => timers.delete(id) };
  vm.runInNewContext(source, sandbox, { filename: 'garage.js' });
  return { app: module.exports, components: components, rhmi: rhmi, calls: calls, timers: timers, gpu: () => gpu, advance: () => { now += 500; } };
}

(async function () {
  await test('manifest, native ID8 resources and credential gate', () => gate.validate());
  await test('all 95 ASCII glyphs survive case-sensitive baking', () => fontComplete(font));
  await test('font negative control detects uppercase-loss regression', () => {
    const bad = JSON.parse(JSON.stringify(font)); delete bad.glyphs.A;
    assert.throws(() => fontComplete(bad), /Missing ASCII glyph 65/);
  });
  await test('pagination wraps, refresh preserves page and gauge units are explicit', () => {
    const s = Model.create('0.1.0', 'test', 'demo'); assert.strictEqual(Model.snapshot(s).signals.fuel.value, 68);
    Model.act(s, 0); assert.strictEqual(s.page, Model.order[Model.order.length - 1]); assert.strictEqual(Model.pages[s.page], 'Balkan Automotive'); Model.act(s, 1); assert.strictEqual(s.page, 0);
    Model.act(s, 1); assert.strictEqual(s.page, 1); assert(Model.summary(s).includes('PSI gauge'));
    Model.act(s, 2); assert.strictEqual(s.page, 1); assert.strictEqual(s.refreshes, 1); assert.strictEqual(Model.snapshot(s).signals.boost.value, 24.2);
    Model.act(s, 1); assert.strictEqual(s.page, Model.order[2]);
    Model.act(s, 12); assert.strictEqual(s.page, 2); assert(Model.summary(s).includes('68% / E68'));
    const seen = []; for (let i = 0; i < Model.order.length; i++) { seen.push(s.page); Model.act(s, 1); }
    assert.strictEqual(new Set(seen).size, Model.pages.length, 'Next must visit every page once per cycle');
    Model.act(s, 4); assert(s.info); assert(Model.summary(s).includes('v0.1.0'));
    Model.act(s, 3); assert.strictEqual(s.mode, 'live'); assert(Model.summary(s).includes('DISCONNECTED'));
  });
  await test('view hit testing and GPU operation encoding', () => {
    const editing = Model.create('test'); editing.page = 5; editing.editing = true;
    View.buttons.forEach((b, i) => assert.strictEqual(View.hit(b.x + 1, b.y + 1, editing), i));
    assert.strictEqual(View.hit(-1, -1), -1);
    const r = View.draw(Model.create('0.1.0'), font), words = r.words();
    assert(words.length > 100); assert.strictEqual(words[0], 4); assert(r.atlases.has(1));
    const s = Model.create('0.1.0');
    for (let i = 0; i < Model.pages.length; i++) {
      s.page = i; const frame = View.draw(s, font);
      frame.ops.filter((o) => o.kind === 'text').forEach((o) => o.text.split('').forEach((c) => assert(font.glyphs[c], 'Unbaked glyph: ' + c)));
      assert(frame.words().length > 100);
      if (i === 0) assert(frame.images.has(1), 'User car image missing');
      if (i === 1) assert(frame.ops.some((o) => o.kind === 'line' && o.color === View.color.track), 'Missing angular instrument scale');
    }
    assert.strictEqual(View.clamp(-1), 0); assert.strictEqual(View.clamp(2), 1);
  });
  await test('source archive agrees with upstream MGU linker parser', () => {
    const data = gate.validate(); const bytes = archive.pack(data.files);
    const upstream = link.untar(bytes);
    assert.deepStrictEqual(upstream.map((f) => f.name).sort(), Object.keys(data.files).sort());
    upstream.forEach((f) => assert(f.data.equals(data.files[f.name])));
    assert.strictEqual(link.readManifest(gate.appDir).id, 'bishal_garage');
    assert(bytes.equals(archive.pack(data.files)), 'Non-deterministic package');
  });
  await test('archive rejects traversal and corrupted headers', () => {
    assert.throws(() => archive.pack({ '../secret': Buffer.from('x') }), /Unsafe/);
    const zlib = require('zlib'), raw = zlib.gunzipSync(archive.pack({ 'safe.txt': Buffer.from('x') }));
    raw[0] = 88; assert.throws(() => archive.unpack(zlib.gzipSync(raw)), /checksum/);
  });
  await test('foreground lifecycle, manifest-driven id and entry mapping', async () => {
    const h = harness(); await h.app.setup();
    assert.strictEqual(h.gpu().id, 'bishal_garage2'); assert(h.gpu().shown);
    assert(h.calls.find((c) => c[0] === 'map' && c[2] === h.components.garage));
    assert(h.calls.findIndex((c) => c[0] === 'active') < h.calls.findIndex((c) => c[0] === 'initialized'));
    assert.strictEqual(h.gpu().placement.scale, 2);
    await h.app.shutdown(); assert(h.gpu().closed); assert.strictEqual(h.timers.size, 0);
    assert(h.calls.find((c) => c[0] === 'destroy')); assert(h.calls.find((c) => c[0] === 'exit' && c[1] === 0));
  });
  await test('native renderer registers the Balkan logo and M panel independently of car artwork', async () => {
    const h = harness(); await h.app.setup();
    const image = h.gpu().kit.imageById.get(2), panel = h.gpu().kit.imageById.get(3);
    assert(image && image.w === 495 && image.h === 116 && image.data.length === 495 * 116 * 4, 'Native logo texture missing');
    assert(panel && panel.data.length === panel.w * panel.h * 4, 'Native M panel texture missing');
    h.app.press(16, true); assert.strictEqual(h.app.state.page, 6);
    assert(h.components.garageStatus.values.Text.includes('Balkan Automotive logo'));
    assert(!h.app.state.editing); assert(h.gpu().lastWords.length > 100);
    await h.app.shutdown();
  });
  await test('native controller focus/action and duplicate raw-event suppression', async () => {
    const h = harness(); await h.app.setup(); h.app.state.mode = 'demo';
    h.components.refresh.emit('focus', { value: true }); assert.strictEqual(h.app.state.focus, 2);
    h.components.refresh.emit('action', { row: 0 });
    h.rhmi.emit('userEvent', { eventType: 'ACTION', sourceId: h.components.refresh.getId(), parameterMap: { 2: 0 } });
    assert.strictEqual(h.app.state.refreshes, 1); assert(h.components.garageStatus.values.Text.includes('74%'));
    h.advance(); h.components.refresh.emit('action', { row: 0 }); assert.strictEqual(h.app.state.refreshes, 2);
    await h.app.shutdown();
  });
  await test('native rapid independent presses survive paired delivery suppression', async () => {
    const h = harness(); await h.app.setup();
    h.components.next.emit('action'); h.components.next.emit('action');
    assert.strictEqual(h.app.state.page, Model.order[2], 'Independent repeated presses were dropped');
    h.rhmi.emit('userEvent', { eventType: 'ACTION', sourceId: h.components.next.getId() });
    assert.strictEqual(h.app.state.page, Model.order[2], 'Paired raw delivery was not suppressed');
    h.rhmi.emit('userEvent', { eventType: 'ACTION', sourceId: h.components.next.getId() });
    assert.strictEqual(h.app.state.page, Model.order[2], 'Overlapping paired deliveries executed an extra action');
    h.app.state.page = 5; h.components.refresh.emit('action'); assert(h.app.state.editing);
    const before = h.app.state.custom.slice(); h.components.refresh.emit('action');
    assert.notDeepStrictEqual(h.app.state.custom, before, 'Context-changing repeated press was dropped');
    await h.app.shutdown();
  });
  await test('touch tap, drag/cancel rejection and visibility cleanup', async () => {
    const h = harness(); await h.app.setup(); h.app.state.mode = 'demo'; const gpu = h.gpu(), b = View.buttons[2];
    gpu.emit('touch', 'down', b.x + 5, b.y + 5); gpu.emit('touch', 'up', b.x + 5, b.y + 5); assert.strictEqual(h.app.state.refreshes, 1);
    h.advance(); gpu.emit('touch', 'down', b.x + 5, b.y + 5); gpu.emit('touch', 'move', b.x + 80, b.y + 5); gpu.emit('touch', 'up', b.x + 80, b.y + 5); assert.strictEqual(h.app.state.refreshes, 1);
    gpu.emit('touch', 'down', b.x + 5, b.y + 5); gpu.emit('touch', 'cancel', b.x + 5, b.y + 5); gpu.emit('touch', 'up', b.x + 5, b.y + 5); assert.strictEqual(h.app.state.refreshes, 1);
    h.app.setVisible(false); assert.strictEqual(gpu.shown, false); assert.strictEqual(gpu.claims.length, 0);
    const n = gpu.frameCount; h.app.render(); assert.strictEqual(gpu.frameCount, n);
    await h.app.shutdown();
  });
  await test('touch selection preserves native controller focus', async () => {
    const h = harness(); await h.app.setup(); h.components.previous.emit('focus', { value: true });
    const b = View.buttons[4]; h.gpu().emit('touch', 'down', b.x + 4, b.y + 4); h.gpu().emit('touch', 'up', b.x + 4, b.y + 4);
    assert.strictEqual(h.app.state.info, true); assert.strictEqual(h.app.state.focus, 0, 'Touch moved the controller ring without native focus');
    h.components.previous.emit('action'); assert.strictEqual(h.app.state.page, Model.order[Model.order.length - 1]); assert.strictEqual(h.app.state.focus, 0);
    await h.app.shutdown();
  });
  await test('garage gates vehicle reads by visibility and mode and saves custom edits', async () => {
    const h = harness(); await h.app.setup(); assert.strictEqual(h.app.vehicle.active, true);
    const beforeFrame = h.gpu().frameCount;
    h.app.vehicle.publish({ connected: false, signals: {} });
    assert.strictEqual(h.gpu().frameCount, beforeFrame, 'Telemetry must not bypass the renderer cadence');
    h.gpu().emit('tick'); assert(h.gpu().frameCount > beforeFrame);
    h.app.press(3); assert.strictEqual(h.app.vehicle.active, false, 'Demo must pause vehicle acquisition');
    h.advance(); h.app.press(3); assert.strictEqual(h.app.vehicle.active, true);
    h.app.setVisible(false); assert.strictEqual(h.app.vehicle.active, false); h.app.setVisible(true);
    h.app.state.page = 5; const focus = h.app.state.focus;
    h.gpu().emit('touch', 'down', 1188, 183); h.gpu().emit('touch', 'up', 1188, 183); assert(h.app.state.editing); assert.strictEqual(h.app.state.customSlot, 2); assert.strictEqual(h.app.state.focus, focus);
    h.advance(); h.app.press(2); assert.strictEqual(h.app.state.preferenceStatus, 'Selection saved');
    await h.app.shutdown(); assert(h.app.vehicle.closed);
  });
  await test('native touch swipe changes pages, with vertical and control-rail drags rejected', async () => {
    const h = harness(); await h.app.setup(); const gpu = h.gpu();
    gpu.emit('touch', 'down', 700, 180); gpu.emit('touch', 'move', 500, 180); gpu.emit('touch', 'up', 450, 180);
    assert.strictEqual(h.app.state.page, 1); assert.strictEqual(h.app.state.focus, 0);
    h.advance(); gpu.emit('touch', 'down', 450, 180); gpu.emit('touch', 'move', 700, 180); gpu.emit('touch', 'up', 700, 180);
    assert.strictEqual(h.app.state.page, 0);
    h.advance(); gpu.emit('touch', 'down', 700, 100); gpu.emit('touch', 'move', 690, 250); gpu.emit('touch', 'up', 690, 250); assert.strictEqual(h.app.state.page, 0);
    const b = View.buttons[1]; gpu.emit('touch', 'down', b.x + 10, b.y + 10); gpu.emit('touch', 'move', 900, b.y + 10); gpu.emit('touch', 'up', 900, b.y + 10); assert.strictEqual(h.app.state.page, 0);
    await h.app.shutdown();
  });
  await test('foreground restore cancels stale focus-loss timer', async () => {
    const h = harness(); await h.app.setup();
    h.components.garage.emit('focus', { focus: false }); const hide = h.app.hideTimer; assert(h.timers.has(hide));
    h.rhmi.emit('applicationStackChanged', { ROOT_APP: {} });
    assert(!h.timers.has(hide), 'Pending hide survived a newer foreground signal'); assert(h.app.visible);
    h.components.garage.emit('focus', { focus: false }); const second = h.app.hideTimer;
    await h.app.open('entry'); assert(!h.timers.has(second), 'Reopened app retained stale hide');
    await h.app.shutdown();
  });
  await test('optional SDK visibility reporting cannot crash the app', async () => {
    const h = harness(); h.app.registerHmiVisible = undefined; h.app.unregisterHmiVisible = () => { throw new Error('unsupported'); };
    await h.app.setup(); h.app.setVisible(false); for (let i = 0; i < 5; i++) await Promise.resolve();
    assert(!h.calls.find((c) => c[0] === 'exit')); await h.app.shutdown();
  });
  await test('GitHub catalog mode uses an absolute release artifact URL', () => {
    const build = require('../tools/package'); build({ github: 'sample-owner/g80-apps', tag: 'catalog' });
    const catalog = JSON.parse(fs.readFileSync(path.join(gate.root, 'dist/catalog.json')));
    const artifact = catalog.components[0].artifact;
    assert.strictEqual(new URL(artifact.url).href, 'https://github.com/sample-owner/g80-apps/releases/download/catalog/bishal_garage@0.1.0.tgz');
    assert.strictEqual(catalog.components[0].build, 'unit');
    assert(archive.unpack(fs.readFileSync(path.join(gate.root, 'dist', artifact.name)))['mgu-app.json']);
    build();
  });
  await test('background start needs no RHMI and absent entry fails explicitly', async () => {
    const h = harness(true); await h.app.setup(); assert(!h.gpu()); assert(h.calls.find((c) => c[0] === 'initialized')); await h.app.shutdown();
    const bad = harness(false, true); assert.throws(() => bad.app.setup(), /entry point/); await bad.app.shutdown();
    const eventFailure = harness(false, true); eventFailure.app.emit('initialized');
    for (let i = 0; i < 10; i++) await Promise.resolve();
    assert(eventFailure.calls.find((c) => c[0] === 'exit' && c[1] === 1), 'Synchronous setup error must be caught by initialized handler');
  });
  await require('./data')(test);
  await require('./vehicle')(test);
  await require('./custom')(test);
  await require('./design')(test);
  await require('./features')(test);
  console.log('\n' + passed + ' tests passed. SDK and renderer calls are mocked; no head-unit execution claimed.');
})().catch((err) => { console.error(err.stack); process.exitCode = 1; });
