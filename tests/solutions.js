// Referenzlösungen: Für jedes Level eine Brücke, die nachweislich hält.
// Wird von tests/run.js genutzt, um sicherzustellen, dass jedes Level lösbar ist.
const { MATERIALS } = require('./engine');

function D(g) {
  const d = { nodes: [], beams: [], n: 1 };
  d.node = (x, y, fixed) => {
    x = +x.toFixed(3); y = +y.toFixed(3);
    const a = g.anchors.find(a => Math.abs(a.x - x) < 1e-3 && Math.abs(a.y - y) < 1e-3);
    if (a) return a.id;
    let n = d.nodes.find(n => Math.abs(n.x - x) < 1e-3 && Math.abs(n.y - y) < 1e-3);
    if (n) return n.id;
    n = { id: 'n' + d.n++, x, y };
    if (fixed) { n.fixed = true; n.pillar = true; n.ground = g.floorAt(x); }
    d.nodes.push(n); return n.id;
  };
  d.beam = (p, q, m) => {
    const len = Math.hypot(p[0] - q[0], p[1] - q[1]);
    if (len > MATERIALS[m].maxLen + 1e-6) throw new Error(`zu lang ${m} ${len.toFixed(2)} ${p} ${q}`);
    const a = d.node(...p), b = d.node(...q);
    if (d.beams.some(x => (x.a === a && x.b === b) || (x.a === b && x.b === a))) return;
    d.beams.push({ a, b, m });
  };
  d.pillar = (x, y) => d.node(x, y, true);
  return d;
}
// Warren-Fachwerk entlang einer Fahrbahn-Polylinie
function warren(d, deck, h, mat, road = 'road', chord = mat) {
  const mids = [];
  for (let k = 0; k < deck.length - 1; k++) {
    const [x1, y1] = deck[k], [x2, y2] = deck[k + 1];
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2 + h;
    mids.push([mx, my]);
    if (road) d.beam(deck[k], deck[k + 1], road);
    d.beam(deck[k], [mx, my], mat); d.beam([mx, my], deck[k + 1], mat);
  }
  for (let k = 0; k < mids.length - 1; k++) d.beam(mids[k], mids[k + 1], chord);
  return mids;
}
const line = (x0, y0, x1, y1, n) => Array.from({ length: n + 1 }, (_, i) => [x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n]);

const refs = {
  l1: (d) => warren(d, line(0, 0, 6, 0, 3), 1.5, 'wood'),
  l2: (d) => warren(d, line(0, 0, 10, 0, 5), 1.5, 'wood'),
  l3: (d) => { const deck = [[0,0],[1.5,0.5],[3,0.5],[4.5,1],[6,1],[7.5,1],[9,0.5],[10.5,0.5],[12,0]]; warren(d, deck, 1.5, 'wood'); },
  l4: (d) => warren(d, line(0, 0, 14, 0, 7), 1.5, 'wood', 'road', 'steel'),
  l5: (d) => { warren(d, line(0, 0, 10, 0, 5), -1.5, 'wood'); warren(d, line(10, 0, 20, 0, 5), -1.5, 'wood'); d.beam([10,-1.5],[9,-1.5],'wood'); d.beam([10,-1.5],[11,-1.5],'wood'); d.beam([10,-1.5],[10,0],'wood'); },
  l6: (d) => warren(d, line(0, 0, 14, 3, 8), 1.5, 'wood', 'road', 'steel'),
  l7: (d) => { warren(d, line(0, 0, 14, 0, 7), -1.5, 'wood', 'road', 'steel'); },
  l8: (d) => { const m = warren(d, line(0, 0, 16, 0, 8), 1.7, 'steel'); },
  l9: (d) => {
    const deck = line(0, 0, 24, 0, 12);
    warren(d, deck, -1.2, 'wood');
    for (let k = 1; k < 12; k++) { const [x, y] = deck[k]; if (x <= 10) d.beam([-1, 7], [x, y], 'rope'); if (x >= 14) d.beam([25, 7], [x, y], 'rope'); }
  },
  l10: (d) => warren(d, line(0, 0, 18, 0, 9), 1.7, 'steel'),
  l11: (d) => {
    // zwei Klappen, Scharnier am Ufer, Hydraulik zum Pylon
    for (const s of [1, -1]) {
      const X = x => s > 0 ? x : 12 - x;
      const deck = [[X(0), 0], [X(2), 0], [X(4), 0], [X(s > 0 ? 5.5 : 6), 0]];
      for (let k = 0; k < 3; k++) d.beam(deck[k], deck[k + 1], 'road');
      d.beam([X(1), -1], [X(2), 0], 'steel'); d.beam([X(1), -1], [X(0), 0], 'steel');
      d.beam([X(1), -1], [X(3), -1], 'steel'); d.beam([X(3), -1], [X(2), 0], 'steel'); d.beam([X(3), -1], [X(4), 0], 'steel');
      d.beam([X(3), -1], [X(4.5), -0.5], 'steel'); d.beam([X(4.5), -0.5], [X(4), 0], 'steel'); d.beam([X(4.5), -0.5], deck[3], 'steel');
      d.beam([X(0), 3], [X(2), 0], 'hyd');
    }
  },
  l12: (d) => { const p = [7, 14, 21]; for (const x of p) d.pillar(x, -1.5);
    for (let i = 0; i < 4; i++) warren(d, line(i * 7, 0, i * 7 + 7, 0, 4), -1.5, 'wood');
    for (const x of p) { d.beam([x, -1.5], [x, 0], 'wood'); d.beam([x, -1.5], [x - 0.875, -1.5], 'wood'); d.beam([x, -1.5], [x + 0.875, -1.5], 'wood'); } },
  l13: (d) => {
    const deck = [[0,0],[1.5,0.5],[3,1],[4.5,1.5],[6,1.5],[7.5,1],[8.5,0.5],[10,-0.5],[11.5,0.5],[12.5,1],[14,1.5],[15.5,1.5],[17,1],[18.5,0.5],[20,0]];
    const m = warren(d, deck, -1.2, 'wood', 'road', 'steel');
    d.beam([10, -2], m[6], 'wood'); d.beam([10, -2], m[7], 'wood'); d.beam([4.5, -1], m[2], 'wood'); d.beam([4.5, -1], m[3], 'wood'); d.beam([15.5, -1], m[10], 'wood'); d.beam([15.5, -1], m[11], 'wood');
  },
  l14: (d) => { warren(d, line(0, 0, 11, 0, 6), 1.8, 'steel'); warren(d, line(11, 0, 22, 0, 6), 1.8, 'steel'); d.beam([11,-2],[11,0],'steel'); },
  l15: (d) => {
    const deck = line(0, 0, 30, 0, 15);
    warren(d, deck, -1.5, 'wood', 'road', 'steel');
    for (let k = 1; k < 15; k++) { const [x, y] = deck[k]; const T = x <= 15 ? [-1.5, 9] : [31.5, 9]; if (Math.hypot(x - T[0], y - T[1]) <= 14) d.beam(T, [x, y], 'rope'); }
  },
  l16: (d) => {
    for (const s of [1, -1]) {
      const X = x => s > 0 ? x : 16 - x;
      const deck = [[X(0), 0], [X(2), 0], [X(4), 0], [X(6), 0], [X(s > 0 ? 7.5 : 8), 0]];
      for (let k = 0; k < 4; k++) d.beam(deck[k], deck[k + 1], 'road');
      const bot = [[X(1), -1.6], [X(3), -1.6], [X(5), -1.6], [X(6.75), -1.0]];
      d.beam(bot[0], deck[0], 'steel');
      for (let k = 0; k < 4; k++) { d.beam(bot[k], deck[k + 1], 'steel'); if (k < 3) { d.beam(bot[k], bot[k + 1], 'steel'); d.beam(bot[k + 1], deck[k + 1], 'steel'); } }
      d.beam([X(0), 3.4], [X(3), 0], 'hyd');
      d.beam([X(3), 0], bot[1], 'steel'); d.beam([X(3), 0], [X(2), 0], 'road'); d.beam([X(3), 0], [X(4), 0], 'road');
      d.beams = d.beams.filter(b => !(b.m === 'road' && ((b.a === d.node(X(2), 0) && b.b === d.node(X(4), 0)) || (b.b === d.node(X(2), 0) && b.a === d.node(X(4), 0)))));
      d.beam([X(0), 3.4], [X(6), 0], 'rope');
      d.beam([X(0), 0], [X(1.5), 1], 'steel'); d.beam([X(1.5), 1], [X(3), 0], 'steel'); d.beam([X(1.5), 1], [X(2), 0], 'steel');
    }
  },
  l17: (d) => {
    const sp = [[0, 6.5], [6.5, 13], [13, 20], [20, 27], [27, 33.5], [33.5, 40]];
    for (const x of [6.5, 20, 33.5]) d.pillar(x, -2);
    for (const [a, b] of sp) warren(d, line(a, 0, b, 0, 4), 1.8, 'steel');
    for (const x of [6.5, 13, 20, 27, 33.5]) d.beam([x, -2], [x, 0], 'steel');
  },
  l18: (d) => warren(d, line(0, 0, 14, -2.5, 8), 1.5, 'wood', 'road', 'steel'),
  l19: (d) => {
    const deck = line(0, 0, 16, 0, 8);
    warren(d, deck, -1.2, 'wood');
    for (let k = 1; k < 8; k++) { const [x, y] = deck[k]; d.beam([x <= 8 ? -1 : 17, 6], [x, y], 'rope'); }
  },
  l20: (d) => {
    const deck = [[0,0],[1.5,0.5],[3,1],[4.5,1.5],[6,2],[7.5,2],[8.5,2],[10,2],[11.5,1.5],[13,1],[14.5,0.5],[16,0]];
    warren(d, deck, 1.5, 'wood', 'road', 'steel');
  },
  l21: (d) => warren(d, line(0, 0, 12, 0, 6), -1.5, 'steel'),
  l22: (d) => {
    const m = warren(d, line(0, 0, 18, 0, 9), -1.7, 'steel');
    d.beam([0, -3], m[0], 'steel'); d.beam([18, -3], m[8], 'steel');
    const top = warren(d, line(0, 0, 18, 0, 9), 1.7, 'steel', null);
  },
  l23: (d) => {
    for (let i = 0; i < 4; i++) warren(d, line(i * 8, 0, i * 8 + 8, 0, 4), -1.5, 'wood');
    for (const x of [8, 16, 24]) { d.beam([x, -1.5], [x - 1, -1.5], 'wood'); d.beam([x, -1.5], [x + 1, -1.5], 'wood'); d.beam([x, -1.5], [x, 0], 'wood'); }
  },
  l24: (d) => {
    const m = warren(d, line(0, 0, 22, 4, 12), 1.5, 'wood', 'road', 'steel');
    const deck = line(0, 0, 22, 4, 12);
    d.beam([11, -0.5], deck[6], 'steel'); d.beam([11, -0.5], deck[5], 'steel'); d.beam([11, -0.5], deck[7], 'steel');
  },
  l25: (d) => {
    // tiefere Klappen wie in l16, Zylinder weiter außen, Seil stützt die Spitze im abgesenkten Zustand
    for (const s of [1, -1]) {
      const X = x => s > 0 ? x : 12 - x;
      const deck = [[X(0), 0], [X(1.5), 0], [X(3), 0], [X(4.5), 0], [X(s > 0 ? 5.5 : 6), 0]];
      for (let k = 0; k < 4; k++) d.beam(deck[k], deck[k + 1], 'road');
      const bot = [[X(0.75), -1.4], [X(2.25), -1.6], [X(3.75), -1.2], [X(5), -0.6]];
      d.beam(deck[0], bot[0], 'steel');
      for (let k = 0; k < 4; k++) { d.beam(bot[k], deck[k + 1], 'steel'); if (k < 3) { d.beam(bot[k], bot[k + 1], 'steel'); d.beam(bot[k + 1], deck[k + 1], 'steel'); } }
      d.beam([X(0), 3], [X(3), 0], 'hyd');
      d.beam([X(0), 3], [X(4.5), 0], 'rope');
      d.beam([X(0), 0], [X(1), 1], 'steel'); d.beam([X(1), 1], [X(1.5), 0], 'steel'); d.beam([X(1), 1], [X(3), 0], 'steel');
    }
  },
  l26: (d) => {
    for (const x of [9, 18, 27]) d.pillar(x, -2);
    for (let i = 0; i < 4; i++) warren(d, line(i * 9, 0, i * 9 + 9, 0, 5), 1.7, 'wood', 'road', 'steel');
    for (const x of [9, 18, 27]) d.beam([x, -2], [x, 0], 'steel');
  },
  l27: (d) => {
    const deck = line(0, 0, 36, 0, 18);
    warren(d, deck, -1.5, 'wood', 'road', 'steel');
    // durchhängendes Tragseil zwischen den Pylonen, senkrechte Hänger zur Fahrbahn
    const cable = x => 3 + 8 * Math.pow((x - 18) / 19.5, 2);
    let prev = [-1.5, 11];
    for (let x = 2; x <= 34; x += 2) { const p = [x, +cable(x).toFixed(2)]; d.beam(prev, p, 'rope'); d.beam(p, [x, 0], 'rope'); prev = p; }
    d.beam(prev, [37.5, 11], 'rope');
  },
  l28: (d) => { warren(d, line(0, 0, 12, 0, 6), 1.8, 'steel'); warren(d, line(12, 0, 24, 0, 6), 1.8, 'steel'); d.beam([12, -2], [12, 0], 'steel'); },
  l29: (d) => warren(d, line(0, 0, 16, 0, 8), 1.7, 'steel'),
  l30: (d) => {
    const sup = [5.5, 16.5, 27.5, 38.5];
    for (const x of sup) d.pillar(x, -2);
    for (let i = 0; i < 8; i++) warren(d, line(i * 5.5, 0, i * 5.5 + 5.5, 0, 3), 1.8, 'steel');
    for (const x of [5.5, 11, 16.5, 22, 27.5, 33, 38.5]) d.beam([x, -2], [x, 0], 'steel');
  },
};


module.exports = { D, warren, line, refs };
