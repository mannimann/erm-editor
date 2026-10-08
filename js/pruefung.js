/* ============================================================
   pruefung.js  –  Prüfungsmodus (Leistungskontrolle, z. B. mit ONYX/OPAL) und Korrektur
   Ein Szenario mit „pruefung: true“ (js/szenario.js) öffnet die Aufgabe ohne Lösung, Prüfung und Hinweise.
   Die Schüler geben eine Datei ab (.erm-abgabe.json); die Lehrkraft öffnet sie mit ihrer Szenario-Datei und
   bekommt eine Korrekturliste, die sie als Text in die Korrektur kopiert. Plan: .plan/pruefungsmodus.md
   ============================================================ */
'use strict';

(function () {
  const ABGABE_FORMAT = 'erm-editor-abgabe';
  // Arbeitsstand einer Prüfung: alle Schlüssel mit „pruefung-<id>“ (Stand der Aufgabe, Lernpfad, dieser hier)
  const META_PREFIX = 'erm-editor-pruefung-';
  // Geteilte Schul-PCs: Ein Stand ohne Änderung seit 2 Stunden gehört nicht mehr zu einer laufenden Prüfung
  const ABLAUF_MS = 2 * 60 * 60 * 1000;
  // Diesem Tab gehört der Stand schon (Neuladen fragt nicht erneut); sessionStorage gilt nur für diesen Tab
  const BESTAETIGT_KEY = 'erm-editor-pruefung-bestaetigt';
  const ARTEN = ['entitaet', 'attribut', 'beziehung'];

  let pruefung = null; // laufende Prüfung: { sz, pid, markierungen }
  let korrektur = null; // { sz, abgaben: [{ datei, abgabe, punkte, kopiert }], index, meldungen }
  // Korrektur im Browser gespeichert (Szenario-Datei, Abgaben, Korrekturlisten), bis die Lehrkraft sie löscht
  const KORREKTUR_KEY = 'erm-editor-korrekturen-v1';

  const text = (v, max) =>
    String(v ?? '')
      .replace(/[<>]/g, '')
      .trim()
      .slice(0, max);

  // ---- Arbeitsstand und Ablauf ----
  function schluessel() {
    try {
      return Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i));
    } catch (_e) {
      return [];
    }
  }

  function standLoeschen(pid) {
    schluessel()
      .filter((k) => k.includes(`pruefung-${pid}`))
      .forEach((k) => localStorage.removeItem(k));
  }

  function metaLesen(pid) {
    try {
      return JSON.parse(localStorage.getItem(META_PREFIX + pid)) || null;
    } catch (_e) {
      return null;
    }
  }

  function metaSchreiben() {
    if (!pruefung) return;
    try {
      localStorage.setItem(
        META_PREFIX + pruefung.pid,
        JSON.stringify({ geaendert: Date.now(), markierungen: pruefung.markierungen }),
      );
    } catch (_e) {
      // Speicher voll: Der Stand hält nur bis zum Neuladen
    }
  }

  // Alle Prüfungsstände, deren letzte Änderung länger als ABLAUF_MS her ist, löschen
  function aufraeumen(jetzt = Date.now()) {
    schluessel()
      .filter((k) => k.startsWith(META_PREFIX) && k !== BESTAETIGT_KEY)
      .forEach((k) => {
        const pid = k.slice(META_PREFIX.length);
        const geaendert = metaLesen(pid)?.geaendert;
        if (!(jetzt - geaendert < ABLAUF_MS)) standLoeschen(pid);
      });
  }

  const sitzung = {
    lesen: () => {
      try {
        return sessionStorage.getItem(BESTAETIGT_KEY);
      } catch (_e) {
        return null;
      }
    },
    schreiben: (wert) => {
      try {
        if (wert) sessionStorage.setItem(BESTAETIGT_KEY, wert);
        else sessionStorage.removeItem(BESTAETIGT_KEY);
      } catch (_e) {
        // ohne sessionStorage fragt jedes Neuladen
      }
    },
  };

  // Aufgabe eines Szenarios als Lernpfad, der in keinem Menü steht
  function sonderLernpfad(sz, art) {
    const lernpfad = window.Lernpfad.eigenerLernpfad(sz);
    Object.assign(lernpfad, { id: `${art}-${window.Szenario.pruefungsId(sz)}`, [art]: true });
    // Prüfung: weder Musterlösung noch Prüfung. Überführen aus einem Link: kein ER-Modell (nur sein Bild), die
    // Zeichenfläche bleibt leer – ohne ER-Modell kann relmodel.js auch keine Lösung ausrechnen.
    if (art === 'pruefung')
      lernpfad.aufgaben = lernpfad.aufgaben.map(({ masterlösung, validator, ...a }) =>
        sz.aufgabe === 'rm' && !sz.erm ? { ...a, erm: { nodes: [], edges: [], diagramTitle: sz.titel } } : a,
      );
    window.Lernpfad.setSonderLernpfad(lernpfad);
    return lernpfad;
  }

  // ======================================================================
  // PRÜFUNG (Schüler)
  // ======================================================================

  async function starten(sz) {
    const pid = window.Szenario.pruefungsId(sz);
    const lernpfad = sonderLernpfad(sz, 'pruefung');
    aufraeumen();
    const meta = metaLesen(pid);
    if (meta && sitzung.lesen() !== pid) {
      const uhrzeit = new Date(meta.geaendert).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
      // Abbrechen (auch Esc) lässt den Stand stehen: Ein versehentlicher Klick löscht nichts
      const neu = await window.App.showAppModal({
        title: 'Prüfung',
        message: `Auf diesem Gerät gibt es schon eine Bearbeitung dieser Aufgabe (zuletzt geändert um ${uhrzeit} Uhr). Ist das deine?`,
        mode: 'confirm',
        confirmLabel: 'Nein – neu beginnen',
        cancelLabel: 'Ja – weiterarbeiten',
      });
      if (neu) standLoeschen(pid);
    }
    sitzung.schreiben(pid);
    pruefung = { sz, pid, markierungen: metaLesen(pid)?.markierungen || {} };
    metaSchreiben();

    document.body.classList.add('pruefung', `pruefung-${sz.aufgabe}`);
    const titel = document.getElementById('app-title');
    titel.textContent = `Prüfung: ${sz.titel}`;
    titel.title = titel.textContent;
    if (sz.ermBild) ermBildZeigen(ermBildSvg(sz.ermBild));
    // Der Link bleibt in der Adresszeile: Neuladen öffnet die Prüfung wieder. Ausnahme: Die Lehrkraft sieht sich
    // eine Überführen-Prüfung aus ihrer Datei an – deren ER-Modell gehört nicht in eine Adresse, die man kopiert.
    if (!(sz.aufgabe === 'rm' && sz.erm)) {
      const link = `#szenario=${await window.Szenario.packen(window.Szenario.fuerLink(sz))}`;
      window.history.replaceState(null, '', window.location.pathname + link);
    }
    return window.App.startLernpfad(lernpfad.id, true);
  }

  // ---- Überführen: Bild des ER-Modells statt seiner Daten (Format: Szenario.pruefeErmBild). Aus der
  // Zeichenfläche der Lehrkraft kommen nur Formen, Linien und Beschriftungen – wer womit verbunden ist, steht
  // nirgends, und der Link bleibt kurz. ----
  function ermBildAusEditor() {
    const r = (n) => Math.round(Number(n) || 0);
    const attr = (el, ...namen) => namen.map((n) => r(el.getAttribute(n)));
    const k = [...document.querySelectorAll('#nodes-layer .node')].map((g) => {
      const [, x, y] = /translate\(\s*([-\d.]+)[,\s]+([-\d.]+)/.exec(g.getAttribute('transform')) || [0, 0, 0];
      const form = g.querySelector('rect, ellipse, polygon');
      const zeilen = [...g.querySelectorAll('text tspan')].map((t) => t.textContent);
      const text = zeilen.length ? zeilen.join('\n') : g.querySelector('text')?.textContent || '';
      const pk = g.classList.contains('node-attribute') && g.querySelector(':scope > line') ? 1 : 0;
      if (form.tagName === 'rect') return ['e', r(x), r(y), ...attr(form, 'width', 'height'), text, 0];
      if (form.tagName === 'ellipse') return ['a', r(x), r(y), ...attr(form, 'rx', 'ry'), text, pk];
      const p = form
        .getAttribute('points')
        .split(/[\s,]+/)
        .map(Number); // 0,-h/2 w/2,0 0,h/2 -w/2,0
      return ['r', r(x), r(y), r(p[2] * 2), r(p[5] * 2), text, 0];
    });
    const l = [...document.querySelectorAll('#edges-layer line.edge-line')].flatMap((el) =>
      attr(el, 'x1', 'y1', 'x2', 'y2'),
    );
    const z = [...document.querySelectorAll('#edges-layer text.edge-label')].flatMap((el) => [
      ...attr(el, 'x', 'y'),
      el.textContent,
    ]);
    // Ausschnitt: alle Formen und Zahlen mit Rand
    const xs = [];
    const ys = [];
    k.forEach(([art, x, y, a, b]) => {
      const [w, h] = art === 'a' ? [a, b] : [a / 2, b / 2];
      xs.push(x - w, x + w);
      ys.push(y - h, y + h);
    });
    for (let i = 0; i < z.length; i += 3) {
      xs.push(z[i], z[i] + 12);
      ys.push(z[i + 1] - 14, z[i + 1]);
    }
    const rand = 12;
    const [x0, y0] = [Math.min(...xs) - rand, Math.min(...ys) - rand];
    return { v: [x0, y0, Math.max(...xs) + rand - x0, Math.max(...ys) + rand - y0], k, l, z };
  }

  // Zeichnet wie js/diagram.js (renderNode, renderEdge), nur ohne Kennungen
  function ermBildSvg({ v, k, l, z }) {
    const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const teile = [`<rect x="${v[0]}" y="${v[1]}" width="${v[2]}" height="${v[3]}" fill="#fff"/>`];
    for (let i = 0; i + 3 < l.length; i += 4)
      teile.push(
        `<line x1="${l[i]}" y1="${l[i + 1]}" x2="${l[i + 2]}" y2="${l[i + 3]}" stroke="#475569" stroke-width="2"/>`,
      );
    for (let i = 0; i + 2 < z.length; i += 3)
      teile.push(
        `<text x="${z[i]}" y="${z[i + 1]}" font-size="13" font-weight="700" fill="#1e293b">${esc(z[i + 2])}</text>`,
      );
    k.forEach(([art, x, y, a, b, text, pk]) => {
      const form = {
        e: `<rect x="${-a / 2}" y="${-b / 2}" width="${a}" height="${b}" fill="#dbeafe" stroke="#2563eb" stroke-width="2"/>`,
        a: `<ellipse rx="${a}" ry="${b}" fill="#fef3c7" stroke="#d97706" stroke-width="2"/>`,
        r: `<polygon points="0,${-b / 2} ${a / 2},0 0,${b / 2} ${-a / 2},0" fill="#dcfce7" stroke="#16a34a" stroke-width="2"/>`,
      }[art];
      const zeilen = String(text).split('\n');
      const zeile = (t, i) => `<tspan x="0" y="${i * 14 - ((zeilen.length - 1) * 14) / 2}">${esc(t)}</tspan>`;
      const breite = Math.max(8, text.trim().length * 7.1) / 2; // Unterstrich wie makePrimaryKeyDecoration
      teile.push(
        `<g transform="translate(${x},${y})">${form}<text text-anchor="middle" dominant-baseline="middle" font-size="13" fill="#1e293b"${pk ? ' font-weight="800"' : ''}>${zeilen.map(zeile).join('')}</text>${
          pk
            ? `<line x1="${-breite}" x2="${breite}" y1="8" y2="8" stroke="#1e293b" stroke-width="2.5" stroke-linecap="round"/>`
            : ''
        }</g>`,
      );
    });
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${v[2]}" height="${v[3]}" viewBox="${v.join(' ')}" font-family="system-ui, 'Segoe UI', sans-serif">${teile.join('')}</svg>`;
  }

  // Das Bild über der (leeren) Zeichenfläche; Klick wechselt zwischen eingepasst und Originalgröße.
  // Als <img> geladen, darum liefe in einem präparierten Bild auch kein Skript.
  function ermBildZeigen(svg) {
    const box = document.createElement('div');
    box.id = 'pruefung-erm-bild';
    const img = document.createElement('img');
    img.alt = 'ER-Modell der Aufgabe';
    img.title = 'Klicken: Originalgröße / einpassen';
    img.src = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    img.addEventListener('click', () => box.classList.toggle('gross'));
    box.appendChild(img);
    document.getElementById('canvas-container').appendChild(box);
  }

  // Jede Änderung (ER-Modell, Relationen, Textmarker) hält den Stand frisch
  function beruehrt() {
    if (pruefung && window.Lernpfad?.state?.lernpfadId === `pruefung-${pruefung.pid}`) metaSchreiben();
  }

  function abgabeDaten() {
    const { sz, pid, markierungen } = pruefung;
    const s = window.AppState.state;
    return {
      format: ABGABE_FORMAT,
      version: 1,
      pruefungsId: pid,
      titel: sz.titel,
      aufgabe: sz.aufgabe,
      abgegeben: new Date().toISOString(),
      ...(sz.aufgabe === 'erm'
        ? { erm: { nodes: s.nodes, edges: s.edges } }
        : {
            relationen: window.RelModel.getStudentRelations().map((r) => ({
              name: r.name,
              attrs: r.attrs.map((a) => ({ name: a.name, isPk: !!a.isPk, isFk: !!a.isFk })),
            })),
          }),
      markierungen,
    };
  }

  function herunterladen(daten, dateiname) {
    const blob = new Blob([JSON.stringify(daten, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = dateiname;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  async function abgeben() {
    if (!pruefung) return;
    const dateiname = `${pruefung.sz.titel.replace(/[\\/:*?"<>|]/g, '-')}.erm-abgabe.json`;
    herunterladen(abgabeDaten(), dateiname);
    const loeschen = await window.App.showAppModal({
      title: 'Abgabe gespeichert',
      message: `Lade die Datei „${dateiname}“ jetzt hoch (z. B. in ONYX). Danach kannst du deinen Arbeitsstand auf diesem Gerät löschen, damit ihn niemand nach dir sieht. Du kannst auch weiterarbeiten und später erneut abgeben.`,
      mode: 'confirm',
      confirmLabel: 'Arbeitsstand löschen',
      cancelLabel: 'Weiterarbeiten',
    });
    if (!loeschen) return;
    standLoeschen(pruefung.pid);
    sitzung.schreiben(null);
    pruefung = null; // kein Speichern mehr bis zum Neuladen
    window.location.reload();
  }

  // ======================================================================
  // KORREKTUR (Lehrkraft)
  // ======================================================================

  // Abgabe von außen (Schüler): nur bekannte Felder, Namen ohne < und >, Größen begrenzt
  function pruefeAbgabe(d) {
    if (!d || d.format !== ABGABE_FORMAT) return { fehler: 'Das ist keine Abgabe-Datei des ERM-Editors.' };
    if (d.version !== 1) return { fehler: 'Die Abgabe stammt aus einer neueren Version des ERM-Editors.' };
    const aufgabe = d.aufgabe === 'rm' ? 'rm' : 'erm';
    const markierungen = {};
    Object.entries(d.markierungen && typeof d.markierungen === 'object' ? d.markierungen : {})
      .slice(0, 5000)
      .forEach(([i, art]) => {
        if (/^\d{1,5}$/.test(i) && ARTEN.includes(art)) markierungen[i] = art;
      });
    const abgabe = {
      pruefungsId: String(d.pruefungsId ?? '')
        .replace(/[^a-z0-9]/g, '')
        .slice(0, 16),
      titel: text(d.titel, 80),
      aufgabe,
      abgegeben: text(d.abgegeben, 40),
      markierungen,
    };
    if (aufgabe === 'erm') {
      abgabe.erm = window.Szenario.pruefeErm(d.erm);
      if (!abgabe.erm) return { fehler: 'Das ER-Modell in der Abgabe ist ungültig.' };
    } else {
      if (!Array.isArray(d.relationen) || d.relationen.length > 200)
        return { fehler: 'Die Relationen in der Abgabe sind ungültig.' };
      abgabe.relationen = d.relationen.map((r) => ({
        name: text(r?.name, 100),
        attrs: (Array.isArray(r?.attrs) ? r.attrs.slice(0, 200) : []).map((a) => ({
          name: text(a?.name, 100),
          isPk: !!a?.isPk,
          isFk: !!a?.isFk,
        })),
      }));
    }
    return { abgabe };
  }

  // Korrekturliste aus dem geladenen Modell (ER-Modell bzw. Relationen der Abgabe) und der Musterlösung.
  // Gruppen aus Zeilen { art, text, fehlt, ok }; fehlt steht nur bei ✗ im Feedback.
  function punkteBerechnen(sz) {
    const L = window.Lernpfad;
    const zeilen = (art, items, fehlt, beschriften = (i) => i.label.replace('.', ': ')) =>
      items.map((i) => ({ art, text: beschriften(i), fehlt, ok: i.ok }));
    const gruppen = [];
    let zusaetzlich;
    if (sz.aufgabe === 'erm') {
      const spec = L.masterAusErm(sz.erm, sz.kardinalitaeten);
      const st = L.getExpertChecklistStatus(spec);
      const anzeige = (k) => (k === 'n:n' ? 'n:m' : k);
      gruppen.push(zeilen('Entitätsklassen', st.entities.items, 'fehlt', (i) => i.label));
      gruppen.push(
        st.relationships.items.flatMap(({ rel, verbunden, karteOk, gezeichnet }) => [
          {
            art: 'Beziehungen',
            text: `„${rel.name}“ zwischen ${rel.from} und ${rel.to}`,
            fehlt: 'fehlt oder verbindet andere Entitätsklassen',
            ok: verbunden,
          },
          ...(rel.cardinality
            ? [
                {
                  art: 'Kardinalitäten',
                  text: `„${rel.name}“: ${rel.cardinality}`,
                  fehlt: verbunden ? `gezeichnet ${anzeige(gezeichnet)}` : 'Beziehung fehlt',
                  ok: karteOk,
                },
              ]
            : []),
        ]),
      );
      gruppen.push(zeilen('Attribute', st.attributes.items, 'fehlt'));
      gruppen.push(zeilen('Primärschlüssel', st.primaryKeys.items, 'nicht als Primärschlüssel markiert'));
      zusaetzlich = L.zusaetzlicheErmElemente(spec);
    } else {
      const st = L.getRelmodelChecklistStatus() || {
        relations: { items: [] },
        attributes: { items: [] },
        primaryKeys: { items: [] },
        foreignKeys: { items: [] },
        extras: [],
      };
      gruppen.push(zeilen('Relationen', st.relations.items, 'fehlt', (i) => i.label));
      gruppen.push(zeilen('Attribute', st.attributes.items, 'fehlt'));
      gruppen.push(zeilen('Primärschlüssel', st.primaryKeys.items, 'nicht als PS markiert'));
      gruppen.push(zeilen('Fremdschlüssel', st.foreignKeys.items, 'fehlt oder nicht als FS markiert'));
      zusaetzlich = st.extras;
    }
    return {
      gruppen: gruppen.filter((g) => g.length),
      zusaetzlich: zusaetzlich.map((t) => ({ text: t, an: false })), // nur auf Wunsch ins Feedback
      eigene: [],
      kommentar: '',
    };
  }

  // „Beziehungen (3/4) · Kardinalitäten (2/4)“ – je Art die erfüllten Zeilen
  function gruppenTitel(gruppe) {
    return [...new Set(gruppe.map((z) => z.art))]
      .map((art) => {
        const zs = gruppe.filter((z) => z.art === art);
        return `${art} (${zs.filter((z) => z.ok).length}/${zs.length})`;
      })
      .join(' · ');
  }

  const zeileText = (z) => `${z.ok ? '✓' : '✗'} ${z.text}${!z.ok && z.fehlt ? ` – ${z.fehlt}` : ''}`;

  function feedbackText(titel, punkte) {
    const teile = [`Feedback: ${titel}`];
    punkte.gruppen.forEach((g) => teile.push([gruppenTitel(g), ...g.map(zeileText)].join('\n')));
    const zusaetzlich = punkte.zusaetzlich.filter((z) => z.an);
    if (zusaetzlich.length) teile.push(['Zusätzlich im Modell', ...zusaetzlich.map((z) => `• ${z.text}`)].join('\n'));
    if (punkte.eigene.length) teile.push(['Weitere Punkte', ...punkte.eigene.map(zeileText)].join('\n'));
    if (punkte.kommentar.trim()) teile.push(`Anmerkung: ${punkte.kommentar.trim()}`);
    return teile.join('\n\n');
  }

  // ---- Korrektur-Ansicht: Leiste unten (#korrektur-leiste) mit Reitern Lösungsdatei, Abgaben, Korrigieren, Aufgabentext ----
  // Dateien werden am Inhalt erkannt (Szenario oder Abgabe), egal über welchen Knopf oder per Ziehen.

  // Gespeicherte Korrektur laden; Dateien von außen werden dabei wie beim Öffnen geprüft
  function korrekturLaden() {
    let gespeichert = {};
    try {
      gespeichert = JSON.parse(localStorage.getItem(KORREKTUR_KEY)) || {};
    } catch (_e) {
      // nichts gespeichert
    }
    const sz = gespeichert.szenario ? window.Szenario.pruefeSzenario(gespeichert.szenario).sz : null;
    const abgaben = (Array.isArray(gespeichert.abgaben) ? gespeichert.abgaben : [])
      .map((a) => {
        const { abgabe } = pruefeAbgabe(a?.daten);
        if (!abgabe) return null;
        const punkte = Array.isArray(a.punkte?.gruppen) ? a.punkte : null;
        return { datei: text(a.datei, 200), daten: a.daten, abgabe, punkte, szId: a.szId, kopiert: !!a.kopiert };
      })
      .filter(Boolean);
    const letzte = Number.isInteger(gespeichert.index) ? gespeichert.index : 0;
    return {
      sz: sz?.erm ? sz : null,
      szenarioDaten: gespeichert.szenario,
      abgaben,
      index: -1,
      letzte,
      meldungen: [],
      reiter: 1,
    };
  }

  function korrekturSpeichern() {
    if (!korrektur) return;
    const { szenarioDaten, abgaben, index } = korrektur;
    try {
      localStorage.setItem(
        KORREKTUR_KEY,
        JSON.stringify({
          szenario: szenarioDaten,
          index,
          abgaben: abgaben.map(({ datei, daten, punkte, szId, kopiert }) => ({ datei, daten, punkte, szId, kopiert })),
        }),
      );
    } catch (_e) {
      korrektur.meldungen.push('Der Speicher des Browsers ist voll – die Korrektur gilt nur bis zum Neuladen.');
    }
  }

  // Kopien der gerade angezeigten Abgabe (Arbeitsstand des Korrektur-Lernpfads)
  const kopienLoeschen = () =>
    schluessel()
      .filter((k) => /(:|lernpfad-)korrektur-/.test(k))
      .forEach((k) => localStorage.removeItem(k));

  async function korrekturLoeschen() {
    const was = await window.App.showAppModal({
      title: 'Gespeicherte Korrektur löschen',
      message:
        'Was soll aus diesem Browser gelöscht werden? Deine Korrekturlisten gehen dabei verloren. Die Dateien auf deinem Rechner bleiben.',
      mode: 'confirm',
      confirmLabel: 'Nur die Abgaben',
      extraLabel: 'Abgaben und Szenario',
    });
    if (!was) return;
    const L = window.Lernpfad;
    if (L.getLernpfad()?.korrektur && L.state.lernpfadAktiv) L.hidePanel();
    kopienLoeschen();
    Object.assign(korrektur, { abgaben: [], index: -1, meldungen: [] });
    if (was === 'extra') Object.assign(korrektur, { sz: null, szenarioDaten: null });
    korrektur.reiter = korrektur.sz ? 2 : 1;
    document.getElementById('app-title').innerHTML = korrektur.titelVorher;
    if (korrektur.sz) korrekturSpeichern();
    else localStorage.removeItem(KORREKTUR_KEY);
    zeichnen();
  }

  async function korrekturOeffnen(dateien = []) {
    const L = window.Lernpfad;
    if (!korrektur) {
      window.Szenario?.panelSchliessen?.();
      if (L.state.lernpfadAktiv) L.hidePanel();
      korrektur = korrekturLaden();
      const titel = document.getElementById('app-title');
      korrektur.titelVorher = titel.innerHTML;
      document.body.classList.add('korrektur');
      window.dispatchEvent(new Event('resize')); // Aufgabenleiste endet vor der Seitenleiste
    }
    if (dateien.length) await dateienLesen(dateien);
    // Weiter, wo die Lehrkraft aufgehört hat
    else if (korrektur.sz && korrektur.abgaben[korrektur.letzte] && passt(korrektur.abgaben[korrektur.letzte]))
      await zeigen(korrektur.letzte);
    else {
      korrektur.reiter = korrektur.sz ? 2 : 1;
      zeichnen();
    }
  }

  function korrekturBeenden() {
    if (!korrektur) return;
    if (window.Lernpfad.getLernpfad()?.korrektur && window.Lernpfad.state.lernpfadAktiv) window.Lernpfad.hidePanel();
    kopienLoeschen(); // gespeichert bleibt die Korrektur selbst (KORREKTUR_KEY)
    document.getElementById('app-title').innerHTML = korrektur.titelVorher;
    korrektur = null;
    document.body.classList.remove('korrektur');
    window.dispatchEvent(new Event('resize'));
  }

  // [{ name, daten }]: Szenario-Dateien setzen die Musterlösung, Abgaben kommen in die Liste
  async function dateienLesen(dateien) {
    korrektur.meldungen = [];
    const neu = [];
    let ziel = -1;
    for (const { name, daten } of dateien) {
      if (daten?.format === window.Szenario.FORMAT) {
        const { sz, fehler } = window.Szenario.pruefeSzenario(daten);
        if (fehler) korrektur.meldungen.push(`„${name}“: ${fehler}`);
        else if (!sz.erm)
          korrektur.meldungen.push(
            `„${name}“ ist ein Prüfungslink, keine Lösungsdatei. Nimm die Lösungsdatei, die du beim Erstellen der Prüfung gespeichert hast.`,
          );
        else Object.assign(korrektur, { sz, szenarioDaten: daten });
      } else if (daten?.format === ABGABE_FORMAT) {
        const { abgabe, fehler } = pruefeAbgabe(daten);
        const roh = JSON.stringify(daten);
        const doppelt = korrektur.abgaben.findIndex((a) => JSON.stringify(a.daten) === roh);
        if (fehler) korrektur.meldungen.push(`„${name}“: ${fehler}`);
        else if (doppelt >= 0 || neu.some((a) => JSON.stringify(a.daten) === roh)) {
          korrektur.meldungen.push(`„${name}“ ist schon in der Liste.`);
          ziel = Math.max(ziel, doppelt);
        } else neu.push({ datei: name, daten, abgabe, punkte: null, kopiert: false });
      } else {
        korrektur.meldungen.push(`„${name}“ ist weder eine Lösungsdatei noch eine Abgabe des ERM-Editors.`);
      }
    }
    korrektur.abgaben.push(...neu);
    korrekturSpeichern();
    // Die erste neue Abgabe zeigen, sonst die schon vorhandene, sonst weiter wie zuletzt
    if (neu.length) ziel = korrektur.abgaben.length - neu.length;
    else if (ziel < 0) ziel = korrektur.index >= 0 ? korrektur.index : korrektur.letzte;
    if (korrektur.sz && ziel >= 0 && passt(korrektur.abgaben[ziel])) await zeigen(ziel);
    else {
      korrektur.reiter = korrektur.sz ? 2 : 1;
      zeichnen();
    }
  }

  const passt = (a) => !!a && !!korrektur.sz && a.abgabe.aufgabe === korrektur.sz.aufgabe;
  const gleichePruefung = (a) => a.abgabe.pruefungsId === window.Szenario.pruefungsId(korrektur.sz);

  // Abgabe i ins Diagramm bzw. Relationenmodell laden (nur ansehen) und ihre Korrekturliste zeigen
  async function zeigen(i) {
    const a = korrektur.abgaben[i];
    if (!a || !passt(a)) return;
    const { sz } = korrektur;
    const L = window.Lernpfad;
    const id = `korrektur-${window.Szenario.pruefungsId(sz)}`;
    korrektur.index = i;
    const daten =
      sz.aufgabe === 'erm'
        ? {
            ...a.abgabe.erm,
            kardinalitaeten: sz.kardinalitaeten,
            diagramTitle: `Abgabe: ${sz.titel}`,
            snapToGrid: true,
          }
        : { studentRelations: JSON.parse(JSON.stringify(a.abgabe.relationen)), nextId: 1 };
    if (L.state.lernpfadAktiv && L.state.lernpfadId === id) {
      // Korrektur läuft schon: nur das Modell austauschen
      if (sz.aufgabe === 'erm') window.AppState.applyErmPayload(JSON.parse(JSON.stringify(daten)), true);
      else window.RelModel.setStudentRelations(daten.studentRelations);
    } else {
      if (L.state.lernpfadAktiv) L.hidePanel();
      sonderLernpfad(sz, 'korrektur');
      localStorage.setItem(L.getWorkKey(id, 1), JSON.stringify(daten));
      await window.App.startLernpfad(id, true);
    }
    window.AppState.state.diagramLocked = true; // nur ansehen
    // Neu berechnet nur ohne Liste oder mit einer anderen Szenario-Datei; sonst bleibt, was die Lehrkraft abgehakt hat
    if (!a.punkte || a.szId !== sz.id) {
      a.punkte = punkteBerechnen(sz);
      a.szId = sz.id;
    }
    korrekturSpeichern();
    document.getElementById('app-title').textContent = `Korrektur: ${sz.titel}`;
    if (korrektur.reiter < 3) korrektur.reiter = 3;
    zeichnen();
  }

  const el = (tag, klasse, inhalt) => {
    const e = document.createElement(tag);
    if (klasse) e.className = klasse;
    if (inhalt !== undefined) e.textContent = inhalt;
    return e;
  };
  const knopf = (inhalt, klasse, aktion) => {
    const b = el('button', klasse, inhalt);
    b.type = 'button';
    b.addEventListener('click', aktion);
    return b;
  };

  // Leiste unten neu aufbauen: Kopf mit Reitern, darunter der Inhalt des Reiters
  function zeichnen() {
    const leiste = document.getElementById('korrektur-leiste');
    if (!leiste) return;
    // Scrollstand behalten, solange Reiter und Abschnitt gleich bleiben (Korrigieren: nur rechts gescrollt)
    const scrollBox = () => leiste.querySelector('.korrektur-inhalt') || leiste.querySelector('.lk-seiten');
    const scroll = scrollBox() && `${korrektur?.reiter}|${korrektur?.abschnitt}` === korrektur?.gezeichnet ? scrollBox().scrollTop : 0;
    leiste.innerHTML = '';
    if (!korrektur) return;
    const { sz, abgaben, index, meldungen } = korrektur;
    const aktuell = abgaben[index];
    const reiter = aktuell?.punkte || korrektur.reiter < 3 ? korrektur.reiter : 2;
    korrektur.gezeichnet = `${reiter}|${korrektur.abschnitt}`;

    const kopf = el('div', 'lk-kopf');
    const reiterleiste = el('div', 'lk-reiter');
    reiterleiste.setAttribute('role', 'tablist');
    const reiterKnopf = (nr, text, an, fertig) => {
      const b = knopf(text, fertig ? 'fertig' : '', () => {
        korrektur.reiter = nr;
        zeichnen();
      });
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', String(nr === reiter));
      b.disabled = !an;
      reiterleiste.appendChild(b);
    };
    reiterKnopf(1, '1 · Lösungsdatei', true, !!sz);
    reiterKnopf(2, `2 · Abgaben${abgaben.length ? ` (${abgaben.length})` : ''}`, true, abgaben.length > 0);
    reiterKnopf(3, '3 · Korrigieren', !!aktuell?.punkte, false);
    reiterKnopf(4, '📄 Aufgabentext', !!aktuell?.punkte, false);
    const loeschen = knopf('🗑 Löschen …', 'lk-gefahr', korrekturLoeschen);
    loeschen.title = 'Gespeicherte Abgaben (und auf Wunsch die Lösungsdatei) aus diesem Browser löschen';
    loeschen.disabled = !sz && !abgaben.length;
    const schliessen = knopf('✕', 'aufgabe-close-btn', korrekturBeenden);
    schliessen.title = 'Korrektur beenden – gespeichert bleibt alles';
    const knoepfe = el('div', 'lk-kopf-knoepfe');
    knoepfe.append(loeschen, schliessen);
    kopf.append(el('h3', '', sz ? `📝 Korrektur: ${sz.titel}` : '📝 Abgaben korrigieren'), reiterleiste, knoepfe);
    leiste.appendChild(kopf);

    const seite = el('div', 'lk-seiten');
    leiste.appendChild(seite);
    if (meldungen.length) {
      const box = el('div', 'korrektur-meldungen');
      meldungen.forEach((m) => box.appendChild(el('p', '', `⚠ ${m}`)));
      seite.appendChild(box);
    }

    if (reiter === 1) {
      if (sz) {
        const zeile = el('div', 'lk-zeile');
        zeile.append(
          el(
            'span',
            '',
            `✓ ${sz.titel} · ${sz.aufgabe === 'rm' ? 'Ins Relationenmodell überführen' : 'ER-Modell zeichnen'}`,
          ),
          knopf('⬆ Andere wählen', 'rel-btn', dateiWaehlen),
        );
        seite.appendChild(zeile);
      } else {
        seite.append(
          el(
            'p',
            'lk-hinweis',
            'Die Datei „… (Lösungsdatei).erm-szenario.json“, gespeichert beim Erstellen der Prüfung.',
          ),
          knopf('⬆ Lösungsdatei wählen', 'rel-btn primary', dateiWaehlen),
        );
      }
    } else if (reiter === 2) {
      if (abgaben.length) {
        const liste = el('div', 'korrektur-abgaben');
        abgaben.forEach((a, i) => {
          const ok = passt(a);
          const b = knopf(
            `${i + 1}. ${a.datei}${a.abgabe.abgegeben ? ` · ${datum(a.abgabe.abgegeben)}` : ''}${a.kopiert ? ' · 📋 kopiert' : ''}`,
            `korrektur-abgabe${i === index ? ' aktiv' : ''}`,
            () => zeigen(i),
          );
          b.disabled = !ok;
          if (!sz) b.title = 'Erst die Lösungsdatei wählen';
          else if (!ok) b.title = 'Andere Aufgabenart als die Lösungsdatei';
          else if (!gleichePruefung(a)) {
            b.title = 'Gehört zu einer anderen Prüfung (anderer Titel oder Text)';
            b.textContent += ' · ⚠ andere Prüfung';
          }
          liste.appendChild(b);
        });
        seite.appendChild(liste);
      }
      const zeile = el('div', 'lk-knoepfe');
      zeile.append(
        knopf('⬆ Abgaben wählen', `rel-btn${sz && !abgaben.length ? ' primary' : ''}`, dateiWaehlen),
        el('span', 'lk-hinweis', 'Eine oder mehrere „….erm-abgabe.json“ – oder Dateien einfach ins Fenster ziehen.'),
      );
      seite.appendChild(zeile);
    } else if (reiter === 3) {
      if (!gleichePruefung(aktuell))
        seite.appendChild(
          el('p', 'korrektur-warnung', '⚠ Die Abgabe gehört zu einer anderen Prüfung als die Lösungsdatei.'),
        );
      seite.classList.add('korrektur-seite');
      korrekturListe(seite, aktuell.punkte);
    } else {
      // Aufgabentext mit den Markierungen des Schülers (nur ansehen, nicht bewertet); Überführen ohne Markieren
      const text = el('div', 'aufgabe-task korrektur-text');
      text.innerHTML = window.Lernpfad.eigenerLernpfad(sz).aufgaben[0].szenario;
      if (sz.aufgabe === 'erm') {
        const hinweis = el('p', 'korrektur-markiert', '🖍 Die Markierungen hat der Schüler in der Prüfung gesetzt.');
        seite.append(hinweis, text);
        window.Lernpfad.freierTextmarker(text, hinweis, aktuell.abgabe.markierungen);
      } else seite.appendChild(text);
    }
    scrollBox().scrollTop = scroll;

    // Fuß beim Korrigieren: welche Abgabe, kopieren, weiter
    if (reiter < 3) return;
    const fuss = el('div', 'lk-fuss');
    const vor = abgaben.findIndex((a, i) => i > index && passt(a));
    const zurueck = abgaben.findLastIndex((a, i) => i < index && passt(a));
    const wo = el(
      'span',
      'korrektur-wo',
      `${index + 1} von ${abgaben.length}: ${aktuell.datei}${
        aktuell.abgabe.abgegeben ? ` · abgegeben ${datum(aktuell.abgabe.abgegeben)}` : ''
      }`,
    );
    const zurueckKnopf = knopf('◀', 'rel-btn', () => zeigen(zurueck));
    zurueckKnopf.disabled = zurueck < 0;
    zurueckKnopf.title = 'Vorige Abgabe';
    fuss.append(zurueckKnopf, wo);
    if (reiter === 3) fuss.appendChild(knopf('📋 Feedback kopieren', 'rel-btn primary', feedbackKopieren));
    fuss.appendChild(
      vor >= 0
        ? knopf('Nächste Abgabe ▶', 'rel-btn', () => zeigen(vor))
        : knopf('⬆ Weitere Abgabe', 'rel-btn', dateiWaehlen),
    );
    leiste.appendChild(fuss);
  }

  // Korrekturliste in Spalten, darunter eigene Punkte und Anmerkung
  function korrekturListe(box, punkte) {
    const neuZeichnen = () => {
      korrekturSpeichern();
      zeichnen();
    };
    const zeile = (z, wechseln, entfernen) => {
      const b = knopf(zeileText(z), `korrektur-zeile${z.ok ? ' ok' : ''}`, () => {
        wechseln();
        neuZeichnen();
      });
      if (!entfernen) return b;
      const reihe = el('div', 'korrektur-reihe');
      const weg = knopf('✕', 'korrektur-weg', () => {
        entfernen();
        neuZeichnen();
      });
      weg.title = 'Punkt entfernen';
      reihe.append(b, weg);
      return reihe;
    };
    // Eigene Punkte und Anmerkung: je ein eigener Abschnitt
    const eigeneSeite = (ziel) => {
      if (punkte.eigene.length) {
        const liste = el('div', 'korrektur-spalten');
        punkte.eigene.forEach((z, i) =>
          liste.appendChild(
            zeile(
              z,
              () => (z.ok = !z.ok),
              () => punkte.eigene.splice(i, 1),
            ),
          ),
        );
        ziel.appendChild(liste);
      }
      const form = el('form', 'korrektur-neu');
      const eingabe = el('input', 'prop-input');
      Object.assign(eingabe, {
        type: 'text',
        maxLength: 200,
        placeholder: 'Eigener Punkt, z. B. „übersichtlich angeordnet“',
      });
      form.append(eingabe, el('button', 'rel-btn', '+'));
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const t = eingabe.value.trim();
        if (t) punkte.eigene.push({ text: t, ok: true });
        neuZeichnen();
        document.querySelector('.korrektur-neu input')?.focus();
      });
      ziel.appendChild(form);
    };
    const anmerkungSeite = (ziel) => {
      const kommentar = el('textarea', 'prop-input korrektur-kommentar');
      kommentar.rows = 5;
      kommentar.placeholder = 'Anmerkung für den Schüler';
      kommentar.value = punkte.kommentar;
      kommentar.addEventListener('input', () => {
        punkte.kommentar = kommentar.value;
        korrekturSpeichern();
        document.querySelector('.korrektur-abschnitte [data-key="anmerkung"]').textContent = anmerkungTitel();
      });
      ziel.appendChild(kommentar);
    };
    const anmerkungTitel = () => `Anmerkung${punkte.kommentar.trim() ? ' ✎' : ''}`;

    // Abschnitte als Reiter links untereinander, der Inhalt rechts daneben (korrektur.abschnitt: key, bleibt
    // beim Wechsel der Abgabe)
    const zeilenSeite = (zeilen) => (ziel) => {
      const spalten = el('div', 'korrektur-spalten');
      spalten.append(...zeilen());
      ziel.appendChild(spalten);
    };
    const abschnitte = [
      ...punkte.gruppen.map((g) => ({
        key: g[0].art,
        titel: gruppenTitel(g).replace(' · ', '\n'),
        hinweis: 'Klick auf eine Zeile wechselt zwischen ✓ und ✗.',
        seite: zeilenSeite(() => g.map((z) => zeile(z, () => (z.ok = !z.ok)))),
      })),
      ...(punkte.zusaetzlich.length
        ? [
            {
              key: 'zusaetzlich',
              titel: `Zusätzlich im Modell (${punkte.zusaetzlich.filter((z) => z.an).length}/${punkte.zusaetzlich.length})`,
              hinweis: 'Steht in der Abgabe, aber nicht in der Lösung. ✓ = kommt ins Feedback.',
              seite: zeilenSeite(() =>
                punkte.zusaetzlich.map((z) => zeile({ text: z.text, ok: z.an }, () => (z.an = !z.an))),
              ),
            },
          ]
        : []),
      {
        key: 'eigene',
        titel: `Eigene Punkte${punkte.eigene.length ? ` (${punkte.eigene.length})` : ''}`,
        hinweis: 'Kommen ins Feedback, z. B. zur Darstellung. ✕ entfernt einen Punkt.',
        seite: eigeneSeite,
      },
      {
        key: 'anmerkung',
        titel: anmerkungTitel(),
        hinweis: 'Steht am Ende des Feedbacks.',
        seite: anmerkungSeite,
      },
    ];
    const nr = Math.max(0, abschnitte.findIndex((a) => a.key === korrektur.abschnitt));
    const reiter = el('div', 'korrektur-abschnitte');
    reiter.setAttribute('role', 'tablist');
    reiter.setAttribute('aria-orientation', 'vertical');
    abschnitte.forEach((a, i) => {
      const b = knopf(a.titel, '', () => {
        korrektur.abschnitt = a.key;
        zeichnen();
      });
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', String(i === nr));
      b.dataset.key = a.key;
      reiter.appendChild(b);
    });
    const inhalt = el('div', 'korrektur-inhalt');
    inhalt.setAttribute('role', 'tabpanel');
    inhalt.appendChild(el('p', 'lk-hinweis', abschnitte[nr].hinweis));
    abschnitte[nr].seite(inhalt);
    const liste = el('div', 'korrektur-liste');
    liste.append(reiter, inhalt);
    box.appendChild(liste);
  }

  const datum = (iso) => {
    const d = new Date(iso);
    return isNaN(d) ? iso : d.toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' });
  };

  async function feedbackKopieren() {
    const a = korrektur?.abgaben[korrektur.index];
    if (!a?.punkte) return;
    const t = feedbackText(korrektur.sz.titel, a.punkte);
    try {
      await navigator.clipboard.writeText(t);
      window.App.showTopToast('Feedback kopiert – jetzt in die Korrektur (z. B. ONYX) einfügen.');
    } catch (_e) {
      window.App.showAppModal({ title: 'Feedback', message: t, mode: 'alert', confirmLabel: 'Schließen' });
    }
    a.kopiert = true;
    korrekturSpeichern();
    zeichnen();
  }

  function dateiWaehlen() {
    document.getElementById('korrektur-datei').click();
  }

  async function dateienAus(fileList) {
    const dateien = [];
    for (const datei of fileList) {
      let daten = null;
      try {
        daten = JSON.parse(await datei.text());
      } catch (_e) {
        // keine JSON-Datei: wird als unbekannt gemeldet
      }
      dateien.push({ name: datei.name, daten });
    }
    return dateien;
  }

  // Markierungen im Aufgabentext: in der Prüfung zum Bearbeiten, in der Korrektur nur zum Ansehen
  function textmarker(container, kopf) {
    const lernpfad = window.Lernpfad.getLernpfad();
    const abgabe = korrektur?.abgaben[korrektur.index]?.abgabe;
    if (lernpfad?.pruefung && pruefung)
      window.Lernpfad.freierTextmarker(container, kopf, pruefung.markierungen, metaSchreiben);
    else if (lernpfad?.korrektur && abgabe) window.Lernpfad.freierTextmarker(container, kopf, abgabe.markierungen);
  }

  // ---- Prüfung absichern: Was die Prüfung ausblendet, ist auch ohne CSS (Firefox „Ansicht → Kein Stil“) nicht
  // klickbar. Gegen die Entwicklerwerkzeuge des Browsers hilft das nicht – darum steht bei ERM-Aufgaben keine
  // Lösung im Link. ----
  const GESPERRT = [
    '#btn-import',
    '#btn-export-json',
    '#btn-export-png',
    '#btn-clear',
    '#btn-relmodel-import',
    '#btn-relmodel-export-json',
    '#btn-relmodel-export-png',
    '#btn-rules-modal',
    '#btn-check',
    '#btn-preview-student',
    '#btn-sql',
    '#solution-area',
    '#feedback-area',
    '.tab-dropdown',
    '#btn-aufgabe-close',
    '.aufgabe-reset-btn',
    '#aufgabe-mehr',
  ];
  const GESPERRT_ERM = ['#btn-relmodel-toggle', '#relmodel-drawer', '#relmodel-resizer'];
  const stil = document.createElement('style');
  stil.textContent = `body.pruefung :is(${GESPERRT.join()}, .nicht-in-pruefung),
    body.pruefung-erm :is(${GESPERRT_ERM.join()}) { display: none !important; }`;
  document.head?.appendChild(stil);

  document.addEventListener(
    'click',
    (e) => {
      const b = document.body.classList;
      if (!b.contains('pruefung')) return;
      if (
        e.target.closest?.(GESPERRT.join()) ||
        (b.contains('pruefung-erm') && e.target.closest?.(GESPERRT_ERM.join()))
      ) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    },
    true,
  );

  document.addEventListener('DOMContentLoaded', () => {
    const input = document.getElementById('korrektur-datei');
    if (!input) return;
    input.addEventListener('change', async (e) => {
      const dateien = await dateienAus(e.target.files);
      e.target.value = '';
      if (dateien.length) korrekturOeffnen(dateien);
    });
    // Korrektur: Dateien ins Fenster ziehen
    const ziehen = (an) => document.body.classList.toggle('korrektur-ziehen', an);
    document.addEventListener('dragover', (e) => {
      if (!korrektur || !e.dataTransfer?.types.includes('Files')) return;
      e.preventDefault();
      ziehen(true);
    });
    document.addEventListener('dragleave', (e) => !e.relatedTarget && ziehen(false));
    document.addEventListener('drop', async (e) => {
      if (!korrektur || !e.dataTransfer?.files.length) return;
      e.preventDefault();
      ziehen(false);
      korrekturOeffnen(await dateienAus(e.dataTransfer.files));
    });
  });

  // Abgelaufene Stände gleich beim Laden entfernen, auch wenn keine Prüfung geöffnet wird
  aufraeumen();

  window.Pruefung = {
    ABGABE_FORMAT,
    ABLAUF_MS,
    starten,
    beruehrt,
    abgeben,
    aufraeumen,
    pruefeAbgabe,
    punkteBerechnen,
    feedbackText,
    korrekturOeffnen,
    korrekturBeenden,
    textmarker,
    ermBildAusEditor,
    ermBildSvg,
  };
})();
