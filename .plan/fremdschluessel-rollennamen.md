# Fremdschlüssel mit reinem Rollennamen in der Relationenmodell-Prüfung zulassen

Stand: 07.10.2026 · Anlass: Abgleich der Benennungskonventionen mit dem Lehrbuch
(lehrbuch-informatik, Kapitel „Relationenmodell“ in Klasse 9 und Grundkurs)

## Auftrag

Die Relationenmodell-Prüfung soll einen Fremdschlüssel auch dann als richtig erkennen, wenn er
**nur nach seiner Rolle** benannt ist, etwa `leitung` in `buehne` oder `vorgesetzter` in
`mitarbeiter`. Bisher fällt so ein Name durch. Darum steht im Lehrbuch der Hinweis, im Editor die
Rolle als Zusatz zu schreiben (`Personalnr-Vorgesetzter`).

Die Prüfung darf dadurch nicht beliebig werden: Ein falsch platzierter oder überzähliger
Fremdschlüssel muss weiterhin als Fehler auffallen.

## Benennungskonventionen (Lehrbuch)

1. **Name des Primärschlüssels**, wenn er sprechend ist: `besuchernr↑`, `personalnr↑`.
2. **Tabellenname**, wenn der Primärschlüssel nichtssagend ist (`name`, `id`, `bezeichnung`):
   kurz `band↑` oder mit Schlüssel `band_name↑`, `ort_id↑`.
3. **Rollenname**, Pflicht bei Selbstbeziehung oder zwei Fremdschlüsseln auf dieselbe Tabelle,
   sonst optional: `vorgesetzter↑`, `heim_mannschaft↑`, `leitung↑`.

## Was der Editor schon kann

`js/relmodel.js`, `fkMatches` / `fkRawNameMatches`:

- Konvention 1: exakter Name des Primärschlüssels, auch mit Zusatz davor oder danach, getrennt
  durch `-`, `_` oder Leerzeichen (`Personalnr-Vorgesetzter`, `fk_SchülerNr`).
- Konvention 2: Name der Zieltabelle (`_fkTabelle`), sobald genau ein Fremdschlüssel aus dieser
  Beziehung auf die Tabelle zeigt, ebenfalls mit Zusatz (`band_name`, `ort_id`, `heim_mannschaft`).
- Selbstbeziehung: zusätzlich angehängte Ziffern (`schülernr1`, `schülernr2`).

Konvention 3 geht also nur, wenn Primärschlüssel oder Tabellenname im Namen vorkommen.

## Ansatz

Zuordnung über das **Ziel** statt über den Namen, als letzte Stufe nach dem Namensvergleich:

1. Das Relationenmodell-Formular bekommt beim Fremdschlüssel die Auswahl „verweist auf“. Im
   SQL-Panel gibt es sie schon (`fkTarget` in `js/sql.js`); beide sollten dasselbe Feld nutzen.
2. In der Prüfung: Ein Schüler-Fremdschlüssel, dessen Name zu keinem Lösungs-Fremdschlüssel passt,
   wird einem **noch freien** Lösungs-Fremdschlüssel derselben Relation zugeordnet, dessen
   Zieltabelle (`_fkSourceEntity`) zum gewählten `fkTarget` passt.
3. Ohne `fkTarget` bleibt es beim bisherigen Verhalten. Die Rückmeldung kann dann vorschlagen,
   bei „verweist auf“ das Ziel zu wählen oder Schlüssel bzw. Tabelle in den Namen zu nehmen.
4. Bei einem zusammengesetzten Ziel-Schlüssel gelten die Fremdschlüssel gruppenweise, wie bisher
   in `js/sql.js` (gleiches Ziel und gleicher Zusatz).

## Grenzen

- Zeigen zwei Fremdschlüssel derselben Relation auf dieselbe Tabelle (`startet_von` / `landet_in`,
  `heim` / `gast`), merkt die Prüfung nicht, wenn die Rollen vertauscht sind. Das ist hinnehmbar:
  Die Namen sind frei wählbar, die Struktur stimmt trotzdem.
- 1:1-Beziehungen: Die Prüfung auf „Fremdschlüssel in beide Richtungen eingetragen“
  (`resolvedSourceFkName`) sucht den Fremdschlüssel bisher über den Namen. Sie muss die neue
  Zuordnung über das Ziel mitnutzen, sonst rutscht ein Rollenname dort durch.
- Die Musterlösung zeigt weiterhin Namen nach Konvention 1 oder 2; Rollennamen werden nur
  akzeptiert, nicht vorgeschlagen.

## Tests

In `test/pruefen.js`, Teil 3 (Relationenmodell-Prüfung), ergänzen:

- `buehne.leitung` mit `fkTarget` auf `mitarbeiter` → richtig.
- Derselbe Name ohne `fkTarget` → wie bisher nicht zugeordnet.
- Rollenname mit falschem Ziel → Fehler.
- Zwei Rollennamen auf dieselbe Tabelle (Flugbetrieb: `start`, `ziel`) → beide richtig.
- 1:1 mit Rollenname auf einer Seite und zusätzlichem Fremdschlüssel auf der anderen → Hinweis
  „beide Richtungen“ erscheint weiterhin.

## Offene Fragen

- Soll „verweist auf“ im Relationenmodell-Formular immer sichtbar sein oder nur aufklappbar, damit
  das Formular für Klasse 9 schlank bleibt?
- Soll der Editor bei einem nichtssagenden Fremdschlüsselnamen wie `name` oder `id` einen Hinweis
  geben (Konvention 2), auch wenn die Prüfung ihn akzeptiert?

# weiteres TODO

Prüfe nochmal die Logik beim Überprüfen des Relationenmodells. Ich habe das Gefühl, dass das noch nicht komplett korrekt funktioniert. Teste vor allem die Hinweise in der Hinweisbox oberhalb des Relationenmodells.
