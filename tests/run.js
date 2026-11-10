// Prüft jedes Level: Die Referenzbrücke muss alle Fahrzeuge ins Ziel bringen und im Budget bleiben,
// eine Straße ganz ohne Stützen muss einstürzen.
// Aufruf: node tests/run.js [level-id]
const E = require('./engine');
const { D, line, refs } = require('./solutions');

function run(L, design) {
  const g = E.prepLevel(L);
  const sim = new E.Sim(L, g, design, L.vehicles);
  let maxR = 0, breaks = 0;
  while (!sim.result && sim.t < 150) {
    sim.step(1 / 60);
    for (const b of sim.beams) if (!b.broken) maxR = Math.max(maxR, b.sf / b.mat.strength);
    for (const e of sim.events) if (e.type === 'break') breaks++;
    sim.events.length = 0;
  }
  return { ok: !!sim.result?.ok, reason: sim.result?.reason || '', maxR, breaks, balls: sim.ballsGot, nBalls: sim.balls.length };
}

function plainRoad(L, g) {
  const d = D(g), yL = L.yL || 0, yR = L.yR || 0;
  const pts = line(0, yL, L.span, yR, Math.ceil(Math.hypot(L.span, yR - yL) / 1.99));
  for (let i = 0; i < pts.length - 1; i++) d.beam(pts[i], pts[i + 1], 'road');
  return d;
}

const only = process.argv[2];
const ids = new Set();
let failed = 0;
for (const L of E.LEVELS) {
  if (ids.has(L.id)) { console.log(`✗ doppelte Level-ID ${L.id}`); failed++; }
  ids.add(L.id);
  if (only && L.id !== only) continue;
  const g = E.prepLevel(L);
  const problems = [];
  let cost = 0, r = null;
  if (!refs[L.id]) problems.push('keine Referenzlösung');
  else {
    const d = D(g);
    try {
      refs[L.id](d);
      cost = E.designCost(d, g);
      r = run(L, d);
      if (!r.ok) problems.push('Referenz scheitert: ' + r.reason);
      if (cost > L.budget) problems.push(`Referenz über Budget (${cost} > ${L.budget})`);
      if (r.nBalls && r.balls < r.nBalls) problems.push(`nur ${r.balls}/${r.nBalls} Bälle`);
    } catch (e) { problems.push('Referenz ungültig: ' + e.message); }
  }
  const plain = run(L, plainRoad(L, g));
  if (plain.ok) problems.push('reine Straße hält (zu leicht)');
  const info = r ? `Kosten ${String(cost).padStart(6)} / ${String(L.budget).padStart(6)} (${Math.round(cost / L.budget * 100)} %), max. Belastung ${Math.round(r.maxR * 100)} %, Brüche ${r.breaks}` : '';
  console.log(`${problems.length ? '✗' : '✓'} ${L.id.padEnd(4)} ${L.name.padEnd(22)} ${info}${problems.length ? '\n    ' + problems.join('\n    ') : ''}`);
  if (problems.length) failed++;
}
console.log(failed ? `\n${failed} Level mit Problemen` : `\nAlle ${only ? 1 : E.LEVELS.length} Level lösbar.`);
process.exit(failed ? 1 : 0);
