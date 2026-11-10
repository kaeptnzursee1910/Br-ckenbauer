// Baut die einzelne, eigenständige Spieldatei index.html aus src/.
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const r = f => fs.readFileSync(path.join(root, 'src', f), 'utf8');
const body = r('head.html') + '<script>\n' + ['engine.js', 'levels.js', 'ui.js'].map(r).join('\n') + '</script>\n';
const html = '<!doctype html>\n<html lang="de">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n</head>\n<body>\n' + body + '</body>\n</html>\n';
fs.writeFileSync(path.join(root, 'index.html'), html);
console.log('index.html geschrieben (' + Math.round(html.length / 1024) + ' KB)');
