'use strict';

const path = require('path');
class Preferences {
  constructor(fs, file) { this.fs = fs; this.file = file; }
  load() {
    try { return JSON.parse(this.fs.readFileSync(this.file, 'utf8')).gauges; }
    catch (e) { return null; }
  }
  save(gauges) {
    try {
      const dir = path.dirname(this.file);
      if (!this.fs.existsSync(dir)) this.fs.mkdirSync(dir);
      this.fs.writeFileSync(this.file + '.tmp', JSON.stringify({ schema: 1, gauges: gauges }) + '\n');
      this.fs.renameSync(this.file + '.tmp', this.file);
      return true;
    } catch (e) { return false; }
  }
}
module.exports = Preferences;
