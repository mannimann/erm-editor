/* Prüfskript: node test/pruefen.js  (braucht Node und das Programm sqlite3)
   1. Toleranter Namensvergleich: Beispiele aus dem Umbauplan
   2. Keine zwei Namen derselben Entitätsklasse fallen nach der Normalisierung zusammen
      (Musterlösungen und ER-Modelle in files/); jedes ER-Modell erfüllt seine ERM-Quest
   3. Relationenmodell-Prüfung: Musterlösung, umbenannte Fremdschlüssel, zweite 1:1-Richtung, SQL-Regeln
   4. SQL aus allen Musterlösungen der Relationenmodell-Quests läuft in SQLite, die Verweise stimmen */
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
for (const file of ['js/relmodel.js', 'js/sql.js', 'js/quest.js']) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), context, { filename: file });
}
const { RelModel, SQLExport, Quest } = context;
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

const reihen = Quest.getSeriesList();
pruefe('Musterlösungen: keine zusammenfallenden Namen', () => {
  for (const reihe of reihen)
    for (const q of reihe.quests) {
      const m = q.masterlösung;
      if (!m) continue;
      const wo = `${reihe.id} ${q.number} ${q.title}`;
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

// Szenarien: ERM-Quest und Relationenmodell-Quest gehören über den Titel zusammen
const ermSzenarien = new Map();
for (const id of ['erm-uebung', 'erm-experten'])
  Quest.getQuestsForMode(id)
    .filter((q) => q.masterlösung)
    .forEach((q) => ermSzenarien.set(q.title, q));
const rmSzenarien = ['rm-uebung', 'rm-experten'].flatMap((id) => Quest.getQuestsForMode(id).filter((q) => q.jsonFile));

pruefe('Jedes ER-Modell erfüllt die Musterlösung seiner ERM-Quest', () => {
  for (const q of rmSzenarien) {
    context.AppState = { state: ermLaden(q.jsonFile) };
    const result = ermSzenarien.get(q.title).validator();
    assert(result.passed, `${q.jsonFile}: ${result.error}`);
  }
});

pruefe('ERM-Quest: „AnzahlNaechte“ und „EMail“ werden erkannt', () => {
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

pruefe('Relationenmodell-Experten: NOT NULL und UNIQUE nach den Regeln', () => {
  const fahrschule = Quest.getQuestsForMode('rm-experten').find((q) => q.title === 'Fahrschule');
  const rels = loesung(fahrschule.jsonFile);
  RelModel.setStudentRelations(rels);
  const ohne = fahrschule.validator();
  assert(!ohne.passed && /NOT NULL/.test(ohne.message), 'ohne NOT NULL darf die Quest nicht bestehen');
  rel(rels, 'Fahrstunde')
    .attrs.filter((a) => a.isFk)
    .forEach((a) => (a.notNull = true));
  RelModel.setStudentRelations(rels);
  assert(fahrschule.validator().passed, 'mit NOT NULL muss die Quest bestehen');

  const uni = Quest.getQuestsForMode('rm-experten').find((q) => q.title === 'Universität');
  const u = loesung(uni.jsonFile);
  for (const r of u) for (const a of r.attrs) if (a.isFk && !a.isPk) a.notNull = true;
  RelModel.setStudentRelations(u);
  assert(/UNIQUE/.test(uni.validator().message || ''), 'Universität ohne UNIQUE');
  attr(u, 'Hilfskraft', 'Matrikelnummer').unique = true;
  RelModel.setStudentRelations(u);
  const mitUnique = uni.validator();
  assert(mitUnique.passed, mitUnique.message);
});

pruefe('Schritt-Reihen: das fertige Modell erfüllt jede Quest', () => {
  const bestehen = (reihe, von, bis) => {
    for (const q of Quest.getQuestsForMode(reihe).slice(von - 1, bis)) {
      if (q.seitenleisteSelbstOeffnen) continue; // prüft die geöffnete Seitenleiste im Browser
      const result = q.validator();
      assert(result.passed, `${reihe} ${q.number} ${q.title}: ${result.error || result.message}`);
    }
  };
  context.AppState = { state: ermLaden('schule-grundlagen.json') };
  bestehen('erm-grundlagen', 1, 99);

  // ERM-Auffrischung: bis Quest 5 mit „Bezeichnung“, ab Quest 6 mit dem Verbundschlüssel
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

  const rels = loesung('schule-auffrischung.json');
  attr(rels, 'Schüler', 'Klassenstufe').notNull = true;
  attr(rels, 'Schüler', 'Parallelklasse').notNull = true;
  attr(rels, 'Klasse', 'SchülerNr').unique = true;
  RelModel.setStudentRelations(rels);
  bestehen('rm-auffrischung', 1, 99);
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

console.log(fehler ? `\n${fehler} Prüfung(en) fehlgeschlagen` : '\nAlle Prüfungen bestanden');
process.exit(fehler ? 1 : 0);
