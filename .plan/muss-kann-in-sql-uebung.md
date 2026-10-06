# Muss, Kann und UNIQUE: aus der Relationenmodell-Auffrischung in die SQL-Übung

Auftrag für `erm-editor`. Stand: 06.10.2026, Gegenstück zum Lehrbuch-Commit „Grundkurs: Muss/Kann nach SQL:
CRUD“ in `lehrbuch-informatik`.

## Warum

Im Lehrbuch (Grundkurs) wandert Muss/Kann aus dem Kapitel „Relationenmodell“ in das spätere Kapitel
„SQL: CRUD & eigene Datenbank“. Dort wird `NOT NULL` erst gebraucht, und dort steht schon die Reihe
„SQL-Übung“. Die Wiedereinführung des Relationenmodells war mit Muss/Kann zu voll.

Die Quest „Muss, Kann und UNIQUE“ (heute Quest 6 der Relationenmodell-Auffrischung, `js/quest.js`) soll deshalb
an den Anfang der SQL-Übung wandern.

## Änderungen

### `rm-auffrischung`

- Quest 6 „Muss, Kann und UNIQUE“ entfernen. Die Reihe hat dann 5 Aufgaben und den Abschluss (6).
- Abschluss: Den Punkt „Muss-Beziehungen mit NOT NULL und 1:1 mit UNIQUE absichern“ streichen, ebenso den
  Schritt „Speichere unter ‚SQL erzeugen‘ den Code als .sql-Datei“.
- `SQL erzeugen` mit NOT NULL/UNIQUE ist in der Auffrischung damit nicht mehr nötig. Prüfen, ob die Häkchen
  NOT NULL und UNIQUE in dieser Reihe trotzdem sichtbar bleiben sollen (Stufe Fortgeschritten): Ja ist
  unproblematisch, sie werden nur nicht abgefragt.
- Bei der 1:1-Beziehung (Quest 3 „ist Klassensprecher“) die Erklärung prüfen: Das Lehrbuch sagt jetzt „Der
  Fremdschlüssel kommt auf eine Seite — am besten dorthin, wo jede Entität sicher einen Partner hat — und bekommt
  UNIQUE“. Das Wort „Muss-Seite“ fällt im Kapitel „Relationenmodell“ nicht mehr.

### `sql-uebung`

- Neue Quest 1 „Muss, Kann und UNIQUE“ vor den fünf Szenarien. Inhalt wie die bisherige Auffrischungs-Quest 6:
  Schul-Relationenmodell (Ergebnis der Auffrischung, als Vorgabe geladen und gesperrt wie die übrigen
  SQL-Übungs-Quests), Erklärkasten zu Muss → NOT NULL, Kann → NULL, 1:1 → UNIQUE, dieselben `sqlRegeln`.
  Neue Begriffe in der ersten Zeile des Erklärkastens: „Neuer Begriff: Muss-Beziehung · Kann-Beziehung“.
- Die Szenarien rücken auf Quest 2–6: 2 Fahrschule (Spalten genannt), 3 Flugbetrieb (Regeln genannt),
  4 Universität, 5 Tagung, 6 Katastrophenschutz (Regeln nur im Szenariotext).
- Die Reihe ist bisher eine Übungsreihe (✏️, `schritt: false`, keine Erklärquest). Mit Quest 1 als Lernquest
  bricht sie dieses Muster bewusst (Entscheidung des Nutzers). Zu klären beim Umbau: Symbol und Untertitel
  (z. B. „Muss, Kann, NOT NULL und UNIQUE“), ob Quest 1 die übrigen freischaltet oder alle frei bleiben, und ob
  `rmVorgabe` für Quest 1 dieselbe Musterlösung lädt wie für die Szenarien.
- Abschlusstext und Verweis aus `rm-experten` („Weiter geht es mit der Reihe ‚SQL-Übung‘“) bleiben passend.
- Speicherschlüssel: Durch die neue Nummerierung passt gespeicherter Fortschritt der SQL-Übung nicht mehr.
  Neuer Schlüssel wie beim letzten Umbau, oder alten Stand verwerfen.

### Tests

`test/pruefen.js` ruft `bestehen('rm-auffrischung', 1, 99)` auf und sucht SQL-Übungs-Quests nach Titel — nach dem Umbau laufen lassen und Erwartungen prüfen.

## Lehrbuch

Schon angepasst (nicht gepusht, soll mit diesem Umbau live gehen):

- Grundkurs „Relationenmodell“: Erarbeiten-Aufgabe nennt NOT NULL und UNIQUE nicht mehr.
- Grundkurs „SQL: CRUD“: „Quest 1 wiederholt Muss, Kann und UNIQUE am Schul-Beispiel. Danach nennt Quest 2 die
  Spalten, Quest 3 die Geschäftsregeln, ab Quest 4 stehen die Regeln nur im Szenariotext.“ Knackpunkte als
  Quest 2–6.
