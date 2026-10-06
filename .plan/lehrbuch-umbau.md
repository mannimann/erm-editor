# Lehrbuch nachziehen — Umbau des ERM-Editors

Auftrag für `lehrbuch-informatik`. Stand: 06.10.2026, Gegenstück zu `.plan/erm-editor-umbau.md` dort.
Der Editor-Umbau liegt im Branch `quest-reihen-umbau` des Repos `erm-editor` und ist **noch nicht live**:
GitHub Pages veröffentlicht `main`. Editor und Lehrbuch sollten gemeinsam live gehen, weil die Kapitel heute
Reihen und Quest-Nummern nennen, die es danach nicht mehr gibt.

Live schalten: `git checkout main && git merge quest-reihen-umbau && git push` (im Repo `erm-editor`).

Die Grundkurs-Kapitel sind als geprüft markiert: Änderungen dort nur nach Bestätigung.

---

## 1 Was der Editor jetzt kann

### Quest-Reihen

Direktstart über einen Link: `https://erm-editor.jmann.info/?reihe=<ID>`, optional `&quest=<Nummer>` (springt
nur, wenn die Quest freigeschaltet ist; in Szenario-Reihen ist jede Quest außer dem Abschluss frei). Im Menü
„⚔️ Quests“ stehen die Reihen in zwei Spalten, „Einstieg“ und „Fortgeschritten“.

| ID | Reihe | Quests |
| --- | --- | --- |
| **Einstieg** | | |
| `erm-grundlagen` | ERM-Grundlagen (ohne Kardinalitäten) | 1 Erste Entitätsklasse · 2 Attribute hinzufügen · 3 Primärschlüssel setzen · 4 Zweite Entitätsklasse · 5 Attribute für Klasse · 6 Beziehung erstellen · 7 Dritte Entitätsklasse · 8 Zweite Beziehung · 9 Beziehungsattribute · 10 Weitere Beziehung ergänzen · 11 Abschluss |
| `erm-kardinalitaeten` | ERM-Kardinalitäten (neu) | 1 Kardinalität und Leserichtung („geht in“ n:1 vorgegeben) · 2 Beide Richtungen prüfen („unterrichtet“) · 3 Eins zu eins („ist Klassensprecher“, nur Sachverhalt) · 4 Eine Beziehung selbst bestimmen („ist Klassenleiter von“, Lehrer 1:n Klasse) · 5 Abschluss |
| `erm-uebung` | ERM-Übung | 1 Hotel-Verwaltung (ohne Kardinalitäten) · 2 Krankenhaus-System · 3 Bibliothek · 4 Fußball-Turnier · 5 Fitnessstudio-Kursplanung · 6 Abschluss |
| `rm-grundlagen` | Relationenmodell-Grundlagen | 1 Seitenleiste öffnen · 2 Relationen anlegen · 3 Attribute hinzufügen · 4 Primärschlüssel markieren · 5 1:n „geht in“ · 6 1:1 „ist Klassensprecher“ · 7 n:m „unterrichtet“ · 8 Beziehungsattribut „Fach“ · 9 Abschluss |
| `rm-uebung` | Relationenmodell-Übung | dieselben fünf Szenarien wie ERM-Übung (ER-Modell wird geladen) · 6 Abschluss |
| **Fortgeschritten** | | |
| `erm-auffrischung` | ERM-Auffrischung | 1 Entitätsklassen mit Schlüsseln · 2 Beziehungen mit Kardinalitäten · 3 Beziehungsattribut · 4 Zwei Beziehungen zwischen denselben Klassen · 5 Selbstbeziehung · 6 Verbundschlüssel (Klassenstufe + Parallelklasse) · 7 Abschluss |
| `erm-experten` | ERM-Experten | 1 Fahrschule · 2 Flugbetrieb · 3 Universität · 4 Tagung · 5 Katastrophenschutz-Leitstelle · 6 Abschluss |
| `rm-auffrischung` | Relationenmodell-Auffrischung | 1 Relationen mit Schlüsseln · 2 Zusammengesetzter Fremdschlüssel · 3 1:1 „ist Klassensprecher“ · 4 Beziehungstabelle „unterrichtet“ · 5 Selbstbeziehung „ist befreundet mit“ · 6 Muss, Kann und UNIQUE · 7 Abschluss |
| `rm-experten` | Relationenmodell-Experten | dieselben fünf Szenarien wie ERM-Experten, zusätzlich NOT NULL und UNIQUE nach Regeln im Aufgabentext · 6 Abschluss |

Die ERM-Kardinalitäten übernehmen das eigene Schul-ERM, wenn alle Aufgaben der ERM-Grundlagen gelöst sind
(der Abschluss zählt nicht); sonst lädt der Editor eine Vorlage. Während der Quest steht an jeder Linie „?“,
bis die Kardinalität gesetzt ist. Im freien Editor bleibt eine fehlende Kardinalität einfach leer.

Gespeicherter Fortschritt aus den alten Reihen wird **nicht übernommen** (neue Speicherschlüssel). Wer schon
angefangen hat, beginnt die Reihe neu — am besten in der Klasse ankündigen.

### Weitere Änderungen, die die Kapitel betreffen

- **Namen:** Groß- und Kleinschreibung, Leerzeichen, `-`, `_` und ä/ae, ö/oe, ü/ue, ß/ss spielen beim
  Vergleich keine Rolle („Lehrerkürzel“ = „Lehrer-Kürzel“, „AnzahlNächte“ = „AnzahlNaechte“). Hinweise wie
  „Übernimm alle Namen genau — nur dann erkennt der Editor sie“ können weicher werden.
- **Fremdschlüssel-Namen im Relationenmodell:** Der Editor erkennt einen Fremdschlüssel, wenn er heißt wie
  der Primärschlüssel, auf den er zeigt (`Gastnummer`), mit Zusatz (`SchülerNr-Freund`, `Flughafencode-Start`)
  oder wie die Tabelle, auf die er zeigt (`Gast`, wie `mannschaft↑` im Lehrbuch). **Nicht** erkannt werden
  reine Rollennamen wie `vorgesetzter`, `leitung`, `klassenleiter`, `vertreter`, `geworben_von` — im Editor
  schreibt man sie als Zusatz: `Personalnr-Vorgesetzter`.
- **Schalter „Kardinalitäten“** im Header (Standard: an). Ausgeschaltet zeichnet man ER-Modelle ohne Zahlen,
  der Dialog „Beziehung bearbeiten“ fragt dann nicht nach der Kardinalität. Quests setzen den Schalter selbst.
  Ins Relationenmodell überführen lässt sich ein Modell erst mit Kardinalitäten (der Editor meldet das).
- **„SQL erzeugen“** in der Relationenmodell-Seitenleiste: `CREATE TABLE` für SQLite in derselben Form wie im
  Kapitel „Eigene Datenbank“ (klein geschrieben, `INTEGER PRIMARY KEY`, `REFERENCES tabelle(spalte)`,
  zusammengesetzter Schlüssel als letzte Zeile, Tabellen mit Verweis nach ihren Zieltabellen). Datentyp je
  Spalte wählbar, Fremdschlüssel übernehmen den Typ. In der Stufe Fortgeschritten zusätzlich `NOT NULL` und
  `UNIQUE` in der Reihenfolge des Grundkurses (`leitung INTEGER NOT NULL UNIQUE REFERENCES …`); ohne Quest per
  Häkchen. Kopieren oder als `.sql` speichern. `CHECK` erzeugt der Editor nicht.
- **Begriffe:** Beziehungstabelle (überall); Selbstbeziehung, in der Auffrischung „(auch: rekursive
  Beziehung)“. Neue Begriffe stehen in der ersten Zeile des Erklärkastens nach einer gelösten Quest:
  „Neuer Begriff: Entitätsklasse · Symbol: Rechteck“.
- **Checkliste** im Quest-Fenster jetzt auch in den Relationenmodell-Szenarien (Übung und Experten).

---

## 2 Änderungen je Kapitel

### `src/modules/klasse9/lb1/ErModell.vue`

Das Kapitel ist schon „ohne Kardinalitäten“ gedacht (Merkkasten: „Die Zahlen an den Linien … sicherst du im
Kapitel ‚Kardinalitäten‘“). Jetzt passt der Editor dazu.

- Aufgabe „Die ERM-Grundlagen-Quest“: Reihe heißt **„ERM-Grundlagen“**; Knopf auf
  `https://erm-editor.jmann.info/?reihe=erm-grundlagen`.
- Hinweis-Kasten:
  - Punkt „Ab Quest 6 stellst du an jeder Beziehung Zahlen ein …“ **streichen**.
  - „Übernimm alle Namen genau so …“ ersetzen durch: „Übernimm die Namen aus der Quest. Groß- und
    Kleinschreibung, Leerzeichen, Bindestriche und ä/ae spielen keine Rolle.“
- Begriffstabelle: Die Quests liefern Entitätsklasse (Rechteck), Entität (kein Symbol), Attribut (Ellipse),
  Primärschlüssel (unterstrichenes Attribut), Beziehung (Raute), Beziehungsattribut (Ellipse an der Raute).
  Kardinalität kommt erst im nächsten Kapitel.
- Bild `erm_schule.svg` (InfoKarte „Das fertige Schul-ERM“) ist veraltet: Es zeigt Kardinalitäten und
  „ist befreundet mit“. Neu: Schul-ERM ohne Zahlen und ohne Selbstbeziehung. Vorlage im Editor:
  „⬆ Importieren“ → `files/schule-ohne-kardinalitaeten.json` aus dem Repo `erm-editor`, dann „🖼 PNG-Export“
  (Schalter „Kardinalitäten“ aus). Alt-Text entsprechend ohne „(n:1)“, „(1:1)“, „(n:m)“ und ohne
  „ist befreundet mit“.
- Aufgabe Hotel (Abschnitt „Modellieren“): Reihe **„ERM-Übung“**, Quest 1 „Hotel-Verwaltung“; Link
  `?reihe=erm-uebung&quest=1`. Den Satz „… auch Schreibweisen wie ‚AnzahlNaechte‘“ streichen. Die Quest fragt
  keine Kardinalitäten mehr ab.
- Aufgabe „Mensch – Handy“: „… auf Papier oder im ERM-Editor (Schalter ‚Kardinalitäten‘ oben aus)“.

### `src/modules/klasse9/lb1/Kardinalitaeten.vue`

- **Neu: ERM-Kardinalitäten einbinden.** Empfehlung: eigener Abschnitt „Quest“ direkt nach dem Einstieg, wie
  im Kapitel ER-Modell (erst erarbeiten, dann sichern). Textvorschlag:
  > Starte im ERM-Editor die Reihe **„ERM-Kardinalitäten“**. Sie lädt dein Schul-ERM aus dem letzten
  > Kapitel; an den Linien steht noch „?“. Nach jeder Quest erklärt der Editor, was du gerade eingestellt
  > hast — übernimm Begriff und Symbol in deine Tabelle.

  Knopf: `?reihe=erm-kardinalitaeten`. Der Abschnitt „1:1, 1:n, n:m“ bleibt als Sicherung.
- Abschnitt „Modellieren“, Lead: „… die Übungsquests im ERM-Editor prüfen dein Modell.“
- Aufgabe „Starte im ERM-Editor die Reihe ‚ERM-Experten-Quests‘“ → Reihe **„ERM-Übung“**, Teilaufgaben mit
  neuen Nummern (Knackpunkte bleiben gleich): Quest 3 „Bibliothek“ (bisher 2), Quest 4 „Fußball-Turnier“
  (bisher 3), Quest 5 „Fitnessstudio-Kursplanung“ (bisher 5). Link `?reihe=erm-uebung&quest=3`.
- „Schon fertig?“: Quest 2 „Krankenhaus-System“ (bisher 4). Knackpunkt-Vorschlag: „Behandlung vermittelt
  zwischen Patient und Arzt — zwei 1:n-Beziehungen statt n:m. Station hängt über zwei n:1-Beziehungen an
  Patient und an Arzt.“ Die Universität ist jetzt **ERM-Experten 3** (Stufe Fortgeschritten) — für Klasse 9
  streichen oder als „Für Profis“ verlinken (`?reihe=erm-experten&quest=3`).
- Aufgabe „Mensch – Handy“ mit Kardinalität: „Schalte im ERM-Editor die Kardinalitäten ein und ergänze …“.
- Hinweis zum Zusatz „Flug startet von Flughafen“: Genau dieses Modell (Start- **und** Zielflughafen) ist im
  Grundkurs die ERM-Experten-Quest 2 „Flugbetrieb“ — kein Konflikt, eher ein schöner Bogen.

### `src/modules/klasse9/lb1/Relationenmodell.vue`

Das Kapitel nutzt die Relationenmodell-Quests bisher gar nicht. Zum „Kontrollieren im ERM-Editor“ müssten
die Schüler jedes ERM erst selbst nachzeichnen.

- **Neu: Relationenmodell-Grundlagen einbinden**, z. B. als Erarbeitung vor oder nach dem Abschnitt „Regeln“
  (Schul-ERM, Schritt für Schritt: Relationen, Primär- und Fremdschlüssel, 1:n, 1:1, n:m, Beziehungsattribut).
  Link `?reihe=rm-grundlagen`.
- **Neu: Relationenmodell-Übung** im Abschnitt „Übung“ als Aufgabe mit Teilaufgaben (das ER-Modell wird
  geladen, der Editor prüft). Knackpunkte:
  - Quest 1 „Hotel-Verwaltung“: Zwei 1:n-Beziehungen, beide Fremdschlüssel landen in Buchung:
    Gastnummer↑ und Zimmernummer↑. Gast und Zimmer bleiben unverändert.
  - Quest 2 „Krankenhaus-System“: Vier 1:n-Beziehungen, keine Beziehungstabelle: Behandlung bekommt
    Versicherungsnummer↑ und Personalnummer↑, Patient und Arzt bekommen je Stationscode↑.
  - Quest 3 „Bibliothek“: Drei 1:n-Beziehungen: Exemplar bekommt ISBN↑, Ausleihe bekommt Mitgliedsnummer↑ und
    Inventarnummer↑.
  - Quest 4 „Fußball-Turnier“: Alle drei Regeln: Spieler bekommt Teamname↑, Team bekommt TrainerNr↑ und für
    „ist Kapitän“ (1:1) SpielerNr↑; „bestreitet“ (n:m) wird zur Beziehungstabelle mit Teamname↑ und SpielID↑
    als gemeinsamem Primärschlüssel.
  - Quest 5 „Fitnessstudio-Kursplanung“: Zwei Beziehungstabellen, „belegt“ und „leitet“; Anmeldedatum wandert
    in belegt, Wochentag in leitet.
- Regel 1:1 „… oder beide Tabellen zusammenlegen“: Der Editor erkennt nur die Variante mit Fremdschlüssel auf
  einer Seite. Bei Editor-Aufgaben dazuschreiben: „Im Editor: Fremdschlüssel auf eine Seite.“
- Ausblick am Ende oder Verweis ins Kapitel „Eigene Datenbank“: „SQL erzeugen“ macht aus den Relationen
  `CREATE TABLE`-Befehle.

### `src/modules/klasse9/lb1/EigeneDatenbank.vue`

- Abschnitt „Tabellen anlegen“: Hinweis ergänzen, z. B. nach der Merkkarte:
  > Hast du dein Relationenmodell im ERM-Editor angelegt? „SQL erzeugen“ in der Seitenleiste schreibt die
  > `CREATE TABLE`-Befehle für dich — in genau dieser Form. Wähle für jede Spalte den Datentyp und vergleiche
  > mit deinen eigenen Befehlen.
- Mini-Projekt: Weg ausdrücklich machen — ERM im Editor, Relationen in der Seitenleiste, „SQL erzeugen“,
  Code kopieren und in die Konsole einfügen. Passt zum Hinweis „Sammle deine Befehle in einer Textdatei“
  („Als .sql speichern“).
- Optional: `fremdschluessel-pruefen` an den beiden Konsolen. Ohne das prüft SQLite `REFERENCES` nicht; die
  Merkkarte „macht die Spalte zum Fremdschlüssel“ bleibt sonst folgenlos. Dazu passt eine kleine Aufgabe:
  „Füge einen Posten mit einer Bestellnummer ein, die es nicht gibt — was meldet die Datenbank?“ Achtung:
  Dann müssen Zieltabellen zuerst befüllt werden.

### `src/modules/grundkurs/lb5/ErModell.vue` (geprüft — nur nach Bestätigung)

- Aufgabe „Aufwärmen“: Reihe **„ERM-Auffrischung“** statt „ERM-Grundlagen-Quest“; Link
  `?reihe=erm-auffrischung`. Text: „… sie wiederholt in sechs großen Schritten alle Bausteine, dazu
  Selbstbeziehung (rekursive Beziehung) und Verbundschlüssel.“
- Aufgabe „Starte im ERM-Editor die Reihe ‚ERM-Experten-Quests‘“: Reihe **„ERM-Experten“**, neue Teilaufgaben
  und Knackpunkte:
  - Quest 1 „Fahrschule“: Der Text verführt zu „Fahrschüler n:m Fahrlehrer“. Weil dasselbe Paar viele
    Fahrstunden mit eigenem Datum und eigener Uhrzeit hat, ist Fahrstunde eine eigene Entitätsklasse mit
    Stundennummer und zwei 1:n-Beziehungen, „fährt“ und „gibt“ — dasselbe Muster wie Auftritt zwischen Band
    und Bühne.
  - Quest 2 „Flugbetrieb“: Zwischen Flug und Flughafen gibt es zwei Beziehungen, „startet von“ und „landet in“
    — beide n:1, jede mit eigener Raute. „bildet aus“ ist eine rekursive 1:n-Beziehung: Ein Pilot bildet viele
    aus, jeder hat höchstens einen Ausbilder.
  - Quest 3 „Universität“: Fünf Entitätsklassen, sieben Beziehungen. „ist“ verbindet Student und Hilfskraft
    1:1, „besucht“ und „nimmt teil an“ sind n:m, die übrigen 1:n.
  - Zusatz Quest 4 „Tagung“: Raum hat einen Verbundschlüssel aus Gebäude und Raumnummer. „findet statt in“ ist
    n:1, aber nur „höchstens ein Raum“ — eine Kann-Beziehung. „arbeitet ein“ ist eine n:m-Selbstbeziehung.
  - Zusatz Quest 5 „Katastrophenschutz-Leitstelle“: Zwei Beziehungen zwischen Einsatzkraft und Team, „gehört
    zu“ (n:1) und „leitet“ (1:n). „arbeitet ein“ ist rekursiv 1:n: Jede Einsatzkraft wird von genau einer
    eingearbeitet. Einsatz hat einen Verbundschlüssel aus Einsatzgebiet, Datum und Startzeit.
- Satz „Übernimm alle Namen genau aus dem Text — nur dann erkennt der Editor sie“ abschwächen (siehe 1).
- Begriff: Das Kapitel sagt „rekursive Beziehung“, der Editor „Selbstbeziehung (auch: rekursive Beziehung)“.
  Optional im Kapitel einmal „auch Selbstbeziehung“ ergänzen.

### `src/modules/grundkurs/lb5/Relationenmodell.vue` (geprüft — nur nach Bestätigung)

- Aufgabe „Erarbeiten“: Reihe **„Relationenmodell-Auffrischung“** (`?reihe=rm-auffrischung`). Inhaltsliste:
  „Relationen und Verbundschlüssel, zusammengesetzte Fremdschlüssel, 1:n, 1:1, n:m, Beziehungsattribute,
  Selbstbeziehungen und — mit ‚SQL erzeugen‘ — NOT NULL und UNIQUE.“
- Aufgabe „Starte im ERM-Editor die Reihe ‚Relationenmodell-Experten-Quests‘“: Reihe
  **„Relationenmodell-Experten“**. Die Aufgabe nennt jetzt Geschäftsregeln; nach den Relationen setzen die
  Schüler unter „SQL erzeugen“ NOT NULL und UNIQUE, der Editor prüft beides. Satz zu den Namen: „Ein
  Fremdschlüssel heißt wie der Primärschlüssel oder die Tabelle, auf die er zeigt; eine Rolle schreibst du als
  Zusatz (Personalnr-Vorgesetzter).“ Knackpunkte:
  - Quest 1 „Fahrschule“: Beide Fremdschlüssel landen in fahrstunde, Kundennummer↑ und Personalnummer↑. Jede
    Fahrstunde hat genau einen Fahrschüler und einen Fahrlehrer: beide NOT NULL.
  - Quest 2 „Flugbetrieb“: flug bekommt drei Fremdschlüssel — zweimal den Flughafencode (umbenannt, etwa
    Flughafencode-Start und Flughafencode-Ziel) und Lizenznummer↑, alle NOT NULL. pilot bekommt einen
    umbenannten Fremdschlüssel auf sich selbst (Lizenznummer-Ausbilder), der leer bleiben darf.
  - Quest 3 „Universität“: Für „ist“ (1:1) kommt Matrikelnummer↑ auf die Muss-Seite hilfskraft, mit NOT NULL
    und UNIQUE. Die 1:n-Beziehungen geben NOT-NULL-Fremdschlüssel an vorlesung, hilfskraft und seminar;
    „besucht“ und „nimmt teil an“ werden Beziehungstabellen.
  - Zusatz Quest 4 „Tagung“: vortrag bekommt Referentennummer↑ (NOT NULL) und den zusammengesetzten
    Fremdschlüssel aus Gebäude↑ und Raumnummer↑ — ohne NOT NULL, weil der Raum noch fehlen darf. betreut hat
    einen Schlüssel aus drei Spalten, „arbeitet ein“ zwei umbenannte Helfernummern.
  - Zusatz Quest 5 „Katastrophenschutz-Leitstelle“: einsatzkraft bekommt Teamname↑ (NOT NULL) und einen
    umbenannten Fremdschlüssel auf sich selbst, team den Funkrufname↑ der Leitung (NOT NULL). bearbeitet und
    nutzt übernehmen den dreiteiligen Schlüssel von einsatz als zusammengesetzten Fremdschlüssel.
- Hinweis „Im ERM-Editor lässt sich zu jedem ER-Modell die Relationenmodell-Ansicht einblenden — praktisch zum
  Gegenprüfen“: Die Musterlösung des Editors benennt doppelte Fremdschlüssel mit vorangestelltem
  Entitätsnamen (`Band-Name`, `Bühne-Name`), das Kapitel mit Tabellen- oder Rollennamen (`band↑`,
  `leitung↑`). Beim Vergleichen zählt die Stelle, nicht der Name — einen Satz dazu schreiben.

### `src/modules/grundkurs/lb5/SqlCrud.vue` (geprüft — nur nach Bestätigung)

- Optional bei „Das Festival selbst anlegen“: „Zum Vergleich: ‚SQL erzeugen‘ im ERM-Editor schreibt
  `CREATE TABLE` mit NOT NULL, UNIQUE und REFERENCES in derselben Reihenfolge. CHECK ergänzt du selbst.“

### `src/modules/grundkurs/lb5/Normalisierung.vue`

Keine Änderung nötig.

---

## 3 Weitere Schwächen, gefunden beim Durchsehen

Nach Gewicht geordnet; die ersten drei hängen direkt am Umbau.

1. **Gemeinsam live gehen.** Solange der Editor-Branch nicht gemergt ist, stimmen die Kapitel; danach nicht
   mehr. Am besten Lehrbuch und Editor am selben Tag veröffentlichen.
2. **Klasse 9 „Relationenmodell“ ohne Editor-Quests** (siehe oben). Die automatisch geprüften Übungen sind
   der größte Hebel im Kapitel.
3. **Veraltetes Schul-ERM-Bild** in Klasse 9 „ER-Modell“ (Kardinalitäten, Selbstbeziehung).
4. **Fremdschlüssel-Namen uneinheitlich.** Das Lehrbuch mischt Primärschlüsselnamen (`besuchernr↑`),
   Tabellennamen (`band↑`, `mannschaft↑`) und Rollennamen (`vorgesetzter↑`, `klassenleiter↑`). Fachlich ist
   das in Ordnung, aber die Regel fehlt einmal ausdrücklich — idealerweise in der Transformationsregel-Merkkarte
   beider Stufen: „Ein Fremdschlüssel heißt wie der Schlüssel oder die Tabelle, auf die er zeigt; spielt er
   eine Rolle, darf er nach ihr heißen.“
5. **Schreibweise der Relationen uneinheitlich.** Klasse 9 schreibt im Einstieg `mannschaft(…)`, in den
   Regel-Aufgaben `Wohnsitz(…)`, `Hört(…)`. Der Editor ist hier tolerant; es geht nur um ein einheitliches Bild.
6. **`REFERENCES` ohne Wirkung in Klasse 9** (Konsolen ohne `fremdschluessel-pruefen`, siehe oben).
7. **1:1 „Tabellen zusammenlegen“** (Klasse 9) kennt der Editor nicht — nur als Hinweis bei Editor-Aufgaben.
8. **„Für Schnelle: Universität“** in Klasse 9 „Kardinalitäten“ zeigt jetzt in die Stufe Fortgeschritten.

---

## 4 Offene Entscheidungen

1. ERM-Kardinalitäten im Kapitel „Kardinalitäten“: als eigener Abschnitt nach dem Einstieg (Empfehlung) oder
   als erste Aufgabe unter „Modellieren“?
2. Klasse 9 „Relationenmodell“: Relationenmodell-Grundlagen als Erarbeitung **vor** den Regeln (wie beim
   ER-Modell) oder als Übung **danach**?
3. Universität für schnelle Klasse-9-Schüler: streichen oder auf ERM-Experten 3 verlinken?
4. `fremdschluessel-pruefen` in Klasse 9 „Eigene Datenbank“ einschalten?
