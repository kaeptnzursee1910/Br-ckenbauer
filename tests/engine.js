// Lädt die Spiel-Engine und die Level (Browser-Skripte ohne Module) in Node.
const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '..', 'src');
const src = ['engine.js', 'levels.js'].map(f => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n');
module.exports = new Function(src + '\nreturn { MATERIALS, VEHICLES, LEVELS, SANDBOX, SANDBOX_SETS, prepLevel, Sim, designCost, layoutVehicles };')();
