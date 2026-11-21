'use strict';

const fs = require('fs');
const path = require('path');
const gate = require('./validate');
try {
  const at = process.argv.indexOf('--sdk');
  const donor = at >= 0 ? process.argv[at + 1] : process.env.MGU_SDK_DONOR;
  if (!donor) throw new Error('Pass --sdk private/stock-app.tgz (a legally obtained stock ID8 donor); never publish this output.');
  gate.validate();
  const out = path.join(gate.root, 'private/oap');
  const work = path.join(gate.root, 'private/work');
  fs.mkdirSync(out, { recursive: true }); fs.mkdirSync(work, { recursive: true });
  const manifest = require('./vendor/oap_link').readManifest(gate.appDir);
  const result = require('./vendor/oap_link').build(gate.appDir, path.join(out, manifest.id + '@' + manifest.version + '.tgz'), {
    donors: [path.resolve(donor)], workDir: work, epoch: 0
  });
  console.log(JSON.stringify(result, null, 2));
  console.log('PRIVATE donor-linked output. Do not commit, upload or publish it.');
} catch (err) { console.error('build-oap: ' + err.message); process.exitCode = 1; }
