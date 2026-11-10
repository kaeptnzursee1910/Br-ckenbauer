// ===== Spieloberfläche =====
(() => {
const $ = s => document.querySelector(s);
const cv = $('#cv'), ctx = cv.getContext('2d');
let W = 0, H = 0, DPR = 1;

const ICON = {
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>',
  redo: '<path d="M15 14l5-5-5-5"/><path d="M20 9H9a5 5 0 0 0 0 10h3"/>',
  grid: '<path d="M4 4h16v16H4zM4 9.3h16M4 14.6h16M9.3 4v16M14.6 4v16"/>',
  move: '<path d="M12 3v18M3 12h18M9 6l3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3"/>',
  erase: '<path d="M15 4l5 5-10 10H6l-3-3a1.5 1.5 0 0 1 0-2z"/><path d="M11 19h10M9 8l6 6"/>',
  pillar: '<path d="M5 4h14M7 4v3h10V4M8.5 7v12M15.5 7v12M5 20h14"/>',
  play: '<path d="M8 5l11 7-11 7z" fill="currentColor"/>',
  build: '<path d="M14.5 6.5a4 4 0 0 0-5 5L3.5 17.5l3 3 6-6a4 4 0 0 0 5-5l-2.4 2.4-2.3-.7-.7-2.3z"/>',
  restart: '<path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3"/><path d="M4 4v5h5"/>',
  stress: '<path d="M2.5 18h19M4.5 18l3.75-9 3.75 9 3.75-9 3.75 9M8.25 9h7.5"/>',
  speed: '<path d="M3.5 6l8 6-8 6zM12.5 6l8 6-8 6z"/>',
  hyd: '<path d="M2.5 12h8M10.5 7.5h11v9h-11z"/><path d="M14 7.5v9"/>',
  lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
};
const icon = k => `<span class="ico"><svg viewBox="0 0 24 24" aria-hidden="true">${ICON[k]}</svg></span>`;
const STAR = on => `<svg class="star${on ? ' on' : ''}" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.6l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.4l-5.8 3.1 1.1-6.5L2.6 9.4l6.5-.9z"/></svg>`;
document.querySelectorAll('[data-ico]').forEach(el => { el.outerHTML = icon(el.dataset.ico); });

const fmt = n => n === Infinity ? '∞' : Math.round(n).toLocaleString('de-DE') + ' €';
const fmtM = n => n.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' m';

// ---------- Speicher ----------
const SAVE_KEY = 'brueckenbauer.v1';
let save = { progress: {}, designs: {}, hints: {}, unlockAll: false, sandboxSet: 0 };
try { const s = JSON.parse(localStorage.getItem(SAVE_KEY)); if (s) save = Object.assign(save, s); } catch (e) {}
const persist = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) {} };

// ---------- Zustand ----------
const MAT_STYLE = {
  road: { fill: '#5b5e6c', edge: '#2c2d35', hi: '#a3a8b6' },
  wood: { fill: '#cf8d4c', edge: '#7a4a22', hi: '#e8b47a' },
  steel: { fill: '#4b97c6', edge: '#22587a', hi: '#8cc8ea' },
  rope: { fill: '#d2c0f3', edge: '#6e5c9a' },
  hyd: { fill: '#f3c331', edge: '#86650e', rod: '#dfe3e8', rodEdge: '#69707a' },
};
const GRID = 0.5;
const SPEEDS = [0.5, 1, 2];
let mode = 'levels';
let L = LEVELS[0], geo = prepLevel(L), deco = null;
let design = { nodes: [], beams: [], seq: 1 };
let nodeMap = new Map();
let tool = 'road', snap = true, stressView = true, speedIdx = 1;
let sim = null, acc = 0, resultAt = 0, resultShown = false;
let undo = [], redo = [];
let drag = null, hover = null;
const cam = { x: 0, y: 0, s: 40 };
let fx = [];
let time = 0;
let vehicles = [];

const isAnchor = id => id[0] === 'a';
function rebuildMap() {
  nodeMap = new Map();
  for (const a of geo.anchors) nodeMap.set(a.id, a);
  for (const n of design.nodes) nodeMap.set(n.id, n);
}
const allNodes = () => geo.anchors.concat(design.nodes);
const isFixed = n => isAnchor(n.id) || n.fixed;

// ---------- Level laden ----------
function vehicleList() { return L.sandbox ? SANDBOX_SETS[save.sandboxSet % SANDBOX_SETS.length] : L.vehicles; }
function levelIndex() { return LEVELS.indexOf(L); }

function openLevel(lv) {
  L = lv; geo = prepLevel(L);
  const saved = save.designs[L.id];
  design = saved ? JSON.parse(JSON.stringify(saved)) : { nodes: [], beams: [], seq: 1 };
  rebuildMap();
  undo = []; redo = []; sim = null; fx = []; drag = null;
  deco = makeDeco();
  if (!L.mats.includes(tool) && tool !== 'move' && tool !== 'erase') tool = L.mats[0];
  if (tool === 'pillar' && !L.pillars) tool = L.mats[0];
  vehicles = vehicleList();
  fitCamera();
  setMode('edit');
  const idx = levelIndex();
  $('#lvlName').textContent = L.sandbox ? 'Sandkasten' : `${idx + 1} · ${L.name}`;
  if (!save.hints[L.id]) showHint(); else $('#hint').hidden = true;
}

function showHint() {
  $('#hintText').innerHTML = `<b>${L.sandbox ? 'Sandkasten' : 'Level ' + (levelIndex() + 1) + ': ' + L.name}</b>${L.hint}`;
  $('#hint').hidden = false;
}
$('#hintOk').onclick = () => { $('#hint').hidden = true; save.hints[L.id] = 1; persist(); };

function fitCamera() {
  const v = Object.assign({}, geo.view);
  if (H > W) { v.x0 = -2.5; v.x1 = geo.span + 2.5; }
  const top = 80, bottom = W < 720 ? 170 : 110;
  const vw = v.x1 - v.x0, vh = v.y1 - v.y0;
  cam.s = Math.max(8, Math.min(W / vw, (H - top - bottom) / vh));
  cam.x = (v.x0 + v.x1) / 2;
  const cy = (v.y0 + v.y1) / 2, sy = (top + H - bottom) / 2;
  cam.y = cy - (H / 2 - sy) / cam.s;
}

// Deko je Level (Palmen, Büsche, Steine), deterministisch
function makeDeco() {
  let seed = 7;
  for (const ch of L.id) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  const rnd = () => { seed ^= seed << 13; seed >>>= 0; seed ^= seed >>> 17; seed ^= seed << 5; seed >>>= 0; return seed / 4294967296; };
  const d = { palms: [], bushes: [], tufts: [], stones: [], strata: [] };
  const sides = [[-30, -3.5, geo.yL], [geo.span + 3.5, geo.span + 30, geo.yR]];
  for (const [a, b, y] of sides) {
    for (let i = 0; i < 4; i++) d.palms.push({ x: a + (b - a) * (i + rnd() * 0.6) / 4, y, h: 3.2 + rnd() * 2.6, lean: (rnd() - 0.5) * 1.6, ph: rnd() * 6 });
    for (let i = 0; i < 7; i++) d.bushes.push({ x: a + (b - a) * rnd(), y: y - 0.55 - rnd() * 0.5, r: 0.35 + rnd() * 0.4 });
    for (let i = 0; i < 18; i++) d.tufts.push({ x: a + (b - a) * rnd(), y: y - 0.6 - rnd() * 6, s: 0.25 + rnd() * 0.3 });
    for (let i = 0; i < 10; i++) d.stones.push({ x: a + (b - a) * rnd(), y: y - 1.4 - rnd() * 8, r: 0.15 + rnd() * 0.35 });
  }
  for (let i = 0; i < 6; i++) d.strata.push({ y: geo.yL - 1.5 - i * 1.9 - rnd(), a: 0.1 + rnd() * 0.25, f: 0.3 + rnd() * 0.4, ph: rnd() * 6 });
  return d;
}

// ---------- Modus ----------
function setMode(m) {
  mode = m;
  $('#levels').hidden = m !== 'levels';
  const inGame = m === 'edit' || m === 'sim';
  $('#hudL').hidden = $('#hudR').hidden = $('#dock').hidden = $('#playBox').hidden = !inGame;
  if (m !== 'edit') $('#hint').hidden = true;
  buildToolbar();
  updateHUD();
}

function buildToolbar() {
  const t = $('#tools');
  const bp = $('#btnPlay');
  if (mode === 'sim') {
    const hydBtn = sim && sim.hasHyd && !geo.boat;
    t.innerHTML =
      `<button class="tool" data-act="restart">${icon('restart')}Neustart</button>` +
      `<button class="tool${stressView ? ' on' : ''}" data-act="stress">${icon('stress')}Belastung</button>` +
      `<button class="tool" data-act="speed">${icon('speed')}Tempo ${SPEEDS[speedIdx].toLocaleString('de-DE')}×</button>` +
      (hydBtn ? `<button class="tool${sim.hydTarget ? ' on' : ''}" data-act="hyd">${icon('hyd')}Hydraulik</button>` : '');
    bp.className = 'build'; bp.innerHTML = `<span class="ico">${'<svg viewBox="0 0 24 24">' + ICON.build + '</svg>'}</span>Bauen`;
    bp.setAttribute('aria-label', 'Zurück zum Bauen');
  } else {
    let h = '';
    L.mats.forEach((k, i) => {
      const m = MATERIALS[k], st = MAT_STYLE[k];
      h += `<button class="tool${tool === k ? ' on' : ''}" data-tool="${k}" title="${m.name} (${i + 1})"><span class="sw" style="background:${st.fill}"></span>${m.name}<span class="len">${fmt(m.cost)}/m · max ${m.maxLen} m</span></button>`;
    });
    if (L.pillars) h += `<button class="tool${tool === 'pillar' ? ' on' : ''}" data-tool="pillar">${icon('pillar')}Pfeiler</button>`;
    h += '<span class="sep"></span>';
    h += `<button class="tool${tool === 'move' ? ' on' : ''}" data-tool="move">${icon('move')}Bewegen</button>`;
    h += `<button class="tool${tool === 'erase' ? ' on' : ''}" data-tool="erase">${icon('erase')}Löschen</button>`;
    h += '<span class="sep"></span>';
    h += `<button class="tool" data-act="undo" ${undo.length ? '' : 'disabled'}>${icon('undo')}Zurück</button>`;
    h += `<button class="tool" data-act="redo" ${redo.length ? '' : 'disabled'}>${icon('redo')}Vor</button>`;
    h += `<button class="tool${snap ? ' on' : ''}" data-act="snap">${icon('grid')}Raster</button>`;
    t.innerHTML = h;
    bp.className = ''; bp.innerHTML = `<span class="ico"><svg viewBox="0 0 24 24">${ICON.play}</svg></span>Testen`;
    bp.setAttribute('aria-label', 'Brücke testen');
  }
}

$('#tools').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b || b.disabled) return;
  if (b.dataset.tool) { tool = b.dataset.tool; buildToolbar(); return; }
  const a = b.dataset.act;
  if (a === 'undo') doUndo();
  else if (a === 'redo') doRedo();
  else if (a === 'snap') { snap = !snap; buildToolbar(); }
  else if (a === 'restart') startSim();
  else if (a === 'stress') { stressView = !stressView; buildToolbar(); }
  else if (a === 'speed') { speedIdx = (speedIdx + 1) % SPEEDS.length; buildToolbar(); }
  else if (a === 'hyd' && sim) { sim.manualHyd = true; sim.hydTarget = sim.hydTarget ? 0 : 1; buildToolbar(); }
});
$('#btnPlay').onclick = () => { if (mode === 'sim') stopSim(); else if (mode === 'edit') startSim(); };

function updateHUD() {
  if (mode !== 'edit' && mode !== 'sim') return;
  const cost = designCost(design, geo);
  const over = cost > L.budget;
  $('#costVal').textContent = fmt(cost);
  $('#costMax').textContent = L.budget === Infinity ? '' : '/ ' + fmt(L.budget);
  $('#costChip').classList.toggle('over', over);
  const nb = geo.balls.length;
  $('#ballChip').hidden = !nb;
  $('#ballVal').textContent = `${sim ? sim.ballsGot : 0}/${nb}`;
  const vc = $('#vehChip');
  vc.hidden = !(L.sandbox && mode === 'edit');
  if (!vc.hidden) vc.textContent = 'Fahrzeuge: ' + vehicles.map(k => VEHICLES[k].name).join(', ');
  const sc = $('#statusChip');
  sc.hidden = mode !== 'sim';
  if (sim) {
    let s = `Im Ziel ${sim.vDone}/${sim.vehicles.length}`;
    if (sim.hasHyd) s += sim.hyd > 0.02 ? ' · Hydraulik ein' : '';
    if (geo.boat && sim.t < geo.boat.t0 + geo.boat.dur) s = 'Schiff kommt …';
    sc.textContent = s;
  }
}
$('#vehChip').onclick = () => {
  save.sandboxSet = (save.sandboxSet + 1) % SANDBOX_SETS.length; persist();
  vehicles = vehicleList(); updateHUD();
};

let toastT = 0;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 1800); }

// ---------- Bearbeiten ----------
function snapshot() { return JSON.stringify(design); }
function pushUndo(s) { undo.push(s ?? snapshot()); if (undo.length > 100) undo.shift(); redo = []; }
function restore(s) { design = JSON.parse(s); rebuildMap(); changed(false); }
function doUndo() { if (!undo.length) return; redo.push(snapshot()); restore(undo.pop()); }
function doRedo() { if (!redo.length) return; undo.push(snapshot()); restore(redo.pop()); }
function changed(rebuild = true) {
  if (rebuild) rebuildMap();
  save.designs[L.id] = design; persist();
  updateHUD(); if (mode === 'edit') buildToolbar();
}

function addNode(x, y, extra) {
  const n = Object.assign({ id: 'n' + design.seq++, x: +x.toFixed(4), y: +y.toFixed(4) }, extra || {});
  design.nodes.push(n); return n;
}
function cleanupOrphans() {
  const used = new Set();
  for (const b of design.beams) { used.add(b.a); used.add(b.b); }
  design.nodes = design.nodes.filter(n => n.pillar || used.has(n.id));
}
function hitNode(w, tol, filter) {
  let best = null, bd = tol;
  for (const n of allNodes()) {
    if (filter && !filter(n)) continue;
    const d = Math.hypot(n.x - w.x, n.y - w.y);
    if (d < bd) { bd = d; best = n; }
  }
  return best;
}
function distSeg(px, py, ax, ay, bx, by) {
  const ex = bx - ax, ey = by - ay, l2 = ex * ex + ey * ey;
  let t = l2 ? ((px - ax) * ex + (py - ay) * ey) / l2 : 0; t = clamp(t, 0, 1);
  return Math.hypot(px - ax - ex * t, py - ay - ey * t);
}
function hitBeam(w, tol) {
  let best = null, bd = tol;
  for (const b of design.beams) {
    const a = nodeMap.get(b.a), c = nodeMap.get(b.b);
    if (!a || !c) continue;
    const d = distSeg(w.x, w.y, a.x, a.y, c.x, c.y);
    if (d < bd) { bd = d; best = b; }
  }
  return best;
}
const snapV = v => Math.round(v / GRID) * GRID;
function placeEnd(s, w, maxLen) {
  let dx = w.x - s.x, dy = w.y - s.y; const d = Math.hypot(dx, dy);
  let tx = w.x, ty = w.y;
  if (d > maxLen) { tx = s.x + dx / d * maxLen; ty = s.y + dy / d * maxLen; }
  if (!snap) return { x: tx, y: ty };
  let best = null, bd = 1e9;
  const bx = Math.floor(tx / GRID), by = Math.floor(ty / GRID);
  for (let i = -1; i <= 2; i++) for (let j = -1; j <= 2; j++) {
    const cx = (bx + i) * GRID, cy = (by + j) * GRID;
    if (Math.hypot(cx - s.x, cy - s.y) > maxLen + 1e-6) continue;
    const dd = Math.hypot(cx - tx, cy - ty);
    if (dd < bd) { bd = dd; best = { x: cx, y: cy }; }
  }
  return best || { x: tx, y: ty };
}
function inNoBuild(ax, ay, bx, by) {
  for (const z of geo.noBuild) if (segRect(ax, ay, bx, by, z[0], z[1], z[2], z[3])) return true;
  return false;
}
function beamProblem(a, b, mat) {
  const len = Math.hypot(a.x - b.x, a.y - b.y);
  if (len < 0.25) return 'zu kurz';
  if (len > MATERIALS[mat].maxLen + 1e-6) return `zu lang (max. ${MATERIALS[mat].maxLen} m)`;
  if (inNoBuild(a.x, a.y, b.x, b.y)) return 'Hier darf nicht gebaut werden';
  return '';
}
function eraseAt(w, tol) {
  const n = hitNode(w, tol * 0.8, n => !isAnchor(n.id));
  if (n) {
    design.beams = design.beams.filter(b => b.a !== n.id && b.b !== n.id);
    design.nodes = design.nodes.filter(m => m !== n);
    cleanupOrphans(); rebuildMap(); return true;
  }
  const b = hitBeam(w, tol * 0.7);
  if (b) { design.beams = design.beams.filter(x => x !== b); cleanupOrphans(); rebuildMap(); return true; }
  return false;
}
function pillarProblem(p) {
  if (p.x < 1.4 || p.x > geo.span - 1.4) return 'Pfeiler nur im Flussbett möglich';
  const ground = geo.floorAt(p.x);
  if (p.y < ground + 0.5) return 'Zu nah am Boden';
  if (p.y > Math.max(geo.yL, geo.yR) + 0.5) return 'Pfeiler höchstens bis Straßenhöhe';
  if (geo.boat && p.x > geo.boat.x0 - 0.5 && p.x < geo.boat.x1 + 0.5) return 'Der Pfeiler würde das Schiff blockieren';
  if (inNoBuild(p.x, ground, p.x, p.y)) return 'Hier darf nicht gebaut werden';
  return '';
}
function placePillar(w) {
  const p = snap ? { x: snapV(w.x), y: snapV(w.y) } : { x: w.x, y: w.y };
  const existing = hitNode(p, 0.3);
  if (existing && isAnchor(existing.id)) return;
  const prob = pillarProblem(p);
  if (prob) { toast(prob); return; }
  pushUndo();
  if (existing) { existing.fixed = true; existing.pillar = true; existing.ground = geo.floorAt(existing.x); }
  else addNode(p.x, p.y, { fixed: true, pillar: true, ground: geo.floorAt(p.x) });
  changed();
}

// ---------- Kamera / Koordinaten ----------
const toWorld = (sx, sy) => ({ x: (sx - W / 2) / cam.s + cam.x, y: cam.y - (sy - H / 2) / cam.s });
function setWorld() { ctx.setTransform(DPR * cam.s, 0, 0, -DPR * cam.s, DPR * (W / 2 - cam.x * cam.s), DPR * (H / 2 + cam.y * cam.s)); }
function setScreen() { ctx.setTransform(DPR, 0, 0, DPR, 0, 0); }
const toScreen = (x, y) => [(x - cam.x) * cam.s + W / 2, H / 2 - (y - cam.y) * cam.s];
function zoomAt(sx, sy, f) {
  const w = toWorld(sx, sy);
  cam.s = clamp(cam.s * f, 6, 180);
  cam.x = w.x - (sx - W / 2) / cam.s; cam.y = w.y + (sy - H / 2) / cam.s;
}

// ---------- Eingabe ----------
const pointers = new Map();
let pinch = null;
cv.addEventListener('contextmenu', e => e.preventDefault());
cv.addEventListener('pointerdown', e => {
  if (mode === 'levels') return;
  cv.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 2) {
    if (drag && drag.type === 'move') { drag.node.x = drag.ox; drag.node.y = drag.oy; }
    if (drag && drag.type === 'erase' && drag.changed) { restore(drag.snap); }
    drag = null;
    const [p1, p2] = [...pointers.values()];
    pinch = { d: Math.hypot(p1.x - p2.x, p1.y - p2.y), cx: (p1.x + p2.x) / 2, cy: (p1.y + p2.y) / 2 };
    return;
  }
  if (pointers.size > 2) return;
  if (e.button === 1 || e.button === 2) { drag = { type: 'pan', sx: e.clientX, sy: e.clientY, cx: cam.x, cy: cam.y, moved: 99 }; return; }
  down(e.clientX, e.clientY, e.pointerType);
});
cv.addEventListener('pointermove', e => {
  const p = pointers.get(e.pointerId);
  if (p) { p.x = e.clientX; p.y = e.clientY; }
  if (pinch && pointers.size >= 2) {
    const [p1, p2] = [...pointers.values()];
    const d = Math.hypot(p1.x - p2.x, p1.y - p2.y), cx = (p1.x + p2.x) / 2, cy = (p1.y + p2.y) / 2;
    cam.x -= (cx - pinch.cx) / cam.s; cam.y += (cy - pinch.cy) / cam.s;
    if (pinch.d > 10) zoomAt(cx, cy, d / pinch.d);
    pinch.d = d; pinch.cx = cx; pinch.cy = cy;
    return;
  }
  if (drag) moveTo(e.clientX, e.clientY);
  else if (e.pointerType === 'mouse' && mode === 'edit') {
    const w = toWorld(e.clientX, e.clientY);
    hover = hitNode(w, Math.max(0.3, 16 / cam.s));
  }
});
const endPointer = e => {
  if (!pointers.has(e.pointerId)) return;
  pointers.delete(e.pointerId);
  if (pinch) { if (pointers.size < 2) pinch = null; return; }
  if (drag) up(e.clientX, e.clientY, e.type === 'pointercancel');
};
cv.addEventListener('pointerup', endPointer);
cv.addEventListener('pointercancel', endPointer);
cv.addEventListener('wheel', e => {
  e.preventDefault();
  if (e.ctrlKey || Math.abs(e.deltaY) > Math.abs(e.deltaX)) zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0018)));
  else { cam.x += e.deltaX / cam.s; }
}, { passive: false });

function down(sx, sy, ptype) {
  const w = toWorld(sx, sy);
  const tol = Math.max(0.35, (ptype === 'mouse' ? 14 : 24) / cam.s);
  const pan = extra => { drag = Object.assign({ type: 'pan', sx, sy, cx: cam.x, cy: cam.y, moved: 0 }, extra); };
  if (mode !== 'edit') return pan();
  if (!$('#hint').hidden) { $('#hint').hidden = true; save.hints[L.id] = 1; persist(); }
  if (MATERIALS[tool]) {
    const n = hitNode(w, tol);
    if (n) { drag = { type: 'build', from: n, mat: tool, end: { x: n.x, y: n.y, node: null }, prob: 'zu kurz', tol, sx, sy }; return; }
    return pan({ tap: 'beam' });
  }
  if (tool === 'pillar') return pan({ tap: 'pillar' });
  if (tool === 'move') {
    const n = hitNode(w, tol, n => !isFixed(n));
    if (n) { drag = { type: 'move', node: n, ox: n.x, oy: n.y, snap: snapshot(), ok: true, tol }; return; }
    return pan();
  }
  if (tool === 'erase') {
    drag = { type: 'erase', snap: snapshot(), changed: false, tol };
    if (eraseAt(w, tol)) drag.changed = true;
  }
}
function moveTo(sx, sy) {
  const w = toWorld(sx, sy);
  if (drag.type === 'pan') {
    drag.moved = Math.max(drag.moved, Math.hypot(sx - drag.sx, sy - drag.sy));
    cam.x = drag.cx - (sx - drag.sx) / cam.s; cam.y = drag.cy + (sy - drag.sy) / cam.s;
  } else if (drag.type === 'build') {
    const f = drag.from, m = MATERIALS[drag.mat];
    const tgt = hitNode(w, drag.tol * 0.75, n => n !== f);
    if (tgt && Math.hypot(tgt.x - f.x, tgt.y - f.y) <= m.maxLen + 1e-6) drag.end = { x: tgt.x, y: tgt.y, node: tgt };
    else {
      const p = placeEnd(f, w, m.maxLen);
      const ex = hitNode(p, 0.05, n => n !== f);
      drag.end = { x: p.x, y: p.y, node: ex || null };
    }
    drag.prob = beamProblem(f, drag.end, drag.mat);
    if (!drag.prob && drag.end.node) {
      const dup = design.beams.find(b => (b.a === f.id && b.b === drag.end.node.id) || (b.b === f.id && b.a === drag.end.node.id));
      if (dup && dup.m === drag.mat) drag.prob = 'existiert schon';
    }
  } else if (drag.type === 'move') {
    const n = drag.node;
    const p = snap ? { x: snapV(w.x), y: snapV(w.y) } : w;
    n.x = p.x; n.y = p.y;
    let ok = !allNodes().some(o => o !== n && Math.hypot(o.x - n.x, o.y - n.y) < 0.1);
    for (const b of design.beams) {
      if (b.a !== n.id && b.b !== n.id) continue;
      const o = nodeMap.get(b.a === n.id ? b.b : b.a);
      if (beamProblem(n, o, b.m)) ok = false;
    }
    drag.ok = ok;
  } else if (drag.type === 'erase') {
    if (eraseAt(w, drag.tol)) drag.changed = true;
  }
}
function up(sx, sy, cancelled) {
  const d = drag; drag = null;
  if (cancelled) { if (d.type === 'move') { d.node.x = d.ox; d.node.y = d.oy; } return; }
  if (d.type === 'pan') {
    if (d.moved < 8 && d.tap === 'pillar') placePillar(toWorld(sx, sy));
    else if (d.moved < 8 && d.tap === 'beam') {
      const w = toWorld(sx, sy);
      const b = hitBeam(w, Math.max(0.3, 18 / cam.s));
      if (b && b.m !== tool) {
        const a = nodeMap.get(b.a), c = nodeMap.get(b.b);
        const prob = beamProblem(a, c, tool);
        if (prob) toast(`${MATERIALS[tool].name}: ${prob}`);
        else { pushUndo(); b.m = tool; changed(); toast(`In ${MATERIALS[tool].name} umgewandelt`); }
      }
    }
    return;
  }
  if (d.type === 'build') {
    if (d.prob) { if (d.prob !== 'zu kurz') toast(d.prob); return; }
    pushUndo();
    const endNode = d.end.node || addNode(d.end.x, d.end.y);
    const dup = design.beams.find(b => (b.a === d.from.id && b.b === endNode.id) || (b.b === d.from.id && b.a === endNode.id));
    if (dup) dup.m = d.mat; else design.beams.push({ a: d.from.id, b: endNode.id, m: d.mat });
    changed();
  } else if (d.type === 'move') {
    if (!d.ok) { d.node.x = d.ox; d.node.y = d.oy; toast('Knoten kann dort nicht hin'); return; }
    if (d.node.x !== d.ox || d.node.y !== d.oy) { pushUndo(d.snap); changed(); }
  } else if (d.type === 'erase') {
    if (d.changed) { pushUndo(d.snap); changed(); }
  }
}

window.addEventListener('keydown', e => {
  if (mode !== 'edit' && mode !== 'sim') return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); if (mode === 'edit') (e.shiftKey ? doRedo : doUndo)(); return; }
  if (e.key === ' ') { e.preventDefault(); $('#btnPlay').click(); return; }
  if (e.key === 'Escape') { if (mode === 'sim') stopSim(); else openMenu(); return; }
  if (mode === 'edit' && /^[1-9]$/.test(e.key)) {
    const list = L.mats.concat(L.pillars ? ['pillar'] : []);
    const k = list[+e.key - 1]; if (k) { tool = k; buildToolbar(); }
  }
});

// ---------- Simulation ----------
function startSim() {
  vehicles = vehicleList();
  sim = new Sim(L, geo, design, vehicles);
  acc = 0; resultShown = false; resultAt = 0; fx = [];
  $('#result').hidden = true;
  setMode('sim');
}
function stopSim() { sim = null; fx = []; $('#result').hidden = true; setMode('edit'); }

function handleEvents() {
  for (const e of sim.events) {
    if (e.type === 'break') {
      const st = MAT_STYLE[e.mat];
      for (let i = 0; i < 10; i++) fx.push({ k: 'chip', x: e.ex, y: e.ey, vx: (Math.random() - 0.5) * 5, vy: Math.random() * 4 + 1, life: 1.2, max: 1.2, c: st.fill, s: 0.08 + Math.random() * 0.08, r: Math.random() * 6 });
      fx.push({ k: 'puff', x: e.ex, y: e.ey, life: 0.5, max: 0.5, s: 0.6 });
    } else if (e.type === 'splash') {
      for (let i = 0; i < 26; i++) fx.push({ k: 'drop', x: e.x + (Math.random() - 0.5) * 2, y: e.y, vx: (Math.random() - 0.5) * 4, vy: 3 + Math.random() * 5, life: 1.3, max: 1.3, s: 0.08 + Math.random() * 0.1 });
      fx.push({ k: 'ring', x: e.x, y: e.y, life: 1.2, max: 1.2 });
    } else if (e.type === 'ball') {
      const cols = ['#ef4f3f', '#2f8de4', '#ffc42e', '#fff', '#3fbf6a'];
      for (let i = 0; i < 22; i++) fx.push({ k: 'chip', x: e.x, y: e.y, vx: (Math.random() - 0.5) * 6, vy: Math.random() * 6, life: 1.4, max: 1.4, c: cols[i % 5], s: 0.07 + Math.random() * 0.06, r: Math.random() * 6 });
      fx.push({ k: 'text', x: e.x, y: e.y + 0.6, life: 1.2, max: 1.2, t: '+1' });
    } else if (e.type === 'done') {
      fx.push({ k: 'text', x: geo.finishX - 1, y: geo.yR + 3.6, life: 1.4, max: 1.4, t: '✓' });
    }
  }
  sim.events.length = 0;
}

function stars(cost, ok) {
  if (!ok) return [false, false, false];
  const inB = cost <= L.budget;
  const third = geo.balls.length ? sim.ballsGot === geo.balls.length : cost <= L.budget * 0.85;
  return [true, inB, inB && third];
}

function showResult() {
  resultShown = true;
  const r = sim.result, cost = designCost(design, geo);
  const ok = r.ok;
  const st = stars(cost, ok);
  const n = st.filter(Boolean).length;
  if (ok && !L.sandbox) {
    const p = save.progress[L.id] || { stars: 0, best: Infinity };
    p.stars = Math.max(p.stars, n);
    if (cost <= L.budget) p.best = Math.min(p.best ?? Infinity, cost);
    save.progress[L.id] = p; persist();
    confetti();
  }
  $('#rTitle').textContent = ok ? (n === 3 ? 'Perfekt gebaut!' : 'Geschafft!') : 'Eingestürzt!';
  $('#rText').textContent = ok ? (L.sandbox ? 'Alle Fahrzeuge sind angekommen.' : 'Alle Fahrzeuge sind sicher am anderen Ufer angekommen.') : r.reason + ' Passe die Brücke an und versuche es noch einmal.';
  $('#rStars').innerHTML = L.sandbox || !ok ? '' : st.map(s => STAR(s)).join('');
  $('#rStars').querySelectorAll('.star.on').forEach((el, i) => el.style.animationDelay = (0.15 + i * 0.18) + 's');
  const nb = geo.balls.length;
  const items = [];
  items.push([ok, 'Alle Fahrzeuge im Ziel', `${sim.vDone}/${sim.vehicles.length}`]);
  if (!L.sandbox) items.push([cost <= L.budget, 'Im Budget', `${fmt(cost)} / ${fmt(L.budget)}`]);
  if (nb) items.push([sim.ballsGot === nb, 'Alle Bälle eingesammelt', `${sim.ballsGot}/${nb}`]);
  else if (!L.sandbox) items.push([cost <= L.budget * 0.85, 'Sparsam: höchstens 85 % des Budgets', `${Math.round(cost / L.budget * 100)} %`]);
  $('#rChecks').innerHTML = items.map(([g, t, v]) => `<li class="${g ? 'ok' : 'no'}"><span class="mk">${g ? '✓' : '✗'}</span>${t}<span class="v">${v}</span></li>`).join('');
  const idx = levelIndex();
  let btns = `<button class="btn ghost" data-r="build">Weiter bauen</button><button class="btn ghost" data-r="again">Nochmal ansehen</button>`;
  if (ok && idx >= 0 && idx < LEVELS.length - 1) btns += `<button class="btn orange" data-r="next">Nächstes Level</button>`;
  else if (ok && idx === LEVELS.length - 1) btns += `<button class="btn orange" data-r="levels">Zur Levelauswahl</button>`;
  $('#rButtons').innerHTML = btns;
  $('#result').hidden = false;
}
$('#rButtons').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  const a = b.dataset.r;
  $('#result').hidden = true;
  if (a === 'build') stopSim();
  else if (a === 'again') startSim();
  else if (a === 'next') openLevel(LEVELS[levelIndex() + 1]);
  else if (a === 'levels') showLevels();
});

function confetti() {
  const cols = ['#ef4f3f', '#2f8de4', '#ffc42e', '#3fbf6a', '#ffffff', '#f28a1e'];
  const w0 = toWorld(0, 0), w1 = toWorld(W, 0);
  for (let i = 0; i < 120; i++) fx.push({ k: 'conf', x: w0.x + (w1.x - w0.x) * Math.random(), y: w0.y + Math.random() * 2, vx: (Math.random() - 0.5) * 2, vy: -Math.random() * 2, life: 4, max: 4, c: cols[i % cols.length], s: (0.12 + Math.random() * 0.12) * 40 / cam.s, r: Math.random() * 6 });
}

// ---------- Menüs ----------
function openMenu() {
  if (mode === 'sim') stopSim();
  const cost = designCost(design, geo);
  $('#menuInfo').textContent = L.sandbox ? 'Sandkasten: Bauen ohne Budget.' : `Level ${levelIndex() + 1}: ${L.name}. Aktuelle Kosten ${fmt(cost)} von ${fmt(L.budget)}.`;
  const c = $('#mClear'); c.textContent = 'Brücke komplett löschen'; c.dataset.confirm = '';
  $('#menu').hidden = false;
}
$('#btnMenu').onclick = openMenu;
$('#mResume').onclick = () => { $('#menu').hidden = true; };
$('#mLevels').onclick = () => { $('#menu').hidden = true; showLevels(); };
$('#mHint').onclick = () => { $('#menu').hidden = true; showHint(); };
$('#mHelp').onclick = () => { $('#menu').hidden = true; $('#help').hidden = false; };
$('#mClear').onclick = () => {
  const c = $('#mClear');
  if (!c.dataset.confirm) { c.dataset.confirm = '1'; c.textContent = 'Wirklich alles löschen? Nochmal tippen'; return; }
  pushUndo(); design = { nodes: [], beams: [], seq: 1 }; changed(); $('#menu').hidden = true; toast('Brücke gelöscht. Mit „Zurück“ rückgängig machen.');
};
$('#helpOk').onclick = () => { $('#help').hidden = true; };
$('#btnHelp2').onclick = () => { $('#help').hidden = false; };
$('#btnUnlock').onclick = () => { save.unlockAll = !save.unlockAll; persist(); renderLevels(); };
for (const id of ['#menu', '#help']) $(id).addEventListener('click', e => { if (e.target === e.currentTarget) e.currentTarget.hidden = true; });

function unlocked(i) { return i === 0 || save.unlockAll || (save.progress[LEVELS[i - 1].id]?.stars > 0); }
function renderLevels() {
  let h = '';
  LEVELS.forEach((lv, i) => {
    const p = save.progress[lv.id]; const s = p?.stars || 0; const ok = unlocked(i);
    const veh = [...new Set(lv.vehicles)].map(k => VEHICLES[k].name).join(', ');
    h += `<button class="card${ok ? '' : ' locked'}" data-i="${i}" ${ok ? '' : 'aria-disabled="true"'}>
      ${ok ? '' : `<span class="lock">${icon('lock')}</span>`}
      <span class="num">${i + 1}</span><span class="nm">${lv.name}</span>
      <span class="veh">${veh} · ${lv.span} m</span>
      <span class="stars">${[0, 1, 2].map(k => STAR(k < s)).join('')}</span></button>`;
  });
  h += `<button class="card sand" data-i="sand"><span class="num">∞</span><span class="nm">Sandkasten</span><span class="veh">Alle Materialien, Pfeiler und Fahrzeuge, kein Budget</span></button>`;
  $('#levelGrid').innerHTML = h;
  $('#btnUnlock').textContent = save.unlockAll ? 'Freischaltung zurücksetzen' : 'Alle Level freischalten';
}
$('#levelGrid').addEventListener('click', e => {
  const c = e.target.closest('.card'); if (!c) return;
  if (c.dataset.i === 'sand') return openLevel(SANDBOX);
  const i = +c.dataset.i;
  if (!unlocked(i)) { toast('Schaffe zuerst das vorherige Level.'); return; }
  openLevel(LEVELS[i]);
});
function showLevels() {
  sim = null; renderLevels();
  if (!deco) deco = makeDeco();
  setMode('levels');
}

// ---------- Zeichnen ----------
function stressColor(r) {
  r = clamp(r, 0, 1);
  const h = 130 - 130 * r;
  return `hsl(${h}, 78%, ${48 - r * 6}%)`;
}
function drawSky() {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#5fb3ec'); g.addColorStop(0.55, '#b5e2f7'); g.addColorStop(1, '#e8f6fa');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  const sx = W * 0.8, sy = H * 0.17;
  const sg = ctx.createRadialGradient(sx, sy, 10, sx, sy, 140);
  sg.addColorStop(0, 'rgba(255,248,210,.95)'); sg.addColorStop(0.3, 'rgba(255,240,180,.45)'); sg.addColorStop(1, 'rgba(255,240,180,0)');
  ctx.fillStyle = sg; ctx.fillRect(sx - 140, sy - 140, 280, 280);
  ctx.fillStyle = '#fff6cf'; ctx.beginPath(); ctx.arc(sx, sy, 38, 0, 7); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.92)';
  for (let i = 0; i < 6; i++) {
    const span = W + 500;
    let x = ((i * 397 + time * (8 + i * 3) - cam.x * 4) % span + span) % span - 250;
    const y = H * (0.07 + ((i * 0.137) % 0.28));
    const k = 0.7 + (i % 3) * 0.25;
    ctx.beginPath();
    ctx.ellipse(x, y, 70 * k, 22 * k, 0, 0, 7); ctx.ellipse(x - 40 * k, y + 6 * k, 40 * k, 18 * k, 0, 0, 7);
    ctx.ellipse(x + 34 * k, y - 10 * k, 44 * k, 24 * k, 0, 0, 7); ctx.ellipse(x + 70 * k, y + 6 * k, 36 * k, 15 * k, 0, 0, 7);
    ctx.fill();
  }
}
function drawHills() {
  const layers = [[0.12, 7, 3.2, '#b3d9d3'], [0.25, 4.6, 2.6, '#95c8b2'], [0.45, 2.6, 2, '#7db794']];
  const se = Math.min(cam.s, 24);
  const horizon = toScreen(0, Math.max(geo.yL, geo.yR))[1];
  layers.forEach(([p, off, amp, col], k) => {
    ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(0, H);
    for (let sx = 0; sx <= W + 16; sx += 16) {
      const u = (sx - W / 2) / se + cam.x * p * cam.s / se;
      const y = off + amp * (0.55 * Math.sin(u * 0.09 + k * 1.7) + 0.3 * Math.sin(u * 0.21 + k) + 0.15 * Math.sin(u * 0.47 + k * 3));
      ctx.lineTo(sx, horizon - y * se);
    }
    ctx.lineTo(W, H); ctx.closePath(); ctx.fill();
  });
}
function poly(pts) { ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); ctx.closePath(); }
function drawWaterBack() {
  const g0 = geo.floor;
  const bed = ctx.createLinearGradient(0, g0, 0, g0 - 8);
  bed.addColorStop(0, geo.dry ? '#d9b779' : '#b99a62'); bed.addColorStop(1, '#a9683b');
  ctx.fillStyle = bed; ctx.fillRect(-5, g0 - 50, geo.span + 10, 50);
  ctx.fillStyle = geo.dry ? '#c9a466' : '#a88a55'; for (let x = 1; x < geo.span; x += 1.7) { ctx.beginPath(); ctx.ellipse(x, g0 + 0.05, 0.4, 0.12, 0, 0, 7); ctx.fill(); }
  if (geo.dry) return;
  const gr = ctx.createLinearGradient(0, geo.water, 0, g0);
  gr.addColorStop(0, '#5cc3e8'); gr.addColorStop(1, '#2378a8');
  ctx.fillStyle = gr; ctx.fillRect(-5, g0, geo.span + 10, geo.water - g0);
}
function waveTop(x) { return geo.water + Math.sin(x * 1.3 + time * 1.6) * 0.06 + Math.sin(x * 0.55 - time * 0.9) * 0.05; }
function drawWaterFront() {
  if (geo.dry) return;
  ctx.save(); poly(geo.valley); ctx.clip();
  ctx.fillStyle = 'rgba(60,170,220,.45)';
  ctx.beginPath(); ctx.moveTo(-5, geo.floor);
  for (let x = -5; x <= geo.span + 5; x += 0.25) ctx.lineTo(x, waveTop(x));
  ctx.lineTo(geo.span + 5, geo.floor); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.lineWidth = 0.07; ctx.beginPath();
  for (let x = -5; x <= geo.span + 5; x += 0.25) { const y = waveTop(x); x === -5 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 0.05;
  for (let i = 0; i < 8; i++) {
    const x = ((i * 3.7 + time * 0.4) % (geo.span + 4)) - 1, y = geo.water - 0.5 - (i % 3) * 0.6;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 0.8, y); ctx.stroke();
  }
  ctx.restore();
}
function drawCliff(pts, yTop, side) {
  const gr = ctx.createLinearGradient(0, yTop, 0, geo.floor - 2);
  gr.addColorStop(0, '#f4cf78'); gr.addColorStop(0.25, '#e6a659'); gr.addColorStop(1, '#a9683b');
  ctx.fillStyle = gr; poly(pts); ctx.fill();
  ctx.save(); poly(pts); ctx.clip();
  for (const s of deco.strata) {
    ctx.strokeStyle = `rgba(120,60,25,${s.a * 0.6})`; ctx.lineWidth = 0.35; ctx.beginPath();
    for (let x = -40; x <= geo.span + 40; x += 1) { const y = s.y + Math.sin(x * s.f + s.ph) * 0.3; x === -40 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(140,80,40,.35)';
  for (const st of deco.stones) { ctx.beginPath(); ctx.ellipse(st.x, st.y, st.r, st.r * 0.7, 0, 0, 7); ctx.fill(); }
  ctx.restore();
  ctx.strokeStyle = '#9a5c33'; ctx.lineWidth = 0.07;
  ctx.beginPath(); for (let i = 1; i < 5; i++) { i === 1 ? ctx.moveTo(pts[i][0], pts[i][1]) : ctx.lineTo(pts[i][0], pts[i][1]); } ctx.stroke();
}
function drawRock(r) {
  const gr = ctx.createLinearGradient(r.x - r.w, 0, r.x + r.w, 0);
  gr.addColorStop(0, '#b3a89c'); gr.addColorStop(1, '#857a70');
  ctx.fillStyle = gr; poly(r.poly); ctx.fill();
  ctx.strokeStyle = '#6d635b'; ctx.lineWidth = 0.07; ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.beginPath(); ctx.moveTo(r.poly[1][0], r.poly[1][1]); ctx.lineTo(r.poly[2][0], r.poly[2][1]); ctx.lineTo(r.x, r.top - 0.15); ctx.lineTo(r.x - r.w * 0.2, r.top - 1.2); ctx.closePath(); ctx.fill();
}
function drawTower(t) {
  const w = 0.7, y0 = t.base - 0.3;
  ctx.fillStyle = '#ece6da'; ctx.fillRect(t.x - w / 2, y0, w, t.top - y0);
  ctx.fillStyle = '#d2c9b9'; ctx.fillRect(t.x + w * 0.12, y0, w * 0.38, t.top - y0);
  ctx.fillStyle = '#c4baa8';
  for (let y = y0 + 1.2; y < t.top - 0.6; y += 1.6) ctx.fillRect(t.x - w / 2, y, w, 0.08);
  ctx.fillStyle = '#e2dbcd'; ctx.fillRect(t.x - 0.55, t.top - 0.35, 1.1, 0.35);
  ctx.strokeStyle = '#9d9383'; ctx.lineWidth = 0.05; ctx.strokeRect(t.x - w / 2, y0, w, t.top - y0);
}
function drawPalm(p) {
  const sway = Math.sin(time * 0.8 + p.ph) * 0.12;
  const tx = p.x + p.lean + sway, ty = p.y + p.h;
  ctx.strokeStyle = '#8a5a32'; ctx.lineCap = 'round';
  const n = 8;
  for (let i = 0; i < n; i++) {
    const t0 = i / n, t1 = (i + 1) / n;
    const x0 = p.x + (tx - p.x) * t0 * t0, y0 = p.y + p.h * t0, x1 = p.x + (tx - p.x) * t1 * t1, y1 = p.y + p.h * t1;
    ctx.lineWidth = 0.32 - 0.15 * t0; ctx.strokeStyle = i % 2 ? '#8a5a32' : '#9e6a3c';
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
  }
  const leaves = [-2.6, -1.9, -1.0, -0.2, 0.6, 1.4, 2.2];
  leaves.forEach((a0, i) => {
    const a = a0 * 0.55 + Math.PI / 2 + sway * 0.6;
    const len = 1.6 + (i % 2) * 0.4;
    const ex = tx + Math.cos(a) * len, ey = ty + Math.sin(a) * len * 0.75 - 0.6 * Math.abs(Math.cos(a));
    const nx = -Math.sin(a) * 0.35, ny = Math.cos(a) * 0.35;
    const mx = (tx + ex) / 2, my = (ty + ey) / 2 + 0.45;
    ctx.fillStyle = i % 2 ? '#4f9a3c' : '#62b149';
    ctx.beginPath(); ctx.moveTo(tx, ty);
    ctx.quadraticCurveTo(mx + nx, my + ny, ex, ey);
    ctx.quadraticCurveTo(mx - nx * 0.4, my - ny * 0.4 - 0.1, tx, ty);
    ctx.fill();
  });
  ctx.fillStyle = '#6b4424'; ctx.beginPath(); ctx.arc(tx - 0.1, ty - 0.12, 0.13, 0, 7); ctx.arc(tx + 0.12, ty - 0.08, 0.12, 0, 7); ctx.fill();
}
function drawBush(b) {
  ctx.fillStyle = '#4e9a3e'; ctx.beginPath(); ctx.arc(b.x - b.r * 0.6, b.y, b.r * 0.8, 0, 7); ctx.arc(b.x + b.r * 0.6, b.y, b.r * 0.75, 0, 7); ctx.fill();
  ctx.fillStyle = '#66b74d'; ctx.beginPath(); ctx.arc(b.x, b.y + b.r * 0.35, b.r, 0, 7); ctx.fill();
}
function drawTuft(t) {
  ctx.strokeStyle = '#8fae46'; ctx.lineWidth = 0.05; ctx.lineCap = 'round'; ctx.beginPath();
  for (let i = -2; i <= 2; i++) { ctx.moveTo(t.x + i * 0.05, t.y); ctx.lineTo(t.x + i * 0.14 * t.s * 3, t.y + t.s * (1 - Math.abs(i) * 0.2)); }
  ctx.stroke();
}
function drawGroundRoad(x0, x1, y) {
  const top = y + ROAD_HALF;
  ctx.fillStyle = '#ddd6c8'; ctx.fillRect(x0, top - 0.75, x1 - x0, 0.3);
  ctx.fillStyle = '#5b5e6c'; ctx.fillRect(x0, top - 0.45, x1 - x0, 0.45);
  ctx.fillStyle = '#9ea3b0'; ctx.fillRect(x0, top - 0.05, x1 - x0, 0.05);
  ctx.fillStyle = '#f4f1e8';
  for (let x = Math.ceil(x0 / 2.5) * 2.5; x < x1 - 1; x += 2.5) ctx.fillRect(x, top - 0.25, 1.2, 0.07);
}
function drawAbutment(xEdge, y, dir) {
  const low = Math.min(y, ...geo.anchors.filter(a => Math.abs(a.x - xEdge) < 0.01).map(a => a.y)) - 0.45;
  const x0 = dir < 0 ? xEdge - 1.6 : xEdge, x1 = dir < 0 ? xEdge : xEdge + 1.6;
  ctx.fillStyle = '#ece6da'; ctx.fillRect(x0, low, x1 - x0, y - 0.6 - low);
  ctx.fillStyle = '#d6cdbd'; ctx.fillRect(dir < 0 ? x1 - 0.3 : x0, low, 0.3, y - 0.6 - low);
  ctx.strokeStyle = '#a69c8a'; ctx.lineWidth = 0.05; ctx.strokeRect(x0, low, x1 - x0, y - 0.6 - low);
  ctx.fillStyle = '#c9bfad';
  for (let yy = low + 0.6; yy < y - 0.8; yy += 0.9) ctx.fillRect(x0 + 0.15, yy, x1 - x0 - 0.3, 0.05);
}
function drawFlag() {
  const x = geo.finishX - 0.5, y = geo.yR + ROAD_HALF;
  ctx.strokeStyle = '#59606b'; ctx.lineWidth = 0.1; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + 3.6); ctx.stroke();
  const cw = 0.3, rows = 3, cols = 5;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const wv = Math.sin(time * 4 + c * 0.9) * 0.08 * c / cols;
    ctx.fillStyle = (r + c) % 2 ? '#1f2530' : '#ffffff';
    ctx.fillRect(x + c * cw, y + 3.5 - (r + 1) * cw + wv, cw, cw);
  }
}
function drawPowerLine(z) {
  const yTop = Math.min(z[3], geo.yL + 5.5);
  for (const px of [z[0] - 2.5, z[2] + 2.5]) {
    const base = px < geo.span / 2 ? geo.yL : geo.yR;
    ctx.strokeStyle = '#6d5b48'; ctx.lineWidth = 0.16; ctx.beginPath(); ctx.moveTo(px, base); ctx.lineTo(px, yTop + 0.4); ctx.stroke();
    ctx.lineWidth = 0.1; ctx.beginPath(); ctx.moveTo(px - 0.7, yTop + 0.2); ctx.lineTo(px + 0.7, yTop + 0.2); ctx.stroke();
  }
  ctx.strokeStyle = '#2a2f38'; ctx.lineWidth = 0.035;
  for (const off of [-0.6, 0, 0.6]) {
    ctx.beginPath(); ctx.moveTo(z[0] - 2.5 + off, yTop + 0.2);
    ctx.quadraticCurveTo((z[0] + z[2]) / 2, yTop - 1.2, z[2] + 2.5 + off, yTop + 0.2); ctx.stroke();
  }
}
function drawNoBuild(z) {
  ctx.save();
  const y0 = Math.max(z[1], geo.view.y0), y1 = Math.min(z[3], geo.view.y1);
  ctx.beginPath(); ctx.rect(z[0], y0, z[2] - z[0], y1 - y0); ctx.clip();
  ctx.fillStyle = 'rgba(217,68,58,.10)'; ctx.fill();
  ctx.strokeStyle = 'rgba(217,68,58,.30)'; ctx.lineWidth = 0.08;
  for (let x = z[0] - 30; x < z[2]; x += 0.8) { ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x + 30, y0 + 30); ctx.stroke(); }
  ctx.restore();
  ctx.setLineDash([0.3, 0.2]); ctx.strokeStyle = 'rgba(190,50,40,.7)'; ctx.lineWidth = 0.06;
  ctx.strokeRect(z[0], y0, z[2] - z[0], y1 - y0); ctx.setLineDash([]);
}
function drawBoatZone(b) {
  ctx.fillStyle = 'rgba(255,255,255,.16)'; ctx.fillRect(b.x0, geo.water, b.x1 - b.x0, b.top - geo.water);
  ctx.setLineDash([0.3, 0.22]); ctx.strokeStyle = 'rgba(255,255,255,.95)'; ctx.lineWidth = 0.07;
  ctx.strokeRect(b.x0, geo.water, b.x1 - b.x0, b.top - geo.water); ctx.setLineDash([]);
  ctx.globalAlpha = 0.6; drawBoatShape((b.x0 + b.x1) / 2, geo.water, b, 0.55); ctx.globalAlpha = 1;
}
function drawBoatShape(cx, y, b, k) {
  const hw = (b.x1 - b.x0) * 0.42 * k, hh = 0.9 * k, mast = (b.top - geo.water - 0.3) * k;
  ctx.fillStyle = '#e4574a'; ctx.beginPath();
  ctx.moveTo(cx - hw, y + hh); ctx.lineTo(cx + hw * 1.1, y + hh); ctx.lineTo(cx + hw * 0.8, y - 0.3 * k); ctx.lineTo(cx - hw * 0.85, y - 0.3 * k); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.fillRect(cx - hw * 0.95, y + hh * 0.55, hw * 2, 0.14 * k);
  ctx.strokeStyle = '#6b4a2b'; ctx.lineWidth = 0.12 * k; ctx.beginPath(); ctx.moveTo(cx, y + hh); ctx.lineTo(cx, y + mast); ctx.stroke();
  ctx.fillStyle = '#fffaf0'; ctx.beginPath(); ctx.moveTo(cx + 0.1 * k, y + mast - 0.2 * k); ctx.lineTo(cx + 0.1 * k, y + hh + 0.3 * k); ctx.lineTo(cx + hw * 0.95, y + hh + 0.3 * k); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#f3efe4'; ctx.beginPath(); ctx.moveTo(cx - 0.1 * k, y + mast * 0.85); ctx.lineTo(cx - 0.1 * k, y + hh + 0.3 * k); ctx.lineTo(cx - hw * 0.75, y + hh + 0.3 * k); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#2f8de4'; ctx.beginPath(); ctx.moveTo(cx, y + mast); ctx.lineTo(cx + 0.7 * k, y + mast - 0.2 * k); ctx.lineTo(cx, y + mast - 0.4 * k); ctx.fill();
}
function boatState() {
  const b = geo.boat; if (!b || !sim) return null;
  const t = sim.t;
  if (t < b.t0 - 6) return null;
  if (t < b.t0) { const a = (t - (b.t0 - 6)) / 6; return { k: 0.45 + 0.55 * a, alpha: Math.min(1, a * 2), front: false }; }
  if (t < b.t0 + b.dur) return { k: 1, alpha: 1, front: false };
  const a = (t - b.t0 - b.dur) / 3.5; if (a > 1) return null;
  return { k: 1 + 0.4 * a, alpha: 1 - a, front: true };
}
function drawBoat(front) {
  const s = boatState(); if (!s || s.front !== front) return;
  const b = geo.boat;
  ctx.globalAlpha = s.alpha;
  drawBoatShape((b.x0 + b.x1) / 2, geo.water + Math.sin(time * 2) * 0.05, b, s.k);
  ctx.globalAlpha = 1;
}
function drawPillar(n) {
  const w = PILLAR.w, g0 = (n.ground ?? geo.floorAt(n.x)) - 0.5;
  const gr = ctx.createLinearGradient(n.x - w / 2, 0, n.x + w / 2, 0);
  gr.addColorStop(0, '#f1ece2'); gr.addColorStop(1, '#c9c0b0');
  ctx.fillStyle = gr; ctx.fillRect(n.x - w / 2, g0, w, n.y - g0 - 0.05);
  ctx.fillStyle = '#e4ddd0'; ctx.fillRect(n.x - w * 0.65, n.y - 0.35, w * 1.3, 0.3);
  ctx.strokeStyle = '#9d9383'; ctx.lineWidth = 0.05; ctx.strokeRect(n.x - w / 2, g0, w, n.y - g0 - 0.05);
}
function drawBeam(ax, ay, bx, by, mat, ratio, opts = {}) {
  const st = MAT_STYLE[mat], m = MATERIALS[mat];
  const col = ratio != null ? stressColor(ratio) : st.fill;
  ctx.lineCap = 'round';
  if (opts.ghost) ctx.globalAlpha = 0.6;
  if (mat === 'hyd') {
    const len = Math.hypot(bx - ax, by - ay) || 1e-6, base = opts.base || len;
    const cl = Math.min(len, base * 0.52), ux = (bx - ax) / len, uy = (by - ay) / len;
    const mx = ax + ux * cl, my = ay + uy * cl;
    ctx.strokeStyle = st.rodEdge; ctx.lineWidth = 0.15; line(mx, my, bx, by);
    ctx.strokeStyle = ratio != null ? col : st.rod; ctx.lineWidth = 0.09; line(mx, my, bx, by);
    ctx.strokeStyle = st.edge; ctx.lineWidth = m.w + 0.07; line(ax, ay, mx, my);
    ctx.strokeStyle = col; ctx.lineWidth = m.w; line(ax, ay, mx, my);
    ctx.strokeStyle = 'rgba(255,255,255,.4)'; ctx.lineWidth = 0.05; line(ax, ay, mx, my);
  } else {
    ctx.strokeStyle = opts.bad ? '#b3261e' : st.edge; ctx.lineWidth = m.w + (mat === 'rope' ? 0.04 : 0.07); line(ax, ay, bx, by);
    ctx.strokeStyle = opts.bad ? '#ff8a80' : col; ctx.lineWidth = m.w; line(ax, ay, bx, by);
    if (st.hi && !opts.bad) {
      const len = Math.hypot(bx - ax, by - ay) || 1e-6;
      let nx = -(by - ay) / len, ny = (bx - ax) / len; if (ny < 0) { nx = -nx; ny = -ny; }
      const o = m.w * 0.28;
      ctx.strokeStyle = ratio != null ? 'rgba(255,255,255,.35)' : st.hi; ctx.lineWidth = mat === 'road' ? 0.045 : 0.04;
      line(ax + nx * o, ay + ny * o, bx + nx * o, by + ny * o);
    }
  }
  ctx.globalAlpha = 1;
}
function line(ax, ay, bx, by) { ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke(); }
function drawNode(x, y, fixed, hl) {
  if (fixed) {
    ctx.fillStyle = '#39414e'; ctx.beginPath(); ctx.arc(x, y, 0.21, 0, 7); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 0.06; ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y, 0.07, 0, 7); ctx.fill();
  } else {
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y, 0.12, 0, 7); ctx.fill();
    ctx.strokeStyle = '#2b3442'; ctx.lineWidth = 0.045; ctx.stroke();
  }
  if (hl) { ctx.strokeStyle = '#ffc42e'; ctx.lineWidth = 0.07; ctx.beginPath(); ctx.arc(x, y, 0.38, 0, 7); ctx.stroke(); }
}
function drawBall(x, y, k) {
  const r = 0.4, rot = time * 0.8 + x;
  const cols = ['#ef4f3f', '#ffffff', '#2f8de4', '#ffffff', '#ffc42e', '#ffffff'];
  for (let i = 0; i < 6; i++) {
    ctx.fillStyle = cols[i]; ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y, r, rot + i * Math.PI / 3, rot + (i + 1) * Math.PI / 3); ctx.closePath(); ctx.fill();
  }
  ctx.strokeStyle = 'rgba(0,0,0,.25)'; ctx.lineWidth = 0.04; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.beginPath(); ctx.ellipse(x - 0.13, y + 0.15, 0.12, 0.07, 0.6, 0, 7); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,220,.8)';
  const tw = (Math.sin(time * 3 + x * 2) + 1) / 2;
  star4(x + 0.45, y + 0.4, 0.12 * tw + 0.04);
}
function star4(x, y, s) { ctx.beginPath(); ctx.moveTo(x, y + s * 2); ctx.lineTo(x + s * 0.4, y + s * 0.4); ctx.lineTo(x + s * 2, y); ctx.lineTo(x + s * 0.4, y - s * 0.4); ctx.lineTo(x, y - s * 2); ctx.lineTo(x - s * 0.4, y - s * 0.4); ctx.lineTo(x - s * 2, y); ctx.lineTo(x - s * 0.4, y + s * 0.4); ctx.closePath(); ctx.fill(); }

const VCOL = { car: '#e8553d', van: '#2fb5c4', truck: '#f2a02c', bus: '#f4cf3a' };
function rrect(x, y, w, h, r) { ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h); }
function drawVehicle(k, bx, by, fx_, fy, rot) {
  const d = VEHICLES[k];
  const dx = fx_ - bx, dy = fy - by, l = Math.hypot(dx, dy) || 1, ux = dx / l, uy = dy / l;
  ctx.save();
  ctx.transform(ux, uy, -uy, ux, (bx + fx_) / 2, (by + fy) / 2);
  const len = d.len, r = d.r, roof = d.h - r, c = VCOL[k];
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(20,24,32,.55)'; ctx.lineWidth = 0.05;
  if (k === 'car') {
    ctx.fillStyle = c; ctx.beginPath();
    ctx.moveTo(-len * 0.31, 0.5); ctx.lineTo(-len * 0.2, roof); ctx.lineTo(len * 0.1, roof); ctx.lineTo(len * 0.29, 0.5); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#c6ecff'; ctx.beginPath();
    ctx.moveTo(-len * 0.26, 0.52); ctx.lineTo(-len * 0.18, roof - 0.1); ctx.lineTo(-len * 0.05, roof - 0.1); ctx.lineTo(-len * 0.05, 0.52); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(len * 0.0, 0.52); ctx.lineTo(len * 0.0, roof - 0.1); ctx.lineTo(len * 0.085, roof - 0.1); ctx.lineTo(len * 0.24, 0.52); ctx.closePath(); ctx.fill();
    ctx.fillStyle = c; rrect(-len / 2, -0.08, len, 0.62, 0.22); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.3)'; ctx.fillRect(-len * 0.45, 0.32, len * 0.9, 0.06);
  } else if (k === 'van') {
    ctx.fillStyle = c; rrect(-len / 2, -0.08, len * 0.97, roof + 0.08, 0.28); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#c6ecff';
    ctx.beginPath(); ctx.moveTo(len * 0.27, 0.62); ctx.lineTo(len * 0.27, roof - 0.12); ctx.lineTo(len * 0.36, roof - 0.12); ctx.lineTo(len * 0.46, 0.62); ctx.closePath(); ctx.fill();
    for (let i = 0; i < 3; i++) { rrect(-len * 0.44 + i * len * 0.23, 0.68, len * 0.19, roof - 0.85, 0.08); ctx.fill(); }
    ctx.fillStyle = '#fff'; ctx.fillRect(-len / 2, 0.38, len * 0.97, 0.1);
  } else if (k === 'truck') {
    const cab = 1.55;
    ctx.fillStyle = '#3a3f4a'; ctx.fillRect(-len / 2, -0.05, len, 0.22);
    ctx.fillStyle = '#ece7dc'; rrect(-len / 2, 0.17, len - cab - 0.1, roof - 0.07, 0.08); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = 'rgba(120,110,95,.45)'; for (let x = -len / 2 + 0.5; x < len / 2 - cab - 0.2; x += 0.5) line(x, 0.25, x, roof);
    ctx.strokeStyle = 'rgba(20,24,32,.55)';
    ctx.fillStyle = '#2c7be5'; ctx.fillRect(-len / 2 + 0.4, roof * 0.5, len - cab - 0.9, 0.22);
    ctx.fillStyle = c; rrect(len / 2 - cab, -0.08, cab, roof - 0.15, 0.25); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#c6ecff'; ctx.beginPath(); ctx.moveTo(len / 2 - cab + 0.25, roof * 0.55); ctx.lineTo(len / 2 - cab + 0.25, roof - 0.35); ctx.lineTo(len / 2 - 0.25, roof - 0.35); ctx.lineTo(len / 2 - 0.08, roof * 0.55); ctx.closePath(); ctx.fill();
  } else {
    ctx.fillStyle = c; rrect(-len / 2, -0.08, len, roof + 0.08, 0.32); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#c6ecff';
    const n = 6, ww = (len - 1.4) / n;
    for (let i = 0; i < n; i++) { rrect(-len / 2 + 0.35 + i * ww, roof * 0.5, ww - 0.15, roof * 0.38, 0.08); ctx.fill(); }
    rrect(len / 2 - 0.85, 0.2, 0.6, roof - 0.35, 0.12); ctx.fill();
    ctx.fillStyle = '#e07a1f'; ctx.fillRect(-len / 2, roof * 0.32, len, 0.12);
  }
  ctx.fillStyle = '#ffe58a'; ctx.beginPath(); ctx.arc(len / 2 - 0.12, 0.25, 0.09, 0, 7); ctx.fill();
  ctx.fillStyle = '#d9372b'; ctx.fillRect(-len / 2, 0.2, 0.08, 0.16);
  for (const wx of [-d.wb / 2, d.wb / 2]) {
    ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.arc(wx, 0, r + 0.08, 0, Math.PI); ctx.fill();
    ctx.fillStyle = '#262a31'; ctx.beginPath(); ctx.arc(wx, 0, r, 0, 7); ctx.fill();
    ctx.fillStyle = '#c9ced6'; ctx.beginPath(); ctx.arc(wx, 0, r * 0.48, 0, 7); ctx.fill();
    ctx.strokeStyle = '#7f8690'; ctx.lineWidth = 0.05;
    for (let i = 0; i < 3; i++) { const a = rot + i * 2.094; line(wx, 0, wx + Math.cos(a) * r * 0.45, Math.sin(a) * r * 0.45); }
  }
  ctx.restore();
}

function drawScene() {
  setScreen(); drawSky(); drawHills();
  setWorld();
  drawWaterBack();
  for (const r of geo.rocks) drawRock(r);
  drawCliff(geo.left, geo.yL, -1); drawCliff(geo.right, geo.yR, 1);
  for (const t of geo.towers) drawTower(t);
  for (const z of geo.noBuild) if (z[1] > 0) drawPowerLine(z);
  for (const p of deco.palms) drawPalm(p);
  for (const t of deco.tufts) drawTuft(t);
  drawAbutment(0, geo.yL, -1); drawAbutment(geo.span, geo.yR, 1);
  drawGroundRoad(-95, 0, geo.yL); drawGroundRoad(geo.span, geo.span + 95, geo.yR);
  drawFlag();
  if (mode === 'edit') drawGrid();
  if (mode === 'edit') { for (const z of geo.noBuild) drawNoBuild(z); if (geo.boat) drawBoatZone(geo.boat); }
  if (mode === 'sim') drawBoat(false);
  // Pfeiler
  if (sim) { for (const n of design.nodes) if (n.pillar) drawPillar(n); }
  else for (const n of design.nodes) if (n.pillar) drawPillar(n);
  // Balken
  if (sim) {
    const P = sim.P;
    const order = ['rope', 'wood', 'steel', 'hyd', 'road'];
    for (const key of order) for (const b of sim.beams) {
      if (b.mat.key !== key) continue;
      const a = P[b.i], c = P[b.j];
      drawBeam(a.x, a.y, c.x, c.y, key, stressView && !b.broken ? b.sf / b.mat.strength : null, { base: b.base });
    }
    const used = new Set(); for (const b of sim.beams) { used.add(b.i); used.add(b.j); }
    for (const i of used) { const p = P[i]; drawNode(p.x, p.y, p.fixed, false); }
  } else {
    const order = ['rope', 'wood', 'steel', 'hyd', 'road'];
    for (const key of order) for (const b of design.beams) {
      if (b.m !== key) continue;
      const a = nodeMap.get(b.a), c = nodeMap.get(b.b);
      if (!a || !c) continue;
      const bad = drag && drag.type === 'move' && !drag.ok && (b.a === drag.node.id || b.b === drag.node.id);
      drawBeam(a.x, a.y, c.x, c.y, key, null, { bad });
    }
    if (drag && drag.type === 'build' && drag.prob !== 'zu kurz') {
      const f = drag.from;
      ctx.setLineDash([0.18, 0.14]); ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 0.045;
      ctx.beginPath(); ctx.arc(f.x, f.y, MATERIALS[drag.mat].maxLen, 0, 7); ctx.stroke(); ctx.setLineDash([]);
      drawBeam(f.x, f.y, drag.end.x, drag.end.y, drag.mat, null, { ghost: true, bad: !!drag.prob });
    } else if (drag && drag.type === 'build') {
      const f = drag.from;
      ctx.setLineDash([0.18, 0.14]); ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 0.045;
      ctx.beginPath(); ctx.arc(f.x, f.y, MATERIALS[drag.mat].maxLen, 0, 7); ctx.stroke(); ctx.setLineDash([]);
    }
    for (const a of geo.anchors) drawNode(a.x, a.y, true, (hover === a) || (drag && drag.type === 'build' && (drag.from === a || drag.end.node === a)));
    for (const n of design.nodes) drawNode(n.x, n.y, n.fixed, hover === n || (drag && ((drag.type === 'build' && (drag.from === n || drag.end.node === n)) || (drag.type === 'move' && drag.node === n))));
    if (drag && drag.type === 'build' && !drag.end.node && drag.prob !== 'zu kurz') drawNode(drag.end.x, drag.end.y, false, true);
  }
  // Fahrzeuge
  if (sim) {
    for (const v of sim.vehicles) {
      if (v.state === 'done') continue;
      const a = sim.P[v.parts[0]], c = sim.P[v.parts[1]];
      drawVehicle(v.k, a.x, a.y, c.x, c.y, v.rot);
    }
  } else {
    for (const v of layoutVehicles(geo, vehicles)) {
      const y = geo.yL + v.d.r + ROAD_HALF;
      drawVehicle(v.k, v.cx - v.d.wb / 2, y, v.cx + v.d.wb / 2, y, 0);
    }
  }
  // Bälle
  const balls = sim ? sim.balls : geo.balls;
  for (const b of balls) if (!b.got) drawBall(b.x, b.y + Math.sin(time * 2 + b.x) * 0.08);
  if (mode === 'sim') drawBoat(true);
  for (const b of deco.bushes) drawBush(b);
  drawWaterFront();
  drawFx();
  setScreen();
  if (drag && drag.type === 'build' && drag.prob !== 'zu kurz') drawLabel();
}
function drawGrid() {
  const v = geo.view, s = cam.s;
  const x0 = Math.floor(v.x0), x1 = Math.ceil(v.x1), y0 = Math.floor(v.y0), y1 = Math.ceil(v.y1);
  ctx.lineWidth = 1 / s;
  const step = s < 18 ? 2 : GRID;
  for (let x = x0; x <= x1 + 1e-6; x += step) {
    const major = Math.abs(x / 2 - Math.round(x / 2)) < 1e-6;
    ctx.strokeStyle = major ? 'rgba(255,255,255,.34)' : `rgba(255,255,255,${snap ? 0.16 : 0.08})`;
    line(x, y0, x, y1);
  }
  for (let y = y0; y <= y1 + 1e-6; y += step) {
    const major = Math.abs(y / 2 - Math.round(y / 2)) < 1e-6;
    ctx.strokeStyle = major ? 'rgba(255,255,255,.34)' : `rgba(255,255,255,${snap ? 0.16 : 0.08})`;
    line(x0, y, x1, y);
  }
}
function drawLabel() {
  const f = drag.from, e = drag.end;
  const len = Math.hypot(e.x - f.x, e.y - f.y);
  const txt = drag.prob ? drag.prob : `${fmtM(len)} · ${fmt(len * MATERIALS[drag.mat].cost)}`;
  const [sx, sy] = toScreen((f.x + e.x) / 2, (f.y + e.y) / 2);
  ctx.font = '800 14px Nunito, system-ui, sans-serif';
  const w = ctx.measureText(txt).width + 18;
  const x = clamp(sx - w / 2, 8, W - w - 8), y = sy - 46;
  ctx.fillStyle = drag.prob ? '#d9443a' : '#17324d';
  ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, 28, 9) : ctx.rect(x, y, w, 28); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle'; ctx.fillText(txt, x + 9, y + 14.5);
}
function drawFx() {
  for (const p of fx) {
    const a = clamp(p.life / p.max, 0, 1);
    if (p.k === 'chip' || p.k === 'conf') {
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.globalAlpha = a;
      ctx.fillStyle = p.c; ctx.fillRect(-p.s, -p.s * 0.5, p.s * 2, p.s); ctx.restore();
    } else if (p.k === 'drop') {
      ctx.globalAlpha = a; ctx.fillStyle = '#e8f8ff'; ctx.beginPath(); ctx.arc(p.x, p.y, p.s, 0, 7); ctx.fill();
    } else if (p.k === 'ring') {
      ctx.globalAlpha = a; ctx.strokeStyle = '#fff'; ctx.lineWidth = 0.08;
      ctx.beginPath(); ctx.ellipse(p.x, p.y, (1 - a) * 3 + 0.5, ((1 - a) * 3 + 0.5) * 0.25, 0, 0, 7); ctx.stroke();
    } else if (p.k === 'puff') {
      ctx.globalAlpha = a * 0.7; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(p.x, p.y, p.s * (1.6 - a), 0, 7); ctx.fill();
    } else if (p.k === 'text') {
      ctx.save(); ctx.globalAlpha = a;
      const [sx, sy] = toScreen(p.x, p.y + (1 - a) * 1.2);
      setScreen(); ctx.font = '400 26px "Lilita One", system-ui, sans-serif'; ctx.textAlign = 'center';
      ctx.lineWidth = 5; ctx.strokeStyle = '#17324d'; ctx.strokeText(p.t, sx, sy); ctx.fillStyle = '#ffc42e'; ctx.fillText(p.t, sx, sy);
      ctx.restore(); setWorld();
    }
    ctx.globalAlpha = 1;
  }
}
function updateFx(dt) {
  for (const p of fx) {
    p.life -= dt;
    if (p.k === 'chip' || p.k === 'drop') { p.vy -= 9.81 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.r = (p.r || 0) + dt * 6; }
    if (p.k === 'conf') { p.vy = Math.max(p.vy - 3 * dt, -2.5); p.x += (p.vx + Math.sin(time * 3 + p.r) * 0.8) * dt; p.y += p.vy * dt; p.r += dt * 4; }
  }
  fx = fx.filter(p => p.life > 0);
}

// ---------- Hauptschleife ----------
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  time += dt;
  if (sim) {
    acc += dt * SPEEDS[speedIdx];
    let n = 0;
    while (acc >= 1 / 60 && n < 5) { sim.step(1 / 60); acc -= 1 / 60; n++; }
    if (n === 5) acc = 0;
    handleEvents();
    if (sim.result && !resultShown) { if (!resultAt) resultAt = time + 0.4; else if (time >= resultAt) showResult(); }
    if (Math.floor(time * 10) !== Math.floor((time - dt) * 10)) updateHUD();
  }
  if (mode === 'levels') cam.x += Math.sin(time * 0.15) * dt * 0.6;
  updateFx(dt);
  drawScene();
  requestAnimationFrame(frame);
}

function resize() {
  DPR = Math.min(2, window.devicePixelRatio || 1);
  const ow = W, oh = H;
  W = window.innerWidth; H = window.innerHeight;
  cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
  if (!ow) fitCamera();
  else if (ow !== W || oh !== H) fitCamera();
}
window.addEventListener('resize', resize);
resize();
deco = makeDeco();
rebuildMap();
showLevels();
fitCamera();
requestAnimationFrame(frame);
})();
