/* ============================================================
   sql.js  –  SQL-Code (CREATE TABLE) aus den Relationen der Schüler
   ============================================================ */
'use strict';

(function () {
  const TYPEN = ['INTEGER', 'REAL', 'TEXT'];
  const R = () => window.RelModel;

  // SQL-Name: klein, ä → ae, ö → oe, ü → ue, ß → ss, alles außer a–z und 0–9 → _
  // („Lehrer-Kürzel“ → lehrer_kuerzel, „ist befreundet mit“ → ist_befreundet_mit).
  // ponytail: SQL-Schlüsselwörter als Namen (z. B. „Index“) werden nicht abgefangen.
  function sqlName(name) {
    return R()
      .foldName(R().stripForeignKeyMarker(name))
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
  }

  function hatName(x) {
    return !!String(x?.name || '').trim();
  }

  function primaerschluessel(rel) {
    return rel.attrs.filter((a) => a.isPk && hatName(a));
  }

  // Mögliche Ziele eines Fremdschlüssels: Primärschlüssel, die so heißen wie er – exakt oder mit Zusatz
  // („SchülerNr-Freund“ → SchülerNr). Bevorzugt: Schlüssel, die nicht selbst Fremdschlüssel sind
  // (Schüler.SchülerNr statt „ist befreundet mit“.SchülerNr), dann der exakte Name. Danach zählt der
  // Name der Zieltabelle, wenn sie genau einen Schlüssel hat („mannschaft“ → mannschaft(name)).
  function kandidaten(fk, rels) {
    const liste = [];
    rels.forEach((rel) => {
      const pks = primaerschluessel(rel);
      pks.forEach((pk) => {
        if (pk === fk) return;
        const exakt = R().normalizeName(pk.name) === R().normalizeName(fk.name);
        if (!exakt && !R().selfRefFkRawNameMatchesBase(fk.name, pk.name)) return;
        liste.push({ rel, attr: pk, rang: (pk.isFk ? 2 : 0) + (exakt ? 0 : 1) });
      });
      if (pks.length === 1 && pks[0] !== fk && R().fkRawNameMatches(fk.name, rel.name))
        liste.push({ rel, attr: pks[0], rang: 1.5 });
    });
    const besterRang = Math.min(...liste.map((k) => k.rang));
    const beste = liste.filter((k) => k.rang === besterRang);
    return beste.filter((k, i) => beste.findIndex((b) => b.attr === k.attr) === i);
  }

  // Ziel eines Fremdschlüssels; bei mehreren oder keinen Kandidaten zählt die Wahl „verweist auf“ (fkTarget).
  function zielVon(fk, rels) {
    const auswahl = kandidaten(fk, rels);
    if (auswahl.length === 1) return { ziel: auswahl[0], auswahl, eindeutig: true };
    const t = fk.fkTarget;
    const rel = t && rels.find((r) => r.id === t.rel);
    const attr = rel && primaerschluessel(rel).find((a) => a.id === t.attr && a !== fk);
    return { ziel: attr ? { rel, attr } : null, auswahl, eindeutig: false };
  }

  // Ein Fremdschlüssel übernimmt den Typ seines Primärschlüssels.
  function typVon(attr, rels, besucht = new Set()) {
    if (attr.isFk && !besucht.has(attr)) {
      besucht.add(attr);
      const { ziel } = zielVon(attr, rels);
      if (ziel) return typVon(ziel.attr, rels, besucht);
    }
    return TYPEN.includes(attr.sqlType) ? attr.sqlType : 'TEXT';
  }

  /**
   * Erzeugt CREATE-TABLE-Code (SQLite) aus Relationen
   * [{ id?, name, attrs: [{ id?, name, isPk, isFk, sqlType?, notNull?, unique?, fkTarget? }] }].
   * erweitert (Stufe Fortgeschritten): NOT NULL und UNIQUE übernehmen.
   * Rückgabe: { sql, fehler[] } – bei Fehlern ist sql leer.
   */
  function generateSQL(relationen, { erweitert = false } = {}) {
    const rels = (relationen || [])
      .map((rel) => ({ ...rel, attrs: (rel.attrs || []).filter(hatName) }))
      .filter((rel) => hatName(rel) || rel.attrs.length);
    const fehler = [];

    const tabellen = new Map();
    rels.forEach((rel) => {
      const tabelle = sqlName(rel.name);
      if (!tabelle) {
        fehler.push('Eine Relation hat keinen Namen.');
        return;
      }
      if (tabellen.has(tabelle))
        fehler.push(`„${tabellen.get(tabelle).name}“ und „${rel.name}“ ergeben beide die Tabelle ${tabelle}.`);
      else tabellen.set(tabelle, rel);
      if (!primaerschluessel(rel).length) fehler.push(`Relation „${rel.name}“ hat keinen Primärschlüssel.`);
      const spalten = new Map();
      rel.attrs.forEach((a) => {
        const spalte = sqlName(a.name);
        if (!spalte) fehler.push(`In „${rel.name}“ ergibt „${a.name}“ keinen Spaltennamen.`);
        else if (spalten.has(spalte))
          fehler.push(
            `In „${rel.name}“ ergeben „${spalten.get(spalte).name}“ und „${a.name}“ beide die Spalte ${spalte}.`,
          );
        else spalten.set(spalte, a);
      });
    });

    // Fremdschlüssel auflösen
    const verweise = new Map(); // Fremdschlüssel → { rel, attr }
    rels.forEach((rel) =>
      rel.attrs
        .filter((a) => a.isFk)
        .forEach((fk) => {
          const { ziel } = zielVon(fk, rels);
          if (ziel) verweise.set(fk, ziel);
          else
            fehler.push(
              `Fremdschlüssel „${fk.name}“ in „${rel.name}“: Wähle bei „verweist auf“, auf welchen Primärschlüssel er zeigt.`,
            );
        }),
    );

    // Fremdschlüssel auf einen zusammengesetzten Schlüssel gruppieren: gleiches Ziel und gleicher Zusatz
    // (Klassenstufe + Parallelklasse; Klassenstufe-Sprecher + Parallelklasse-Sprecher).
    const gruppen = new Map(); // rel → Map(schlüssel → { ziel, fks })
    rels.forEach((rel) => {
      const proRel = new Map();
      rel.attrs.forEach((fk) => {
        const ziel = verweise.get(fk);
        if (!ziel || primaerschluessel(ziel.rel).length < 2) return;
        const zusatz = R().normalizeName(fk.name).replace(R().normalizeName(ziel.attr.name), '');
        const key = `${sqlName(ziel.rel.name)}|${zusatz}`;
        if (!proRel.has(key)) proRel.set(key, { ziel: ziel.rel, fks: [] });
        proRel.get(key).fks.push(fk);
      });
      proRel.forEach(({ ziel, fks }) => {
        const zielPks = primaerschluessel(ziel);
        const abgedeckt = zielPks.filter((pk) => fks.some((fk) => verweise.get(fk).attr === pk));
        if (fks.length !== zielPks.length || abgedeckt.length !== zielPks.length)
          fehler.push(
            `In „${rel.name}“ passt der Fremdschlüssel auf „${ziel.name}“ nicht zu dessen Schlüssel aus ${zielPks
              .map((pk) => `„${pk.name}“`)
              .join(' und ')}.`,
          );
      });
      gruppen.set(rel, proRel);
    });

    if (fehler.length) return { sql: '', fehler };

    // Tabellen, auf die verwiesen wird, zuerst. Selbstverweise und Verweise innerhalb eines Zyklus
    // (klasse ↔ schueler) zählen nicht – dort bleibt die ursprüngliche Reihenfolge.
    const ziele = (rel) => new Set(rel.attrs.map((a) => verweise.get(a)?.rel).filter((z) => z && z !== rel));
    const erreicht = (von, nach, gesehen = new Set()) => {
      if (von === nach) return true;
      if (gesehen.has(von)) return false;
      gesehen.add(von);
      return [...ziele(von)].some((z) => erreicht(z, nach, gesehen));
    };
    const offen = [...rels];
    const reihenfolge = [];
    while (offen.length) {
      const naechste =
        offen.find((rel) => [...ziele(rel)].every((z) => reihenfolge.includes(z) || erreicht(z, rel))) || offen[0];
      reihenfolge.push(naechste);
      offen.splice(offen.indexOf(naechste), 1);
    }

    const sql = reihenfolge
      .map((rel) => {
        const pks = primaerschluessel(rel);
        const zusammengesetzt = [...gruppen.get(rel).values()];
        const inGruppe = (a) => zusammengesetzt.find((g) => g.fks.includes(a));
        // UNIQUE eines zusammengesetzten Fremdschlüssels gilt für die Kombination
        const uniqueGruppe = (g) => erweitert && g.fks.every((fk) => fk.unique);

        const zeilen = rel.attrs.map((a) => {
          let zeile = `${sqlName(a.name)} ${typVon(a, rels)}`;
          const einzigerPs = a.isPk && pks.length === 1;
          const gruppe = inGruppe(a);
          if (einzigerPs) zeile += ' PRIMARY KEY';
          if (erweitert && a.notNull && !a.isPk) zeile += ' NOT NULL';
          if (erweitert && a.unique && !einzigerPs && !(gruppe && uniqueGruppe(gruppe))) zeile += ' UNIQUE';
          const ziel = verweise.get(a);
          if (ziel && !gruppe) zeile += ` REFERENCES ${sqlName(ziel.rel.name)}(${sqlName(ziel.attr.name)})`;
          return zeile;
        });
        zusammengesetzt.forEach((g) => {
          // Spalten in der Reihenfolge des Zielschlüssels
          const zielPks = primaerschluessel(g.ziel);
          const fks = zielPks.map((pk) => g.fks.find((fk) => verweise.get(fk).attr === pk));
          const spalten = fks.map((fk) => sqlName(fk.name)).join(', ');
          if (uniqueGruppe(g)) zeilen.push(`UNIQUE (${spalten})`);
          zeilen.push(
            `FOREIGN KEY (${spalten}) REFERENCES ${sqlName(g.ziel.name)}(${zielPks.map((pk) => sqlName(pk.name)).join(', ')})`,
          );
        });
        if (pks.length > 1) zeilen.push(`PRIMARY KEY (${pks.map((a) => sqlName(a.name)).join(', ')})`);
        return `CREATE TABLE ${sqlName(rel.name)} (\n  ${zeilen.join(',\n  ')}\n);`;
      })
      .join('\n\n');

    return { sql, fehler };
  }

  // ======================================================================
  // DIALOG
  // ======================================================================

  let erweitertFrei = false; // Wahl ohne laufende Quest

  // Stufe der laufenden Quest-Reihe: 'Einstieg', 'Fortgeschritten' oder null (keine Quest)
  function stufe() {
    const q = window.Quest;
    return q?.state?.questsPanelVisible ? q.getSeries?.()?.stufe || null : null;
  }

  function istErweitert() {
    const s = stufe();
    if (s === 'Fortgeschritten') return true;
    if (s === 'Einstieg') return false;
    return erweitertFrei;
  }

  function el(tag, className = '', text = '') {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  // Änderung an einer Spalte in den Relationen des Schülers speichern
  function aendern(relId, attrId, werte) {
    const rels = R().getStudentRelations();
    const attr = rels.find((r) => r.id === relId)?.attrs.find((a) => a.id === attrId);
    if (!attr) return;
    Object.assign(attr, werte);
    R().setStudentRelations(rels);
    render();
  }

  function auswahlfeld(optionen, wert, onChange) {
    const select = el('select', 'prop-select sql-select');
    optionen.forEach(([value, label]) => {
      const option = el('option', '', label);
      option.value = value;
      select.appendChild(option);
    });
    select.value = wert;
    select.addEventListener('change', () => onChange(select.value));
    return select;
  }

  function haekchen(checked, onChange) {
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = !!checked;
    cb.addEventListener('change', () => onChange(cb.checked));
    return cb;
  }

  function render() {
    const rels = R()
      .getStudentRelations()
      .map((rel) => ({ ...rel, attrs: rel.attrs.filter(hatName) }));
    const erweitert = istErweitert();
    const container = document.getElementById('sql-spalten');
    container.innerHTML = '';

    if (!rels.some((rel) => rel.attrs.length)) {
      container.appendChild(el('p', 'table-preview-empty', 'Lege zuerst Relationen mit Attributen an.'));
    }

    rels
      .filter((rel) => rel.attrs.length)
      .forEach((rel) => {
        const section = el('section', 'sql-relation');
        section.appendChild(el('h5', '', `${rel.name || 'Relation ohne Namen'} → ${sqlName(rel.name) || '?'}`));
        const wrap = el('div', 'table-preview-table-wrap');
        const table = el('table', 'sql-table');
        const kopf = el('tr');
        ['Spalte', 'Typ', 'verweist auf', ...(erweitert ? ['NOT NULL', 'UNIQUE'] : [])].forEach((t) =>
          kopf.appendChild(el('th', '', t)),
        );
        table.appendChild(el('thead')).appendChild(kopf);
        const body = table.appendChild(el('tbody'));
        const einPs = primaerschluessel(rel).length === 1;

        rel.attrs.forEach((a) => {
          const zeile = el('tr');
          const spalte = el('td', 'sql-spalte', sqlName(a.name));
          const schluessel = [a.isPk && 'PS', a.isFk && 'FS'].filter(Boolean).join(', ');
          if (schluessel) spalte.appendChild(el('span', 'sql-key', schluessel));
          zeile.appendChild(spalte);

          const typZelle = el('td');
          const fk = a.isFk ? zielVon(a, rels) : null;
          if (fk?.ziel) typZelle.textContent = `${typVon(a, rels)} (wie Primärschlüssel)`;
          else
            typZelle.appendChild(
              auswahlfeld(
                TYPEN.map((t) => [t, t]),
                TYPEN.includes(a.sqlType) ? a.sqlType : 'TEXT',
                (sqlType) => aendern(rel.id, a.id, { sqlType }),
              ),
            );
          zeile.appendChild(typZelle);

          const zielZelle = el('td');
          if (!fk) zielZelle.textContent = '–';
          else if (fk.eindeutig) zielZelle.textContent = `${fk.ziel.rel.name}.${fk.ziel.attr.name}`;
          else {
            // Mehrdeutig: passende Primärschlüssel anbieten, ohne Treffer alle
            const angebot = fk.auswahl.length
              ? fk.auswahl
              : rels
                  .flatMap((r) => primaerschluessel(r).map((pk) => ({ rel: r, attr: pk })))
                  .filter((k) => k.attr !== a);
            zielZelle.appendChild(
              auswahlfeld(
                [
                  ['', '– bitte wählen –'],
                  ...angebot.map((k) => [`${k.rel.id}|${k.attr.id}`, `${k.rel.name}.${k.attr.name}`]),
                ],
                fk.ziel ? `${fk.ziel.rel.id}|${fk.ziel.attr.id}` : '',
                (wert) => {
                  const [relId, attrId] = wert.split('|');
                  aendern(rel.id, a.id, { fkTarget: wert ? { rel: relId, attr: attrId } : null });
                },
              ),
            );
          }
          zeile.appendChild(zielZelle);

          if (erweitert) {
            const nn = el('td');
            if (a.isPk) nn.textContent = '–';
            else nn.appendChild(haekchen(a.notNull, (notNull) => aendern(rel.id, a.id, { notNull })));
            zeile.appendChild(nn);
            const uq = el('td');
            if (a.isPk && einPs) uq.textContent = '–';
            else uq.appendChild(haekchen(a.unique, (unique) => aendern(rel.id, a.id, { unique })));
            zeile.appendChild(uq);
          }
          body.appendChild(zeile);
        });

        wrap.appendChild(table);
        section.appendChild(wrap);
        container.appendChild(section);
      });

    const { sql, fehler } = generateSQL(rels, { erweitert });
    const fehlerBox = document.getElementById('sql-fehler');
    fehlerBox.innerHTML = '';
    if (fehler.length) {
      const liste = el('ul', 'sql-fehler-liste');
      fehler.forEach((f) => liste.appendChild(el('li', '', f)));
      fehlerBox.appendChild(liste);
    }
    document.getElementById('sql-ausgabe').textContent = sql;
    document.getElementById('sql-ausgabe').hidden = !sql;
    document.getElementById('btn-sql-kopieren').disabled = !sql;
    document.getElementById('btn-sql-speichern').disabled = !sql;
  }

  function oeffnen() {
    const s = stufe();
    document.getElementById('sql-erweitert-wrap').hidden = !!s;
    document.getElementById('sql-erweitert').checked = istErweitert();
    render();
    const backdrop = document.getElementById('modal-sql-backdrop');
    backdrop.style.display = 'flex';
    backdrop.focus();
  }

  function schliessen() {
    document.getElementById('modal-sql-backdrop').style.display = 'none';
  }

  async function kopieren() {
    const pre = document.getElementById('sql-ausgabe');
    const btn = document.getElementById('btn-sql-kopieren');
    try {
      await navigator.clipboard.writeText(pre.textContent);
      btn.textContent = '✓ Kopiert';
    } catch (_e) {
      // Ohne Zugriff auf die Zwischenablage: Code markieren
      const range = document.createRange();
      range.selectNodeContents(pre);
      window.getSelection().removeAllRanges();
      window.getSelection().addRange(range);
      btn.textContent = 'Markiert – Strg+C drücken';
    }
    setTimeout(() => (btn.textContent = '📋 Kopieren'), 2000);
  }

  function speichern() {
    const sql = document.getElementById('sql-ausgabe').textContent;
    const blob = new Blob([sql + '\n'], { type: 'application/sql' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const title = (window.AppState?.state?.diagramTitle || 'datenbank').replace(/[^a-zA-Z0-9äöüÄÖÜß_\- ]/g, '');
    a.download = (title.trim() || 'datenbank') + '.sql';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  document.addEventListener('DOMContentLoaded', () => {
    const backdrop = document.getElementById('modal-sql-backdrop');
    if (!backdrop) return;
    document.getElementById('btn-sql').addEventListener('click', oeffnen);
    document.getElementById('btn-sql-close').addEventListener('click', schliessen);
    document.getElementById('btn-sql-kopieren').addEventListener('click', kopieren);
    document.getElementById('btn-sql-speichern').addEventListener('click', speichern);
    document.getElementById('sql-erweitert').addEventListener('change', (e) => {
      erweitertFrei = e.target.checked;
      render();
    });
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) schliessen();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && backdrop.style.display !== 'none') schliessen();
    });
  });

  window.SQLExport = { generateSQL, sqlName };
})();
