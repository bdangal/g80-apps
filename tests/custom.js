'use strict';
const assert = require('assert');
const Model = require('../apps/bishal_garage/src/model');
const View = require('../apps/bishal_garage/src/view');
const Preferences = require('../apps/bishal_garage/src/preferences');
const font = require('../apps/bishal_garage/package/artwork/font.json');
module.exports = async function (test) {
  await test('My Gauges retains index five and editor has controller equivalents for every operation', () => {
    const s = Model.create('0.1.0'); Model.act(s, 15); assert.strictEqual(s.page, 5);
    Model.act(s, 2); assert(s.editing); assert(Model.rows(s)[2].includes('Change gauge'));
    const initial = s.custom.slice(); Model.act(s, 2); assert.notDeepStrictEqual(s.custom, initial); assert(s.configDirty); assert.strictEqual(new Set(s.custom).size, 3);
    Model.act(s, 1); assert.strictEqual(s.customSlot, 1); Model.act(s, 0); assert.strictEqual(s.customSlot, 0);
    Model.act(s, 4); assert.deepStrictEqual(s.custom, initial); Model.act(s, 3); assert(!s.editing); assert.strictEqual(s.mode, 'live');
    Model.act(s, 1); assert.strictEqual(s.page, 6); Model.act(s, 1); assert.strictEqual(s.page, 0);
  });
  await test('My Gauges touch slots open editor and selection uses shared live readings', () => {
    const s = Model.create('0.1.0', 'test', 'demo'); s.page = 5;
    assert.strictEqual(View.customHit(s, 244, 183), 5); assert.strictEqual(View.customHit(s, 708, 183), 6); assert.strictEqual(View.customHit(s, 1172, 183), 7);
    Model.act(s, 7); assert(s.editing); assert.strictEqual(s.customSlot, 2);
    Model.configure(s, ['speed', 'oil', 'gear']);
    const ops = View.draw(s, font).ops, labels = ops.filter((o) => o.kind === 'text').map((o) => o.text);
    assert(labels.includes('Vehicle speed'.toUpperCase())); assert(labels.includes('GARAGE  5 / 6'));
    Model.act(s, 3); Model.act(s, 3); assert.strictEqual(s.mode, 'live');
    const live = View.draw(s, font).ops.filter((o) => o.kind === 'text').map((o) => o.text);
    assert(live.includes('DISCONNECTED')); assert(!live.includes('54'));
    s.info = true; assert.strictEqual(View.customHit(s, 195, 183), -1);
  });
  await test('My Gauges settings reject malformed duplicates and prototype names', () => {
    const s = Model.create('0.1.0');
    [null, {}, ['rpm'], ['rpm', 'rpm', 'boost'], ['rpm', 'boost', '__proto__']].forEach((bad) => { Model.configure(s, bad); assert.deepStrictEqual(s.custom, ['rpm', 'boost', 'power'], 'Invalid custom selection accepted'); });
    Model.configure(s, ['speed', 'oil', 'ethanol']); assert.deepStrictEqual(s.custom, ['speed', 'oil', 'ethanol']);
  });
  await test('My Gauges preferences round trip atomically and report save failures', () => {
    const files = {}; const fs = { existsSync: () => true, readFileSync: (p) => { if (!files[p]) throw new Error('missing'); return files[p]; }, writeFileSync: (p, s) => { files[p] = s; }, renameSync: (a, b) => { files[b] = files[a]; delete files[a]; } };
    const prefs = new Preferences(fs, '/private-data/gauges.json'); assert.strictEqual(prefs.load(), null);
    assert(prefs.save(['speed', 'oil', 'ethanol'])); assert.deepStrictEqual(prefs.load(), ['speed', 'oil', 'ethanol']);
    fs.renameSync = () => { throw new Error('disk full'); }; assert.strictEqual(prefs.save(['rpm', 'boost', 'power']), false);
    assert.deepStrictEqual(prefs.load(), ['speed', 'oil', 'ethanol']);
  });
};
