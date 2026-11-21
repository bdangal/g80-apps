'use strict';

const OnlineApp = require('oap-sdk/src/core/OnlineApp.js');
const fs = require('fs');
const path = require('path');
const Model = require('./model.js');
const View = require('./view.js');
const VehicleData = require('./vehicle.js').VehicleData;
const Preferences = require('./preferences.js');
const someipBuilders = require('oap-sdk/src/someip/someipBuilders');
const RenderClient = require('./mgu_render_client.js').RenderClient;
const log = console;
const names = ['previous', 'next', 'refresh', 'mode', 'about'];
function yes(value) { return value === true || value === 1 || value === 'true' || value === '1'; }

class Garage extends OnlineApp {
  constructor() {
    super();
    this.visible = false;
    this.stopping = false;
    this.ready = false;
    this.lastDelivery = {};
    this.components = [];
    this.on('initialized', () => Promise.resolve().then(() => this.setup()).catch((err) => this.fail(err)));
    this.on('entryPointExecute', (uuid) => this.open(uuid).catch((err) => this.fail(err)));
    this.on('changeVisibility', (data) => { if (data && data.visible === false) this.setVisible(false); });
    this.on('shutdown', () => this.shutdown());
    this.on('error', (err) => log.warn('Bishal\'s M3 App: ' + err.message));
  }

  setup() {
    if (!this.rhmiApplication) return this.initialized();
    const pkg = this.packageJson || this._packageJson;
    this.state = Model.create(pkg.version, this.getAppId());
    this.preferences = new Preferences(fs, path.join(__dirname, '../../data/gauges.json'));
    Model.configure(this.state, this.preferences.load());
    this.vehicle = new VehicleData(someipBuilders, (frame) => {
      if (!this.stopping) Model.acceptFrame(this.state, frame);
    }, { warn: (text) => log.warn('Vehicle data: ' + text) });
    this.font = JSON.parse(fs.readFileSync(path.join(__dirname, '../artwork/font.json'), 'utf8'));
    const alpha = fs.readFileSync(path.join(__dirname, '../artwork/font.alpha'));
    const car = JSON.parse(fs.readFileSync(path.join(__dirname, '../artwork/car.json'), 'utf8'));
    const image = { w: car.width, h: car.height, data: fs.readFileSync(path.join(__dirname, '../artwork/car.rgba')) };
    const logo = JSON.parse(fs.readFileSync(path.join(__dirname, '../artwork/balkan-logo.json'), 'utf8'));
    const logoImage = { w: logo.width, h: logo.height, data: fs.readFileSync(path.join(__dirname, '../artwork/balkan-logo.rgba')) };
    const panel = JSON.parse(fs.readFileSync(path.join(__dirname, '../artwork/m-panel.json'), 'utf8'));
    const panelImage = { w: panel.width, h: panel.height, data: fs.readFileSync(path.join(__dirname, '../artwork/m-panel.rgba')) };
    const kit = { atlasById: () => ({ atlasW: this.font.width, atlasH: this.font.height, alpha: alpha }), imageById: new Map([[1, image], [2, logoImage], [3, panelImage]]) };
    this.gpu = new RenderClient(this.getAppId(), log, { mode: 'layer', kit: kit });
    this.gpu.fps(12);
    this.gpu.on('ready', (screen, info) => {
      this.rendererReady = !!(info && info.modes.indexOf('layer') >= 0);
      if (!this.rendererReady) return;
      const b = info.appArea;
      const scale = Math.min(b.w / View.WIDTH, b.h / View.HEIGHT);
      this.gpu.mode('layer');
      this.gpu.place({ x: b.x, y: b.y, w: b.w, h: b.h, scale: scale,
        ox: (b.w - View.WIDTH * scale) / 2, oy: (b.h - View.HEIGHT * scale) / 2 });
      this.syncRenderer();
    });
    this.gpu.on('close', () => { this.rendererReady = false; this.touchDown = null; });
    this.gpu.on('state', (s) => { if (!s.front || !s.onScreen) this.touchDown = null; });
    this.gpu.on('closed', () => { this.touchDown = null; this.setVisible(false); });
    this.gpu.on('touch', (phase, x, y) => {
      if (!this.visible) return;
      if (phase === 'down') this.touchDown = { index: View.customHit(this.state, x, y), x: x, y: y, moved: false };
      if (phase === 'move' && this.touchDown && Math.abs(x - this.touchDown.x) + Math.abs(y - this.touchDown.y) > 20) this.touchDown.moved = true;
      if (phase === 'cancel') this.touchDown = null;
      if (phase === 'up') {
        const down = this.touchDown; this.touchDown = null;
        if (View.swipe(this.state, down, x, y)) this.press(x < down.x ? 1 : 0, true);
        else if (down && !down.moved && down.index >= 0 && down.index === View.customHit(this.state, x, y)) this.press(down.index, true);
      }
    });
    this.gpu.on('tick', () => this.render());
    const rhmi = this.rhmiApplication;
    const root = rhmi.getByName('garage');
    if (!root) throw new Error('ID8 garage state is missing');
    this.components = names.map((name, index) => {
      const comp = rhmi.getByName(name);
      if (!comp) throw new Error('ID8 component missing: ' + name);
      comp.on('action', () => this.press(index, false, 'component'));
      comp.on('focus', (event) => { if (yes(event && event.value)) this.focus(index); });
      return comp;
    });
    rhmi.on('userEvent', (event) => {
      const index = this.components.findIndex((comp) => Number(comp.getId()) === Number(event && event.sourceId));
      if (index < 0) return;
      if (event.eventType === 'ACTION') this.press(index, false, 'raw');
      if (event.eventType === 'FOCUS' && yes((event.parameterMap || {})[0])) this.focus(index);
    });
    root.on('focus', (event) => {
      clearTimeout(this.hideTimer);
      if (yes(event && event.focus)) this.setVisible(true);
      else this.hideTimer = setTimeout(() => this.setVisible(false), 100);
    });
    rhmi.on('applicationStackChanged', (stack) => {
      if (stack && Object.prototype.hasOwnProperty.call(stack, 'ROOT_APP')) this.setVisible(true);
      else if (stack && Object.keys(stack).length) this.setVisible(false);
    });
    this.renderNative();
    const descriptions = this.appDescription.application.entryPoints;
    const entry = this.getEntryPoints().find((candidate) => descriptions.some((d) => d.uuid === candidate.getDescription().uuid));
    if (!entry) throw new Error('Manager did not hand over this app entry point');
    return root.updateResources()
      .then(() => entry.init())
      .then(() => rhmi.mapEntryState(entry.getDescription().uuid, root))
      .then(() => entry.setAvailability('ENABLED'))
      .then(() => {
        const data = this.getVisibilityData && this.getVisibilityData();
        this.foreground = ['ENTRY_POINT', 'LUM', 'BOOKMARK', 'START_WIDGET', 'TRIGGER_HMI', 'SPEECH_COMMAND'].indexOf((data && data.reason) || this.startReason) >= 0;
        return this.foreground ? this.registerActive() : undefined;
      })
      .then(() => this.initialized())
      .then(() => {
        this.ready = true;
        this.vehicle.start();
        this.gpu.connect();
        this.keepalive = setInterval(() => { if (this.visible) this.renderNative(); this.render(); }, 1000);
        if (this.foreground) this.setVisible(true);
        const uuid = this.pendingEntry || (this.getLastExecutedEntryPointUuid && this.getLastExecutedEntryPointUuid());
        return uuid ? this.open(uuid) : undefined;
      });
  }

  open(uuid) {
    if (this.stopping || !uuid) return Promise.resolve();
    if (!this.ready) { this.pendingEntry = uuid; return Promise.resolve(); }
    this.setVisible(true);
    return Promise.resolve(this.rhmiApplication.openEntryState(uuid));
  }
  setVisible(visible) {
    if (this.stopping) return;
    const changed = this.visible !== visible;
    if (visible) clearTimeout(this.hideTimer);
    this.visible = visible;
    if (this.vehicle) this.vehicle.setActive(visible && this.state.mode === 'live');
    if (!visible) this.touchDown = null;
    this.syncRenderer();
    if (changed && this.ready) {
      const methods = visible ? ['registerActive', 'registerHmiVisible'] : ['unregisterHmiVisible', 'registerInactive'];
      methods.forEach((name) => {
        if (typeof this[name] === 'function') Promise.resolve().then(() => this[name]()).catch((err) => log.warn(name + ': ' + err.message));
      });
    }
  }
  syncRenderer() {
    if (!this.gpu || !this.rendererReady) return;
    this.gpu.claim(this.visible ? [{ x: 0, y: 0, w: View.WIDTH, h: View.HEIGHT }] : []);
    if (this.visible) this.render();
    this.gpu.show(this.visible);
  }
  focus(index) { this.state.focus = index; this.render(); }
  press(index, touch, origin) {
    if (this.stopping || !this.state || index < 0 || index >= 40 + Model.groups.length || (index >= 10 + Model.pages.length && index < 40)) return;
    const now = Date.now();
    if (!touch && (origin === 'component' || origin === 'raw')) {
      const pending = (this.lastDelivery[index] || []).filter((delivery) => now - delivery.time < 80);
      const pair = pending.findIndex((delivery) => delivery.origin !== origin);
      if (pair >= 0) { pending.splice(pair, 1); this.lastDelivery[index] = pending; return; }
      pending.push({ origin: origin, time: now });
      this.lastDelivery[index] = pending.slice(-32);
    }
    if (!touch && index < names.length) this.state.focus = index;
    Model.act(this.state, index);
    if (this.state.scanRequest) { this.state.scanRequest = false; if (!this.vehicle.scanFaults()) this.state.faults = { state: 'done', units: [], error: 'Diagnostic link not ready' }; }
    if (this.state.configDirty) {
      this.state.preferenceStatus = this.preferences.save(Model.settings(this.state)) ? 'Selection saved' : 'Save failed / this session only';
      this.state.configDirty = false;
    }
    this.vehicle.setActive(this.visible && this.state.mode === 'live');
    this.renderNative(); this.render();
  }
  renderNative() {
    const rows = Model.rows(this.state);
    this.components.forEach((comp, i) => comp.setValue(0, 'PrimaryText', rows[i], 'Text'));
    const text = Model.summary(this.state);
    this.rhmiApplication.getByName('garageStatus').setValue(0, 'Text', text, 'Text');
  }
  render() {
    if (!this.visible || !this.rendererReady || this.stopping) return;
    this.gpu.frame(View.draw(this.state, this.font));
  }
  fail(err) { log.error('Bishal\'s M3 App: ' + (err.stack || err)); this.shutdown(1); }
  shutdown(code) {
    if (this.stopping) return this.shutdownPromise;
    this.stopping = true;
    clearInterval(this.keepalive); clearTimeout(this.hideTimer);
    if (this.vehicle) this.vehicle.close();
    if (this.gpu) this.gpu.close();
    this.shutdownPromise = Promise.resolve().then(() => this.destroyBundles())
      .catch((err) => log.warn('destroyBundles: ' + err.message)).then(() => process.exit(code || 0));
    return this.shutdownPromise;
  }
}
const app = new Garage();
app.start().catch((err) => app.fail(err));
module.exports = app;
