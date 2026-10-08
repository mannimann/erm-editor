# Prüfungsmodus für Leistungskontrollen mit ONYX/OPAL

Stand: 07.10.2026 · Anlass: Leistungskontrollen im ERM-Editor, eingebunden in ONYX-Tests (OPAL)

## Auftrag

Schüler sollen eine Szenario-Aufgabe bearbeiten, ohne sich Lösungen, Hinweise oder Prüfergebnisse
anzeigen lassen zu können. Die Abgabe läuft als Datei über eine ONYX-Upload-Aufgabe. Die Lehrkraft
korrigiert im Editor mit einer abhakbaren Feedback-Liste, die sie in die ONYX-Korrektur kopiert. Die
Punktzahl leitet sie selbst daraus ab.

Keine eigene Seite: Der Prüfungsmodus hängt an der Aufgabe (dem Prüfungslink), nicht an der URL. Wer
die normale Seite öffnet, hat die Prüfungsaufgabe dort nicht.

Ein Tab-Wechsel-Zähler entfällt: In ONYX müssen die Schüler ohnehin zwischen den Tabs wechseln.

## Ablauf

1. **Lehrkraft:** Szenario-Dialog → Haken „Als Prüfung“ → „Prüfungslink erzeugen“. Dabei wird die
   Szenario-Datei mit Musterlösung automatisch heruntergeladen. Ohne sie kann nicht korrigiert werden.
2. **ONYX-Aufgabe:** Link im Aufgabentext, dazu eine Upload-Aufgabe (`.json` ist dort erlaubt).
3. **Schüler:** öffnet den Link, arbeitet, klickt „Abgeben“ und lädt die `.erm-abgabe.json` in ONYX hoch.
4. **Lehrkraft:** lädt die Abgaben aus ONYX herunter, öffnet sie im Editor mit „Abgabe korrigieren“ und
   ihrer Szenario-Datei, hakt die Feedback-Liste ab und kopiert sie in das ONYX-Kommentarfeld.

## Entscheidungen

- Kein „Überprüfen“ für Schüler, auch kein abgespecktes („7 von 10“). Dadurch muss die Musterlösung bei
  ERM-Aufgaben nicht im Link stehen.
- Textmarker ohne Prüfung: Schüler markieren frei, nichts wird auf Richtigkeit geprüft.
- Transformationsregeln, SQL und Tabellenvorschau (beide) sind ausgeblendet.
- Info bleibt, aber gekürzt (siehe Schritt 3).
- `.json` ist als Upload-Dateityp in ONYX möglich.
- Arbeitsstände laufen nach 2 Stunden ohne Änderung ab und lassen sich nach dem Abgeben löschen.
- Nach dem Abgeben darf weitergearbeitet werden.
- Kardinalitäten stehen in der Korrekturliste als eigene Zeile.
- Textmarker-Markierungen kommen in die Abgabe, nur zum Nachvollziehen, ohne Prüfung.
- Die Notation (Form ↔ Begriff) prüft der Editor nicht. Dafür sorgt der ONYX-Test: Symbolfrage in
  einem linearen ersten Abschnitt vor dem Link, dazu Fragen zum Lesen von Diagrammen.

## Schritte

### 1. Szenario-Format (`js/szenario.js`)

- Neues Feld `pruefung: true` in `pruefeSzenario` und `fuerDatei`.
- **ERM-Aufgabe:** Der Prüfungslink enthält **kein `erm`**, nur Titel, Text, Aufgabenart und
  Kardinalitäten-Einstellung. `pruefeSzenario` lässt ein fehlendes ER-Modell nur bei `pruefung` zu.
- **RM-Aufgabe:** Das ERM ist die Vorgabe und steht im Link.
- `pruefungsId`: Hash über Titel, Text und Aufgabenart (bei RM zusätzlich das ERM). Sie lässt sich aus
  dem Link und aus der vollständigen Szenario-Datei gleich berechnen, sodass Abgabe und Szenario
  zusammenpassen.
- Beim Erzeugen des Prüfungslinks wird die Szenario-Datei mit heruntergeladen. Im Dialog steht der
  Hinweis, dass der Link keine Lösung enthält und die Datei zum Korrigieren nötig ist.

### 2. Prüfung öffnen (`js/app.js`, `js/szenario.js`)

- Prüfungs-Szenarien landen **nicht** in „Eigene Szenarien“ (`speichern`/`liste`). Sonst könnte ein
  Schüler sie dort als Lehrkraft öffnen und im Editor die Musterlösung sehen.
- Der `#szenario=…`-Teil bleibt bei Prüfungen in der Adresszeile. Bisher entfernt ihn `replaceState`.
  Neu laden öffnet so einfach die Prüfung wieder.
- Der Arbeitsstand wird je `pruefungsId` im localStorage gesichert (ERM bzw. Relationen und
  Textmarker-Markierungen), zusammen mit dem Zeitpunkt der letzten Änderung.
- **Geteilte Schul-PCs:** Kein Schüler soll den Stand seines Vorgängers sehen. Drei Schutzstufen:
  1. **Ablauf nach 2 Stunden:** Beim Laden der Seite werden alle Prüfungs-Arbeitsstände gelöscht,
     deren letzte Änderung älter als 2 Stunden ist, auch die anderer Prüfungen. Maßgeblich ist die
     letzte Änderung, nicht der Beginn: Wer arbeitet, hält seinen Stand frisch. Die 2 Stunden sind
     eine Konstante im Code.
  2. **Löschen nach dem Abgeben:** siehe Schritt 5.
  3. **Nachfrage beim Öffnen:** Gibt es einen jüngeren Stand, fragt der Editor: „Auf diesem Gerät gibt
     es schon eine Bearbeitung (zuletzt geändert 10:42). Ist das deine?“ → Weiterarbeiten / Neu
     beginnen.
- `body.pruefung` sorgt für eine deutliche Kopfzeile „PRÜFUNG · Titel“ in eigener Farbe. So ist auf
  einen Blick zu sehen, ob ein Schüler im Prüfungsmodus oder auf der normalen Seite arbeitet.

### 3. Ausblenden im Prüfungsmodus

Fast nur CSS über `body.pruefung`. Dazu kommen Guards in JS, damit Tastenkürzel und direkte Aufrufe
nichts öffnen.

- Musterlösungs-Bereich: Lösung anzeigen, Tabellenvorschau und SQL der Musterlösung
- „✔ Überprüfen“ (RM), Checkliste und Hinweise im Aufgabenpanel
- „📋 Regeln“ (Transformationsregeln)
- „🛢 SQL erzeugen“ und „🧾 Tabellenvorschau“ der eigenen Relationen
- Lernpfad-Menü, Lernpfad schließen, „Eigenes Szenario“
- Import und Export für ERM und RM (JSON und PNG), „🗑 Neu“

**Info gekürzt:** Es bleiben die Bedienung (PS/FS-Checkboxen, PS und FS gleichzeitig) und die
Schreibweise für umbenannte Fremdschlüssel. Ausgeblendet werden der Absatz zu „Überprüfen“, der
Abschnitt „SQL erzeugen“ und die Erwähnungen der Musterlösung in der Zeichenlegende.

### 4. Freier Textmarker (`js/lernpfad.js`, `textmarker`)

- Im Prüfungsmodus gibt es keine Spec, also keine Prüfung und keinen Klickzähler.
- Die Legende (Entitätsklasse, Attribut, Beziehung) wird zur Stiftauswahl. Ein Klick auf ein Wort
  markiert es in der gewählten Farbe, ein erneuter Klick entfernt die Markierung.
- Markiert wird nur das angeklickte Wort, nicht alle Vorkommen.
- Die Markierungen gehören zum Arbeitsstand und überstehen ein Neuladen.

### 5. Abgeben

- Button „Abgeben“ im Aufgabenpanel, er lädt `<Titel>.erm-abgabe.json` herunter.
- Inhalt: `format: "erm-editor-abgabe"`, `version`, `pruefungsId`, Titel, ERM bzw. Relationen,
  Textmarker-Markierungen, Zeitstempel. Kein Name, ONYX kennt die Person, die hochlädt.
- Nach dem Download fragt ein Dialog: „Datei in ONYX hochgeladen? Dann Arbeitsstand auf diesem Gerät
  löschen.“ → Löschen / Weiterarbeiten.
- Nach dem Abgeben darf weitergearbeitet und erneut abgegeben werden, in ONYX zählt die zuletzt
  hochgeladene Datei.
- Der normale Import lehnt das Format ab, weil das `format`-Feld nicht passt. Eine Abgabe lässt sich
  also nicht in die normale Seite laden.

### 6. Korrekturmodus mit Feedback-Liste

**Öffnen:** Szenario-Dialog → „Abgabe korrigieren“ → Szenario-Datei und Abgabe wählen.

- Passt die `pruefungsId` nicht, erscheint eine Warnung.
- **Sicherheit:** Abgaben kommen von Schülern, also von außen. Sie werden bereinigt wie Szenarien
  (bekannte Felder, Namen ohne `<` und `>`, Größenlimits), damit eine präparierte Datei im Browser der
  Lehrkraft nichts ausführt.
- Links steht die Arbeit des Schülers, nur zum Ansehen. Rechts steht die Korrekturliste.
- Der Aufgabentext erscheint mit den Textmarker-Markierungen des Schülers. Sie werden nicht geprüft
  und kommen nicht in die Liste, sie helfen nur beim Nachvollziehen der Lösung.

**Liste, automatisch vorausgefüllt und von Hand änderbar:**

- **ERM-Aufgabe:** Entitätsklassen, Attribute, Primärschlüssel, Beziehungen und, falls gefordert,
  Kardinalitäten, jeder Punkt ✓ oder ✗. Die Kardinalität steht als eigene Zeile unter der
  Beziehung, z. B. „✓ Beziehung „bucht“ zwischen Gast und Zimmer“ und darunter „✗ Kardinalität
  „bucht“: 1:n erwartet, n:m gezeichnet“. Die Grundlage gibt es schon: `getExpertChecklistStatus`
  (`js/lernpfad.js`) liefert die Punkte einzeln mit `ok`.
- **RM-Aufgabe:** Relationen, Attribute, Primärschlüssel und Fremdschlüssel einzeln. Dafür muss die
  Prüfung in `js/relmodel.js` (`checkAndGetResult`) ihre Einzelbefunde als Liste zurückgeben. Bisher
  kommt nur `passed` heraus, die Befunde stecken als HTML im Feedback. Das ist der größte Umbau.
- **Zusätzlich im Modell:** Was der Schüler hat und die Musterlösung nicht. Diese Punkte sind als
  Hinweis vorausgewählt und abwählbar.
- Ein Klick auf einen Punkt schaltet zwischen ✓ und ✗ um, etwa um ein Synonym gelten zu lassen.
- Zeile „+ eigene Anmerkung“ für freie Punkte, dazu ein Feld für einen Gesamtkommentar.

**Kopieren:** Der Button „📋 Feedback kopieren“ erzeugt reinen Text mit Zeilenumbrüchen, den jedes
ONYX-Kommentarfeld annimmt:

```text
Feedback: Hotel-Verwaltung

Entitätsklassen (2/3)
✓ Gast
✓ Zimmer
✗ Buchung – fehlt

Attribute (6/8)
✓ Gast: Gastnummer (Primärschlüssel)
✗ Zimmer: PreisProNacht – fehlt
…

Zusätzlich im Modell
• Entitätsklasse „Rechnung“ ist nicht Teil der Aufgabe

Anmerkung: …
```

Die Zähler helfen beim Ableiten der Punkte. Eine Punktzahl rechnet der Editor nicht aus.

**Nächste Abgabe:** „Weitere Abgabe öffnen“ lädt die nächste Datei, die Szenario-Datei bleibt geladen.
Stapel-Korrektur mehrerer Dateien auf einmal kommt bei Bedarf später.

### 7. Tests (`test/pruefen.js`)

- Ein Prüfungslink einer ERM-Aufgabe enthält keine Namen von Entitätsklassen und Attributen.
- Der normale Import lehnt eine Abgabe ab.
- Die `pruefungsId` aus dem Link und aus der Szenario-Datei ist gleich.
- Eine präparierte Abgabe (`<script>` in Namen, zu groß, unbekannte Felder) wird bereinigt bzw. abgelehnt.
- Korrekturliste: Die Musterlösung als Abgabe ergibt nur ✓, eine leere Abgabe nur ✗, jeweils für ERM
  und RM.
- Ablauf: Ein Arbeitsstand mit letzter Änderung vor über 2 Stunden wird beim Laden gelöscht, ein
  jüngerer bleibt.

## Grenzen

- **RM-Aufgaben:** Das ERM steht als Vorgabe im Link. Ein Schüler könnte es im normalen Editor
  nachzeichnen und sich dort die Lösung anzeigen lassen. Das kostet Aufwand und Zeit, lässt sich ohne
  Server aber nicht verhindern. ERM-Aufgaben sind dicht, weil ihr Link keine Lösung enthält.
- **DevTools:** Alles, was im Browser ankommt, kann ein versierter Schüler lesen. Bei ERM-Aufgaben
  kommt keine Lösung an, bei RM-Aufgaben nur das ohnehin sichtbare ERM.

## Umsetzung (07.10.2026)

Abweichungen vom Plan:

- Neue Datei `js/pruefung.js` (Prüfung, Abgabe, Korrektur). Prüfung und Korrektur laufen als
  Sonder-Lernpfad (`Lernpfad.setSonderLernpfad`), der in keinem Menü steht.
- RM-Korrekturliste: kein Umbau von `checkAndGetResult` nötig. `getRelmodelChecklistStatus` liefert die
  Einzelpunkte schon und gibt jetzt zusätzlich `extras` (überzählige Relationen und Attribute) zurück.
- Ausblenden nur per CSS (`body.pruefung`). Es gibt keine Tastenkürzel, die die ausgeblendeten
  Funktionen öffnen. JS-Guards entfallen, weil sie gegen DevTools ohnehin nicht helfen.
- „Selbst ausprobieren“ öffnet eine Prüfung im neuen Tab, so wie die Schüler sie sehen.
- Korrektur: erst die Szenario-Datei wählen, dann führt ein Dialog zur Abgabe (zweites Dateifenster
  braucht einen Klick). Die Abgabe ist im Editor gesperrt, nur zum Ansehen.
- „Ist das deine?“: Abbrechen oder Esc heißt weiterarbeiten, damit ein versehentlicher Klick nichts
  löscht. Im selben Tab fragt ein Neuladen nicht erneut (sessionStorage).

## Überarbeitung (07.10.2026, nach erstem Test)

- **Sperre ohne CSS:** Was die Prüfung ausblendet, steht als Liste `GESPERRT` in `js/pruefung.js`. Daraus
  entsteht die CSS-Regel, und ein Klick-Abfänger (Capture-Phase) sperrt dieselben Elemente. So bleibt
  auch bei Firefox „Ansicht → Webseiten-Stil → Kein Stil“ alles gesperrt. Die Musterlösung des
  Relationenmodells wird in der Prüfung gar nicht erst in die Seite geschrieben (`renderSolution`).
  Gegen die Entwicklerwerkzeuge hilft das nicht.
- **Korrektur als eigene Ansicht:** Einstieg über das Menü (Lernpfade → Für Lehrkräfte → „📝 Abgaben
  korrigieren“), über den Szenario-Dialog, oder indem man eine Abgabe importiert bzw. als Szenario öffnet.
  Rechts steht eine Seitenleiste mit drei Schritten: Szenario-Datei, Abgaben (mehrere, Liste zum
  Wechseln, Status „kopiert“), Korrekturliste mit „Feedback kopieren“ und „Nächste Abgabe“. Dateien
  werden am Inhalt erkannt, egal über welchen Knopf oder per Ziehen ins Fenster. Fehler stehen in der
  Seitenleiste, statt als Dialog zu verschwinden. Die Szenario-Datei bleibt im Browser gespeichert,
  fürs nächste Mal.
- Die Szenario-Datei einer Prüfung über „Szenario öffnen“ oder „Importieren“ fragt: korrigieren oder
  wie Schüler ansehen.
- Hinweis-Dialoge (`showAlertModal`) schließen sich nicht mehr von selbst.

## Absicherung (07.10.2026, zweite Runde)

- **Überführen ohne ERM-Daten:** Der Prüfungslink einer RM-Aufgabe enthält das ER-Modell nur als Bild
  (`ermBild`: SVG aus `App.diagrammSvg(true)`, ohne Kennungen und Klickflächen) und eine Kennung
  (`ermId`, Hash des ER-Modells) für die Prüfungs-ID. Im Browser der Schüler gibt es damit keine
  Daten, aus denen `relmodel.js` die Lösung berechnen könnte. Das Bild wird als `<img>` gezeigt, so
  laufen in einem präparierten SVG keine Skripte. Die Szenario-Datei der Lehrkraft enthält weiter das
  ER-Modell, nur mit ihr geht die Korrektur. Ein entpackter Link wird dort abgelehnt.
- **Szenario-Datei der Korrektur** nur in `sessionStorage` (dieser Tab), nicht mehr in `localStorage`.
  Beim Beenden der Korrektur werden die Arbeitsstände der Schüler aus dem Browser gelöscht.
- **Prüfbericht:** Warnung, wenn das Szenario einer eingebauten Übung gleicht (mindestens 60 % gleiche
  Entitätsklassen), weil Schüler dort mit Lösung üben könnten.
- **Hinweis beim Erzeugen des Links:** Szenario-Datei nicht weitergeben und nicht auf einem Schul-PC
  liegen lassen; dort auch das eigene Modell im Editor löschen.
- **Bleibt offen:** Bei RM-Aufgaben kann ein Schüler das ER-Modell aus dem Bild im normalen Editor
  nachzeichnen und sich dort die Lösung zeigen lassen. Eine Sperre im selben Browser (localStorage)
  ließe sich mit einem privaten Fenster umgehen und würde die nächste Klasse am Gerät behindern.
  Darum gibt es sie nicht. Verhindern ließe sich das nur mit Server und Anmeldung.

## Dritte Runde (07.10.2026)

- **Kurzer Link beim Überführen:** Statt eines SVG trägt der Link das Bild als Zahlenlisten
  (`ermBild`: Formen mit Größe und Text, Linien, Kardinalitäten; Format in `Szenario.pruefeErmBild`).
  Erzeugt wird es aus der Zeichenfläche der Lehrkraft (`Pruefung.ermBildAusEditor`), gezeichnet im
  Browser der Schüler (`Pruefung.ermBildSvg`, wie `js/diagram.js`). Wer womit verbunden ist, steht
  nirgends. Ergebnis: Hotel 706 statt 2143 Zeichen, Universität 1063. Das ist kürzer als ein Link
  mit den ERM-Daten. Der SVG-Umbau des PNG-Exports ist wieder entfernt.
- „Nur die Funktion entfernen, die die Lösung ausrechnet“ reicht nicht: Mit den ERM-Daten im Link
  kopiert ein Schüler sie in den normalen Editor und lässt sich dort die Lösung zeigen.
- **Korrektur bleibt im Browser gespeichert** (`erm-editor-korrekturen-v1`: Szenario-Datei, Abgaben,
  Korrekturlisten, zuletzt angesehene Abgabe). Doppelte Abgaben werden erkannt. „🗑 Löschen …“ im Kopf
  der Seitenleiste löscht entweder nur die Abgaben oder Abgaben und Szenario. Das ersetzt die
  `sessionStorage`-Lösung der zweiten Runde.

## Vierte Runde: Bereich für Lehrkräfte (07.10.2026)

Ziel: Andere Lehrkräfte sollen Übungen und Prüfungen ohne Erklärung erstellen können.

- **Menü „Für Lehrkräfte“:** „🔗 Links zu den Lernpfaden“, „🛠 Übung oder Prüfung erstellen“, „📝 Abgaben
  korrigieren“. „Szenario öffnen“ entfällt: Dateien öffnet „Importieren“ (erkennt Übung, Lösungsdatei und
  Abgabe), Entwürfe lädt die Seitenleiste. Die Gruppe „Eigene Szenarien“ heißt „Eigene Übungen“.
- **Seitenleiste statt Dialog** (`#erstellen-panel`, Kopfzeile türkis): Links bleibt der Editor frei zum
  Zeichnen, rechts stehen fünf Schritte: 1. Übung oder Prüfung (Karten mit je einem Satz Wirkung),
  2. Aufgabe der Schüler, 3. Titel und Text, 4. Musterlösung mit Prüfbericht, der beim Zeichnen
  mitläuft, 5. Weitergeben (gesperrt mit „Noch offen: …“, solange etwas fehlt).
- **Eigener Speicherplatz für die Musterlösung** (`AppState.modellPlatzSetzen`): Beim Öffnen kommt der
  Entwurf auf die Zeichenfläche, beim Schließen das freie Modell zurück. „📋 Mein Modell übernehmen“
  holt ein schon gezeichnetes Modell in den Entwurf. Der Entwurf wird automatisch gespeichert;
  „📂 Datei laden“ und „🗑 Neu beginnen“ stehen oben in der Seitenleiste.
- **Prüfung weitergeben:** 1. „Lösungsdatei speichern“ (`Titel (Lösungsdatei).erm-szenario.json`),
  2. „Prüfungslink kopieren“, erst danach frei und wieder gesperrt, sobald sich der Entwurf ändert.
  Dazu „▶ Als Schüler ansehen“ (neuer Tab) und „📝 Abgaben korrigieren“ (öffnet die Korrektur mit
  diesem Entwurf als Lösungsdatei).
- **Übung weitergeben:** Link kopieren, als Datei speichern, ausprobieren (zurück mit „✎ Zurück zum
  Bearbeiten“).
- Überführen: Aufgabentext freiwillig, Knopf „🧾 Erwartete Relationen ansehen“.
- Einheitliche Wörter: Übung, Prüfung, Lösungsdatei (auch in der Korrektur). Die Lösungsdatei über
  „Importieren“ fragt: Abgaben korrigieren, bearbeiten oder als Schüler ansehen.
- Gemeinsame CSS-Klassen beider Seitenleisten: `lk-*`.

## Fünfte Runde: Leisten unten (07.10.2026)

- **Erstellen und Korrektur unten** (`.lk-leiste`, `position: fixed` wie die Aufgabenleiste, rechts bis
  zum Relationenmodell; `syncAufgabePanelRight` setzt `right`). Rechts gibt es keine zweite
  Seitenleiste mehr. Damit ist der Fehler beim Ziehen der Relationenmodell-Breite weg: Die Breite
  wurde vom rechten Rand des Layouts aus gerechnet und war um die Breite der Korrektur-Leiste zu groß.
- **Schritte als Reiter:** Erstellen mit „1 · Art“, „2 · Text“, „3 · Musterlösung“ (beim Überführen
  „3 · ER-Modell“), „4 · Weitergeben“, dazu „Zurück“ und „Weiter“ sowie ✓ an erledigten Schritten. Der
  zuletzt offene Reiter wird gemerkt. Bei einer Prüfung stehen 1 Lösungsdatei und 2 Prüfungslink
  nebeneinander im Reiter 4.
- **Korrektur** mit „1 · Lösungsdatei“, „2 · Abgaben (n)“, „3 · Korrigieren“ und „📄 Aufgabentext“
  (Markierungen des Schülers). Die Liste läuft in Spalten über die Breite. Im Fuß stehen ◀, die
  aktuelle Abgabe, „Feedback kopieren“ und „Nächste Abgabe“. Die Aufgabenleiste ist in der Korrektur
  ausgeblendet. Der Reiter folgt dem Fortschritt (Datei gewählt → Abgaben → Korrigieren).
- **Ziehgriff:** Die Höhe beider Leisten lässt sich an der Oberkante ziehen und wird gemerkt
  (`erm-editor-lk-hoehe-v1`).
- **Menü „Für Lehrkräfte“:** drei gleich breite Knöpfe nebeneinander, einspaltig (bis 1000 px)
  untereinander.

## Sechste Runde: Übersicht und Feinschliff (08.10.2026)

- **Reiter „☰ Übersicht“** ganz links beim Erstellen: gespeicherte Prüfungen und Übungen getrennt, der
  offene Entwurf hervorgehoben, je Eintrag 🗑 (mit Rückfrage), dazu „➕ Neu erstellen“ und
  „⬆ Datei laden“ (legt einen neuen Entwurf an statt den offenen zu ersetzen). „Neu beginnen“ entfällt.
- **Mehrere Entwürfe:** `erm-editor-entwuerfe-v1` = `{ aktiv, liste: [{ id, titel, text, aufgabe,
  kardinalitaeten, pruefung, gesichert, reiter, geaendert }] }`, das ER-Modell je Entwurf unter
  `erm-editor-szenario-entwurf-erm-v1:<id>`. Der alte Einzelentwurf wird beim ersten Laden umgezogen.
  Bei offener Leiste gibt es immer einen aktiven Entwurf; leere Entwürfe zeigt die Übersicht nicht, sie
  fallen beim Wechseln weg.
- **Korrigieren:** Abschnitte (Entitätsklassen, Beziehungen · Kardinalitäten, Attribute, …, „Eigene
  Punkte“, „Anmerkung“) als Reiter links untereinander mit Zählern, der Inhalt rechts daneben in Spalten;
  links und rechts scrollen getrennt. Der gewählte Abschnitt bleibt beim Wechsel der Abgabe. „Zusätzlich im Modell“ ist zunächst ✗ und
  kommt nur auf Wunsch ins Feedback. „Feedback kopieren“ nur im Reiter „Korrigieren“.
- **Aufgabentext in der Korrektur:** deutlicher Hinweis, dass die Markierungen vom Schüler stammen.
- Titel und Text stehen immer übereinander.
- Löschen, Andere wählen, Datei laden als Knöpfe; Dateiwahl mit ⬆. Das Textfeld des Aufgabentexts
  wächst mit der Höhe der Leiste. Der Griff sitzt wie bei der Aufgabenleiste 1,5 px über der Kante.
- „🧾 Erwartete Relationen ansehen“ zeigt die Lösung ohne Rückfrage (`RelModel.loesungAnzeigen`).
- **Überführen:** Der Text ist ein freiwilliger Hinweis (Reiter „2 · Hinweise“, beim Schüler unter
  „Hinweise:“), ohne Textmarker – auch nicht in Prüfung und Korrektur.
- Löschen in der Korrektur als zurückhaltender Knopf (`.lk-gefahr`, rot erst beim Zeigen).
- **Schmale Leiste:** Die Leisten richten sich nach ihrer eigenen Breite (`container: lk`), nicht
  nach dem Bildschirm – sie werden auch schmal, wenn das Relationenmodell offen ist. Unter 920 px stehen
  die Reiter unter Titel und Knöpfen (Schließen, gespeichert, Löschen bleiben oben rechts); unter 760 px Art-Karten und Übersicht einspaltig; unter 640 px die Abschnitte der
  Korrektur oben und alles scrollt zusammen. Geprüft mit 1400–640 px, mit und ohne Relationenmodell.
- Kein Passwort für die Lösungsdatei; doppelte Entwürfe beim erneuten Laden bleiben so.
