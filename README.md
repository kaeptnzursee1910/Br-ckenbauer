# Brückenbauer

Ein 2D-Brückenbau-Spiel für iPad und Browser. Baue Brücken aus Straße, Holz, Stahl, Seilen und Hydraulik, stelle Pfeiler in den Fluss und schau zu, ob Autos, Transporter, Lkw und Busse sicher ans andere Ufer kommen.

- **30 Level** und ein **Sandkasten** ohne Budget
- Echte Physik-Simulation: Balken dehnen sich, biegen sich und brechen bei Überlast
- Belastungsanzeige von grün (entspannt) bis rot (kurz vor dem Bruch)
- Budget, drei Sterne pro Level, Strandbälle zum Einsammeln
- Klappbrücken mit Hydraulik für durchfahrende Segelschiffe
- Touch-Steuerung für das iPad, Maus und Tastatur am Computer
- Eine einzige HTML-Datei ohne Abhängigkeiten. Fortschritt und Bauten werden im Browser gespeichert.

## Spielen

Öffne `index.html` in einem Browser.

**Auf dem iPad:** Aktiviere GitHub Pages für dieses Repository (*Settings → Pages → Build and deployment → Deploy from a branch → `main` / `/ (root)`*). Das Spiel liegt dann unter `https://<benutzername>.github.io/<repository>/`. Öffne die Adresse in Safari und wähle *Teilen → Zum Home-Bildschirm*, dann startet es wie eine App.

### Steuerung

| Aktion | iPad | Computer |
| --- | --- | --- |
| Balken bauen | Material wählen, von einem Knoten aus ziehen | gleich, mit der Maus |
| Balken umwandeln | mit einem Material auf den Balken tippen | klicken |
| Pfeiler setzen | Pfeiler wählen, über dem Fluss tippen | klicken |
| Ansicht verschieben | mit einem Finger auf freier Fläche ziehen | ziehen oder rechte Maustaste |
| Zoomen | zwei Finger | Mausrad |
| Material wählen | Werkzeugleiste | Tasten `1`–`6` |
| Testen | ▶ Testen | Leertaste |
| Rückgängig | Zurück | `Strg`/`⌘` + `Z` |

### Sterne

★ alle Fahrzeuge im Ziel · ★★ im Budget · ★★★ alle Bälle eingesammelt (in Leveln ohne Bälle: höchstens 85 % des Budgets).

## Entwicklung

Benötigt nur [Node.js](https://nodejs.org/) (ab Version 18), keine weiteren Pakete.

```sh
npm test        # prüft, dass jedes Level lösbar ist
npm run build   # erzeugt index.html aus src/
```

### Aufbau

```
src/
  head.html    Styles und HTML-Gerüst (Menüs, Werkzeugleiste, Overlays)
  engine.js    Physik (XPBD), Materialien, Fahrzeuge, Level-Geometrie – ohne DOM
  levels.js    alle Level und der Sandkasten
  ui.js        Zeichnen, Eingabe, Menüs, Speichern
tests/
  engine.js    lädt engine.js und levels.js in Node
  solutions.js eine Referenzbrücke für jedes Level
  run.js       simuliert alle Level ohne Grafik
scripts/
  build.js     fügt alles zu index.html zusammen
index.html     das fertige Spiel (wird gebaut und mit eingecheckt)
```

### Ein Level hinzufügen

1. Trage das Level in `src/levels.js` ein. Wichtige Felder:
   - `span`: Breite der Lücke in Metern
   - `yL`, `yR`: Höhe der Ufer
   - `floor`, `water`: Flussbett und Wasserspiegel; `dry: true` für eine trockene Schlucht
   - `anchors`: zusätzliche Ankerpunkte `[x, y]`
   - `rocks`: Felsen mit Ankerpunkt auf der Spitze
   - `towers`: Pylone mit Ankerpunkt oben
   - `balls`: Strandbälle `[x, y]`
   - `noBuild`: Sperrzonen `[x0, y0, x1, y1]`
   - `boat`: Schiffsdurchfahrt mit `x0`, `x1`, `top`, `t0` (Ankunft in Sekunden) und `dur` (Dauer)
   - `pillars: true`: eigene Pfeiler erlaubt
   - `mats`: erlaubte Materialien (`road`, `wood`, `steel`, `rope`, `hyd`)
   - `vehicles`: Fahrzeuge (`car`, `van`, `truck`, `bus`)
   - `budget`, `hint`
2. Lege in `tests/solutions.js` eine Referenzbrücke unter derselben ID an.
3. Führe `npm test` aus. Der Test schlägt fehl, wenn die Referenzbrücke einstürzt, das Budget überschreitet oder Bälle verfehlt, oder wenn schon eine Straße ganz ohne Stützen hält.
4. Führe `npm run build` aus und committe `index.html` mit.
