'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const port = Number(process.env.PORT || 8080);
function bundle() {
  const files = ['model.js', 'data.js', 'session.js', 'view.js', 'record.js'];
  return '(function(){const modules={'+ files.map((file) => JSON.stringify('./' + file) + ':function(require,module,exports){\n' + fs.readFileSync(path.join(root, 'apps/bishal_garage/src', file), 'utf8') + '\n}').join(',') + '}; const cache={};window.garageRequire=function load(id){if(cache[id])return cache[id].exports;const m={exports:{}};cache[id]=m;modules[id](load,m,m.exports);return m.exports;};})();';
}
http.createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  if (url.pathname === '/developer') { res.writeHead(302, { Location: '/?developer=1' }); res.end(); return; }
  if (url.pathname === '/gallery') { res.writeHead(302, { Location: '/screenshots/index.html' }); res.end(); return; }
  const pages = ['overview', 'performance', 'fuel-ethanol', 'temperatures', 'live-pulls', 'my-gauges', 'balkan-automotive', 'pull-graph', 'peaks', 'g-meter', 'brake-test', 'drag-timer', 'm-vitals', 'readiness', 'diagnostics', 'dyno', 'seats', 'drive-recorder', 'turn-view'];
  const captures = pages.concat(pages.map((name) => name + '-disconnected'), ['my-gauges-fuel', 'my-gauges-fuel-disconnected', 'my-gauges-editor', 'estimated-power-fixture', 'disconnected', 'stale', 'live-pulls-stale', 'settings', 'unavailable', 'diagnostics-scanned']);
  const capture = /^\/capture\/([a-z-]+)$/.exec(url.pathname);
  if (req.method === 'POST' && capture && captures.includes(capture[1])) {
    const chunks = []; let size = 0;
    req.on('data', (chunk) => { size += chunk.length; if (size > 2000000) req.destroy(); else chunks.push(chunk); });
    req.on('end', () => {
      const data = Buffer.concat(chunks);
      if (data.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') { res.writeHead(400); res.end('PNG required'); return; }
      const dir = path.join(root, 'docs/screenshots'); fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, capture[1] + '.png'), data); res.end('Saved desktop app-area capture: ' + capture[1]);
    }); return;
  }
  const shot = /^\/screenshots\/([a-z-]+)\.png$/.exec(url.pathname);
  if (shot && (captures.includes(shot[1]) || shot[1] === 'tour')) {
    res.setHeader('Content-Type', 'image/png');
    fs.createReadStream(path.join(root, 'docs/screenshots', shot[1] + '.png')).on('error', () => { res.statusCode = 404; res.end('Capture not generated'); }).pipe(res); return;
  }
  const routes = { '/': ['preview/index.html', 'text/html'], '/screenshots/index.html': ['docs/screenshots/index.html', 'text/html'], '/preview.js': ['preview/preview.js', 'text/javascript'],
    '/artwork/balkan-logo.png': ['apps/bishal_garage/package/artwork/balkan-logo.png', 'image/png'],
    '/artwork/m-panel.png': ['apps/bishal_garage/package/artwork/m-panel.png', 'image/png'],
    '/artwork/car.png': ['apps/bishal_garage/package/artwork/car.png', 'image/png'],
    '/artwork/font.png': ['apps/bishal_garage/package/artwork/font.png', 'image/png'], '/artwork/font.json': ['apps/bishal_garage/package/artwork/font.json', 'application/json'] };
  res.setHeader('Cache-Control', 'no-store');
  if (url.pathname === '/bundle.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(bundle()); return; }
  const route = routes[url.pathname];
  if (!route) { res.writeHead(404); res.end('Not found'); return; }
  res.setHeader('Content-Type', route[1] + (route[1].startsWith('text/') ? '; charset=utf-8' : ''));
  fs.createReadStream(path.join(root, route[0])).on('error', () => { res.statusCode = 500; res.end('Read failed'); }).pipe(res);
}).listen(port, '127.0.0.1', () => console.log('Bishal\'s M3 App preview: http://127.0.0.1:' + port));
