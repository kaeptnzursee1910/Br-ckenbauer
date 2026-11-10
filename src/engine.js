// ===== Physik-Engine (XPBD, ohne DOM) =====
const HYD_RATE = 0.3, G = 9.81, SUB = 24, ROAD_HALF = 0.14, JOINT = 0.12, MU = 0.9;

const MATERIALS = {
  road:  { key: 'road',  name: 'Straße',    maxLen: 2,  cost: 180, mass: 0.6,  strength: 520,  EA: 6e4,   w: 0.30, road: true },
  wood:  { key: 'wood',  name: 'Holz',      maxLen: 2,  cost: 120, mass: 0.25, strength: 460,  EA: 4e4,   w: 0.17 },
  steel: { key: 'steel', name: 'Stahl',     maxLen: 4,  cost: 320, mass: 0.42, strength: 1150, EA: 1.2e5, w: 0.20 },
  rope:  { key: 'rope',  name: 'Seil',      maxLen: 14, cost: 80,  mass: 0.05, strength: 850,  EA: 9e4,   w: 0.07, tensionOnly: true },
  hyd:   { key: 'hyd',   name: 'Hydraulik', maxLen: 5,  cost: 650, mass: 0.55, strength: 1700, EA: 1.5e5, w: 0.24, hydraulic: true },
};
const PILLAR = { cost: 260, base: 600, w: 0.9 };

const VEHICLES = {
  car:   { key: 'car',   name: 'Auto',        mass: 10, len: 3.4, wb: 2.2, r: 0.34, h: 1.35, speed: 5.0 },
  van:   { key: 'van',   name: 'Transporter', mass: 17, len: 4.4, wb: 2.9, r: 0.37, h: 1.95, speed: 4.6 },
  truck: { key: 'truck', name: 'Lkw',         mass: 32, len: 6.2, wb: 4.2, r: 0.46, h: 2.45, speed: 3.8 },
  bus:   { key: 'bus',   name: 'Bus',         mass: 25, len: 7.2, wb: 4.9, r: 0.43, h: 2.55, speed: 4.2 },
};

const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const smooth = t => t * t * (3 - 2 * t);

function segRect(x1, y1, x2, y2, rx0, ry0, rx1, ry1) {
  let t0 = 0, t1 = 1;
  const dx = x2 - x1, dy = y2 - y1;
  const p = [-dx, dx, -dy, dy], q = [x1 - rx0, rx1 - x1, y1 - ry0, ry1 - y1];
  for (let k = 0; k < 4; k++) {
    if (p[k] === 0) { if (q[k] < 0) return false; continue; }
    const r = q[k] / p[k];
    if (p[k] < 0) { if (r > t1) return false; if (r > t0) t0 = r; }
    else { if (r < t0) return false; if (r < t1) t1 = r; }
  }
  return true;
}

function prepLevel(L) {
  const span = L.span, yL = L.yL || 0, yR = L.yR || 0;
  const floor = L.floor ?? -8, water = L.dry ? -1e9 : (L.water ?? floor + 2.5);
  const g = { span, yL, yR, floor, water, dry: !!L.dry };
  const A = [[0, yL], [span, yR]].concat(L.anchors || []);
  g.rocks = (L.rocks || []).map(r => ({ x: r.x, top: r.top, w: r.w || 2.6 }));
  for (const r of g.rocks) A.push([r.x, r.top]);
  g.towers = (L.towers || []).map(t => ({ x: t.x, top: t.top, base: t.x <= span / 2 ? yL : yR }));
  for (const t of g.towers) A.push([t.x, t.top]);
  g.anchors = A.map((a, i) => ({ id: 'a' + i, x: a[0], y: a[1] }));
  const lowL = Math.min(yL, ...g.anchors.filter(a => Math.abs(a.x) < 0.01).map(a => a.y));
  const lowR = Math.min(yR, ...g.anchors.filter(a => Math.abs(a.x - span) < 0.01).map(a => a.y));
  const kL = Math.max(floor + 0.8, lowL - 0.8), kR = Math.max(floor + 0.8, lowR - 0.8);
  const D = 95, B = floor - 40;
  g.left = [[-D, yL], [0, yL], [0, kL], [0.8, (kL + floor) / 2], [1.6, floor], [1.6, B], [-D, B]];
  g.right = [[span + D, yR], [span, yR], [span, kR], [span - 0.8, (kR + floor) / 2], [span - 1.6, floor], [span - 1.6, B], [span + D, B]];
  g.valley = g.left.slice(1, 5).concat([[1.6, floor - 45], [span - 1.6, floor - 45]], g.right.slice(1, 5).reverse(), [[span, yR + 60], [0, yL + 60]]);
  const segs = [];
  const chain = pts => { for (let i = 0; i < pts.length - 1; i++) segs.push([pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]]); };
  chain(g.left.slice(0, 5)); chain(g.right.slice(0, 5));
  segs.push([1.6, floor, span - 1.6, floor]);
  for (const r of g.rocks) {
    const t = r.top - 0.15, w = r.w;
    r.poly = [[r.x - w * 0.75, floor], [r.x - w * 0.5, t - 0.5], [r.x - w * 0.32, t], [r.x + w * 0.32, t], [r.x + w * 0.5, t - 0.5], [r.x + w * 0.75, floor]];
    chain(r.poly);
  }
  g.segs = segs;
  g.startX = -5.5; g.finishX = span + 8;
  g.killY = g.dry ? floor + 1.0 : water + 0.1;
  g.balls = (L.balls || []).map(b => ({ x: b[0], y: b[1] }));
  g.noBuild = L.noBuild || [];
  g.boat = L.boat || null;
  g.pillars = !!L.pillars;
  g.floorAt = x => {
    let f = floor;
    for (const r of g.rocks) if (Math.abs(x - r.x) < r.w * 0.4) f = Math.max(f, r.top - 0.15);
    return f;
  };
  const ys = g.anchors.map(a => a.y).concat(g.balls.map(b => b.y), [yL, yR]);
  if (g.boat) ys.push(g.boat.top);
  g.view = { x0: -9.5, x1: span + 9, y0: Math.min(floor, ...ys) - 0.8, y1: Math.max(...ys) + 4 };
  return g;
}

function layoutVehicles(g, list) {
  let x = g.startX;
  return list.map(k => {
    const d = VEHICLES[k];
    const cx = x - d.len / 2;
    x -= d.len + 2.4;
    return { k, d, cx };
  });
}

function designCost(design, g) {
  let c = 0;
  const pos = new Map(g.anchors.map(a => [a.id, a]).concat(design.nodes.map(n => [n.id, n])));
  for (const b of design.beams) {
    const a = pos.get(b.a), e = pos.get(b.b);
    if (!a || !e) continue;
    c += Math.hypot(a.x - e.x, a.y - e.y) * MATERIALS[b.m].cost;
  }
  for (const n of design.nodes) if (n.pillar) c += PILLAR.base + (n.y - n.ground) * PILLAR.cost;
  return Math.round(c);
}

class Sim {
  constructor(L, g, design, vlist) {
    this.L = L; this.g = g; this.t = 0; this.events = []; this.result = null; this.pending = null;
    this.hyd = 0; this.hydTarget = 0; this.manualHyd = false;
    const P = this.P = [];
    const id = new Map();
    const add = (x, y, m, fixed) => { P.push({ x, y, px: x, py: y, vx: 0, vy: 0, m, w: 0, fixed, dead: false }); return P.length - 1; };
    for (const a of g.anchors) id.set(a.id, add(a.x, a.y, 0, true));
    for (const n of design.nodes) id.set(n.id, add(n.x, n.y, JOINT, !!n.fixed));
    this.beams = [];
    for (const b of design.beams) {
      const i = id.get(b.a), j = id.get(b.b);
      if (i == null || j == null) continue;
      const mat = MATERIALS[b.m], pi = P[i], pj = P[j];
      const L0 = Math.hypot(pj.x - pi.x, pj.y - pi.y);
      if (L0 < 1e-3) continue;
      pi.m += mat.mass * L0 / 2; pj.m += mat.mass * L0 / 2;
      this.beams.push({ i, j, L0, base: L0, mat, comp: L0 / mat.EA, sf: 0, acc: 0, broken: false });
    }
    for (const p of P) p.w = p.fixed ? 0 : 1 / p.m;
    this.roads = this.beams.filter(b => b.mat.road);
    this.hyds = this.beams.filter(b => b.mat.hydraulic);
    this.hasHyd = this.hyds.length > 0;

    const lay = layoutVehicles(g, vlist);
    this.speed = Math.min(...lay.map(v => v.d.speed));
    this.startT = g.boat ? g.boat.t0 + g.boat.dur + 0.2 + 1 / HYD_RATE + 0.4 : 0.9;
    this.vehicles = lay.map(({ k, d, cx }) => {
      const R = d.r + ROAD_HALF, y0 = g.yL + R, yt = y0 + d.h * 0.55;
      const mw = d.mass * 0.32, mt = d.mass * 0.18;
      const parts = [add(cx - d.wb / 2, y0, mw), add(cx + d.wb / 2, y0, mw), add(cx - d.wb / 2, yt, mt), add(cx + d.wb / 2, yt, mt)];
      for (const pi of parts) P[pi].w = 1 / P[pi].m;
      const cons = [];
      for (const [a, b] of [[0, 1], [2, 3], [0, 2], [1, 3], [0, 3], [1, 2]]) {
        const pa = P[parts[a]], pb = P[parts[b]];
        cons.push([parts[a], parts[b], Math.hypot(pa.x - pb.x, pa.y - pb.y)]);
      }
      return { k, d, parts, cons, R, state: 'wait', rot: 0, target: 0, lastX: cx };
    });
    const convoy = lay.length ? lay[0].cx - lay[lay.length - 1].cx + 8 : 0;
    this.maxT = this.startT + ((g.finishX - g.startX) + convoy) / this.speed * 1.9 + 8;
    this.balls = g.balls.map(b => ({ x: b.x, y: b.y, got: false }));
    this.ballsGot = 0;
    this.vDone = 0;
    this.boatHit = false;
  }

  contact(p, a, c, ax, ay, bx, by, R, k) {
    const ex = bx - ax, ey = by - ay, l2 = ex * ex + ey * ey;
    let t = l2 > 0 ? ((p.x - ax) * ex + (p.y - ay) * ey) / l2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const qx = ax + ex * t, qy = ay + ey * t;
    const dx = p.x - qx, dy = p.y - qy, d2 = dx * dx + dy * dy;
    if (d2 >= R * R) return;
    let d = Math.sqrt(d2), nx, ny;
    if (d < 1e-7) { const l = Math.sqrt(l2) || 1; nx = -ey / l; ny = ex / l; if (ny < 0) { nx = -nx; ny = -ny; } d = 0; }
    else { nx = dx / d; ny = dy / d; }
    const ta = 1 - t;
    const wa = a ? a.w : 0, wc = c ? c.w : 0;
    const W = p.w + wa * ta * ta + wc * t * t;
    if (W <= 0) return;
    const s = (R - d) / W;
    p.x += p.w * s * nx; p.y += p.w * s * ny;
    if (a) { a.x -= wa * ta * s * nx; a.y -= wa * ta * s * ny; c.x -= wc * t * s * nx; c.y -= wc * t * s * ny; }
    k.n++; k.s += s;
    // Antrieb über die Fläche, die in Fahrtrichtung ansteigt (sonst klemmen Räder in Senken)
    if (nx < k.best) { k.best = nx; k.a = a; k.c = c; k.t = t; k.nx = nx; k.ny = ny; }
  }

  // Normalkontakte sammeln, dann einmal Reibung/Antrieb entlang der gemittelten Fahrbahnrichtung
  collide(pi, R, target, h) {
    const p = this.P[pi], P = this.P;
    const k = { n: 0, s: 0, nx: 0, ny: 1, best: 2, a: null, c: null, t: 0 };
    for (const s of this.g.segs) {
      if (p.x < Math.min(s[0], s[2]) - R || p.x > Math.max(s[0], s[2]) + R || p.y < Math.min(s[1], s[3]) - R || p.y > Math.max(s[1], s[3]) + R) continue;
      this.contact(p, null, null, s[0], s[1], s[2], s[3], R, k);
    }
    for (const b of this.roads) {
      const a = P[b.i], c = P[b.j];
      if (p.x < Math.min(a.x, c.x) - R || p.x > Math.max(a.x, c.x) + R || p.y < Math.min(a.y, c.y) - R || p.y > Math.max(a.y, c.y) + R) continue;
      this.contact(p, a, c, a.x, a.y, c.x, c.y, R, k);
    }
    if (!k.n) return false;
    const tx = k.ny, ty = -k.nx;
    const { a, c, t } = k, ta = 1 - t;
    const wa = a ? a.w : 0, wc = c ? c.w : 0;
    let rx = p.x - p.px, ry = p.y - p.py;
    if (a) { rx -= (a.x - a.px) * ta + (c.x - c.px) * t; ry -= (a.y - a.py) * ta + (c.y - c.py) * t; }
    const vt = (rx * tx + ry * ty) / h;
    const dv = clamp(target - vt, -30 * h, 26 * h);
    const W = p.w + wa * ta * ta + wc * t * t;
    const mx = MU * k.s;
    const lt = clamp(dv * h / W, -mx, mx);
    p.x += p.w * lt * tx; p.y += p.w * lt * ty;
    if (a) { a.x -= wa * ta * lt * tx; a.y -= wa * ta * lt * ty; c.x -= wc * t * lt * tx; c.y -= wc * t * lt * ty; }
    return true;
  }

  breakBeam(b) {
    const P = this.P;
    let end = Math.random() < 0.5 ? 'i' : 'j';
    const old = P[b[end]];
    const hm = b.mat.mass * b.base / 2;
    P.push({ x: old.x, y: old.y, px: old.px, py: old.py, vx: old.vx, vy: old.vy, m: hm + 0.05, w: 1 / (hm + 0.05), fixed: false, dead: false });
    if (!old.fixed) { old.m = Math.max(JOINT, old.m - hm); old.w = 1 / old.m; }
    b[end] = P.length - 1;
    b.broken = true;
    b.L0 *= 0.97;
    const o = P[b.i === P.length - 1 ? b.j : b.i];
    this.events.push({ type: 'break', x: (old.x + o.x) / 2, y: (old.y + o.y) / 2, ex: old.x, ey: old.y, mat: b.mat.key });
  }

  finish(ok, reason, delay) {
    if (this.pending || this.result) return;
    this.pending = { ok, reason, at: this.t + delay };
  }

  step(dt) {
    if (this.result) return;
    const g = this.g, P = this.P, h = dt / SUB, h2 = h * h;
    if (g.boat && !this.manualHyd) {
      const b = g.boat;
      this.hydTarget = (this.t > b.t0 - 4.6 && this.t < b.t0 + b.dur + 0.2) ? 1 : 0;
    }
    this.hyd += clamp(this.hydTarget - this.hyd, -HYD_RATE * dt, HYD_RATE * dt);
    const hs = smooth(this.hyd);
    for (const b of this.hyds) if (!b.broken) b.L0 = b.base * (1 - 0.5 * hs);
    for (const v of this.vehicles) {
      if (v.state === 'wait' && this.t >= this.startT) v.state = 'drive';
      v.target = v.state === 'drive' ? this.speed : 0;
    }
    const gs = G * smooth(clamp(this.t / 0.6, 0, 1));
    for (let s = 0; s < SUB; s++) {
      for (const p of P) {
        if (p.w === 0 || p.dead) continue;
        p.px = p.x; p.py = p.y;
        p.vy -= gs * h;
        p.x += p.vx * h; p.y += p.vy * h;
      }
      for (const b of this.beams) {
        const a = P[b.i], c = P[b.j];
        const ws = a.w + c.w;
        if (ws === 0) continue;
        const dx = c.x - a.x, dy = c.y - a.y, len = Math.sqrt(dx * dx + dy * dy);
        if (len < 1e-9) continue;
        const C = len - b.L0;
        if (b.mat.tensionOnly && C < 0) continue;
        const dl = -C / (ws + b.comp / h2);
        const nx = dx / len, ny = dy / len;
        a.x -= a.w * dl * nx; a.y -= a.w * dl * ny;
        c.x += c.w * dl * nx; c.y += c.w * dl * ny;
        b.acc += Math.abs(dl) / h2;
      }
      for (const v of this.vehicles) {
        if (v.state === 'done') continue;
        for (let it = 0; it < 2; it++) for (const [i, j, L0] of v.cons) {
          const a = P[i], c = P[j];
          const dx = c.x - a.x, dy = c.y - a.y, len = Math.sqrt(dx * dx + dy * dy) || 1e-9;
          const dl = -(len - L0) / (a.w + c.w);
          const nx = dx / len, ny = dy / len;
          a.x -= a.w * dl * nx; a.y -= a.w * dl * ny;
          c.x += c.w * dl * nx; c.y += c.w * dl * ny;
        }
        this.collide(v.parts[0], v.R, v.target, h);
        this.collide(v.parts[1], v.R, v.target, h);
        this.collide(v.parts[2], 0.25, 0, h);
        this.collide(v.parts[3], 0.25, 0, h);
      }
      const damp = 1 - 0.5 * h;
      for (const p of P) {
        if (p.w === 0 || p.dead) continue;
        p.vx = (p.x - p.px) / h * damp; p.vy = (p.y - p.py) / h * damp;
        const sp = p.vx * p.vx + p.vy * p.vy;
        if (sp > 3600) { const k = 60 / Math.sqrt(sp); p.vx *= k; p.vy *= k; }
      }
      for (const b of this.beams) {
        const a = P[b.i], c = P[b.j], ws = a.w + c.w;
        if (ws === 0) continue;
        const dx = c.x - a.x, dy = c.y - a.y, len = Math.sqrt(dx * dx + dy * dy) || 1e-9;
        const nx = dx / len, ny = dy / len;
        const vr = (c.vx - a.vx) * nx + (c.vy - a.vy) * ny;
        const k = vr * 0.04 / ws;
        a.vx += a.w * k * nx; a.vy += a.w * k * ny;
        c.vx -= c.w * k * nx; c.vy -= c.w * k * ny;
      }
    }
    this.t += dt;
    // Belastung & Bruch
    for (const b of this.beams) {
      const f = b.acc / SUB; b.acc = 0;
      if (b.broken) { b.sf *= 0.85; continue; }
      b.sf += (f - b.sf) * 0.3;
      if (this.t > 0.15 && b.sf > b.mat.strength) this.breakBeam(b);
    }
    // Fahrzeuge
    for (const v of this.vehicles) {
      if (v.state === 'done') continue;
      const a = P[v.parts[0]], c = P[v.parts[1]];
      const cx = (a.x + c.x) / 2, cy = (a.y + c.y) / 2;
      v.rot -= (cx - v.lastX) / v.d.r; v.lastX = cx;
      if (v.state !== 'fallen') {
        const ux = c.x - a.x, uy = c.y - a.y, tp = P[v.parts[2]];
        const up = (-uy * (tp.x - a.x) + ux * (tp.y - a.y));
        if (cx > g.finishX) {
          v.state = 'done'; this.vDone++;
          for (const pi of v.parts) { P[pi].dead = true; P[pi].w = 0; }
          this.events.push({ type: 'done', x: cx, y: cy });
          if (this.vDone === this.vehicles.length) this.finish(true, '', 0.5);
          continue;
        }
        if (cy < g.killY || cy < Math.min(g.yL, g.yR) - 7 || up < 0) {
          v.state = 'fallen';
          if (cy < g.killY) this.events.push({ type: 'splash', x: cx, y: g.water });
          this.finish(false, up < 0 && cy >= g.killY ? 'Ein Fahrzeug hat sich überschlagen.' : 'Ein Fahrzeug ist abgestürzt.', 1.6);
        }
      } else if (!v.splashed && cy < g.water) { v.splashed = true; this.events.push({ type: 'splash', x: cx, y: g.water }); }
      // Bälle
      const ux = c.x - a.x, uy = c.y - a.y, ul = Math.hypot(ux, uy) || 1;
      const nx = ux / ul, ny = uy / ul;
      for (const ball of this.balls) {
        if (ball.got) continue;
        const rx = ball.x - cx, ry = ball.y - cy;
        const lu = rx * nx + ry * ny, lv = -rx * ny + ry * nx;
        if (Math.abs(lu) < v.d.len / 2 + 0.4 && lv > -v.d.r - 0.4 && lv < v.d.h - v.d.r + 0.4) {
          ball.got = true; this.ballsGot++;
          this.events.push({ type: 'ball', x: ball.x, y: ball.y });
        }
      }
    }
    // Schiff
    if (g.boat && !this.boatHit) {
      const b = g.boat;
      if (this.t > b.t0 && this.t < b.t0 + b.dur) {
        for (const bm of this.beams) {
          const a = P[bm.i], c = P[bm.j];
          if (segRect(a.x, a.y, c.x, c.y, b.x0, g.water, b.x1, b.top)) {
            this.boatHit = true;
            if (!bm.broken) this.breakBeam(bm);
            this.events.push({ type: 'boat', x: (a.x + c.x) / 2, y: (a.y + c.y) / 2 });
            this.finish(false, 'Das Schiff ist gegen die Brücke gefahren.', 1.4);
            break;
          }
        }
      }
    }
    if (this.t > this.maxT) this.finish(false, 'Die Fahrzeuge kommen nicht ans Ziel.', 0);
    if (this.pending && this.t >= this.pending.at) this.result = this.pending;
  }
}
