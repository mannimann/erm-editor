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
  Textmarker-Markierungen).
- Beim Öffnen mit vorhandenem Stand fragt der Editor: „Weiterarbeiten oder neu beginnen?“ Das ist
  wegen geteilter Schul-PCs nötig, damit kein Schüler den Stand seines Vorgängers übernimmt.
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
  Zeitstempel. Kein Name, ONYX kennt die Person, die hochlädt.
- Mehrfach abgeben ist möglich, in ONYX zählt die zuletzt hochgeladene Datei.
- Der normale Import lehnt das Format ab, weil das `format`-Feld nicht passt. Eine Abgabe lässt sich
  also nicht in die normale Seite laden.

### 6. Korrekturmodus mit Feedback-Liste

**Öffnen:** Szenario-Dialog → „Abgabe korrigieren“ → Szenario-Datei und Abgabe wählen.

- Passt die `pruefungsId` nicht, erscheint eine Warnung.
- **Sicherheit:** Abgaben kommen von Schülern, also von außen. Sie werden bereinigt wie Szenarien
  (bekannte Felder, Namen ohne `<` und `>`, Größenlimits), damit eine präparierte Datei im Browser der
  Lehrkraft nichts ausführt.
- Links steht die Arbeit des Schülers, nur zum Ansehen. Rechts steht die Korrekturliste.

**Liste, automatisch vorausgefüllt und von Hand änderbar:**

- **ERM-Aufgabe:** Entitätsklassen, Attribute, Primärschlüssel, Beziehungen und, falls gefordert,
  Kardinalitäten, jeder Punkt ✓ oder ✗. Die Grundlage gibt es schon: `getExpertChecklistStatus`
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

```
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

## Grenzen

- **RM-Aufgaben:** Das ERM steht als Vorgabe im Link. Ein Schüler könnte es im normalen Editor
  nachzeichnen und sich dort die Lösung anzeigen lassen. Das kostet Aufwand und Zeit, lässt sich ohne
  Server aber nicht verhindern. ERM-Aufgaben sind dicht, weil ihr Link keine Lösung enthält.
- **DevTools:** Alles, was im Browser ankommt, kann ein versierter Schüler lesen. Bei ERM-Aufgaben
  kommt keine Lösung an, bei RM-Aufgaben nur das ohnehin sichtbare ERM.
