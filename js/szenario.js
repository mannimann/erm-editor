/* ============================================================
   szenario.js  –  Eigene Szenarien von Lehrkräften
   Die Lehrkraft zeichnet die Musterlösung als ER-Modell und schreibt den Text. Daraus wird eine Datei
   (.erm-szenario.json) oder ein Link (#szenario=…). Schüler öffnen sie als Übungs-Lernpfad; geprüft wird
   gegen das ER-Modell (js/lernpfad.js: masterAusErm) bzw. dessen Relationenmodell.
   ============================================================ */
'use strict';

(function () {
  const FORMAT = 'erm-editor-szenario';
  const LISTE_KEY = 'erm-editor-eigene-szenarien-v1';
  const ENTWUERFE_KEY = 'erm-editor-entwuerfe-v1';
  const ENTWURF_KEY = 'erm-editor-szenario-entwurf-v1'; // bis Runde 6: ein einziger Entwurf (wird umgezogen)
  const PROBE_KEY = 'erm-editor-szenario-probe-v1'; // Szenario, das die Lehrkraft gerade ausprobiert
  const KARTEN = ['1', 'n', 'm'];
  const N = (s) => window.RelModel.normalizeName(s);

  // ---- Prüfen: Szenarien kommen von außen (Datei, Link) – nur bekannte Felder, Namen ohne < und > ----
  function hash(text) {
    let h = 5381;
    for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) >>> 0;
    return h.toString(36);
  }

  const name = (v, max) =>
    String(v ?? '')
      .replace(/[<>]/g, '')
      .trim()
      .slice(0, max);

  // ER-Modell von außen (Szenario, Abgabe einer Prüfung): nur bekannte Felder; null, wenn ungültig
  function pruefeErm(erm) {
    const nodes = erm?.nodes;
    const edges = erm?.edges;
    if (!Array.isArray(nodes) || !Array.isArray(edges) || nodes.length > 400 || edges.length > 800) return null;

    const knoten = nodes
      .filter((n) => ['entity', 'attribute', 'relationship'].includes(n?.type) && typeof n.id === 'string')
      .map((n) => ({
        id: n.id.slice(0, 24),
        type: n.type,
        name: name(n.name, 100),
        x: Math.round(Number(n.x)) || 0,
        y: Math.round(Number(n.y)) || 0,
        isPrimaryKey: !!n.isPrimaryKey,
      }));
    const ids = new Set(knoten.map((n) => n.id));
    const karte = (v) => (KARTEN.includes(String(v).toLowerCase()) ? String(v).toLowerCase() : '');
    const kanten = edges
      .filter((e) => ids.has(e?.fromId) && ids.has(e?.toId))
      .map((e, i) => {
        const k = { id: typeof e.id === 'string' ? e.id.slice(0, 24) : `k${i}`, fromId: e.fromId, toId: e.toId };
        if (e.edgeType === 'relationship' || e.edgeType === 'attribute') k.edgeType = e.edgeType;
        if (e.edgeType !== 'attribute') Object.assign(k, { chenFrom: karte(e.chenFrom), chenTo: karte(e.chenTo) });
        return k;
      });
    return { nodes: knoten, edges: kanten };
  }

  // Bild des ER-Modells im Prüfungslink (js/pruefung.js ermBildAusEditor): nur Formen, Linien und Beschriftungen.
  // v: Ausschnitt [x, y, b, h]; k: Formen [Art e|a|r, x, y, Breite, Höhe, Text, Primärschlüssel 0|1];
  // l: Linien x1, y1, x2, y2, …; z: Kardinalitäten x, y, Text, …  – null, wenn ungültig
  function pruefeErmBild(b) {
    const zahl = (n) => (Number.isFinite(n) && Math.abs(n) < 100000 ? Math.round(n) : null);
    const zahlen = (a) => (Array.isArray(a) && a.every((n) => zahl(n) !== null) ? a.map(zahl) : null);
    const v = zahlen(b?.v);
    const l = zahlen(b?.l);
    if (v?.length !== 4 || !l || l.length > 4000 || !Array.isArray(b.k) || b.k.length > 400) return null;
    if (!Array.isArray(b.z) || b.z.length > 3000) return null;
    const k = b.k.map((f) =>
      Array.isArray(f) && ['e', 'a', 'r'].includes(f[0]) && zahlen(f.slice(1, 5))?.length === 4
        ? [f[0], ...zahlen(f.slice(1, 5)), name(f[5], 200), f[6] ? 1 : 0]
        : null,
    );
    const z = [];
    for (let i = 0; i + 2 < b.z.length; i += 3) z.push(zahl(b.z[i]), zahl(b.z[i + 1]), name(b.z[i + 2], 3));
    return k.includes(null) || z.includes(null) ? null : { v, k, l, z };
  }

  function pruefeSzenario(d) {
    if (!d || d.format !== FORMAT) return { fehler: 'Das ist keine Szenario-Datei des ERM-Editors.' };
    if (d.version !== 1) return { fehler: 'Das Szenario stammt aus einer neueren Version des ERM-Editors.' };
    const titel = name(d.titel, 80);
    if (!titel) return { fehler: 'Das Szenario hat keinen Titel.' };
    const aufgabe = d.aufgabe === 'rm' ? 'rm' : 'erm';
    // Prüfungslink: ohne ER-Modell, damit keine Lösung im Browser der Schüler ankommt. Beim Überführen ist das
    // ER-Modell die Vorgabe – es kommt als Bild (SVG, nur im <img> angezeigt, also ohne Skripte), nicht als Daten.
    const ohneErm = !!d.pruefung && d.erm == null;
    const erm = ohneErm ? null : pruefeErm(d.erm);
    if (!ohneErm && !erm) return { fehler: 'Das ER-Modell im Szenario ist ungültig.' };
    if (erm && !erm.nodes.some((n) => n.type === 'entity')) return { fehler: 'Das ER-Modell im Szenario ist leer.' };
    const bild = ohneErm && aufgabe === 'rm' ? pruefeErmBild(d.ermBild) : null;
    if (ohneErm && aufgabe === 'rm' && !(bild && /^[a-z0-9]{1,16}$/.test(String(d.ermId))))
      return { fehler: 'Im Prüfungslink fehlt das Bild des ER-Modells.' };

    const sz = {
      titel,
      text: String(d.text ?? '').slice(0, 8000),
      aufgabe,
      kardinalitaeten: aufgabe === 'rm' || !!d.kardinalitaeten,
      erm: erm && { ...erm, kardinalitaeten: true, diagramTitle: titel, snapToGrid: true },
    };
    if (sz.aufgabe === 'rm' && sz.erm && fehlendeKardinalitaeten(sz.erm).length)
      return { fehler: 'Zum Überführen braucht jede Beziehung des ER-Modells Kardinalitäten.' };
    if (bild) Object.assign(sz, { ermBild: bild, ermId: d.ermId });
    if (d.pruefung) sz.pruefung = true;
    sz.id = hash(JSON.stringify(sz));
    return { sz };
  }

  // Kennung des ER-Modells: aus den Daten (Datei der Lehrkraft) oder mitgegeben (Prüfungslink, nur mit Bild)
  const ermKennung = (sz) => (sz.erm ? hash(JSON.stringify(sz.erm)) : sz.ermId || '');

  // Gleich für Prüfungslink (ohne ER-Modell) und Szenario-Datei der Lehrkraft: verbindet die Abgaben mit dem
  // Szenario, gegen das korrigiert wird
  const pruefungsId = (sz) =>
    hash(JSON.stringify([sz.titel, sz.text, sz.aufgabe, sz.kardinalitaeten, sz.aufgabe === 'rm' ? ermKennung(sz) : null]));

  // Beziehungen mit zwei Seiten, aber ohne Zahl an einer Linie
  function fehlendeKardinalitaeten(erm) {
    const ohne = window.Lernpfad.masterAusErm(erm, true).relationships.filter((r) => !r.cardinality);
    return ohne.map((r) => r.name);
  }

  // ---- Datei und Link: Link = JSON, gepackt (deflate) und base64url – alles steht hinter dem #, ----
  // ---- der nicht an den Server geht. ----
  function fuerDatei(sz) {
    const { titel, text, aufgabe, kardinalitaeten, erm, pruefung, ermBild, ermId } = sz;
    return {
      format: FORMAT,
      version: 1,
      titel,
      text,
      aufgabe,
      kardinalitaeten,
      erm,
      ...(pruefung && { pruefung }),
      ...(ermBild && { ermBild, ermId }),
    };
  }

  // Prüfungslink: Das ER-Modell bleibt in der Datei der Lehrkraft. Beim Zeichnen wäre es die Lösung, beim
  // Überführen ergäbe sich die Lösung daraus – dort kommt nur sein Bild mit (pruefeErmBild).
  function fuerLink(sz, ermBild = sz.ermBild) {
    const daten = fuerDatei(sz);
    if (!sz.pruefung) return daten;
    delete daten.erm;
    if (sz.aufgabe === 'rm') Object.assign(daten, { ermBild, ermId: ermKennung(sz) });
    return daten;
  }

  async function packen(obj) {
    const roh = new Blob([JSON.stringify(obj)]).stream().pipeThrough(new CompressionStream('deflate-raw'));
    const bytes = new Uint8Array(await new Response(roh).arrayBuffer());
    let bin = '';
    bytes.forEach((b) => (bin += String.fromCharCode(b)));
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  // Entpacken mit Obergrenze: Ein präparierter Link soll nicht Gigabytes auspacken (Zip-Bombe)
  const MAX_LINK = 200000;
  const MAX_ENTPACKT = 1000000;

  async function auspacken(text) {
    if (text.length > MAX_LINK || !/^[A-Za-z0-9_-]*$/.test(text)) throw new Error('Link ungültig');
    const b64 = text.replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    const leser = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();
    const teile = [];
    let laenge = 0;
    for (;;) {
      const { done, value } = await leser.read();
      if (done) break;
      laenge += value.length;
      if (laenge > MAX_ENTPACKT) {
        await leser.cancel();
        throw new Error('Szenario zu groß');
      }
      teile.push(value);
    }
    return JSON.parse(await new Blob(teile).text());
  }

  // ---- Eigene Szenarien im Browser (localStorage), als Lernpfade im Menü ----
  function liste() {
    try {
      const daten = JSON.parse(localStorage.getItem(LISTE_KEY) || '[]');
      return Array.isArray(daten) ? daten.map((d) => pruefeSzenario(d).sz).filter((sz) => sz && !sz.pruefung) : [];
    } catch (_e) {
      return [];
    }
  }

  function speichern(szenarien) {
    try {
      localStorage.setItem(LISTE_KEY, JSON.stringify(szenarien.map(fuerDatei)));
    } catch (_e) {
      // Speicher voll: Szenario gilt nur bis zum Neuladen
    }
    window.Lernpfad.setEigeneSzenarien(szenarien);
    window.App?.baueLernpfadMenu?.();
  }

  // Szenario übernehmen (Datei, Link, „Selbst ausprobieren“) und als Aufgabe starten
  // dateiname: aus einer Datei (Lehrkraft), sonst aus einem Link (Schüler)
  async function importieren(daten, dateiname = null) {
    // Abgabe einer Prüfung („Szenario öffnen“ mit der falschen Datei): gehört in die Korrektur
    if (daten?.format === window.Pruefung.ABGABE_FORMAT)
      return window.Pruefung.korrekturOeffnen([{ name: dateiname || 'Abgabe', daten }]);
    const { sz, fehler } = pruefeSzenario(daten);
    if (fehler) {
      window.App?.showAlertModal?.(fehler, 'Szenario nicht geöffnet');
      return false;
    }
    // Prüfung: nicht unter „Eigene Übungen“, sonst ließe sie sich dort als Lehrkraft bearbeiten.
    // Die Lösungsdatei der Lehrkraft führt in die Korrektur, zum Bearbeiten oder in die Ansicht der Schüler.
    if (sz.pruefung && sz.erm && dateiname) {
      const wahl = await window.App.showAppModal({
        title: 'Lösungsdatei einer Prüfung',
        message: `„${sz.titel}“ ist die Lösungsdatei einer Prüfung. Was möchtest du tun?`,
        mode: 'confirm',
        confirmLabel: '📝 Abgaben korrigieren',
        extraLabel: '▶ Als Schüler ansehen',
        cancelLabel: '🛠 Bearbeiten',
      });
      if (wahl === true) return window.Pruefung.korrekturOeffnen([{ name: dateiname, daten }]);
      if (wahl !== 'extra') {
        panelOeffnen();
        return dateiGelesen(daten);
      }
    }
    if (sz.pruefung) return window.Pruefung.starten(sz);
    const alle = liste();
    if (!alle.some((x) => x.id === sz.id)) speichern([...alle, sz]);
    return window.App?.startLernpfad?.(`eigen-${sz.id}`);
  }

  async function ausLink(text) {
    try {
      return await importieren(await auspacken(text));
    } catch (_e) {
      window.App?.showAlertModal?.(
        'Der Link enthält kein lesbares Szenario. Ist er vollständig kopiert?',
        'Szenario nicht geöffnet',
      );
      return false;
    }
  }

  async function entfernen(lernpfadId) {
    const sz = liste().find((x) => `eigen-${x.id}` === lernpfadId);
    if (!sz) return;
    const ok = await window.App?.showConfirmModal?.(
      `Szenario „${sz.titel}“ und deinen Arbeitsstand dazu entfernen?`,
      'Szenario entfernen',
    );
    if (!ok) return;
    if (window.Lernpfad.state.lernpfadAktiv && window.Lernpfad.state.lernpfadId === lernpfadId)
      window.Lernpfad.hidePanel();
    fortschrittLoeschen(lernpfadId);
    speichern(liste().filter((x) => x.id !== sz.id));
  }

  function fortschrittLoeschen(lernpfadId) {
    [window.Lernpfad.getStorageKey(lernpfadId), window.Lernpfad.getWorkKey(lernpfadId, 1)].forEach((k) =>
      localStorage.removeItem(k),
    );
  }

  // ======================================================================
  // ÜBUNG ODER PRÜFUNG ERSTELLEN (Lehrkräfte): Leiste unten, vier Schritte als Reiter. Die Musterlösung
  // entsteht darüber im Editor auf einem eigenen Speicherplatz je Entwurf (modellKey, AppState.modellPlatzSetzen);
  // das freie Modell bleibt und kommt beim Schließen zurück.
  // ======================================================================

  const ENTWURF_ERM_KEY = 'erm-editor-szenario-entwurf-erm-v1';
  const feld = (id) => document.getElementById(id);
  const offen = () => document.body.classList.contains('erstellen');
  let titelVorher = '';
  let letzterLink = null; // { id, link }: Der angezeigte Link gilt nur für diesen Stand des Entwurfs

  function formular() {
    const wahl = (name) => document.querySelector(`input[name="${name}"]:checked`)?.value;
    return {
      titel: feld('szenario-titel').value,
      text: feld('szenario-text').value,
      aufgabe: wahl('szenario-aufgabe') || 'erm',
      kardinalitaeten: feld('szenario-kardinalitaeten').checked,
      pruefung: wahl('szenario-art') === 'pruefung',
    };
  }

  function formularFuellen({ titel = '', text = '', aufgabe = 'erm', kardinalitaeten = true, pruefung = false }) {
    feld('szenario-titel').value = titel;
    feld('szenario-text').value = text;
    const waehle = (name, wert) => {
      const radio = document.querySelector(`input[name="${name}"][value="${wert}"]`);
      if (radio) radio.checked = true;
    };
    waehle('szenario-aufgabe', aufgabe === 'rm' ? 'rm' : 'erm');
    waehle('szenario-art', pruefung ? 'pruefung' : 'uebung');
    feld('szenario-kardinalitaeten').checked = kardinalitaeten;
  }

  // Das Szenario aus Formular und ER-Modell im Editor
  function entwurf() {
    const f = formular();
    const s = window.AppState.state;
    return {
      format: FORMAT,
      version: 1,
      ...f,
      kardinalitaeten: f.aufgabe === 'rm' || f.kardinalitaeten,
      erm: { nodes: s.nodes, edges: s.edges },
    };
  }

  // ---- Entwürfe im Browser: { aktiv, liste: [{ id, titel, text, aufgabe, kardinalitaeten, pruefung, gesichert,
  // reiter, geaendert }] }, das ER-Modell je Entwurf unter modellKey(id). Solange die Leiste offen ist, gibt es
  // immer einen aktiven Entwurf; leere Entwürfe zeigt die Übersicht nicht und fallen beim Wechseln weg.
  let ablage = null; // ohne localStorage gelten die Entwürfe bis zum Neuladen
  const modellKey = (id) => `${ENTWURF_ERM_KEY}:${id}`;

  function entwuerfe() {
    if (ablage) return ablage;
    try {
      const d = JSON.parse(localStorage.getItem(ENTWUERFE_KEY));
      if (d && Array.isArray(d.liste)) return (ablage = d);
    } catch (_e) {
      // unten neu anlegen
    }
    // Umzug: Früher gab es nur einen Entwurf (ENTWURF_KEY, Modell unter ENTWURF_ERM_KEY)
    ablage = { aktiv: null, liste: [] };
    try {
      const alt = JSON.parse(localStorage.getItem(ENTWURF_KEY) || 'null');
      const erm = localStorage.getItem(ENTWURF_ERM_KEY);
      if (alt || erm) {
        const id = neueId();
        ablage.liste.push({ ...alt, id, geaendert: Date.now() });
        ablage.aktiv = id;
        if (erm) localStorage.setItem(modellKey(id), erm);
      }
      localStorage.removeItem(ENTWURF_KEY);
      localStorage.removeItem(ENTWURF_ERM_KEY);
    } catch (_e) {
      // ohne Speicher nichts umzuziehen
    }
    entwuerfeSchreiben(ablage);
    return ablage;
  }

  function entwuerfeSchreiben(d) {
    ablage = d;
    try {
      localStorage.setItem(ENTWUERFE_KEY, JSON.stringify(d));
    } catch (_e) {
      // ohne Speicher gelten die Entwürfe bis zum Neuladen
    }
  }

  const neueId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  // Formular, Reiter und „Lösungsdatei gespeichert für Stand …“ (gesichert) des aktiven Entwurfs
  function entwurfLesen() {
    const d = entwuerfe();
    return d.liste.find((x) => x.id === d.aktiv) || {};
  }

  function entwurfMerken(extra = {}) {
    const d = entwuerfe();
    const e = d.liste.find((x) => x.id === d.aktiv);
    if (!e) return;
    Object.assign(e, formular(), extra, { geaendert: Date.now() });
    entwuerfeSchreiben(d);
  }

  function entwurfLeer(e) {
    let erm = null;
    try {
      erm = JSON.parse(localStorage.getItem(modellKey(e.id)));
    } catch (_e) {
      // kein Modell
    }
    return !String(e.titel || '').trim() && !String(e.text || '').trim() && !erm?.nodes?.length;
  }

  function entwurfEntfernen(id) {
    const d = entwuerfe();
    d.liste = d.liste.filter((x) => x.id !== id);
    if (d.aktiv === id) d.aktiv = null;
    entwuerfeSchreiben(d);
    localStorage.removeItem(modellKey(id));
  }

  // Einen Entwurf in Formular und Editor holen; der vorige fällt weg, wenn er leer ist
  function entwurfLaden(id, nr) {
    const d = entwuerfe();
    const e = d.liste.find((x) => x.id === id);
    if (!e) return;
    const vorher = d.liste.find((x) => x.id === d.aktiv && x.id !== id);
    formularFuellen(e);
    d.aktiv = id;
    entwuerfeSchreiben(d);
    window.AppState.modellPlatzSetzen(modellKey(id)); // speichert vorher das Modell des vorigen Entwurfs
    if (vorher && entwurfLeer(vorher)) entwurfEntfernen(vorher.id);
    letzterLink = null;
    feld('szenario-link-wrap').hidden = true;
    reiterZeigen(nr ?? e.reiter ?? 1);
    aktualisieren();
  }

  function neuerEntwurf(werte = {}) {
    const d = entwuerfe();
    const id = neueId();
    d.liste.push({ titel: '', text: '', aufgabe: 'erm', kardinalitaeten: true, pruefung: false, ...werte, id, geaendert: Date.now() });
    entwuerfeSchreiben(d);
    entwurfLaden(id, 1);
  }

  async function entwurfLoeschen(id) {
    const e = entwuerfe().liste.find((x) => x.id === id);
    if (!e) return;
    const ok = await window.App.showConfirmModal(
      `„${e.titel || 'Ohne Titel'}“ mit Text und ER-Modell aus dem Browser löschen? Gespeicherte Dateien und verschickte Links bleiben gültig.`,
      'Entwurf löschen',
    );
    if (!ok) return;
    const aktiv = entwuerfe().aktiv === id;
    if (aktiv) window.AppState.modellPlatzSetzen(null); // nicht mehr in den gelöschten Entwurf speichern
    entwurfEntfernen(id);
    if (aktiv) {
      // Gleich wieder einen aktiven Entwurf: den zuletzt bearbeiteten oder einen leeren
      const naechster = [...entwuerfe().liste].sort((a, b) => b.geaendert - a.geaendert)[0];
      if (naechster) entwurfLaden(naechster.id, 0);
      else {
        neuerEntwurf();
        reiterZeigen(0);
      }
    }
    uebersichtZeichnen();
  }

  // Reiter 0: gespeicherte Prüfungen und Übungen getrennt, der aktive Entwurf hervorgehoben
  function uebersichtZeichnen() {
    const d = entwuerfe();
    // Der aktive Entwurf: Modell aus dem Editor (das gespeicherte kommt verzögert)
    const leer = (e) =>
      e.id === d.aktiv ? !e.titel?.trim() && !e.text?.trim() && !window.AppState.state.nodes.length : entwurfLeer(e);
    const liste = d.liste.filter((e) => !leer(e));
    const zeit = (t) =>
      new Date(t).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    [
      ['entwuerfe-pruefung', true],
      ['entwuerfe-uebung', false],
    ].forEach(([ulId, pruefung]) => {
      const ul = feld(ulId);
      ul.innerHTML = '';
      const eintraege = liste.filter((e) => !!e.pruefung === pruefung).sort((a, b) => b.geaendert - a.geaendert);
      if (!eintraege.length) {
        const li = document.createElement('li');
        li.className = 'lk-leer';
        li.textContent = pruefung ? 'Noch keine Prüfung.' : 'Noch keine Übung.';
        ul.appendChild(li);
      }
      eintraege.forEach((e) => {
        const li = document.createElement('li');
        li.classList.toggle('aktiv', e.id === d.aktiv);
        const oeffnen = document.createElement('button');
        oeffnen.type = 'button';
        oeffnen.className = 'lk-entwurf';
        const titel = document.createElement('strong');
        titel.textContent = e.titel || 'Ohne Titel';
        const info = document.createElement('small');
        info.textContent = `${e.aufgabe === 'rm' ? 'Überführen' : 'ER-Modell zeichnen'} · ${zeit(e.geaendert)}${
          e.id === d.aktiv ? ' · gerade offen' : ''
        }`;
        oeffnen.append(titel, info);
        oeffnen.addEventListener('click', () => entwurfLaden(e.id, Math.max(1, e.reiter || 1)));
        const weg = document.createElement('button');
        weg.type = 'button';
        weg.className = 'lk-gefahr';
        weg.textContent = '🗑 Löschen';
        weg.title = `„${e.titel || 'Ohne Titel'}“ löschen`;
        weg.addEventListener('click', () => entwurfLoeschen(e.id));
        li.append(oeffnen, weg);
        ul.appendChild(li);
      });
    });
  }

  // Prüfbericht: Fehler sperren das Weitergeben, Warnungen nicht. bereich 'text' steht nur unter „Noch offen“.
  function bericht(e) {
    const zeilen = [];
    const fehler = (text, bereich = 'modell') => zeilen.push({ art: 'fehler', text, bereich });
    const warnung = (text) => zeilen.push({ art: 'warnung', text, bereich: 'modell' });
    const m = window.Lernpfad.masterAusErm(e.erm, e.kardinalitaeten);
    const liste = (namen) => namen.map((n) => `„${n}“`).join(', ');

    if (!String(e.titel).trim()) fehler('Titel fehlt.', 'text');
    // Beim Überführen ist das ER-Modell die Aufgabe, ein Text ist dort freiwillig
    if (!String(e.text).trim() && e.aufgabe !== 'rm') fehler('Aufgabentext fehlt.', 'text');
    if (!m.entities.length) {
      fehler(e.aufgabe === 'rm' ? 'Noch kein ER-Modell gezeichnet.' : 'Noch keine Musterlösung gezeichnet.');
      return zeilen;
    }
    const attribute = Object.values(m.attributes).flat().length;
    zeilen.push({
      art: 'ok',
      bereich: 'modell',
      text: `${m.entities.length} Entitätsklassen, ${attribute} Attribute, ${m.relationships.length} Beziehungen${e.kardinalitaeten ? ' mit Kardinalitäten' : ''}.`,
    });

    const ohnePs = m.entities.filter((n) => !m.primaryKeys[n].length);
    if (ohnePs.length) (e.aufgabe === 'rm' ? fehler : warnung)(`Ohne Primärschlüssel: ${liste(ohnePs)}.`);
    const beziehungen = e.erm.nodes.filter((n) => n.type === 'relationship');
    const lose = beziehungen.filter((b) => !m.relationships.some((r) => r.name === b.name));
    if (lose.length)
      warnung(`Nicht mit zwei Entitätsklassen verbunden, wird nicht geprüft: ${liste(lose.map((b) => b.name))}.`);
    const ohneZahl = fehlendeKardinalitaeten(e.erm);
    if (ohneZahl.length && e.aufgabe === 'rm') fehler(`Zum Überführen fehlen Kardinalitäten bei ${liste(ohneZahl)}.`);
    else if (ohneZahl.length && e.kardinalitaeten)
      warnung(`Ohne Kardinalität, dort zählt nur die Verbindung: ${liste(ohneZahl)}.`);

    // Namen, die nach dem Vergleich der Prüfung (Groß/klein, Leerzeichen, ä/ae …) zusammenfallen
    const doppelt = (namen) => namen.filter((n, i) => namen.findIndex((x) => N(x) === N(n)) !== i);
    // Gleich heißende Beziehungen gehen, wenn sie verschiedene Entitätsklassen verbinden („hat“ zweimal)
    const paar = (r) => `${N(r.name)}|${[N(r.from), N(r.to)].sort().join('|')}`;
    const doppelte = [
      ...doppelt(m.entities),
      ...m.relationships
        .filter((r, i) => m.relationships.findIndex((x) => paar(x) === paar(r)) !== i)
        .map((r) => r.name),
      ...m.entities.flatMap((n) => doppelt(m.attributes[n])),
    ];
    if (doppelte.length) fehler(`Doppelte Namen: ${liste([...new Set(doppelte)])}.`);
    // Überführen: Zwei n:m-Beziehungen gleichen Namens ergäben zwei Beziehungstabellen gleichen Namens;
    // der Editor müsste sie umbenennen („Schule-hat-Klasse“), und das errät niemand
    const nm = m.relationships.filter((r) => r.cardinality && !r.cardinality.split(':').includes('1'));
    const nmDoppelt = doppelt(nm.map((r) => r.name));
    if (e.aufgabe === 'rm' && nmDoppelt.length)
      fehler(`Zum Überführen brauchen n:m-Beziehungen verschiedene Namen: ${liste([...new Set(nmDoppelt)])}.`);

    const fehlt = window.Lernpfad.nichtImText(m, e.text);
    const weitere = fehlt.length > 5 ? ` und ${fehlt.length - 5} weitere` : '';
    if (fehlt.length && String(e.text).trim() && e.aufgabe === 'erm')
      warnung(`Im Text nicht gefunden: ${liste(fehlt.slice(0, 5))}${weitere}.`);
    // Prüfung: Ein eingebautes Übungsszenario mit denselben Entitätsklassen hat im Editor eine Lösung zum Nachsehen
    if (e.pruefung) {
      const eigene = new Set(m.entities.map(N));
      const aehnlich = window.Lernpfad.getLernpfade()
        .filter((r) => !r.eigen)
        .flatMap((r) => r.aufgaben.filter((a) => a.masterlösung).map((a) => ({ r, a })))
        .find(({ a }) => {
          const andere = a.masterlösung.entities.map(N);
          return andere.filter((n) => eigene.has(n)).length >= 0.6 * Math.max(andere.length, eigene.size);
        });
      if (aehnlich)
        warnung(
          `Ähnelt der eingebauten Übung „${aehnlich.a.title}“ (${aehnlich.r.titel}). Dort können Schüler mit Lösung üben – nimm für Prüfungen ein eigenes Szenario.`,
        );
    }
    return zeilen;
  }

  // Reiter 0 (Übersicht) und 1–4: immer nur einer sichtbar, „Zurück“ und „Weiter“ darunter
  function reiterZeigen(nr) {
    const leiste = feld('erstellen-leiste');
    leiste.querySelectorAll('[data-reiter]').forEach((r) => r.setAttribute('aria-selected', String(Number(r.dataset.reiter) === nr)));
    leiste.querySelectorAll('.lk-seite').forEach((s) => (s.hidden = Number(s.dataset.seite) !== nr));
    feld('btn-reiter-zurueck').hidden = nr <= 1;
    feld('btn-reiter-weiter').hidden = nr >= 4 || nr === 0;
    if (nr === 0) uebersichtZeichnen();
    entwurfMerken({ reiter: nr });
  }

  const reiter = () => Number(feld('erstellen-leiste').querySelector('[aria-selected="true"]')?.dataset.reiter) || 0;

  // Leiste an Formular und Modell anpassen; liefert das fertige Szenario oder null
  function aktualisieren() {
    if (!offen()) return null;
    const f = formular();
    const e = entwurf();
    const zeilen = bericht(e);
    const panel = feld('erstellen-leiste');
    panel.dataset.art = f.pruefung ? 'pruefung' : 'uebung';
    panel.dataset.aufgabe = f.aufgabe;
    feld('erstellen-titel').textContent = f.pruefung ? '📝 Prüfung erstellen' : '🏋 Übung erstellen';
    document.getElementById('app-title').textContent = f.pruefung ? 'Prüfung erstellen' : 'Übung erstellen';
    // Beim Überführen gehören Kardinalitäten immer dazu
    feld('szenario-kardinalitaeten').disabled = f.aufgabe === 'rm';
    if (f.aufgabe === 'rm') feld('szenario-kardinalitaeten').checked = true;

    // Schritt 2: Beim Überführen ist das ER-Modell die Aufgabe, der Text nur ein freiwilliger Hinweis
    panel.querySelector('[data-reiter="2"]').textContent = f.aufgabe === 'rm' ? '2 · Hinweise' : '2 · Text';
    feld('szenario-text').placeholder =
      f.aufgabe === 'rm'
        ? 'Freiwillig: Hinweise für die Schüler, z. B. „Achte auf die Fremdschlüssel.“ Die Aufgabe ist das ER-Modell.'
        : 'Aufgabentext für die Schüler';
    // Schritt 3: das Modell im Editor
    panel.querySelector('[data-reiter="3"]').textContent = f.aufgabe === 'rm' ? '3 · ER-Modell' : '3 · Musterlösung';
    feld('szenario-modell-hinweis').textContent =
      f.aufgabe === 'rm'
        ? 'Zeichne oben im Editor das ER-Modell, das die Schüler überführen sollen. Sie sehen es als Bild.'
        : 'Zeichne oben im Editor die Musterlösung. Die Schüler sehen sie nicht.';
    const box = feld('szenario-bericht');
    box.innerHTML = '';
    zeilen
      .filter((z) => z.bereich === 'modell')
      .forEach((z) => {
        const p = document.createElement('p');
        p.className = `szenario-bericht-${z.art}`;
        p.textContent = `${{ ok: '✓', warnung: '⚠', fehler: '✗' }[z.art]} ${z.text}`;
        box.appendChild(p);
      });
    const leer = !window.AppState.state.nodes.length;
    const frei = window.AppState.freiesModell();
    feld('btn-szenario-uebernehmen').hidden = !leer || !frei?.nodes?.length;
    feld('btn-szenario-loesung').disabled = leer;

    // Schritt 4: weitergeben, sobald nichts mehr fehlt
    const fehler = zeilen.filter((z) => z.art === 'fehler');
    const sz = fehler.length ? null : pruefeSzenario(e).sz;
    feld('szenario-offen').hidden = !!sz;
    feld('szenario-offen').textContent = sz ? '' : `Noch offen: ${fehler.map((z) => z.text).join(' ')}`;
    const gesichert = !!sz && entwurfLesen().gesichert === sz.id;
    ['btn-szenario-link', 'btn-szenario-speichern', 'btn-szenario-testen'].forEach((id) => (feld(id).disabled = !sz));
    ['btn-pruefung-datei', 'btn-pruefung-ansehen', 'btn-pruefung-korrigieren'].forEach((id) => (feld(id).disabled = !sz));
    feld('btn-pruefung-link').disabled = !gesichert;
    feld('pruefung-datei-info').textContent = gesichert
      ? '✓ Gespeichert. Nur für dich – nicht an Schüler weitergeben.'
      : 'Nur für dich: Damit korrigierst du die Abgaben.';
    feld('pruefung-link-info').textContent = gesichert
      ? 'Für die Schüler, z. B. im ONYX-Aufgabentext.'
      : 'Wird frei, sobald die Lösungsdatei gespeichert ist.';
    // Ein angezeigter Link passt nur zum Stand, aus dem er entstand
    if (letzterLink && letzterLink.id !== sz?.id) feld('szenario-link-wrap').hidden = true;
    // ✓ an den Reitern: was erledigt ist
    const fertig = {
      1: true,
      2: !fehler.some((z) => z.bereich === 'text'),
      3: !fehler.some((z) => z.bereich === 'modell'),
      4: !!sz && letzterLink?.id === sz.id,
    };
    panel.querySelectorAll('[data-reiter]').forEach((r) => r.classList.toggle('fertig', !!fertig[r.dataset.reiter]));
    entwurfMerken();
    return sz;
  }

  const modellGeaendert = () => offen() && aktualisieren();

  function panelOeffnen() {
    if (offen()) return;
    window.Pruefung?.korrekturBeenden?.();
    if (window.Lernpfad?.state?.lernpfadAktiv) window.Lernpfad.hidePanel();
    titelVorher = document.getElementById('app-title').innerHTML;
    document.body.classList.add('erstellen');
    window.dispatchEvent(new Event('resize'));
    const { aktiv } = entwuerfe();
    if (aktiv) entwurfLaden(aktiv);
    else neuerEntwurf();
  }

  function panelSchliessen() {
    if (!offen()) return;
    window.AppState.modellPlatzSetzen(null);
    document.body.classList.remove('erstellen');
    document.getElementById('app-title').innerHTML = titelVorher;
    window.dispatchEvent(new Event('resize'));
  }

  // Ein Modell, das schon im freien Editor steht, als Musterlösung nehmen
  function modellUebernehmen() {
    const frei = window.AppState.freiesModell();
    if (frei) window.AppState.applyErmPayload(JSON.parse(JSON.stringify(frei)));
  }

  // Überführen: erwartete Relationen in der Seitenleiste des Relationenmodells
  function loesungZeigen() {
    window.RelModel?.openDrawer?.();
    window.RelModel?.loesungAnzeigen?.();
  }

  // ---- Datei laden: eine gespeicherte Übung oder Lösungsdatei als neuen Entwurf weiterbearbeiten ----
  function dateiGelesen(daten) {
    const { sz, fehler } = pruefeSzenario(daten);
    if (fehler) return window.App?.showAlertModal?.(fehler, 'Datei nicht geladen');
    if (!sz.erm)
      return window.App?.showAlertModal?.(
        'Das ist ein Prüfungslink, keine Lösungsdatei. Lade die Lösungsdatei, die du beim Erstellen gespeichert hast.',
        'Datei nicht geladen',
      );
    const { titel, text, aufgabe, kardinalitaeten, pruefung } = sz;
    neuerEntwurf({ titel, text, aufgabe, kardinalitaeten, pruefung });
    window.AppState.applyErmPayload(JSON.parse(JSON.stringify(sz.erm)));
    // Die geladene Lösungsdatei ist schon gespeichert: Der Prüfungslink ist gleich frei
    entwurfMerken({ gesichert: sz.pruefung ? pruefeSzenario(entwurf()).sz?.id : null });
    aktualisieren();
  }

  function herunterladen(daten, dateiname) {
    const blob = new Blob([JSON.stringify(daten, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = dateiname.replace(/[\\/:*?"<>|]/g, '-');
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  // Überführen: Das ER-Modell im Editor ist das des Szenarios (entwurf) – sein Bild kommt in den Prüfungslink
  const linkZu = async (sz) => {
    const bild = sz.pruefung && sz.aufgabe === 'rm' ? window.Pruefung.ermBildAusEditor() : undefined;
    return `${location.origin}${location.pathname}#szenario=${await packen(fuerLink(sz, bild))}`;
  };

  async function linkKopieren() {
    const sz = aktualisieren();
    if (!sz || (sz.pruefung && entwurfLesen().gesichert !== sz.id)) return;
    const link = await linkZu(sz);
    letzterLink = { id: sz.id, link };
    aktualisieren();
    feld('szenario-link').value = link;
    feld('szenario-link-wrap').hidden = false;
    let kopiert = false;
    try {
      await navigator.clipboard.writeText(link);
      kopiert = true;
    } catch (_e) {
      feld('szenario-link').select();
    }
    feld('szenario-link-info').textContent = `${kopiert ? '✓ Kopiert. ' : 'Markiert – mit Strg+C kopieren. '}${
      sz.pruefung
        ? 'Der Link enthält keine Lösung.'
        : 'Schüler öffnen damit die Übung und können ihre Lösung überprüfen.'
    }`;
  }

  function alsDateiSpeichern() {
    const sz = aktualisieren();
    if (sz) herunterladen(fuerDatei(sz), `${sz.titel}.erm-szenario.json`);
  }

  function loesungsdateiSpeichern() {
    const sz = aktualisieren();
    if (!sz) return;
    herunterladen(fuerDatei(sz), `${sz.titel} (Lösungsdatei).erm-szenario.json`);
    entwurfMerken({ gesichert: sz.id });
    aktualisieren();
  }

  // Übung: hier ausprobieren. Jedes Ausprobieren beginnt frisch: Die vorige Probe (auch mit älterem Text) und
  // ihr Arbeitsstand fallen weg.
  async function ausprobieren() {
    const daten = entwurf();
    const sz = aktualisieren();
    if (!sz) return;
    panelSchliessen();
    const alt = localStorage.getItem(PROBE_KEY);
    [alt, sz.id].filter(Boolean).forEach((id) => fortschrittLoeschen(`eigen-${id}`));
    if (alt && alt !== sz.id) speichern(liste().filter((x) => x.id !== alt));
    localStorage.setItem(PROBE_KEY, sz.id);
    await importieren(daten);
  }

  // Prüfung: in einem neuen Tab, genau so, wie die Schüler sie sehen (Tab sofort öffnen, sonst blockiert der
  // Browser das Fenster nach dem Warten aufs Packen)
  async function alsSchuelerAnsehen() {
    const sz = aktualisieren();
    if (!sz) return;
    const tab = window.open('', '_blank');
    if (tab) tab.location = await linkZu(sz);
  }

  function korrigieren() {
    const sz = aktualisieren();
    if (sz) window.Pruefung.korrekturOeffnen([{ name: `${sz.titel} (Lösungsdatei)`, daten: fuerDatei(sz) }]);
  }

  const istProbe = (lernpfadId) => lernpfadId === `eigen-${localStorage.getItem(PROBE_KEY)}`;

  // Aus der Probe zurück: Aufgabe schließen (das freie Modell kommt zurück), dann wieder den Entwurf
  function zurueckZumBearbeiten() {
    window.Lernpfad.hidePanel();
    panelOeffnen();
  }

  document.addEventListener('DOMContentLoaded', () => {
    const panel = feld('erstellen-leiste');
    if (!panel) return;
    panel.querySelector('.lk-reiter').addEventListener('click', (e) => {
      const r = e.target.closest('[data-reiter]');
      if (r) reiterZeigen(Number(r.dataset.reiter));
    });
    panel.addEventListener('input', aktualisieren);
    panel.addEventListener('change', aktualisieren);
    // Der Titel ist auch der Titel des ER-Modells (Feld „Titel“ über der Zeichenfläche)
    feld('szenario-titel').addEventListener('input', () => {
      const t = feld('szenario-titel').value;
      window.AppState.state.diagramTitle = t;
      document.getElementById('erm-title-input').value = t;
      window.AppState.persistDebounced();
    });
    const klick = (id, aktion) => feld(id).addEventListener('click', aktion);
    klick('btn-erstellen-schliessen', panelSchliessen);
    klick('btn-reiter-zurueck', () => reiterZeigen(reiter() - 1));
    klick('btn-reiter-weiter', () => reiterZeigen(reiter() + 1));
    klick('btn-szenario-uebernehmen', modellUebernehmen);
    klick('btn-szenario-loesung', loesungZeigen);
    klick('btn-szenario-neu', () => neuerEntwurf());
    klick('btn-szenario-laden', () => feld('szenario-datei').click());
    klick('btn-szenario-link', linkKopieren);
    klick('btn-szenario-speichern', alsDateiSpeichern);
    klick('btn-szenario-testen', ausprobieren);
    klick('btn-pruefung-datei', loesungsdateiSpeichern);
    klick('btn-pruefung-link', linkKopieren);
    klick('btn-pruefung-ansehen', alsSchuelerAnsehen);
    klick('btn-pruefung-korrigieren', korrigieren);
    feld('szenario-datei').addEventListener('change', (e) => {
      const datei = e.target.files[0];
      e.target.value = '';
      if (!datei) return;
      datei
        .text()
        .then((t) => dateiGelesen(JSON.parse(t)))
        .catch(() => window.App?.showAlertModal?.('Die Datei ist keine Übung des ERM-Editors.', 'Datei nicht geladen'));
    });
  });

  // Gespeicherte Szenarien gleich beim Laden als Lernpfade anmelden (vor dem Aufbau des Lernpfad-Menüs)
  window.Lernpfad.setEigeneSzenarien(liste());

  window.Szenario = {
    FORMAT,
    pruefeSzenario,
    pruefeErm,
    pruefungsId,
    fuerLink,
    packen,
    auspacken,
    importieren,
    ausLink,
    entfernen,
    panelOeffnen,
    panelSchliessen,
    modellGeaendert,
    istProbe,
    zurueckZumBearbeiten,
    bericht,
    liste,
  };
})();
