/* Prüfskript: node test/pruefen.js  (braucht Node und das Programm sqlite3)
   1. Toleranter Namensvergleich: Beispiele aus dem Umbauplan
   2. Keine zwei Namen derselben Entitätsklasse fallen nach der Normalisierung zusammen
      (Musterlösungen und ER-Modelle in files/); jedes ER-Modell erfüllt seine ERM-Aufgabe
   3. Relationenmodell-Prüfung: Musterlösung, umbenannte Fremdschlüssel, zweite 1:1-Richtung, SQL-Regeln
   4. SQL aus allen Musterlösungen der Relationenmodell-Aufgaben läuft in SQLite, die Verweise stimmen
   5. Eigene Szenarien: Musterlösung aus dem ER-Modell, Prüfen von außen, Link hin und zurück */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const FILES = path.join(ROOT, 'files');

// Minimaler Browser-Ersatz: jedes DOM-Element nimmt jeden Zugriff an
function fakeElement() {
  return new Proxy(function () {}, {
    get(t, key) {
      if (Object.prototype.hasOwnProperty.call(t, key)) return t[key];
      if (key === 'style' || key === 'dataset') return (t[key] = {});
      if (key === 'classList') return { add() {}, remove() {}, toggle() {}, contains: () => false };
      if (typeof key === 'symbol' || key === 'then') return undefined;
      return () => fakeElement();
    },
    set(t, key, value) {
      t[key] = value;
      return true;
    },
  });
}

const storage = new Map();
const context = {
  console,
  setTimeout,
  clearTimeout,
  // für die Szenario-Links (js/szenario.js)
  Blob,
  Response,
  CompressionStream,
  DecompressionStream,
  btoa,
  atob,
  document: {
    getElementById: () => fakeElement(),
    querySelector: () => fakeElement(),
    querySelectorAll: () => [],
    createElement: () => fakeElement(),
    createTextNode: () => fakeElement(),
    addEventListener() {},
  },
  localStorage: {
    getItem: (k) => (storage.has(k) ? storage.get(k) : null),
    setItem: (k, v) => storage.set(k, String(v)),
    removeItem: (k) => storage.delete(k),
  },
};
context.window = context;
vm.createContext(context);
for (const file of ['js/relmodel.js', 'js/sql.js', 'js/lernpfad.js', 'js/szenario.js']) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), context, { filename: file });
}
const { RelModel, SQLExport, Lernpfad, Szenario } = context;
const N = RelModel.normalizeName;
const kopie = (x) => JSON.parse(JSON.stringify(x));
const ermLaden = (datei) => JSON.parse(fs.readFileSync(path.join(FILES, datei), 'utf8'));

let fehler = 0;
function pruefe(name, fn) {
  try {
    fn();
    console.log('ok   ' + name);
  } catch (e) {
    fehler++;
    console.log('FEHL ' + name + '\n     ' + e.message.split('\n').join('\n     '));
  }
}

// ---- 1. Toleranter Namensvergleich ----
pruefe('Namen: Schreibweisen aus dem Umbauplan gelten als gleich', () => {
  for (const [a, b] of [
    ['Lehrerkürzel', 'Lehrer-Kürzel'],
    ['Lehrer Kürzel', 'Lehrer-Kürzel'],
    ['lehrer_kuerzel', 'Lehrer-Kürzel'],
    ['AnzahlNächte', 'AnzahlNaechte'],
    ['Schueler', 'Schüler'],
    ['EMail', 'E-Mail'],
  ])
    assert.strictEqual(N(a), N(b), `„${a}“ ≠ „${b}“`);
  assert.notStrictEqual(N('Name'), N('Vorname'));
});

// ---- 2. Eindeutige Namen ----
function eindeutig(namen, wo) {
  const gesehen = new Map();
  for (const name of namen) {
    const n = N(name);
    assert(!gesehen.has(n), `${wo}: „${gesehen.get(n)}“ und „${name}“ fallen zusammen`);
    gesehen.set(n, name);
  }
}

const lernpfade = Lernpfad.getLernpfade();
pruefe('Musterlösungen: keine zusammenfallenden Namen', () => {
  for (const lernpfad of lernpfade)
    for (const q of lernpfad.aufgaben) {
      const m = q.masterlösung;
      if (!m) continue;
      const wo = `${lernpfad.id} ${q.number} ${q.title}`;
      eindeutig(m.entities, wo + ', Entitätsklassen');
      eindeutig(
        m.relationships.map((r) => r.name),
        wo + ', Beziehungen',
      );
      m.entities.forEach((e) => eindeutig(m.attributes[e] || [], `${wo}, ${e}`));
      m.relationships.forEach((r) => eindeutig(r.attributes || [], `${wo}, ${r.name}`));
    }
});

pruefe('ER-Modelle in files/: keine zusammenfallenden Namen', () => {
  for (const datei of fs.readdirSync(FILES).filter((f) => f.endsWith('.json'))) {
    const d = ermLaden(datei);
    for (const typ of ['entity', 'relationship'])
      eindeutig(
        d.nodes.filter((n) => n.type === typ).map((n) => n.name),
        `${datei}, ${typ}`,
      );
    for (const besitzer of d.nodes.filter((n) => n.type !== 'attribute')) {
      const attrs = d.edges
        .filter((e) => e.edgeType === 'attribute' && [e.fromId, e.toId].includes(besitzer.id))
        .map((e) => d.nodes.find((n) => n.id === (e.fromId === besitzer.id ? e.toId : e.fromId)).name);
      eindeutig(attrs, `${datei}, ${besitzer.name}`);
    }
  }
});

// Szenarien: ERM-Aufgabe und Relationenmodell-Aufgabe gehören über den Titel zusammen
const ermSzenarien = new Map();
for (const id of ['erm-uebung', 'erm-experten'])
  Lernpfad.getAlleAufgaben(id)
    .filter((q) => q.masterlösung)
    .forEach((q) => ermSzenarien.set(q.title, q));
const rmSzenarien = ['rm-uebung', 'rm-experten'].flatMap((id) =>
  Lernpfad.getAlleAufgaben(id).filter((q) => q.jsonFile),
);

pruefe('Jedes ER-Modell erfüllt die Musterlösung seiner ERM-Aufgabe', () => {
  for (const q of rmSzenarien) {
    context.AppState = { state: ermLaden(q.jsonFile) };
    const result = ermSzenarien.get(q.title).validator();
    assert(result.passed, `${q.jsonFile}: ${result.error}`);
  }
});

pruefe('ERM-Aufgabe: „AnzahlNaechte“ und „EMail“ werden erkannt', () => {
  const state = ermLaden('uebung-1-hotel.json');
  state.nodes.find((n) => n.name === 'AnzahlNächte').name = 'AnzahlNaechte';
  state.nodes.find((n) => n.name === 'E-Mail').name = 'EMail';
  context.AppState = { state };
  const result = ermSzenarien.get('Hotel-Verwaltung').validator();
  assert(result.passed, result.error);
});

// ---- 3. Relationenmodell-Prüfung ----
function loesung(datei) {
  context.AppState = { state: ermLaden(datei) };
  RelModel.syncFromDiagram();
  return kopie(RelModel.generateSolution(context.AppState.state)).map((rel, i) => ({
    id: 'r' + i,
    name: rel.name,
    attrs: rel.attrs.map((a, j) => ({ id: `a${i}_${j}`, name: a.name, isPk: a.isPk, isFk: a.isFk })),
  }));
}
function rel(rels, name) {
  const r = rels.find((x) => N(x.name) === N(name));
  assert(r, `Relation ${name} fehlt`);
  return r;
}
function attr(rels, relName, attrName) {
  const a = rel(rels, relName).attrs.find((x) => N(x.name) === N(attrName));
  assert(a, `${relName}.${attrName} fehlt`);
  return a;
}
function check(rels) {
  RelModel.setStudentRelations(rels);
  return RelModel.checkAndGetResult().passed;
}

pruefe('Relationenmodell: jede Musterlösung besteht die eigene Prüfung', () => {
  const dateien = [...rmSzenarien.map((q) => q.jsonFile), 'schule-grundlagen.json', 'schule-auffrischung.json'];
  for (const datei of dateien) assert(check(loesung(datei)), datei);
});

pruefe('Relationenmodell: umbenannte Fremdschlüssel nach Konvention werden erkannt', () => {
  let rels = loesung('experten-2-flugbetrieb.json');
  const flug = rel(rels, 'Flug').attrs.filter((a) => a.isFk && /flughafencode/i.test(a.name));
  assert.strictEqual(flug.length, 2);
  flug[0].name = 'Flughafencode-Start';
  flug[1].name = 'Flughafencode_Ziel';
  rel(rels, 'Pilot').attrs.find((a) => a.isFk).name = 'Lizenznummer-Ausbilder';
  assert(check(rels), 'Flugbetrieb mit Flughafencode-Start/-Ziel und Lizenznummer-Ausbilder');

  rel(rels, 'Flug').attrs = rel(rels, 'Flug').attrs.filter((a) => a !== flug[1]);
  assert(!check(rels), 'Flugbetrieb mit nur einem Flughafen-Fremdschlüssel darf nicht bestehen');

  rels = loesung('experten-5-katastrophenschutz.json');
  rel(rels, 'Einsatzkraft').attrs.find((a) => a.isFk && /funkrufname/i.test(a.name)).name = 'Funkrufname-Einarbeiter';
  assert(check(rels), 'Katastrophenschutz mit Funkrufname-Einarbeiter');

  rels = loesung('schule-auffrischung.json');
  const freunde = rel(rels, 'ist befreundet mit').attrs;
  freunde[0].name = 'SchülerNr';
  freunde[1].name = 'Schuelernr-Freund';
  assert(check(rels), 'ist befreundet mit (SchülerNr, Schuelernr-Freund)');
});

pruefe('Relationenmodell: Fremdschlüssel nach der Zieltabelle benannt (z. B. „Gast“ statt „Gastnummer“)', () => {
  let rels = loesung('uebung-1-hotel.json');
  attr(rels, 'Buchung', 'Gastnummer').name = 'Gast';
  attr(rels, 'Buchung', 'Zimmernummer').name = 'Zimmer';
  assert(check(rels), 'Hotel mit Gast↑ und Zimmer↑ in Buchung');

  rels = loesung('experten-2-flugbetrieb.json');
  const flug = rel(rels, 'Flug').attrs.filter((a) => a.isFk);
  flug.find((a) => /lizenznummer/i.test(a.name)).name = 'Pilot';
  flug
    .filter((a) => /flughafencode/i.test(a.name))
    .forEach((a, i) => (a.name = ['Flughafen-Start', 'Flughafen-Ziel'][i]));
  rel(rels, 'Pilot').attrs.find((a) => a.isFk).name = 'Pilot-Ausbilder';
  assert(check(rels), 'Flugbetrieb mit Pilot↑, Flughafen-Start↑, Flughafen-Ziel↑, Pilot-Ausbilder↑');

  // NOT NULL-Regeln finden auch so benannte Fremdschlüssel
  const fahrschule = Lernpfad.getAlleAufgaben('sql-uebung').find((q) => q.title === 'Fahrschule');
  rels = loesung(fahrschule.jsonFile);
  attr(rels, 'Fahrstunde', 'Kundennummer').name = 'Fahrschüler';
  attr(rels, 'Fahrstunde', 'Personalnummer').name = 'Fahrlehrer';
  rel(rels, 'Fahrstunde')
    .attrs.filter((a) => a.isFk)
    .forEach((a) => (a.notNull = true));
  RelModel.setStudentRelations(rels);
  const result = fahrschule.validator();
  assert(result.passed, result.message || result.error);
});

pruefe('Relationenmodell: 1:1-Fremdschlüssel auch in der anderen Richtung', () => {
  let rels = loesung('experten-3-universitaet.json');
  const hk = rel(rels, 'Hilfskraft');
  hk.attrs = hk.attrs.filter((a) => !(a.isFk && N(a.name) === N('Matrikelnummer')));
  rel(rels, 'Student').attrs.push({ id: 'neu1', name: 'HiwiNummer', isPk: false, isFk: true });
  assert(check(rels), 'Universität: HiwiNummer in Student');

  rels = loesung('uebung-4-fussball.json');
  const team = rel(rels, 'Team');
  team.attrs = team.attrs.filter((a) => !(a.isFk && N(a.name) === N('SpielerNr')));
  rel(rels, 'Spieler').attrs.push({ id: 'neu2', name: 'Teamname-Kapitän', isPk: false, isFk: true });
  assert(check(rels), 'Fußball: Teamname-Kapitän in Spieler');
});

pruefe('SQL-Übung: NOT NULL und UNIQUE nach den Regeln, Relationenmodell-Experten ohne', () => {
  assert(
    Lernpfad.getAlleAufgaben('rm-experten').every((q) => !q.sqlRegeln),
    'Relationenmodell-Experten prüfen nur die Überführung',
  );
  const fahrschule = Lernpfad.getAlleAufgaben('sql-uebung').find((q) => q.title === 'Fahrschule');
  const rels = loesung(fahrschule.jsonFile);
  RelModel.setStudentRelations(rels);
  const ohne = fahrschule.validator();
  assert(!ohne.passed && /NOT NULL/.test(ohne.message), 'ohne NOT NULL darf die Aufgabe nicht bestehen');
  rel(rels, 'Fahrstunde')
    .attrs.filter((a) => a.isFk)
    .forEach((a) => (a.notNull = true));
  RelModel.setStudentRelations(rels);
  assert(fahrschule.validator().passed, 'mit NOT NULL muss die Aufgabe bestehen');

  // Aufgabe 1: Schul-Relationenmodell der Auffrischung
  const schule = Lernpfad.getAlleAufgaben('sql-uebung')[0];
  const s = loesung(schule.jsonFile);
  RelModel.setStudentRelations(s);
  assert(!schule.validator().passed, 'Schule ohne NOT NULL und UNIQUE');
  attr(s, 'Schüler', 'Klassenstufe').notNull = true;
  attr(s, 'Schüler', 'Parallelklasse').notNull = true;
  attr(s, 'Klasse', 'SchülerNr').unique = true;
  RelModel.setStudentRelations(s);
  const mitRegeln = schule.validator();
  assert(mitRegeln.passed, mitRegeln.message);

  const uni = Lernpfad.getAlleAufgaben('sql-uebung').find((q) => q.title === 'Universität');
  const u = loesung(uni.jsonFile);
  for (const r of u) for (const a of r.attrs) if (a.isFk && !a.isPk) a.notNull = true;
  RelModel.setStudentRelations(u);
  assert(/UNIQUE/.test(uni.validator().message || ''), 'Universität ohne UNIQUE');
  attr(u, 'Hilfskraft', 'Matrikelnummer').unique = true;
  RelModel.setStudentRelations(u);
  const mitUnique = uni.validator();
  assert(mitUnique.passed, mitUnique.message);
});

pruefe('Schritt-Lernpfade: das fertige Modell erfüllt jede Aufgabe', () => {
  const bestehen = (lernpfad, von, bis) => {
    for (const q of Lernpfad.getAlleAufgaben(lernpfad).slice(von - 1, bis)) {
      if (q.seitenleisteSelbstOeffnen) continue; // prüft die geöffnete Seitenleiste im Browser
      const result = q.validator();
      assert(result.passed, `${lernpfad} ${q.number} ${q.title}: ${result.error || result.message}`);
    }
  };
  // ERM-Grundlagen prüfen nur Verbindungen: mit und ohne Kardinalitäten
  context.AppState = { state: ermLaden('schule-ohne-kardinalitaeten.json') };
  bestehen('erm-grundlagen', 1, 99);
  context.AppState = { state: ermLaden('schule-grundlagen.json') };
  bestehen('erm-grundlagen', 1, 99);

  // ERM-Kardinalitäten: Vorlage hat „?“, fertig mit Zahlen und „ist Klassenleiter von“ (Lehrer 1 : n Klasse)
  context.AppState = { state: ermLaden('schule-ohne-kardinalitaeten.json') };
  assert(
    !Lernpfad.getAlleAufgaben('erm-kardinalitaeten')[0].validator().passed,
    'Vorlage ohne Zahlen darf nicht bestehen',
  );
  const fertig = ermLaden('schule-grundlagen.json');
  const id = (name) => fertig.nodes.find((n) => n.name === name).id;
  fertig.nodes.push({ id: 's900', type: 'relationship', x: 0, y: 0, name: 'ist Klassenleiter von' });
  fertig.edges.push(
    { id: 's901', fromId: 's900', toId: id('Lehrer'), edgeType: 'relationship', chenFrom: '1', chenTo: '1' },
    { id: 's902', fromId: 's900', toId: id('Klasse'), edgeType: 'relationship', chenFrom: '1', chenTo: 'n' },
  );
  context.AppState = { state: fertig };
  bestehen('erm-kardinalitaeten', 1, 99);

  // ERM-Auffrischung: bis Aufgabe 5 mit „Bezeichnung“, ab Aufgabe 6 mit dem Verbundschlüssel
  const vorher = ermLaden('schule-auffrischung.json');
  const parallel = vorher.nodes.find((n) => n.name === 'Parallelklasse');
  vorher.nodes = vorher.nodes.filter((n) => n !== parallel);
  vorher.edges = vorher.edges.filter((e) => ![e.fromId, e.toId].includes(parallel.id));
  vorher.nodes.find((n) => n.name === 'Klassenstufe').name = 'Bezeichnung';
  context.AppState = { state: vorher };
  bestehen('erm-auffrischung', 1, 5);
  context.AppState = { state: ermLaden('schule-auffrischung.json') };
  bestehen('erm-auffrischung', 6, 99);

  RelModel.setStudentRelations(loesung('schule-grundlagen.json'));
  bestehen('rm-grundlagen', 1, 99);

  RelModel.setStudentRelations(loesung('schule-auffrischung.json'));
  bestehen('rm-auffrischung', 1, 99);
});

pruefe('Relationenmodell: 1:1 mit Verbundschlüssel – Fremdschlüssel auf der Seite mit weniger Spalten', () => {
  // Schul-ERM der Auffrischung, „ist Klassensprecher“ mit Klasse als erster Seite
  const state = ermLaden('schule-auffrischung.json');
  const sprecher = state.nodes.find((n) => n.name === 'ist Klassensprecher');
  state.edges
    .filter((e) => e.fromId === sprecher.id)
    .reverse()
    .forEach((e, i) => (e.id = `x${i}`));
  state.edges.sort((a, b) => (a.fromId === sprecher.id) - (b.fromId === sprecher.id) || a.id.localeCompare(b.id));
  context.AppState = { state };
  const rels = kopie(RelModel.generateSolution(state));
  assert(attr(rels, 'Klasse', 'SchülerNr').isFk, 'SchülerNr als Fremdschlüssel in Klasse');
  assert(
    !rel(rels, 'Schüler').attrs.some((a) => a.isFk && /sprecher/i.test(a.name)),
    'kein zweites Klassen-Paar in Schüler',
  );

  // Beide Seiten mit Verbundschlüssel: alle Schlüsselteile wandern mit
  const zwei = {
    nodes: [
      { id: 'e1', type: 'entity', name: 'Raum' },
      { id: 'a1', type: 'attribute', name: 'Gebäude', isPrimaryKey: true },
      { id: 'a2', type: 'attribute', name: 'Nummer', isPrimaryKey: true },
      { id: 'e2', type: 'entity', name: 'Beamer' },
      { id: 'a3', type: 'attribute', name: 'Hersteller', isPrimaryKey: true },
      { id: 'a4', type: 'attribute', name: 'Seriennummer', isPrimaryKey: true },
      { id: 'b1', type: 'relationship', name: 'hängt in' },
    ],
    edges: [
      { id: 'k1', fromId: 'e1', toId: 'a1', edgeType: 'attribute' },
      { id: 'k2', fromId: 'e1', toId: 'a2', edgeType: 'attribute' },
      { id: 'k3', fromId: 'e2', toId: 'a3', edgeType: 'attribute' },
      { id: 'k4', fromId: 'e2', toId: 'a4', edgeType: 'attribute' },
      { id: 'k5', fromId: 'b1', toId: 'e1', edgeType: 'relationship', chenFrom: '1', chenTo: '1' },
      { id: 'k6', fromId: 'b1', toId: 'e2', edgeType: 'relationship', chenFrom: '1', chenTo: '1' },
    ],
  };
  const r2 = kopie(RelModel.generateSolution(zwei));
  const fks = rel(r2, 'Beamer').attrs.filter((a) => a.isFk);
  assert.deepStrictEqual(fks.map((a) => a.name).sort(), ['Gebäude', 'Nummer'], 'beide Teile von Raum in Beamer');
  const { fehler: f } = SQLExport.generateSQL(r2);
  assert.strictEqual(f.length, 0, f.join('; '));
});

pruefe('Lernpfade: Schritt-Lernpfade enden mit Abschluss, Übungs-Lernpfade ohne', () => {
  for (const lernpfad of lernpfade) {
    const letzte = lernpfad.aufgaben[lernpfad.aufgaben.length - 1];
    if (lernpfad.schritt) assert(letzte.abschluss, `${lernpfad.id}: letzte Aufgabe ist der Abschluss`);
    else {
      assert(
        lernpfad.aufgaben.every((q) => !q.abschluss),
        `${lernpfad.id}: keine gesperrte Abschlussaufgabe`,
      );
      assert(lernpfad.abschlussText, `${lernpfad.id}: Glückwunschtext`);
    }
    // 🔷 ER-Modell lernen, Tabellen-Symbol Relationenmodell lernen, ✏️ üben
    const erwartet = !lernpfad.schritt ? '✏️' : lernpfad.art === 'erm' ? '🔷' : 'icon-tabelle';
    assert(lernpfad.icon.includes(erwartet), `${lernpfad.id}: Symbol ${lernpfad.icon}`);
  }
  storage.set(Lernpfad.getStorageKey('erm-uebung'), JSON.stringify({ geloesteAufgaben: [1, 2, 3, 4, 5] }));
  assert(Lernpfad.isLernpfadDone('erm-uebung'), 'ERM-Übung mit fünf gelösten Szenarien ist fertig');
  storage.set(
    Lernpfad.getStorageKey('erm-grundlagen'),
    JSON.stringify({ geloesteAufgaben: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] }),
  );
  assert(Lernpfad.isLernpfadDone('erm-grundlagen'), 'ERM-Grundlagen ohne die Abschlussaufgabe fertig');
  assert.deepStrictEqual({ ...Lernpfad.getFortschritt('erm-grundlagen') }, { erledigt: 10, gesamt: 10 });
  storage.clear();
});

pruefe('Relationenmodell: fehlende Kardinalitäten ergeben keine falsche 1:1-Lösung', () => {
  const ohne = loesung('schule-ohne-kardinalitaeten.json');
  assert(
    ohne.every((r) => r.attrs.every((a) => !a.isFk)),
    'ohne Kardinalitäten keine Fremdschlüssel in der Lösung',
  );
  context.AppState = { state: ermLaden('schule-ohne-kardinalitaeten.json') };
  RelModel.syncFromDiagram();
  RelModel.setStudentRelations(ohne);
  assert(!RelModel.checkAndGetResult().passed, 'Prüfung meldet fehlende Kardinalitäten');
});

// ---- 4. SQL ----
function sqlite(script) {
  return execFileSync('sqlite3', ['-batch', '-bail', ':memory:'], { input: script, stdio: 'pipe' }).toString();
}

pruefe('SQL: Beispiel aus dem Umbauplan (Schul-ERM, Stufe Einstieg)', () => {
  const a = (name, isPk = false, isFk = false, sqlType) => ({ name, isPk, isFk, sqlType });
  const rels = [
    { name: 'Klasse', attrs: [a('Bezeichnung', true), a('Klassenraum'), a('SchülerNr', false, true)] },
    { name: 'Lehrer', attrs: [a('Lehrer-Kürzel', true), a('Vorname'), a('Nachname')] },
    {
      name: 'Schüler',
      attrs: [a('SchülerNr', true, false, 'INTEGER'), a('Vorname'), a('Nachname'), a('Bezeichnung', false, true)],
    },
    { name: 'unterrichtet', attrs: [a('Lehrer-Kürzel', true, true), a('Bezeichnung', true, true), a('Fach')] },
  ];
  const erwartet = `CREATE TABLE klasse (
  bezeichnung TEXT PRIMARY KEY,
  klassenraum TEXT,
  schuelernr INTEGER REFERENCES schueler(schuelernr)
);

CREATE TABLE lehrer (
  lehrer_kuerzel TEXT PRIMARY KEY,
  vorname TEXT,
  nachname TEXT
);

CREATE TABLE schueler (
  schuelernr INTEGER PRIMARY KEY,
  vorname TEXT,
  nachname TEXT,
  bezeichnung TEXT REFERENCES klasse(bezeichnung)
);

CREATE TABLE unterrichtet (
  lehrer_kuerzel TEXT REFERENCES lehrer(lehrer_kuerzel),
  bezeichnung TEXT REFERENCES klasse(bezeichnung),
  fach TEXT,
  PRIMARY KEY (lehrer_kuerzel, bezeichnung)
);`;
  const { sql, fehler: f } = SQLExport.generateSQL(rels);
  assert.strictEqual(f.length, 0, f.join('; '));
  assert.strictEqual(sql, erwartet);
  // Der Verweis greift beim Einfügen
  sqlite(
    `PRAGMA foreign_keys = ON;\n${sql}\nINSERT INTO klasse VALUES ('9a', 'R1', NULL);\nINSERT INTO schueler VALUES (1, 'Lena', 'M', '9a');`,
  );
  assert.throws(
    () => sqlite(`PRAGMA foreign_keys = ON;\n${sql}\nINSERT INTO schueler VALUES (1, 'Lena', 'M', '9z');`),
    /FOREIGN KEY constraint failed/,
  );
});

pruefe('SQL: Musterlösung aus dem Kapitel „Eigene Datenbank“ (Fremdschlüssel mannschaft)', () => {
  const a = (name, sqlType, isPk = false, isFk = false) => ({ name, sqlType, isPk, isFk });
  const rels = [
    { name: 'mannschaft', attrs: [a('name', 'TEXT', true), a('gruendungsjahr', 'INTEGER'), a('stadion', 'TEXT')] },
    {
      name: 'spieler',
      attrs: [
        a('spielernr', 'INTEGER', true),
        a('name', 'TEXT'),
        a('geburtsjahr', 'INTEGER'),
        a('position', 'TEXT'),
        a('rueckennr', 'INTEGER'),
        a('mannschaft', '', false, true),
      ],
    },
  ];
  const erwartet = `CREATE TABLE mannschaft (
  name TEXT PRIMARY KEY,
  gruendungsjahr INTEGER,
  stadion TEXT
);

CREATE TABLE spieler (
  spielernr INTEGER PRIMARY KEY,
  name TEXT,
  geburtsjahr INTEGER,
  position TEXT,
  rueckennr INTEGER,
  mannschaft TEXT REFERENCES mannschaft(name)
);`;
  const { sql, fehler: f } = SQLExport.generateSQL(rels);
  assert.strictEqual(f.length, 0, f.join('; '));
  assert.strictEqual(sql, erwartet);
});

pruefe('SQL: Namen, Kollisionen, fehlender Primärschlüssel', () => {
  assert.strictEqual(SQLExport.sqlName('Lehrer-Kürzel'), 'lehrer_kuerzel');
  assert.strictEqual(SQLExport.sqlName('ist befreundet mit'), 'ist_befreundet_mit');
  assert.strictEqual(SQLExport.sqlName('Straße'), 'strasse');
  const ohnePs = SQLExport.generateSQL([{ name: 'Ort', attrs: [{ name: 'Name' }] }]);
  assert(!ohnePs.sql && ohnePs.fehler.some((m) => m.includes('Relation „Ort“ hat keinen Primärschlüssel')));
  const doppelt = SQLExport.generateSQL([
    { name: 'Gast', attrs: [{ name: 'E-Mail', isPk: true }, { name: 'E_Mail' }] },
  ]);
  assert(!doppelt.sql && doppelt.fehler.length === 1, doppelt.fehler.join('; '));
});

pruefe('SQL: alle Musterlösungen laufen in SQLite, Verweise stimmen', () => {
  const dateien = [
    ...new Set([...rmSzenarien.map((q) => q.jsonFile), 'schule-grundlagen.json', 'schule-auffrischung.json']),
  ];
  for (const datei of dateien) {
    context.AppState = { state: ermLaden(datei) };
    const solution = kopie(RelModel.generateSolution(context.AppState.state));
    // Fortgeschritten: NOT NULL und UNIQUE an allen Fremdschlüsseln, damit auch diese Schreibweise läuft
    const rels = solution.map((r) => ({
      ...r,
      attrs: r.attrs.map((a) => ({ ...a, notNull: a.isFk && !a.isPk, unique: false })),
    }));
    const { sql, fehler: f } = SQLExport.generateSQL(rels, { erweitert: true });
    assert.strictEqual(f.length, 0, `${datei}: ${f.join('; ')}`);

    const tabellen = rels.map((r) => SQLExport.sqlName(r.name));
    const ausgabe = sqlite(
      `PRAGMA foreign_keys = ON;\n${sql}\n` +
        tabellen
          .map((t) => `SELECT '${t}', id, "table", "from", "to" FROM pragma_foreign_key_list('${t}');`)
          .join('\n'),
    );
    const verweise = ausgabe
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((zeile) => {
        const [tabelle, id, ziel, von, nach] = zeile.split('|');
        return { tabelle, id, ziel, von, nach };
      });

    // Erwartung aus der Musterlösung: Fremdschlüssel → Entitätsklasse, deren Primärschlüssel sein Basisname ist
    const entitaeten = solution.filter((r) => r._kind !== 'mn');
    for (const r of solution) {
      for (const a of r.attrs.filter((x) => x.isFk)) {
        const basis = r._hasSelfRefFks ? r._selfRefBasePk : a._fkBaseName || a.name;
        const ziel = entitaeten.filter((e) => e.attrs.some((p) => p.isPk && N(p.name) === N(basis)));
        if (ziel.length !== 1) continue;
        const t = SQLExport.sqlName(r.name);
        const v = verweise.find((x) => x.tabelle === t && x.von === SQLExport.sqlName(a.name));
        assert(v, `${datei}: ${t}.${SQLExport.sqlName(a.name)} hat keinen Verweis`);
        assert.strictEqual(v.ziel, SQLExport.sqlName(ziel[0].name), `${datei}: Ziel von ${t}.${v.von}`);
        assert.strictEqual(v.nach, SQLExport.sqlName(basis), `${datei}: Zielspalte von ${t}.${v.von}`);
      }
      const t = SQLExport.sqlName(r.name);
      const anzahlFks = r.attrs.filter((x) => x.isFk).length;
      assert.strictEqual(
        verweise.filter((x) => x.tabelle === t).length,
        anzahlFks,
        `${datei}: Anzahl Verweise in ${t}`,
      );
    }

    if (datei === 'experten-5-katastrophenschutz.json') {
      // Zusammengesetzter Fremdschlüssel: eine Regel mit drei Spalten
      const bearbeitet = verweise.filter((x) => x.tabelle === 'bearbeitet' && x.ziel === 'einsatz');
      assert.strictEqual(bearbeitet.length, 3);
      assert.strictEqual(new Set(bearbeitet.map((x) => x.id)).size, 1, 'ein FOREIGN KEY für einsatz');
      assert(
        /FOREIGN KEY \((\w+, \w+, \w+)\) REFERENCES einsatz\(\1\)/.test(sql),
        'FOREIGN KEY (…) REFERENCES einsatz(…)',
      );
      assert(sql.includes('REFERENCES einsatzkraft(funkrufname)'), 'Selbstverweis');
    }
  }
});

// ---- 5. Eigene Szenarien ----
const alsSzenario = (datei, aufgabe = 'erm') => ({
  format: 'erm-editor-szenario',
  version: 1,
  titel: datei,
  text: 'Text',
  aufgabe,
  kardinalitaeten: true,
  erm: ermLaden(datei),
});

pruefe('Eigene Szenarien: Musterlösung aus dem ER-Modell = handgeschriebene Musterlösung', () => {
  const menge = (namen) => [...new Set(namen.map(N))].sort().join('|');
  for (const q of rmSzenarien) {
    const hand = ermSzenarien.get(q.title).masterlösung;
    const auto = Lernpfad.masterAusErm(ermLaden(q.jsonFile));
    const wo = q.jsonFile;
    assert.strictEqual(menge(auto.entities), menge(hand.entities), `${wo}: Entitätsklassen`);
    for (const e of hand.entities) {
      const autoE = auto.entities.find((x) => N(x) === N(e));
      assert.strictEqual(menge(auto.attributes[autoE]), menge(hand.attributes[e]), `${wo}: Attribute von ${e}`);
      const pks = Array.isArray(hand.primaryKeys[e]) ? hand.primaryKeys[e] : [hand.primaryKeys[e]];
      assert.strictEqual(menge(auto.primaryKeys[autoE]), menge(pks), `${wo}: Primärschlüssel von ${e}`);
    }
    assert.strictEqual(auto.relationships.length, hand.relationships.length, `${wo}: Anzahl Beziehungen`);
    for (const h of hand.relationships) {
      const a = auto.relationships.find((x) => N(x.name) === N(h.name));
      assert(a, `${wo}: Beziehung ${h.name}`);
      const gleich = N(a.from) === N(h.from) && N(a.to) === N(h.to);
      assert(gleich || (N(a.from) === N(h.to) && N(a.to) === N(h.from)), `${wo}: Seiten von ${h.name}`);
      if (h.cardinality) {
        const [x, y] = a.cardinality.replace(/m/g, 'n').split(':');
        const erwartet = h.cardinality.replace(/m/g, 'n');
        assert.strictEqual(gleich ? `${x}:${y}` : `${y}:${x}`, erwartet, `${wo}: Kardinalität von ${h.name}`);
      }
      assert.strictEqual(menge(a.attributes), menge(h.attributes || []), `${wo}: Attribute von ${h.name}`);
    }
  }
});

pruefe('Eigene Szenarien: als Lernpfad lösbar – ER-Modell zeichnen und ins Relationenmodell überführen', () => {
  for (const q of rmSzenarien) {
    const zeichnen = Szenario.pruefeSzenario(alsSzenario(q.jsonFile)).sz;
    const ueberfuehren = Szenario.pruefeSzenario(alsSzenario(q.jsonFile, 'rm')).sz;
    Lernpfad.setEigeneSzenarien([zeichnen, ueberfuehren]);
    const erm = Lernpfad.getLernpfad(`eigen-${zeichnen.id}`);
    const rm = Lernpfad.getLernpfad(`eigen-${ueberfuehren.id}`);
    assert(erm.art === 'erm' && rm.art === 'rm' && erm.aufgaben.length === 1, q.jsonFile);
    context.AppState = { state: ermLaden(q.jsonFile) };
    const r1 = erm.aufgaben[0].validator();
    assert(r1.passed, `${q.jsonFile} zeichnen: ${r1.error}`);
    RelModel.setStudentRelations(loesung(q.jsonFile));
    const r2 = rm.aufgaben[0].validator();
    assert(r2.passed, `${q.jsonFile} überführen: ${r2.error || r2.message}`);
  }
  // Ohne Kardinalitäten zählt nur die Verbindung
  const ohne = Szenario.pruefeSzenario({ ...alsSzenario('uebung-2-krankenhaus.json'), kardinalitaeten: false }).sz;
  Lernpfad.setEigeneSzenarien([ohne]);
  const state = ermLaden('uebung-2-krankenhaus.json');
  state.edges.forEach((e) => e.edgeType === 'relationship' && (e.chenFrom = e.chenTo = ''));
  context.AppState = { state };
  assert(Lernpfad.getLernpfad(`eigen-${ohne.id}`).aufgaben[0].validator().passed, 'Krankenhaus ohne Kardinalitäten');
  Lernpfad.setEigeneSzenarien([]);
  assert(!Lernpfad.getLernpfade().some((r) => r.eigen), 'eigene Lernpfade wieder entfernt');
});

pruefe('Eigene Szenarien: Daten von außen werden geprüft', () => {
  const html = Lernpfad.textAlsHtml('Ein **Kino** <script>alert(1)</script>\n\n- Film\n- Saal');
  assert(!html.includes('<script>') && html.includes('&lt;script&gt;'), html);
  assert(html.includes('<strong>Kino</strong>') && html.includes('<ul><li>Film</li><li>Saal</li></ul>'), html);
  const boese = alsSzenario('uebung-1-hotel.json');
  boese.titel = 'Hotel <img src=x onerror=alert(1)>';
  boese.erm.nodes[0].name = '<b>Gast</b>';
  boese.erm.nodes[0].onclick = 'alert(1)';
  const { sz } = Szenario.pruefeSzenario(boese);
  assert(!/[<>]/.test(sz.titel + sz.erm.nodes.map((n) => n.name).join()), 'keine spitzen Klammern');
  assert(!('onclick' in sz.erm.nodes[0]), 'nur bekannte Felder');
  assert(Szenario.pruefeSzenario({ format: 'x' }).fehler);
  assert(Szenario.pruefeSzenario({ ...alsSzenario('uebung-1-hotel.json'), erm: { nodes: 'x', edges: [] } }).fehler);
  const ohneZahlen = alsSzenario('uebung-1-hotel.json', 'rm');
  ohneZahlen.erm.edges.forEach((e) => (e.chenFrom = e.chenTo = ''));
  assert(/Kardinalitäten/.test(Szenario.pruefeSzenario(ohneZahlen).fehler), 'Überführen braucht Kardinalitäten');
});

pruefe('ERM-Aufgabe: Beziehungen auch in anderer Verbform („teilnehmen“ für „nimmt teil an“)', () => {
  const uni = ermSzenarien.get('Universität');
  const mit = (aenderung) => {
    const state = ermLaden('experten-3-universitaet.json');
    for (const [alt, neu] of Object.entries(aenderung)) state.nodes.find((n) => n.name === alt).name = neu;
    context.AppState = { state };
    return uni.validator();
  };
  const r = mit({ 'nimmt teil an': 'teilnehmen', 'gehört zu': 'gehören', hält: 'halten' });
  assert(r.passed, r.error);
  // dieselbe Form zwischen falschen Entitätsklassen zählt nicht: „besucht“ heißt jetzt „teilnehmen“
  assert(!mit({ 'nimmt teil an': 'X', besucht: 'teilnehmen' }).passed, 'falsche Entitätsklassen');
  assert(!mit({ Student: 'Studenten' }).passed, 'Mehrzahl bei Entitätsklassen bleibt falsch');
});

pruefe('Eigene Szenarien: zwei Beziehungen „hat“ zwischen verschiedenen Entitätsklassen', () => {
  const k = (id, fromId, toId, chenTo) => ({ id, fromId, toId, edgeType: 'relationship', chenFrom: '1', chenTo });
  const a = (id, fromId, toId) => ({ id, fromId, toId, edgeType: 'attribute' });
  const erm = {
    nodes: [
      { id: 'e1', type: 'entity', name: 'Schule' },
      { id: 'e2', type: 'entity', name: 'Klasse' },
      { id: 'e3', type: 'entity', name: 'Lehrer' },
      ...['e1', 'e2', 'e3'].map((e, i) => ({ id: `p${i}`, type: 'attribute', name: 'Nr', isPrimaryKey: true })),
      { id: 'b1', type: 'relationship', name: 'hat' },
      { id: 'b2', type: 'relationship', name: 'hat' },
    ],
    edges: [
      a('a1', 'e1', 'p0'),
      a('a2', 'e2', 'p1'),
      a('a3', 'e3', 'p2'),
      k('k1', 'b1', 'e1', '1'),
      k('k2', 'b1', 'e2', 'n'),
      k('k3', 'b2', 'e2', 'n'),
      k('k4', 'b2', 'e3', 'm'),
    ],
  };
  // Überführen: zwei n:m-Beziehungen „hat“ wären zwei Tabellen „hat“ – das meldet der Bericht
  const nm = JSON.parse(JSON.stringify(erm));
  nm.edges.forEach((e) => e.edgeType === 'relationship' && (e.chenTo = 'n'));
  const bericht = Szenario.bericht({ titel: 'Hat', text: 'x', aufgabe: 'rm', kardinalitaeten: true, erm: nm });
  assert(
    bericht.some((z) => z.art === 'fehler' && /n:m-Beziehungen verschiedene Namen/.test(z.text)),
    'n:m doppelt',
  );
  // Die zweite „hat“ steht im Modell zuerst: die Prüfung muss die passende nehmen
  erm.nodes.reverse();
  const { sz } = Szenario.pruefeSzenario({
    format: 'erm-editor-szenario',
    version: 1,
    titel: 'Hat',
    text: 'x',
    aufgabe: 'erm',
    kardinalitaeten: true,
    erm,
  });
  assert(!Szenario.bericht({ ...sz, erm }).some((z) => z.art === 'fehler'), 'kein Fehler „doppelte Namen“');
  Lernpfad.setEigeneSzenarien([sz]);
  context.AppState = { state: JSON.parse(JSON.stringify(erm)) };
  const r = Lernpfad.getLernpfad(`eigen-${sz.id}`).aufgaben[0].validator();
  assert(r.passed, r.error);
  // falsche Kardinalität an der zweiten „hat“ wird bemerkt
  context.AppState.state.edges.find((e) => e.id === 'k4').chenTo = '1';
  assert(!Lernpfad.getLernpfad(`eigen-${sz.id}`).aufgaben[0].validator().passed, 'Fehler an der zweiten „hat“');
  Lernpfad.setEigeneSzenarien([]);
});

async function pruefeAsync(name, fn) {
  try {
    await fn();
    console.log('ok   ' + name);
  } catch (e) {
    fehler++;
    console.log('FEHL ' + name + '\n     ' + e.message.split('\n').join('\n     '));
  }
}

(async () => {
  await pruefeAsync('Eigene Szenarien: Link hin und zurück', async () => {
    const original = alsSzenario('experten-5-katastrophenschutz.json');
    const link = await Szenario.packen(original);
    assert(/^[A-Za-z0-9_-]+$/.test(link), 'base64url');
    const zurueck = await Szenario.auspacken(link);
    // als JSON vergleichen: Arrays aus dem vm-Kontext haben einen anderen Prototyp
    const json = (d) => JSON.stringify(Szenario.pruefeSzenario(d).sz);
    assert.strictEqual(json(zurueck), json(original));
    console.log(`     (Katastrophenschutz: ${link.length} Zeichen im Link)`);
  });
  await pruefeAsync('Eigene Szenarien: präparierter Link (Zip-Bombe, fremde Zeichen) wird abgelehnt', async () => {
    const bombe = await Szenario.packen({ format: 'erm-editor-szenario', text: 'a'.repeat(5000000) });
    await assert.rejects(Szenario.auspacken(bombe), /zu groß/);
    await assert.rejects(Szenario.auspacken('abc"><img'), /ungültig/);
  });
  console.log(fehler ? `\n${fehler} Prüfung(en) fehlgeschlagen` : '\nAlle Prüfungen bestanden');
  process.exit(fehler ? 1 : 0);
})();
