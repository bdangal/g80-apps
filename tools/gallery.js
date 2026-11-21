'use strict';
const fs = require('fs');
const path = require('path');
// Captures follow the app's grouped order (Drive / Track / Garage), Balkan last.
const groups = [
  ['Drive', [['overview', 'Overview'], ['performance', 'Performance'], ['live-pulls', 'Live Pulls'], ['pull-graph', 'Pull Graph'], ['peaks', 'Peaks']]],
  ['Track', [['g-meter', 'G-Meter'], ['brake-test', 'Brake Test'], ['drag-timer', 'Drag Timer'], ['m-vitals', 'M Vitals']]],
  ['Garage', [['readiness', 'Readiness'], ['fuel-ethanol', 'Fuel & Ethanol'], ['temperatures', 'Temperatures'], ['diagnostics', 'Diagnostics'], ['my-gauges', 'My Gauges'], ['balkan-automotive', 'Balkan Automotive']]]
];
function image(name, alt) { return '<a href="/screenshots/' + name + '.png" target="_blank"><img src="/screenshots/' + name + '.png" width="1440" height="382" loading="lazy" alt="' + alt + '"></a>'; }
let html = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Bishal\'s M3 App / gallery</title><style>*{box-sizing:border-box}body{margin:0;background:#080e18;color:#f3f6fc;font:16px "Segoe UI",Arial,sans-serif}main{max-width:1488px;margin:auto;padding:24px}h1{font-size:30px;font-weight:500}h2{font-size:24px;font-weight:500;margin:42px 0 16px}h3{font-size:14px;font-weight:500;color:#94a4bb;margin:20px 0 10px}p{color:#94a4bb;line-height:1.6;max-width:1000px}a{color:#88bfff}img{display:block;width:100%;height:auto;border:1px solid #263b56}nav{display:flex;gap:20px;flex-wrap:wrap}.notice{color:#d9b675}</style></head><body><main><h1>Bishal\'s M3 App / screenshots</h1><p>Clean <strong>1440 × 382</strong> application-canvas captures. Same bitmap typography, artwork and draw operations as the head-unit renderer. Click any image to inspect the full-resolution PNG.</p><p class="notice">Browser renders, not in-car screenshots. DEMO readings and runs are simulated. Disconnected, stale, unavailable and estimated-power examples are explicit test fixtures, never claims of a vehicle connection.</p><nav><a href="/">Presentation</a><a href="/developer">Developer tools</a>';
html += groups.map((g) => g[1].map((p) => '<a href="#' + p[0] + '">' + p[1] + '</a>').join('')).join('') + '</nav>';
let count = 0;
groups.forEach((g) => {
  html += '<h1>' + g[0] + '</h1>';
  g[1].forEach((p, i) => {
    count++;
    html += '<section id="' + p[0] + '"><h2>' + g[0] + ' ' + (i + 1) + ' / ' + g[1].length + ' · ' + p[1] + '</h2><h3>DEMO</h3>' + image(p[0], p[1] + ' demonstration') + '<h3>DISCONNECTED</h3>' + image(p[0] + '-disconnected', p[1] + ' disconnected with suppressed values and explicit validity labels') + '</section>';
  });
});
const extra = [['diagnostics-scanned', 'Fault Scanner demo result (sample codes, not this car)'], ['my-gauges-fuel', 'My Gauges fuel selection / ethanol companion / DEMO'], ['my-gauges-fuel-disconnected', 'My Gauges fuel selection / disconnected ethanol'], ['my-gauges-editor', 'Controller-compatible My Gauges editor'], ['settings', 'About / Settings with saved display units'], ['stale', 'Stale temperature fixture'], ['live-pulls-stale', 'Stale Live Pulls fixture'], ['unavailable', 'Connected but unavailable fixture'], ['estimated-power-fixture', 'Estimated engine power fixture / EST. LIVE']];
extra.forEach((item) => { html += '<h2>' + item[1] + '</h2>' + image(item[0], item[1]); });
html += '<p>Read-only acquisition is preserved, but actual head-unit build, installation, controller behavior, performance and signal calibration still require parked-car verification. Ethanol, fuel level, range and odometer remain unmapped.</p></main></body></html>\n';
fs.writeFileSync(path.join(__dirname, '../docs/screenshots/index.html'), html);
console.log('Gallery: ' + count + ' pages x demo/disconnected + ' + extra.length + ' state captures, each 1440x382.');
