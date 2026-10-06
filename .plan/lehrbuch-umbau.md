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
nur, wenn die Quest freigeschaltet ist; in Übungsreihen ist jede Quest frei). Im Menü „⚔️ Quests“ stehen die
Reihen in zwei Spalten, „Einstieg“ und „Fortgeschritten“, jede mit Fortschrittsbalken. Einheitliche Symbole:
🔷 ER-Modell lernen, ▦ Relationenmodell lernen (grünes Tabellen-Symbol, auch am Knopf „Relationenmodell“),
✏️ üben. Zwischen „Einstieg“ und „Fortgeschritten“ steht eine senkrechte Linie.

Nur die Lernreihen (🔷, ▦) enden mit einer Abschlussquest (Zusammenfassung, Ergebnis speichern). Die
Übungsreihen (✏️) haben keine gesperrte letzte Aufgabe mehr: Sind alle Szenarien gelöst, gratuliert der Editor
direkt und nennt die nächste Reihe.

| ID | Reihe | Quests |
| --- | --- | --- |
| **Einstieg** | | |
| `erm-grundlagen` | 🔷 ERM-Grundlagen (ohne Kardinalitäten) | 1 Erste Entitätsklasse · 2 Attribute hinzufügen · 3 Primärschlüssel setzen · 4 Zweite Entitätsklasse · 5 Attribute für Klasse · 6 Beziehung erstellen · 7 Dritte Entitätsklasse · 8 Zweite Beziehung · 9 Beziehungsattribute · 10 Weitere Beziehung ergänzen · 11 Abschluss |
| `erm-kardinalitaeten` | 🔷 ERM-Kardinalitäten (neu, Modell gesperrt) | 1 Kardinalität und Leserichtung („geht in“ n:1 vorgegeben) · 2 Beide Richtungen prüfen („unterrichtet“) · 3 Eins zu eins („ist Klassensprecher“, nur Sachverhalt) · 4 Eine Beziehung selbst bestimmen („ist Klassenleiter von“, Lehrer 1:n Klasse) · 5 Abschluss |
| `erm-uebung` | ✏️ ERM-Übung | 1 Hotel-Verwaltung (ohne Kardinalitäten, Wörter hervorgehoben) · 2 Krankenhaus-System (Wörter hervorgehoben, Kardinalitäten vorgegeben) · 3 Bibliothek · 4 Fußball-Turnier · 5 Fitnessstudio-Kursplanung (ab 3 stehen die Kardinalitäten nur im Text) |
| `rm-grundlagen` | ▦ Relationenmodell-Grundlagen | 1 Seitenleiste öffnen · 2 Relationen anlegen · 3 Attribute hinzufügen · 4 Primärschlüssel markieren · 5 1:n „geht in“ · 6 1:1 „ist Klassensprecher“ · 7 n:m „unterrichtet“ · 8 Beziehungsattribut „Fach“ · 9 Abschluss |
| `rm-uebung` | ✏️ Relationenmodell-Übung | dieselben fünf Szenarien wie ERM-Übung (ER-Modell wird geladen) |
| **Fortgeschritten** | | |
| `erm-auffrischung` | 🔷 ERM-Auffrischung | 1 Entitätsklassen mit Schlüsseln · 2 Beziehungen mit Kardinalitäten · 3 Beziehungsattribut · 4 Zwei Beziehungen zwischen denselben Klassen · 5 Selbstbeziehung · 6 Verbundschlüssel (Klassenstufe + Parallelklasse) · 7 Abschluss |
| `erm-experten` | ✏️ ERM-Experten | 1 Fahrschule (Wörter hervorgehoben) · 2 Flugbetrieb · 3 Universität · 4 Tagung · 5 Katastrophenschutz-Leitstelle |
| `rm-auffrischung` | ▦ Relationenmodell-Auffrischung | 1 Relationen mit Schlüsseln · 2 Zusammengesetzter Fremdschlüssel · 3 1:1 „ist Klassensprecher“ · 4 Beziehungstabelle „unterrichtet“ · 5 Selbstbeziehung „ist befreundet mit“ · 6 Muss, Kann und UNIQUE · 7 Abschluss |
| `rm-experten` | ✏️ Relationenmodell-Experten | dieselben fünf Szenarien wie ERM-Experten, nur die Überführung |
| `sql-uebung` | ✏️ SQL-Übung (neu) | dieselben fünf Szenarien; das Relationenmodell ist vorgegeben, unter „SQL erzeugen“ setzt man NOT NULL und UNIQUE: 1 Fahrschule (Spalten genannt) · 2 Flugbetrieb (Regeln genannt) · 3 Universität · 4 Tagung · 5 Katastrophenschutz (Regeln nur im Szenariotext) |

Reihenfolge in Klasse 9: Die ERM-Grundlagen verweisen am Ende auf ERM-Übung, Szenario 1 „Hotel-Verwaltung“
(noch ohne Kardinalitäten). Nach dem Hotel schickt der Editor zur Reihe ERM-Kardinalitäten, solange sie nicht
erledigt ist; deren Abschluss verweist zurück auf ERM-Übung ab Szenario 2.

Die ERM-Kardinalitäten übernehmen das eigene Schul-ERM, wenn alle Aufgaben der ERM-Grundlagen gelöst sind
(der Abschluss zählt nicht); sonst lädt der Editor eine Vorlage. Dieses Startmodell ist gesperrt:
Entitätsklassen, Attribute und vorhandene Beziehungen lassen sich weder löschen noch umbenennen, nur die
Kardinalitäten ändern; neue Beziehungen (Quest 4) sind erlaubt. Während der Quest steht an jeder Linie „?“,
bis die Kardinalität gesetzt ist. Im freien Editor bleibt eine fehlende Kardinalität einfach leer.

Gespeicherter Fortschritt aus den alten Reihen wird **nicht übernommen** (neue Speicherschlüssel). Wer schon
angefangen hat, beginnt die Reihe neu — am besten in der Klasse ankündigen.

### Weitere Änderungen, die die Kapitel betreffen

- **Namen:** Groß- und Kleinschreibung, Leerzeichen, `-`, `_` und ä/ae, ö/oe, ü/ue, ß/ss spielen beim
  Vergleich keine Rolle („Lehrerkürzel“ = „Lehrer-Kürzel“, „AnzahlNächte“ = „AnzahlNaechte“). Beziehungen
  zählen auch in anderer Verbform, wenn sie die richtigen Entitätsklassen verbinden („teilnehmen“ für
  „nimmt teil an“, „gehören“ für „gehört zu“). Mehrzahl bei Entitätsklassen gilt weiter als falsch. Hinweise wie
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
- **Bedienung:** „Beziehung“ öffnet zuerst den Dialog, die Raute erscheint beim Speichern zwischen den beiden
  Entitätsklassen. Ein Klick auf eine Raute wählt sie nur aus; bearbeitet wird per Doppelklick oder
  Rechtsklick. Neues Werkzeug **„Attribut“** links: hängt ein Attribut an die ausgewählte Entitätsklasse oder
  Beziehung (bei einem ausgewählten Attribut an dessen Besitzer). Jede neue Form ist sofort ausgewählt.
  **Rückgängig/Wiederholen** ↶ ↷ links oben im Header (oder Strg+Z / Strg+Y). Zoom rechts oben: − 100 % +,
  ein Klick auf die Prozentzahl setzt auf 100 % zurück. PNG-Export hat das Symbol 📷 (ER- und
  Relationenmodell). Anleitungen im Lehrbuch, die „Rechtsklick auf die Raute → Attribut hinzufügen“ oder
  „Klick auf die Raute öffnet den Dialog“ beschreiben, anpassen. Die Relationenmodell-Quests sprechen von der
  „rechten Seitenleiste“.
- **Leserichtung:** Der Erklärkasten „Beziehung“ sagt nicht mehr „von links nach rechts“, weil links und rechts
  sich im Editor beim Verschieben oder Auto-Layout ändern: Die Richtung des Satzes ergibt sich aus dem Sinn,
  eine Kardinalität steht an der Linie zu der Entitätsklasse, deren Anzahl sie angibt. Für die festen Bilder im
  Lehrbuch („Lies von links nach rechts“) ist das kein Widerspruch.
- **Textmarker in den ERM-Szenarien:** Wörter im Text anklicken; gehört ein Wort zum ER-Modell, wird es farbig
  (blau Entitätsklasse, gelb Attribut, grün Beziehung), sonst kurz durchgestrichen. Mehrzahl und Umlaut werden
  erkannt („Ärzte“ → Arzt), bei Beziehungen auch Verbformen („gehören“ → gehört zu, „teilnehmen“ → nimmt
  teil an, „durchführen“ → führt durch). Die Klicks sind begrenzt, damit niemand einfach jedes Wort durchklickt: so viele,
  wie das Modell Elemente hat, plus 5 für Fehlgriffe, mindestens 20 (Hotel 22, Universität 32). Neben der
  Legende steht „Klicks: 7 von 22“. Markierungen bleiben stehen (kein Wegklicken); Wortgruppen wie „gilt
  für“ werden samt Leerzeichen markiert. Im Unterricht als Lesestrategie
  nutzbar: erst markieren, dann zeichnen.
- **Speichern:** Das eigene Modell im freien Editor bleibt beim Start einer Quest erhalten und kommt beim
  Schließen zurück; jede Quest hat ihren eigenen Arbeitsstand. Die Warnung „… werden gelöscht“ gibt es nicht
  mehr. Neu laden mitten in einer Quest führt zurück in den freien Editor.
- **„SQL erzeugen“ an der Musterlösung:** erscheint nur, solange die Musterlösung eingeblendet ist.
- **Dialog „SQL erzeugen“** zweispaltig: links Datentypen, NOT NULL und UNIQUE, rechts der Code; geänderte
  Zeilen leuchten kurz auf. Oben steht, dass es SQLite-Datentypen sind (INTEGER, REAL, TEXT).
- **SQL-Übung:** Das vorgegebene Relationenmodell ist gesperrt (kein Bearbeiten, Löschen, Hinzufügen), die
  Musterlösung ist ausgeblendet.

### Für Lehrkräfte: eigene Szenarien

Im Quest-Menü unter „Eigene Szenarien“: **🛠 Szenario erstellen** nimmt das ER-Modell im freien Editor als
Musterlösung, dazu Titel und Aufgabentext (Leerzeile = Absatz, `**Wort**` = hervorgehoben, „- “ = Aufzählung)
und die Aufgabe „ER-Modell zeichnen“ oder „Ins Relationenmodell überführen“. Ein Prüfbericht warnt vor fehlenden
Primärschlüsseln, Kardinalitäten und Namen, die im Text nicht vorkommen. Weitergeben als Datei
(`.erm-szenario.json`, Schüler: „📂 Szenario öffnen“) oder als Link (`…/#szenario=…`, gut 1 000 Zeichen; das
Szenario steckt im Link, es liegt auf keinem Server). Der Editor prüft wie bei den eingebauten Szenarien, mit
Checkliste und Textmarker. „▶ Selbst ausprobieren“ startet jedes Mal frisch; „✎ Zurück zum Bearbeiten“ im
Quest-Fenster führt in den Dialog zurück. Passt z. B. zu Aufgaben, die im Lehrbuch bisher nur auf Papier stehen.

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
  keine Kardinalitäten mehr ab. Der Abschluss der ERM-Grundlagen verweist selbst auf dieses Szenario.
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
  neuen Nummern und einer Steigerung:
  - Quest 2 „Krankenhaus-System“ (bisher 4) als **Einstieg**: wichtige Wörter hervorgehoben, Kardinalitäten
    vorgegeben (Patient 1 : n Behandlung …), jeweils mit dem Satz dazu. Knackpunkt-Vorschlag: „Behandlung
    vermittelt zwischen Patient und Arzt — zwei 1:n-Beziehungen statt n:m. Station hängt über zwei
    n:1-Beziehungen an Patient und an Arzt.“ Link `?reihe=erm-uebung&quest=2`.
  - Quest 3 „Bibliothek“ (bisher 2), Quest 4 „Fußball-Turnier“ (bisher 3), Quest 5
    „Fitnessstudio-Kursplanung“ (bisher 5): Kardinalitäten nur im Text. Knackpunkte bleiben gleich.
- Die Universität ist jetzt **ERM-Experten 3** (Stufe Fortgeschritten) — für Klasse 9 streichen oder als „Für
  Profis“ verlinken (`?reihe=erm-experten&quest=3`).
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
  einer Seite (geprüft und bewusst so gelassen, siehe Abschnitt 3). Bei Editor-Aufgaben dazuschreiben: „Im
  Editor: Fremdschlüssel auf eine Seite.“ Seine Musterlösung setzt den Fremdschlüssel auf die Seite, die dafür
  weniger Spalten braucht.
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
  **„Relationenmodell-Experten“** — nur die Überführung, ohne NOT NULL und UNIQUE (die Reihe ist schwer genug).
  Satz zu den Namen: „Ein Fremdschlüssel heißt wie der Primärschlüssel oder die Tabelle, auf die er zeigt;
  eine Rolle schreibst du als Zusatz (Personalnr-Vorgesetzter).“ Knackpunkte:
  - Quest 1 „Fahrschule“: Beide Fremdschlüssel landen in fahrstunde, Kundennummer↑ und Personalnummer↑.
  - Quest 2 „Flugbetrieb“: flug bekommt drei Fremdschlüssel — zweimal den Flughafencode (umbenannt, etwa
    Flughafencode-Start und Flughafencode-Ziel) und Lizenznummer↑. pilot bekommt einen umbenannten
    Fremdschlüssel auf sich selbst (Lizenznummer-Ausbilder).
  - Quest 3 „Universität“: Für „ist“ (1:1) kommt Matrikelnummer↑ nach hilfskraft (die andere Richtung erkennt
    der Editor auch). Die 1:n-Beziehungen geben Fremdschlüssel an vorlesung, hilfskraft und seminar; „besucht“
    und „nimmt teil an“ werden Beziehungstabellen.
  - Zusatz Quest 4 „Tagung“: vortrag bekommt Referentennummer↑ und den zusammengesetzten Fremdschlüssel aus
    Gebäude↑ und Raumnummer↑. betreut hat einen Schlüssel aus drei Spalten, „arbeitet ein“ zwei umbenannte
    Helfernummern.
  - Zusatz Quest 5 „Katastrophenschutz-Leitstelle“: einsatzkraft bekommt Teamname↑ und einen umbenannten
    Fremdschlüssel auf sich selbst, team den Funkrufname↑ der Leitung. bearbeitet und nutzt übernehmen den
    dreiteiligen Schlüssel von einsatz als zusammengesetzten Fremdschlüssel.
- **Neu: SQL-Übung** (`?reihe=sql-uebung`) nach der Merkkarte „Muss, Kann und die Wahl des Schlüssels“. Das
  Relationenmodell ist vorgegeben; geübt wird nur, was die Merkkarte einführt. Steigerung: Quest 1 nennt die
  Spalten, Quest 2 die Geschäftsregeln, ab Quest 3 stehen die Regeln nur im Szenariotext. Knackpunkte:
  - Quest 1 „Fahrschule“: Kundennummer↑ und Personalnummer↑ in fahrstunde NOT NULL.
  - Quest 2 „Flugbetrieb“: alle drei Fremdschlüssel in flug NOT NULL; Lizenznummer-Ausbilder in pilot bleibt
    ohne NOT NULL („nicht jeder hat einen Ausbilder“).
  - Quest 3 „Universität“: Matrikelnummer↑ in hilfskraft NOT NULL und UNIQUE (1:1, Muss-Seite); die
    Fremdschlüssel in vorlesung, hilfskraft und seminar NOT NULL.
  - Zusatz Quest 4 „Tagung“: Referentennummer↑ NOT NULL, Gebäude↑ und Raumnummer↑ ohne NOT NULL (Raum noch
    offen).
  - Zusatz Quest 5 „Katastrophenschutz-Leitstelle“: Teamname↑ in einsatzkraft und Funkrufname↑ in team NOT
    NULL.
- Hinweis „Im ERM-Editor lässt sich zu jedem ER-Modell die Relationenmodell-Ansicht einblenden — praktisch zum
  Gegenprüfen“: Die Musterlösung des Editors benennt doppelte Fremdschlüssel mit vorangestelltem
  Entitätsnamen (`Band-Name`, `Bühne-Name`), das Kapitel mit Tabellen- oder Rollennamen (`band↑`,
  `leitung↑`). Beim Vergleichen zählt die Stelle, nicht der Name — einen Satz dazu schreiben.

### `src/modules/grundkurs/lb5/SqlCrud.vue` (geprüft — nur nach Bestätigung)

- Optional bei „Das Festival selbst anlegen“: „Zum Vergleich: ‚SQL erzeugen‘ im ERM-Editor schreibt
  `CREATE TABLE` mit NOT NULL, UNIQUE und REFERENCES in derselben Reihenfolge. CHECK ergänzt du selbst.“
  Wer NOT NULL und UNIQUE noch einmal üben will: Reihe „SQL-Übung“ (`?reihe=sql-uebung`), dort lässt sich der
  Code jeder Quest kopieren und in der Konsole ausführen.

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
7. **1:1 „Tabellen zusammenlegen“** (Klasse 9) kennt der Editor nicht — geprüft und bewusst weggelassen:
   Fachlich passt das Zusammenlegen nur, wenn beide Seiten Muss-Seiten sind, und das steht nicht im ER-Modell
   (der Editor kennt nur 1, n, m). Außerdem müssten alle Fremdschlüssel, die auf die verschwundene Tabelle
   zeigen, mit umziehen. Der Grundkurs lehrt ohnehin nur „Fremdschlüssel auf die Muss-Seite + UNIQUE“.
   Lösung im Lehrbuch: bei Editor-Aufgaben „Im Editor: Fremdschlüssel auf eine Seite“.
8. **„Für Schnelle: Universität“** in Klasse 9 „Kardinalitäten“ zeigt jetzt in die Stufe Fortgeschritten.

---

## 4 Offene Entscheidungen

1. ERM-Kardinalitäten im Kapitel „Kardinalitäten“: als eigener Abschnitt nach dem Einstieg (Empfehlung) oder
   als erste Aufgabe unter „Modellieren“?
2. Klasse 9 „Relationenmodell“: Relationenmodell-Grundlagen als Erarbeitung **vor** den Regeln (wie beim
   ER-Modell) oder als Übung **danach**?
3. Universität für schnelle Klasse-9-Schüler: streichen oder auf ERM-Experten 3 verlinken?
4. `fremdschluessel-pruefen` in Klasse 9 „Eigene Datenbank“ einschalten?
5. SQL-Übung: im Grundkurs-Kapitel „Relationenmodell“ nach der Muss/Kann-Merkkarte (Empfehlung, dort werden
   NOT NULL und UNIQUE eingeführt) oder erst in „SQL: CRUD & eigene Datenbank“, wo `CREATE TABLE` kommt?
