'use strict';
const assert = require('assert');
const Model = require('../apps/bishal_garage/src/model');
const View = require('../apps/bishal_garage/src/view');
const font = require('../apps/bishal_garage/package/artwork/font.json');
module.exports = async function (test) {
  await test('display defaults to Fahrenheit without altering canonical telemetry', () => {
    const s = Model.create('test', 'test', 'demo'), frame = Model.snapshot(s), before = JSON.stringify(frame);
    const d = Model.display(s, 'oil', frame.signals.oil);
    assert.strictEqual(d.unit, '\u00b0F');
    assert(Math.abs(d.reading.value - 197.6) < 1e-9, 'Fahrenheit conversion missing');
    assert.strictEqual(d.min, 32); assert.strictEqual(d.max, 302);
    assert.strictEqual(JSON.stringify(frame), before, 'Display mutated canonical signals');
    s.page = 3; assert(Model.summary(s).includes('198 \u00b0F'));
    const missing = Model.display(s, 'oil', { value: null, status: 'unavailable' });
    assert.strictEqual(missing.reading.value, null, 'Unavailable temperature became a numeric reading');
    s.mode = 'live'; assert(!View.draw(s, font).ops.some((op) => op.kind === 'text' && op.size === 65 && op.text === '32'), 'Missing reading rendered as freezing point');
  });
  await test('every displayed unit is US and keeps validity and estimate flags', () => {
    const s = Model.create('test', 'test', 'demo');
    const units = { boost: 'PSI gauge', speed: 'mph', range: 'mi', odometer: 'mi', torque: 'lb-ft', power: 'hp', oil: '\u00b0F', ambient: '\u00b0F', gearboxOil: '\u00b0F', tyreTFL: '\u00b0F', tyrePFL: 'psi' };
    Object.keys(units).forEach((name) => {
      const d = Model.display(s, name, { value: 10, status: 'stale', estimated: true, timestamp: 12 });
      assert.strictEqual(d.unit, units[name], 'Non-US unit shown for ' + name);
      assert.strictEqual(d.reading.status, 'stale'); assert.strictEqual(d.reading.estimated, true); assert.strictEqual(d.reading.timestamp, 12);
    });
    const texts = [];
    for (let page = 0; page < Model.pages.length; page++) { s.page = page; View.draw(s, font).ops.forEach((op) => { if (op.kind === 'text') texts.push(op.text); }); texts.push(Model.summary(s)); }
    s.page = 2; texts.push(Model.summary(s));
    texts.forEach((t) => assert(!/(km\/h|\bkm\b|\bkPa\b|\bkW\b|\bNm\b|\d L\b| L flex| L gas|\bbar\b|\u00b0C|\d m\b)/.test(t), 'Metric unit shown: ' + t));
  });
  await test('settings keep gauge arrays and ignore any saved metric preference', () => {
    const s = Model.create('test'); Model.configure(s, { gauges: ['speed', 'oil', 'gear'], units: 'metric' });
    assert.deepStrictEqual(s.custom, ['speed', 'oil', 'gear']);
    assert.strictEqual(Model.display(s, 'speed', { value: 60, status: 'live' }).unit, 'mph', 'Saved metric preference changed units');
    Model.act(s, 4); assert(Model.rows(s)[2].includes('mph')); Model.act(s, 2); assert(!s.configDirty);
    assert.deepStrictEqual(Model.settings(s), { gauges: ['speed', 'oil', 'gear'] });
    Model.configure(s, { gauges: ['rpm', 'rpm', 'boost'] }); assert.deepStrictEqual(s.custom, ['rpm', 'boost', 'power']);
  });
  await test('touch tabs and swipes use shared geometry without stealing native focus', () => {
    const s = Model.create('test'); const initial = s.focus;
    View.groupButtons.forEach((g, gi) => {
      Model.act(s, View.customHit(s, g.x + 5, g.y + 5)); assert.strictEqual(Model.groupOf(s.page), gi, 'Group button did not open its group');
      View.navigationTabs(s).forEach((b) => { const action = View.customHit(s, b.x + 5, b.y + 5); assert.strictEqual(action, 10 + b.page); Model.act(s, action); assert.strictEqual(s.page, b.page, 'Touch tab did not select page'); });
    });
    assert.strictEqual(s.focus, initial);
    assert(View.swipe(s, { x: 1188, y: 180, index: 7 }, 970, 180), 'Gauge hit area blocked swipe');
    assert(!View.swipe(s, { x: 700, y: 350 }, 900, 350));
    s.editing = true; assert(!View.swipe(s, { x: 700, y: 180 }, 900, 180));
    assert(!View.swipe(s, { x: 700, y: 180 }, 710, 280));
  });
  await test('visual interpolation never delays numbers and invalidation clears the indicator', () => {
    const s = Model.create('test', 'test', 'demo'); s.page = 1;
    View.draw(s, font, 1000); const old = s.visuals.boost.value;
    s.sample = 1; const changed = View.draw(s, font, 1040);
    assert(changed.ops.some((op) => op.kind === 'text' && op.text === '24.2'), 'Numeric reading was interpolated');
    assert(s.visuals.boost.value > old && s.visuals.boost.value < (24.2 + 15) / 50, 'Track transition missing');
    s.mode = 'live'; const absent = View.draw(s, font, 1080);
    assert(!s.visuals.boost, 'Invalid reading retained a position indicator');
    assert(!absent.ops.some((op) => op.kind === 'text' && op.text === '24.2'));
  });
  await test('shared typography uses tabular digits and locally baked degree glyph', () => {
    const advances = '0123456789'.split('').map((n) => font.glyphs[n].advance);
    assert.strictEqual(new Set(advances).size, 1, 'Numerals must have identical advance');
    assert(font.glyphs['\u00b0'], 'Missing locally baked degree glyph'); assert(font.size >= 48);
  });
  await test('presentation fixtures always carry a canvas-level not-vehicle badge', () => {
    const s = Model.create('test'); s.previewFixture = 'TEST FIXTURE / NOT VEHICLE'; s.live.connected = true;
    const labels = View.draw(s, font).ops.filter((op) => op.kind === 'text').map((op) => op.text);
    assert(labels.includes('TEST FIXTURE / NOT VEHICLE'), 'Fixture disclaimer hidden in developer controls');
    assert(!labels.includes('LIVE / READ ONLY'), 'Fixture appears to be a real live connection');
  });
  await test('tab icons share local vector primitives and stay inside compact targets', () => {
    const Recorder = require('../apps/bishal_garage/src/record');
    ['car', 'flag', 'fuel', 'temperature', 'trace', 'gauges', 'shop'].forEach((name) => {
      const r = new Recorder(font); View.tabIcon(r, name, 0, 0, '#389cff');
      assert(r.ops.length >= 3, 'Tab icon missing: ' + name);
      assert(r.ops.every((op) => op.kind === 'line' || op.kind === 'rect'), 'Icons must not require emoji/fonts or network assets');
      r.ops.forEach((op) => assert(op.x >= 0 && op.y >= 0 && op.x <= 20 && op.y <= 20));
      if (name === 'flag') assert.strictEqual(r.ops.filter((op) => op.kind === 'rect').length, 6, 'Checkered flag pattern missing');
      assert(r.words().length > 30);
    });
  });
  await test('sponsor appears only once below the app name in restrained red', () => {
    const s = Model.create('test', 'test', 'demo');
    for (let page = 0; page < Model.pages.length; page++) {
      s.page = page;
      for (const info of [false, true]) {
        s.info = info; const labels = View.draw(s, font).ops.filter((op) => op.kind === 'text');
        const credit = labels.filter((op) => op.text.includes('Balkan') && op.x < 260 && op.y < 46);
        assert.strictEqual(credit.length, 1, 'Sponsor repeated outside header');
        assert.strictEqual(credit[0].text, 'Powered by Balkan Automotive', 'Header must contain one exact sponsor subtitle');
        assert.strictEqual(credit[0].color, View.color.red); assert(credit[0].size >= 14 && credit[0].y < 46);
        assert(!Model.summary(s).includes('Powered by'), 'Sponsor leaked into native summary');
      }
    }
  });
  await test('every fuel instrument has a truthful corn-yellow ethanol companion', () => {
    const now = 10000, s = Model.create('test', 'test', 'demo'); s.custom = ['fuel', 'boost', 'power'];
    [0, 2, 5].forEach((page) => {
      s.page = page;
      function hint() { return View.draw(s, font, now).ops.find((op) => op.kind === 'text' && op.text.indexOf('ETHANOL  ') === 0); }
      s.mode = 'demo'; let h = hint(); assert(h, 'Fuel instrument missing ethanol companion'); assert.strictEqual(h.color, View.color.corn); assert(h.text.includes('E44 / 44% v/v')); assert(!h.text.includes('LIVE'));
      s.mode = 'live'; s.live = { connected: true, signals: { ethanol: { value: 73, unit: '% v/v', timestamp: now, verified: true } } };
      h = hint(); assert(h.text.includes('E73 / 73% v/v / LIVE'), 'Valid live ethanol not identified');
      assert(Model.summary(s, now).includes('E73'));
      s.live.signals.ethanol.timestamp = now - 5000; h = hint(); assert(h.text.includes('E-- / STALE') && !h.text.includes('73'), 'Stale ethanol leaked a number');
      s.live.signals = {}; h = hint(); assert(h.text.includes('E-- / UNAVAILABLE') && !h.text.includes('LIVE'), 'Missing ethanol mislabeled live');
      s.live.connected = false; assert(hint().text.includes('DISCONNECTED'));
    });
  });
  await test('page arrows are removed while tabs reclaim space and editor slot controls remain', () => {
    const s = Model.create('test', 'test', 'demo');
    for (let page = 0; page < Model.pages.length; page++) {
      s.page = page;
      for (const info of [false, true]) {
        s.info = info;
        const labels = View.draw(s, font).ops.filter((op) => op.kind === 'text').map((op) => op.text);
        assert(!labels.includes('<') && !labels.includes('>'), 'Redundant page arrows still rendered');
        assert.strictEqual(View.customHit(s, 30, 350), 40, 'Former arrow target must select the Drive group');
      }
    }
    s.info = false; s.page = 0; Model.act(s, 0); assert.strictEqual(s.page, 6, 'Native previous page broken');
    Model.act(s, 1); assert.strictEqual(s.page, 0, 'Native next page broken');
    s.page = 5; Model.act(s, 2);
    assert.strictEqual(View.customHit(s, 30, 350), 0, 'Editor previous slot missing');
    assert.strictEqual(View.customHit(s, 80, 350), 1, 'Editor next slot missing');
    const labels = View.draw(s, font).ops.filter((op) => op.kind === 'text').map((op) => op.text);
    assert(labels.includes('<') && labels.includes('>'), 'Editor slot controls hidden');
    View.navigationTabs(s).forEach((b) => assert.strictEqual(View.customHit(s, b.x + 4, b.y + 4), 10 + b.page));
  });
  await test('G80 RPM chevron has a real 0-8 scale and truthful position/readout states', () => {
    const Recorder = require('../apps/bishal_garage/src/record'), s = Model.create('test', 'test', 'demo');
    function draw(reading) { s.visuals = {}; const r = new Recorder(font); View.tachometer(r, font, s, reading, 560, 76, 520, 231, 1000); return r; }
    [0, 4280, 5000, 8000, 9000].forEach((value) => {
      const r = draw({ value: value, status: 'live' }), labels = r.ops.filter((op) => op.kind === 'text').map((op) => op.text);
      for (let i = 0; i <= 8; i++) assert(labels.includes(String(i)), 'Tachometer scale tick missing');
      assert(labels.includes('1/min x 1000') && labels.includes(String(value)), 'RPM readout or scale unit missing');
      const needle = r.ops.filter((op) => op.kind === 'line' && op.color === View.color.white && op.width === 3);
      assert.strictEqual(needle.length, 1, 'Current RPM needs one position marker');
      const p = View.tachoPoint(560, 76, 520, 231, Math.min(1, value / 8000));
      assert(Math.abs(needle[0].x - (p.x - p.nx * 18)) < 1e-8);
      assert(!r.ops.some((op) => op.kind === 'line' && op.width === 4), 'Generic slash RPM bar returned');
      const title = r.ops.find((op) => op.kind === 'text' && op.text === 'ENGINE SPEED');
      assert(title.y >= 108, 'Tachometer contour crosses title');
    });
    ['stale', 'unavailable', 'disconnected'].forEach((status) => {
      const r = draw({ value: 4280, status: status });
      assert(!r.ops.some((op) => op.kind === 'line' && op.color === View.color.white && op.width === 3), 'Invalid RPM retained a marker');
      assert(!r.ops.some((op) => op.kind === 'text' && op.text === '4280'), 'Invalid RPM leaked a number');
      assert(r.ops.some((op) => op.kind === 'text' && op.text === status.toUpperCase()));
    });
    [[0, 984, 289], [5 / 8, 1040, 165.875], [1, 984, 92]].forEach((expected) => {
      const p = View.tachoPoint(560, 76, 520, 231, expected[0]);
      assert.strictEqual(p.x, expected[1]); assert.strictEqual(p.y, expected[2], 'RPM vertical scale not linear');
    });
    s.visuals = {};
    const first = new Recorder(font); View.tachometer(first, font, s, { value: 1000, status: 'live' }, 560, 76, 520, 231, 1000);
    const changed = new Recorder(font); View.tachometer(changed, font, s, { value: 7000, status: 'live' }, 560, 76, 520, 231, 1040);
    assert(changed.ops.some((op) => op.text === '7000'), 'Tachometer numeric reading was delayed');
    assert.strictEqual(s.visuals['rpm.tacho'].value, 2500 / 8000, 'Tachometer visual transition incorrect');
    const stale = new Recorder(font); View.tachometer(stale, font, s, { value: 7000, status: 'stale' }, 560, 76, 520, 231, 1080);
    assert(!s.visuals['rpm.tacho'], 'Stale RPM retained animation state');
    [1, 4, 5].forEach((page) => { s.page = page; assert(View.draw(s, font).ops.some((op) => op.text === '1/min x 1000'), 'RPM layout not shared across pages'); });
  });
  await test('OEM sport bars preserve zero missing and estimated engine values', () => {
    const Recorder = require('../apps/bishal_garage/src/record'), s = Model.create('test', 'test', 'demo');
    function draw(reading) { s.visuals = {}; const r = new Recorder(font); View.sportBar(r, font, s, 'power', reading, 964, 78, 440, 1000); return r; }
    const zero = draw({ value: 0, status: 'live' });
    assert(zero.ops.some((op) => op.text === '0' && op.size === 38));
    assert(!zero.ops.some((op) => op.kind === 'rect' && op.color === View.color.red), 'Zero power has a filled bar');
    const estimated = draw({ value: 392, status: 'live', estimated: true });
    assert(estimated.ops.some((op) => op.text === 'EST. ENGINE POWER') && estimated.ops.some((op) => op.text === 'EST. LIVE'), 'Estimated power label missing');
    assert(estimated.ops.some((op) => op.kind === 'rect' && op.color === View.color.red), 'OEM sport fill missing');
    const absent = draw({ value: 392, status: 'stale', estimated: true });
    assert(!absent.ops.some((op) => op.text === '392' || op.kind === 'rect' && op.color === View.color.red), 'Stale sport value or fill leaked');
    assert(!absent.ops.some((op) => op.kind === 'line' && op.color === View.color.white && op.width === 2));
    const us = draw({ value: 100, status: 'live' });
    assert(us.ops.some((op) => op.text === '100' && op.size === 38) && us.ops.some((op) => op.text === 'hp'));
  });
  await test('OEM vehicle stage and technical numeral atlas remain local and proportional', () => {
    const s = Model.create('test', 'test', 'demo'), r = View.draw(s, font);
    const image = r.ops.find((op) => op.kind === 'image' && op.id === 1), panel = r.ops.findIndex((op) => op.kind === 'image' && op.id === 3);
    assert.strictEqual(image.w, 530); assert(Math.abs(image.h / image.w - 577 / 1024) < 1e-10);
    assert(panel >= 0 && panel < r.ops.indexOf(image), 'Figma M panel must sit behind the car');
    const meta = require('../apps/bishal_garage/package/artwork/m-panel.json'), op = r.ops[panel];
    assert(Math.abs(op.h / op.w - meta.height / meta.width) < 1e-10, 'M panel distorted');
    assert(font.numeralFamily && font.numeralFamily.includes('Bahnschrift'), 'Technical numeral atlas missing');
  });
  await test('grouped tabs have disjoint full interiors in every group and the editor', () => {
    const s = Model.create('test');
    const layouts = Model.groups.map((g) => ({ page: g.pages[0], edit: false })).concat([{ page: 5, edit: true }]);
    layouts.forEach((l) => {
      s.page = l.page; s.editing = l.edit;
      const boxes = View.navigationTabs(s), group = Model.groups[Model.groupOf(l.page)];
      assert.strictEqual(boxes.length, group.pages.length);
      if (!l.edit) View.groupButtons.forEach((g) => assert(g.x + g.w < boxes[0].x, 'Group button overlaps tabs'));
      boxes.forEach((b, i) => {
        assert(b.x + b.w <= View.buttons[2].x, 'Tab overlaps native action strip');
        if (i) assert(boxes[i - 1].x + boxes[i - 1].w < b.x, 'Tabs overlap');
        [1, b.w / 2, b.w - 1].forEach((dx) => assert.strictEqual(View.customHit(s, b.x + dx, b.y + 18), 10 + b.page, 'Tab interior routes to wrong action'));
      });
    });
    assert.deepStrictEqual(Model.order.slice().sort((a, b) => a - b), Model.pages.map((p, i) => i), 'Every page must belong to exactly one group');
  });
  await test('Balkan showcase shows the shop logo where the B was, without gauges or vehicle readings', () => {
    const s = Model.create('test', 'test', 'demo'); Model.act(s, 16);
    assert.strictEqual(s.page, 6); assert.strictEqual(Model.pages[6], 'Balkan Automotive');
    assert(Model.summary(s).includes('Balkan Automotive logo'), 'Showcase native summary missing');
    const frame = View.draw(s, font), images = frame.ops.filter((op) => op.kind === 'image');
    assert.strictEqual(images.length, 1, 'Balkan logo missing');
    assert.deepStrictEqual([images[0].id, images[0].x, images[0].w], [2, 114, 495], 'Logo must span the old B width');
    const centre = images[0].y + images[0].h / 2; assert(Math.abs(centre - (59 + 264 / 2)) < 1, 'Logo must be centred in the old B area');
    assert(!frame.ops.some((op) => op.text === 'ENGINE SPEED' || op.text === 'TOUCH AN INSTRUMENT TO CUSTOMIZE'), 'Showcase rendered custom gauges');
    assert.strictEqual(View.customHit(s, 244, 183), -1);
    Model.act(s, 5); assert(!s.editing, 'Shop page entered gauge editor');
    Model.act(s, 1); assert.strictEqual(s.page, 0); Model.act(s, 0); assert.strictEqual(s.page, 6);
    s.mode = 'live'; const liveImages = View.draw(s, font).ops.filter((op) => op.kind === 'image');
    assert.deepStrictEqual(liveImages, images, 'Data mode changes shop artwork');
  });
  await test('logo payload has a transparent background and readable ink on the dark app', () => {
    const fs = require('fs'), path = require('path'), dir = path.join(__dirname, '../apps/bishal_garage/package/artwork');
    const meta = require('../apps/bishal_garage/package/artwork/balkan-logo.json'), rgba = fs.readFileSync(path.join(dir, 'balkan-logo.rgba'));
    assert.strictEqual(rgba.length, meta.width * meta.height * 4);
    let clear = 0, red = 0, dark = 0;
    for (let i = 0; i < rgba.length; i += 4) {
      const a = rgba[i + 3]; if (a < 8) { clear++; continue; }
      if (a > 200 && rgba[i] > 150 && rgba[i] > rgba[i + 1] + 80) red++;
      if (a > 128 && Math.max(rgba[i], rgba[i + 1], rgba[i + 2]) < 90) dark++;
    }
    const total = rgba.length / 4;
    assert(clear / total > 0.4, 'Logo background is not transparent');
    assert(red > 500, 'Red Balkan lettering lost');
    assert(dark / total < 0.01, 'Black ink left invisible on the dark background');
  });
  await test('Balkan page shows the shop business card last in the tab order', () => {
    const s = Model.create('test', 'test', 'demo'); s.page = Model.order[Model.order.length - 1];
    assert.strictEqual(Model.pages[s.page], 'Balkan Automotive', 'Balkan page must be the last tab');
    const garage = Model.groups[Model.groups.length - 1].pages; assert.strictEqual(garage[garage.length - 1], s.page, 'Balkan page must close the last group');
    const texts = View.draw(s, font).ops.filter((op) => op.kind === 'text').map((op) => op.text);
    ['BALKAN AUTO', '210 W Main St, Middletown, PA 17057', 'Performance installations', 'Car servicing', 'Alignments', 'Vinyl wrap', 'Aftermarket part installs', "Literally f*ckin' anything"]
      .forEach((line) => assert(texts.includes(line), 'Business card line missing: ' + line));
    assert(!texts.some((op) => /FUCKING|ENTHUSIASTS|MOSAIC|SPECIALISTS|PENNSYLVANIA|ALL WELCOME|^BALKAN$|^AUTOMOTIVE$/.test(op)), 'Removed Balkan copy remains');
    assert(Model.summary(s).includes('210 W Main St, Middletown, PA 17057'));
  });
  await test('shared rails and large diagonals use the M sport style without coarse stair steps', () => {
    const s = Model.create('test', 'test', 'demo'); s.page = 3;
    const ops = View.draw(s, font, 1000).ops;
    assert(!ops.some((op) => op.kind === 'line' && op.width === 4 && op.color === View.color.track), 'Generic slash track returned');
    assert(ops.some((op) => op.kind === 'rect' && op.color === '#251724'), 'Oil rail missing M-red housing');
    const backdrop = ops.filter((op) => op.kind === 'rect' && op.color === '#172437');
    assert(backdrop.length > 200 && backdrop.every((op) => op.h <= 1), 'Backdrop diagonal too coarse');
    assert(ops.filter((op) => op.kind === 'rect' && op.color === '#0d1624').every((op) => op.h <= 2), 'Facet diagonal too coarse');
  });
  await test('E50 blend planner uses conservative flex E70 and gas E10 and never overshoots', () => {
    const plan = Model.blend(44, 68), volume = 15.9 * 0.68;
    assert(Math.abs(plan.flex - volume * 6 / 20) < 1e-9, 'Flex gallons to E50 wrong');
    assert(Math.abs(plan.flexResult - 50) < 1e-9 && Math.abs(plan.fillResult - 50) < 1e-9, 'Blend does not land on E50');
    assert(Math.abs(plan.fillFlex + plan.fillGas - 15.9 * 0.32) < 1e-9);
    const nearlyFull = Model.blend(20, 95);
    assert(!nearlyFull.fits && nearlyFull.flexResult < 50, 'Partial fill must stay under E50');
    const over = Model.blend(60, 50);
    assert(over.over && Math.abs((7.95 * 60 + over.gas * 10) / (7.95 + over.gas) - 50) < 1e-9, 'Above-E50 gas dilution wrong');
    assert.strictEqual(Model.blend(null, 50), null);
    const s = Model.create('test', 'test', 'demo'); s.page = 2;
    assert(Model.blendLines(s, Model.snapshot(s).signals)[0].includes(' gal flex'), 'Planner text missing');
    s.mode = 'live'; s.live = { connected: true, signals: { ethanol: { value: 44, unit: '% v/v', timestamp: 1, verified: true }, fuel: { value: 68, unit: '%', timestamp: 1, verified: true } } };
    assert.strictEqual(Model.blendLines(s, Model.snapshot(s, 10000).signals), null, 'Planner must not guess without live readings');
    assert(!View.draw(s, font).ops.some((op) => /gal flex/.test(op.text)), 'Disconnected planner fabricated gallons');
  });
  await test('pull timer records 0-60 and 60-130 from continuous live speed and keeps three', () => {
    const t = Model.pullTimer();
    function run(speeds, start) { speeds.forEach((mph, i) => Model.feedPull(t, mph, start + i * 100)); }
    for (let n = 0; n < 4; n++) {
      const speeds = [0, 0]; for (let v = 0; v <= 135; v += 1.6 + n * 0.05) speeds.push(v); run(speeds, n * 100000);
      run([20, 10, 0], n * 100000 + speeds.length * 100);
    }
    assert.strictEqual(t.results['0-60'].length, 3, 'Must keep the last three 0-60 runs');
    assert.strictEqual(t.results['60-130'].length, 3);
    assert(Math.abs(t.results['0-60'][0].seconds - 59 / 1.75 * 0.1) < 1e-6, 'Interpolated 0-60 time wrong');
    const gap = Model.pullTimer(); [[0, 0], [2, 100], [4, 200], [64, 2200]].forEach((p) => Model.feedPull(gap, p[0], p[1]));
    assert.strictEqual(gap.results['0-60'].length, 0, 'Data gap produced a fake run');
    const lift = Model.pullTimer(); [0, 0, 20, 40, 35, 50, 61].forEach((v, i) => Model.feedPull(lift, v, i * 100));
    assert.strictEqual(lift.results['0-60'].length, 0, 'Lift-off run counted');
    const s = Model.create('test', 'test', 'demo'); s.page = 4;
    assert(View.draw(s, font).ops.some((op) => op.text === '3.62'), 'Demo pulls missing');
    s.mode = 'live'; assert(!View.draw(s, font).ops.some((op) => op.text === '3.62'), 'Demo pulls leaked into live');
  });
  await test('every page fits target bounds with a single demo badge and no purple UI', () => {
    const s = Model.create('test', 'test', 'demo');
    for (let page = 0; page < Model.pages.length; page++) {
      s.page = page; const ops = View.draw(s, font, 1000).ops;
      assert.strictEqual(ops.filter((op) => op.kind === 'text' && op.text.includes('DEMO')).length, 1, 'Repeated demo indicators');
      assert(!ops.some((op) => op.kind === 'arc' || op.color === '#b778ff'));
      ops.filter((op) => op.kind === 'text').forEach((op) => {
        const w = op.text.split('').reduce((n, c) => n + font.glyphs[c].advance * op.size / font.size, 0);
        assert(op.x >= 0 && op.x + w <= 1440 && op.y >= 0 && op.y + op.size <= 382, 'Text outside canvas: ' + op.text);
      });
      View.targets(s).forEach((b) => assert(b.x >= 0 && b.x + b.w <= 1440 && b.y + b.h <= 382));
    }
  });
};
