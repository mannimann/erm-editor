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
  const ENTWURF_KEY = 'erm-editor-szenario-entwurf-v1';
  const PROBE_KEY = 'erm-editor-szenario-probe-v1'; // Szenario, das die Lehrkraft gerade ausprobiert
  const KARTEN = ['1', 'n', 'm'];
  const N = (s) => window.RelModel.normalizeName(s);

  // ---- Prüfen: Szenarien kommen von außen (Datei, Link) – nur bekannte Felder, Namen ohne < und > ----
  function hash(text) {
    let h = 5381;
    for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) >>> 0;
    return h.toString(36);
  }

  function pruefeSzenario(d) {
    if (!d || d.format !== FORMAT) return { fehler: 'Das ist keine Szenario-Datei des ERM-Editors.' };
    if (d.version !== 1) return { fehler: 'Das Szenario stammt aus einer neueren Version des ERM-Editors.' };
    const name = (v, max) =>
      String(v ?? '')
        .replace(/[<>]/g, '')
        .trim()
        .slice(0, max);
    const titel = name(d.titel, 80);
    if (!titel) return { fehler: 'Das Szenario hat keinen Titel.' };
    const nodes = d.erm?.nodes;
    const edges = d.erm?.edges;
    if (!Array.isArray(nodes) || !Array.isArray(edges) || nodes.length > 400 || edges.length > 800)
      return { fehler: 'Das ER-Modell im Szenario ist ungültig.' };

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
    if (!knoten.some((n) => n.type === 'entity')) return { fehler: 'Das ER-Modell im Szenario ist leer.' };

    const sz = {
      titel,
      text: String(d.text ?? '').slice(0, 8000),
      aufgabe: d.aufgabe === 'rm' ? 'rm' : 'erm',
      kardinalitaeten: d.aufgabe === 'rm' || !!d.kardinalitaeten,
      erm: { nodes: knoten, edges: kanten, kardinalitaeten: true, diagramTitle: titel, snapToGrid: true },
    };
    if (sz.aufgabe === 'rm' && fehlendeKardinalitaeten(sz.erm).length)
      return { fehler: 'Zum Überführen braucht jede Beziehung des ER-Modells Kardinalitäten.' };
    sz.id = hash(JSON.stringify(sz));
    return { sz };
  }

  // Beziehungen mit zwei Seiten, aber ohne Zahl an einer Linie
  function fehlendeKardinalitaeten(erm) {
    const ohne = window.Lernpfad.masterAusErm(erm, true).relationships.filter((r) => !r.cardinality);
    return ohne.map((r) => r.name);
  }

  // ---- Datei und Link: Link = JSON, gepackt (deflate) und base64url – alles steht hinter dem #, ----
  // ---- der nicht an den Server geht. ----
  function fuerDatei(sz) {
    const { titel, text, aufgabe, kardinalitaeten, erm } = sz;
    return { format: FORMAT, version: 1, titel, text, aufgabe, kardinalitaeten, erm };
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
      return Array.isArray(daten) ? daten.map((d) => pruefeSzenario(d).sz).filter(Boolean) : [];
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
  async function importieren(daten) {
    const { sz, fehler } = pruefeSzenario(daten);
    if (fehler) {
      window.App?.showAlertModal?.(fehler, 'Szenario nicht geöffnet');
      return false;
    }
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

  // ---- Datei wählen: Schüler öffnen ein Szenario, Lehrkräfte laden es zum Bearbeiten ----
  let dateiZweck = 'oeffnen';

  function dateiWaehlen(zweck = 'oeffnen') {
    dateiZweck = zweck;
    document.getElementById('szenario-datei').click();
  }

  async function dateiGelesen(daten) {
    if (dateiZweck === 'oeffnen') return importieren(daten);
    const { sz, fehler } = pruefeSzenario(daten);
    if (fehler) return window.App?.showAlertModal?.(fehler, 'Szenario nicht geladen');
    const ersetzen =
      !window.AppState.state.nodes.length ||
      (await window.App?.showConfirmModal?.(
        'Das ER-Modell im Editor wird durch das des Szenarios ersetzt.',
        'Szenario laden',
      ));
    if (!ersetzen) return;
    window.AppState.applyErmPayload(JSON.parse(JSON.stringify(sz.erm)));
    formularFuellen(sz);
    aktualisieren();
  }

  // ======================================================================
  // DIALOG „Eigenes Szenario erstellen“ (Lehrkräfte)
  // ======================================================================

  const feld = (id) => document.getElementById(id);

  function formular() {
    return {
      titel: feld('szenario-titel').value,
      text: feld('szenario-text').value,
      aufgabe: document.querySelector('input[name="szenario-aufgabe"]:checked')?.value || 'erm',
      kardinalitaeten: feld('szenario-kardinalitaeten').checked,
    };
  }

  function formularFuellen({ titel = '', text = '', aufgabe = 'erm', kardinalitaeten = true }) {
    feld('szenario-titel').value = titel;
    feld('szenario-text').value = text;
    const radio = document.querySelector(`input[name="szenario-aufgabe"][value="${aufgabe === 'rm' ? 'rm' : 'erm'}"]`);
    if (radio) radio.checked = true;
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

  // Prüfbericht für die Lehrkraft: Fehler sperren Speichern und Link, Warnungen nicht
  function bericht(e) {
    const zeilen = [];
    const fehler = (text) => zeilen.push({ art: 'fehler', text });
    const warnung = (text) => zeilen.push({ art: 'warnung', text });
    const m = window.Lernpfad.masterAusErm(e.erm, e.kardinalitaeten);
    const liste = (namen) => namen.map((n) => `„${n}“`).join(', ');

    if (!String(e.titel).trim()) fehler('Gib dem Szenario einen Titel.');
    if (!String(e.text).trim()) fehler('Schreibe den Aufgabentext.');
    if (!m.entities.length) {
      fehler('Zeichne zuerst die Musterlösung als ER-Modell (hier im freien Editor).');
      return zeilen;
    }
    const attribute = Object.values(m.attributes).flat().length;
    zeilen.push({
      art: 'ok',
      text: `Geprüft werden ${m.entities.length} Entitätsklassen, ${attribute} Attribute und ${m.relationships.length} Beziehungen${e.kardinalitaeten ? ' mit Kardinalitäten' : ''}.`,
    });

    const ohnePs = m.entities.filter((n) => !m.primaryKeys[n].length);
    if (ohnePs.length) (e.aufgabe === 'rm' ? fehler : warnung)(`Ohne Primärschlüssel: ${liste(ohnePs)}.`);
    const beziehungen = e.erm.nodes.filter((n) => n.type === 'relationship');
    const offen = beziehungen.filter((b) => !m.relationships.some((r) => r.name === b.name));
    if (offen.length)
      warnung(`Nicht mit zwei Entitätsklassen verbunden, wird nicht geprüft: ${liste(offen.map((b) => b.name))}.`);
    const ohneZahl = fehlendeKardinalitaeten(e.erm);
    if (ohneZahl.length && e.aufgabe === 'rm') fehler(`Zum Überführen fehlen Kardinalitäten bei ${liste(ohneZahl)}.`);
    else if (ohneZahl.length && e.kardinalitaeten)
      warnung(`Ohne Kardinalität, dort wird nur die Verbindung geprüft: ${liste(ohneZahl)}.`);

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
    if (fehlt.length && String(e.text).trim()) warnung(`Im Text nicht gefunden: ${liste(fehlt)}.`);
    return zeilen;
  }

  function aktualisieren() {
    const e = entwurf();
    const zeilen = bericht(e);
    const box = feld('szenario-bericht');
    box.innerHTML = '';
    zeilen.forEach((z) => {
      const p = document.createElement('p');
      p.className = `szenario-bericht-${z.art}`;
      p.textContent = `${{ ok: '✓', warnung: '⚠', fehler: '✗' }[z.art]} ${z.text}`;
      box.appendChild(p);
    });
    const ok = !zeilen.some((z) => z.art === 'fehler');
    ['btn-szenario-speichern', 'btn-szenario-link', 'btn-szenario-testen'].forEach((id) => (feld(id).disabled = !ok));
    // Zum Überführen braucht es immer Kardinalitäten
    feld('szenario-kardinalitaeten').disabled = e.aufgabe === 'rm';
    if (e.aufgabe === 'rm') feld('szenario-kardinalitaeten').checked = true;
    try {
      localStorage.setItem(ENTWURF_KEY, JSON.stringify(formular()));
    } catch (_e) {
      // ignorieren
    }
    return ok;
  }

  function dialogOeffnen() {
    if (window.Lernpfad?.state?.lernpfadAktiv) {
      window.App?.showAlertModal?.(
        'Schließe zuerst den Lernpfad: Die Musterlösung zeichnest du im freien Editor.',
        'Eigenes Szenario',
      );
      return;
    }
    let gespeichert = {};
    try {
      gespeichert = JSON.parse(localStorage.getItem(ENTWURF_KEY) || '{}');
    } catch (_e) {
      // ignorieren
    }
    const s = window.AppState.state;
    formularFuellen({
      titel: gespeichert.titel || s.diagramTitle || '',
      text: gespeichert.text || '',
      aufgabe: gespeichert.aufgabe || 'erm',
      kardinalitaeten: gespeichert.kardinalitaeten ?? s.kardinalitaeten !== false,
    });
    feld('szenario-link-wrap').hidden = true;
    aktualisieren();
    feld('modal-szenario-backdrop').style.display = 'flex';
    feld('szenario-titel').focus();
  }

  function dialogSchliessen() {
    feld('modal-szenario-backdrop').style.display = 'none';
  }

  function alsDateiSpeichern() {
    const { sz } = pruefeSzenario(entwurf());
    if (!sz) return;
    const blob = new Blob([JSON.stringify(fuerDatei(sz), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${sz.titel.replace(/[\\/:*?"<>|]/g, '-')}.erm-szenario.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  async function linkErzeugen() {
    const { sz } = pruefeSzenario(entwurf());
    if (!sz) return;
    const link = `${location.origin}${location.pathname}#szenario=${await packen(fuerDatei(sz))}`;
    feld('szenario-link').value = link;
    feld('szenario-link-wrap').hidden = false;
    let kopiert = false;
    try {
      await navigator.clipboard.writeText(link);
      kopiert = true;
    } catch (_e) {
      feld('szenario-link').select();
    }
    feld('szenario-link-info').textContent =
      `${kopiert ? 'Kopiert. ' : ''}${link.length} Zeichen – das Szenario steckt im Link selbst, es liegt auf keinem Server.`;
  }

  // Jedes Ausprobieren beginnt frisch: Die vorige Probe (auch mit älterem Text) und ihr Arbeitsstand fallen weg
  async function ausprobieren() {
    const daten = entwurf();
    const { sz } = pruefeSzenario(daten);
    if (!sz) return;
    dialogSchliessen();
    const alt = localStorage.getItem(PROBE_KEY);
    [alt, sz.id].filter(Boolean).forEach((id) => fortschrittLoeschen(`eigen-${id}`));
    if (alt && alt !== sz.id) speichern(liste().filter((x) => x.id !== alt));
    localStorage.setItem(PROBE_KEY, sz.id);
    await importieren(daten);
  }

  const istProbe = (lernpfadId) => lernpfadId === `eigen-${localStorage.getItem(PROBE_KEY)}`;

  // Aus der Probe zurück: Aufgabe schließen (das ER-Modell der Lehrkraft kommt zurück), Dialog öffnen
  function zurueckZumBearbeiten() {
    window.Lernpfad.hidePanel();
    dialogOeffnen();
  }

  document.addEventListener('DOMContentLoaded', () => {
    const backdrop = feld('modal-szenario-backdrop');
    if (!backdrop) return;
    feld('btn-szenario-close').addEventListener('click', dialogSchliessen);
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) dialogSchliessen();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && backdrop.style.display !== 'none') dialogSchliessen();
    });
    backdrop.addEventListener('input', aktualisieren);
    backdrop.addEventListener('change', aktualisieren);
    feld('btn-szenario-speichern').addEventListener('click', alsDateiSpeichern);
    feld('btn-szenario-link').addEventListener('click', linkErzeugen);
    feld('btn-szenario-testen').addEventListener('click', ausprobieren);
    feld('btn-szenario-laden').addEventListener('click', () => dateiWaehlen('bearbeiten'));
    feld('szenario-datei').addEventListener('change', (e) => {
      const datei = e.target.files[0];
      e.target.value = '';
      if (!datei) return;
      datei
        .text()
        .then((t) => dateiGelesen(JSON.parse(t)))
        .catch(() => window.App?.showAlertModal?.('Die Datei ist kein gültiges Szenario.', 'Szenario nicht geöffnet'));
    });
  });

  // Gespeicherte Szenarien gleich beim Laden als Lernpfade anmelden (vor dem Aufbau des Lernpfad-Menüs)
  window.Lernpfad.setEigeneSzenarien(liste());

  window.Szenario = {
    FORMAT,
    pruefeSzenario,
    packen,
    auspacken,
    importieren,
    ausLink,
    entfernen,
    dateiWaehlen,
    dialogOeffnen,
    istProbe,
    zurueckZumBearbeiten,
    bericht,
    liste,
  };
})();
