'use strict';
(async function () {
  const Model = garageRequire('./model.js'), View = garageRequire('./view.js');
  const font = await (await fetch('/artwork/font.json')).json();
  const atlas = new Image(); atlas.src = '/artwork/font.png'; await atlas.decode();
  const car = new Image(); car.src = '/artwork/car.png'; await car.decode();
  const logo = new Image(); logo.src = '/artwork/balkan-logo.png'; await logo.decode();
  const panel = new Image(); panel.src = '/artwork/m-panel.png'; await panel.decode();
  const state = Model.create('0.1.0', 'bishal_garage', 'demo');
  try { Model.configure(state, JSON.parse(localStorage.getItem('bishal_garage.gauges'))); } catch (e) { Model.configure(state, null); }
  const params = new URLSearchParams(location.search), requestedPage = Number(params.get('page'));
  if (requestedPage >= 0 && Number.isInteger(requestedPage) && requestedPage < Model.pages.length) state.page = requestedPage;
  if (params.get('developer') === '1') document.body.classList.add('dev');
  const canvas = document.querySelector('canvas'), ctx = canvas.getContext('2d');
  const status = document.querySelector('#status'), nav = document.querySelector('#navigation'), summary = document.querySelector('#accessibleSummary');
  let visible = true, down = null, lastSummary = '';
  // Slots 0-4 are the native actions (kept focusable for rotary simulation); the rest follow View.targets.
  const buttons = [];
  for (let i = 0; i < 5 + View.groupButtons.length + 6; i++) { const b = document.createElement('button'); b.className = 'hotspot'; nav.appendChild(b); buttons.push(b); }
  const hidden = 'left:-10000px;top:0;width:1px;height:1px;pointer-events:none';
  function place(b, box) { b.style.cssText = 'left:' + box.x / View.WIDTH * 100 + '%;top:' + box.y / View.HEIGHT * 100 + '%;width:' + box.w / View.WIDTH * 100 + '%;height:' + box.h / View.HEIGHT * 100 + '%'; }
  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (visible) View.draw(state, font).canvas(ctx, atlas, { 1: car, 2: logo, 3: panel });
    else { ctx.fillStyle = '#080e18'; ctx.fillRect(0, 0, canvas.width, canvas.height); }
    const editor = View.editing(state), extra = View.targets(state).filter((t) => t.action >= 10);
    buttons.forEach((b, i) => {
      b.disabled = !visible; b.removeAttribute('aria-current');
      if (i < 5) {
        if (i < 2 && !editor) { b.style.cssText = hidden; b.tabIndex = -1; } else { place(b, View.buttons[i]); b.tabIndex = 0; }
        b.dataset.action = i; b.setAttribute('aria-label', Model.rows(state)[i]); return;
      }
      const t = extra[i - 5];
      if (!t) { b.style.cssText = hidden; b.tabIndex = -1; b.dataset.action = -1; return; }
      place(b, t); b.tabIndex = 0; b.dataset.action = t.action; b.setAttribute('aria-label', t.action >= 40 ? t.label + ' group' : t.label);
      if (t.page === state.page) b.setAttribute('aria-current', 'page');
    });
    const text = !visible ? 'App hidden. Input claims released.' : Model.summary(state);
    if (text !== lastSummary) { summary.textContent = text; lastSummary = text; }
    status.textContent = text + ' | ' + (state.previewFixture || 'Browser preview / not a vehicle connection');
  }
  function select(index) {
    if (!visible) return;
    Model.act(state, index);
    state.previewFixture = state.mode === 'live' && state.live.source && state.live.source.indexOf('TEST FIXTURE') >= 0 ? 'TEST FIXTURE / NOT A VEHICLE CONNECTION' : '';
    if (state.configDirty) {
      try { localStorage.setItem('bishal_garage.gauges', JSON.stringify(Model.settings(state))); state.preferenceStatus = 'Selection saved'; }
      catch (e) { state.preferenceStatus = 'Save failed / this session only'; }
      state.configDirty = false;
    }
    document.querySelector('#scenario').value = state.mode === 'demo' ? 'demo' : state.live.connected ? state.fixtureScenario || 'unavailable' : 'disconnected';
    draw();
  }
  function rotate(delta) { if (!visible) return; state.focus = Math.max(0, Math.min(4, state.focus + delta)); buttons[state.focus].focus({ preventScroll: true }); draw(); }
  function point(event) { const box = canvas.getBoundingClientRect(); return { x: (event.clientX - box.left) * canvas.width / box.width, y: (event.clientY - box.top) * canvas.height / box.height }; }
  function downEvent(event) { if (!visible) return; down = point(event); down.index = View.customHit(state, down.x, down.y); down.moved = false; event.target.setPointerCapture(event.pointerId); }
  function upEvent(event) {
    const up = point(event), start = down; down = null;
    if (View.swipe(state, start, up.x, up.y)) select(up.x < start.x ? 1 : 0);
    else if (start && !start.moved && start.index >= 0 && start.index === View.customHit(state, up.x, up.y)) select(start.index);
  }
  document.querySelector('.screen').addEventListener('pointerdown', downEvent);
  document.querySelector('.screen').addEventListener('pointermove', (event) => { const p = point(event); if (down && Math.abs(p.x - down.x) + Math.abs(p.y - down.y) > 20) down.moved = true; });
  document.querySelector('.screen').addEventListener('pointercancel', () => { down = null; });
  document.querySelector('.screen').addEventListener('pointerup', upEvent);
  buttons.forEach((button, i) => {
    button.addEventListener('focus', () => { if (i < 5) { state.focus = i; draw(); } });
    button.addEventListener('mousedown', (event) => event.preventDefault());
    button.addEventListener('click', (event) => { if (event.detail === 0 && Number(button.dataset.action) >= 0) select(Number(button.dataset.action)); });
  });
  document.querySelector('#previous').onclick = () => rotate(-1);
  document.querySelector('#next').onclick = () => rotate(1);
  document.querySelector('#select').onclick = () => select(state.focus);
  document.querySelector('#back').onclick = () => { visible = false; down = null; draw(); };
  document.querySelector('#open').onclick = () => { visible = true; draw(); };
  function scenario(name) {
    state.info = false; state.editing = false; state.visuals = {}; state.previewFixture = '';
    if (name === 'demo') state.mode = 'demo';
    else {
      state.mode = 'live'; state.fixtureScenario = name;
      state.live = { connected: name !== 'disconnected', source: 'TEST FIXTURE / NOT VEHICLE', signals: {} };
      if (name === 'stale') {
        const timestamp = Date.now() - 10000;
        const units = { boost: 'psi', rpm: 'rpm', speed: 'mph', fuel: '%', ethanol: '% v/v', oil: 'C', coolant: 'C', intake: 'C', range: 'mi', odometer: 'mi', power: 'hp', torque: 'lb-ft', throttle: '%', gear: 'gear' };
        Object.keys(units).forEach((key) => { state.live.signals[key] = { value: key === 'gear' ? 3 : 44, unit: units[key], timestamp: timestamp, verified: true, reference: 'gauge', basis: 'engine' }; });
      }
      state.previewFixture = 'TEST FIXTURE / NOT A VEHICLE CONNECTION';
    }
    document.querySelector('#scenario').value = name; draw();
  }
  document.querySelector('#scenario').onchange = (event) => scenario(event.target.value);
  document.addEventListener('keydown', (event) => {
    if (event.target.tagName === 'SELECT') return;
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') { event.preventDefault(); rotate(event.key === 'ArrowUp' ? -1 : 1); }
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); select(event.key === 'ArrowLeft' ? 0 : 1); }
    if (event.key === 'Enter' && event.target === document.body) select(state.focus);
    if (event.key === 'Escape') { visible = false; down = null; draw(); }
    if (event.key.toLowerCase() === 'd') document.body.classList.toggle('dev');
  });
  window.garagePreview = { state: state, draw: draw, select: select, scenario: scenario, font: font };
  if (['disconnected', 'unavailable', 'stale'].includes(params.get('state'))) scenario(params.get('state'));
  setInterval(() => { if (visible && !document.hidden) draw(); }, 1000 / 12);
  draw();
})().catch((error) => { console.error(error); document.querySelector('#accessibleSummary').textContent = 'Preview failed to load: ' + error.message; });
