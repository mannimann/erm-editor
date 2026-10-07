/* ============================================================
   app.js  –  Zentraler Zustand & Controller
   ============================================================ */
'use strict';

// ---- Globaler App-Zustand ----
const state = {
  snapToGrid: true,
  kardinalitaeten: true, // false: ER-Modell ohne Kardinalitäten (Schalter im Header)
  diagramTitle: '',
  nodes: [], // { id, type, x, y, name, isPrimaryKey }
  edges: [], // { id, fromId, toId, edgeType, (relationship: chenFrom, chenTo) }
  nextId: 1,
};

const PERSIST_KEY = 'erm-editor-state-v1';

function genId() {
  return 's' + state.nextId++;
}

// ---- Hilfsfunktionen ----
function getNodeById(id) {
  return state.nodes.find((n) => n.id === id) || null;
}

function getConnectedNodes(nodeId, edgeType) {
  return state.edges
    .filter((edge) => {
      if (edgeType && edge.edgeType !== edgeType) return false;
      return edge.fromId === nodeId || edge.toId === nodeId;
    })
    .map((edge) => {
      const otherId = edge.fromId === nodeId ? edge.toId : edge.fromId;
      return { edge, node: getNodeById(otherId) };
    })
    .filter((entry) => !!entry.node);
}

function compareAttributesPrimaryFirst(a, b) {
  if (!!a.isPrimaryKey !== !!b.isPrimaryKey) return a.isPrimaryKey ? -1 : 1;
  return (a.name || '').localeCompare(b.name || '', 'de', { sensitivity: 'base' });
}

function compareRelatedItemsByLabel(a, b) {
  return (a.label || '').localeCompare(b.label || '', 'de', { sensitivity: 'base' });
}

function hasExportableDiagram() {
  return state.nodes.length > 0;
}

function normalizeEntityName(name) {
  return String(name || '')
    .trim()
    .toLocaleLowerCase('de');
}

function isEntityNameTaken(name, excludeId = null) {
  const normalized = normalizeEntityName(name);
  if (!normalized) return false;
  return state.nodes.some(
    (node) => node.type === 'entity' && node.id !== excludeId && normalizeEntityName(node.name) === normalized,
  );
}

function getUniqueEntityName(baseName, excludeId = null) {
  const cleanedBase = String(baseName || '').trim() || 'Entitätsklasse';
  if (!isEntityNameTaken(cleanedBase, excludeId)) return cleanedBase;
  let index = 2;
  while (isEntityNameTaken(`${cleanedBase} ${index}`, excludeId)) index += 1;
  return `${cleanedBase} ${index}`;
}

function normalizeAttributeName(name) {
  return String(name || '')
    .trim()
    .toLocaleLowerCase('de');
}

function getOwningNodeForAttribute(attributeId) {
  const edge = state.edges.find((candidateEdge) => {
    if (candidateEdge.fromId !== attributeId && candidateEdge.toId !== attributeId) return false;
    if (inferEdgeType(candidateEdge) !== 'attribute') return false;
    const otherId = candidateEdge.fromId === attributeId ? candidateEdge.toId : candidateEdge.fromId;
    const otherNode = getNodeById(otherId);
    return otherNode?.type === 'entity' || otherNode?.type === 'relationship';
  });
  if (!edge) return null;
  const otherId = edge.fromId === attributeId ? edge.toId : edge.fromId;
  const otherNode = getNodeById(otherId);
  return otherNode?.type === 'entity' || otherNode?.type === 'relationship' ? otherNode : null;
}

function isOwnerAttributeNameTaken(ownerId, name, excludeAttributeId = null) {
  const normalized = normalizeAttributeName(name);
  if (!ownerId || !normalized) return false;

  return getConnectedNodes(ownerId, 'attribute').some(({ node }) => {
    if (!node || node.type !== 'attribute') return false;
    if (node.id === excludeAttributeId) return false;
    return normalizeAttributeName(node.name) === normalized;
  });
}

function getUniqueOwnerAttributeName(ownerId, baseName, excludeAttributeId = null) {
  const cleanedBase = String(baseName || '').trim() || 'Attribut';
  if (!isOwnerAttributeNameTaken(ownerId, cleanedBase, excludeAttributeId)) return cleanedBase;
  let index = 2;
  while (isOwnerAttributeNameTaken(ownerId, `${cleanedBase} ${index}`, excludeAttributeId)) index += 1;
  return `${cleanedBase} ${index}`;
}

function getOwningEntityForAttribute(attributeId) {
  const owner = getOwningNodeForAttribute(attributeId);
  return owner?.type === 'entity' ? owner : null;
}

function isEntityAttributeNameTaken(entityId, name, excludeAttributeId = null) {
  return isOwnerAttributeNameTaken(entityId, name, excludeAttributeId);
}

function getUniqueEntityAttributeName(entityId, baseName, excludeAttributeId = null) {
  return getUniqueOwnerAttributeName(entityId, baseName, excludeAttributeId);
}

function getExportBaseName() {
  const rawTitle = String(state.diagramTitle || '').trim();
  const safe = (rawTitle || 'neues-erm')
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, '_')
    .replace(/\.+$/g, '')
    .slice(0, 80);
  return safe || 'neues-erm';
}

function buildPersistPayload() {
  return {
    snapToGrid: !!state.snapToGrid,
    kardinalitaeten: state.kardinalitaeten !== false,
    diagramTitle: state.diagramTitle,
    nodes: state.nodes,
    edges: state.edges.map((edge) => {
      const base = {
        id: edge.id,
        fromId: edge.fromId,
        toId: edge.toId,
        edgeType: edge.edgeType,
      };
      if (edge.edgeType === 'relationship') {
        // leer = Kardinalität noch nicht festgelegt
        base.chenFrom = edge.chenFrom || '';
        base.chenTo = edge.chenTo || '';
      }
      return base;
    }),
    nextId: state.nextId,
  };
}

const RELMODEL_PERSIST_KEY = 'erm-relmodel-student-v1';
// Ansicht beim Neuladen wiederherstellen: laufender Lernpfad, rechte Seitenleiste (offen, Breite).
// Aufgabe und Arbeitsstand speichert der Lernpfad selbst. Gelesen wird einmal beim Laden, bevor der Aufbau sie ändert.
const ANSICHT_KEY = 'erm-editor-ansicht-v1';
const gespeicherteAnsicht = (() => {
  try {
    return JSON.parse(localStorage.getItem(ANSICHT_KEY)) || {};
  } catch (_e) {
    return {};
  }
})();
// Neuladen ohne Link: Die Seitenleiste bleibt während des Aufbaus (auch beim Wiederherstellen des Lernpfads)
// fest im gespeicherten Zustand und ohne Animation – kein kurzes Auf- und Zuklappen. Ein Link legt sie selbst fest.
let seitenleisteFest =
  new URLSearchParams(window.location.search).get('lernpfad') || window.location.hash.startsWith('#szenario=')
    ? undefined
    : gespeicherteAnsicht.seitenleiste;

function ansichtMerken(teil) {
  try {
    const ansicht = JSON.parse(localStorage.getItem(ANSICHT_KEY)) || {};
    localStorage.setItem(ANSICHT_KEY, JSON.stringify({ ...ansicht, ...teil }));
  } catch (_e) {
    // ohne Speicher: beim Neuladen startet der freie Editor
  }
}

const RELMODEL_ERM_LERNPFAD_KEY = 'erm-relmodel-erm-lernpfad-v1'; // Relationenmodell während einer ERM-Aufgabe
let aktiverArbeitsstand = null; // Speicherschlüssel des ER-Modells, das gerade aus einer ERM-Aufgabe geladen ist

function getArbeitsstandKey(mode, aufgabeNumber) {
  return window.Lernpfad?.getWorkKey?.(mode, aufgabeNumber) || null;
}

// Lernpfad ({ id, stufe, art: 'erm' | 'rm', schritt, … }) oder null
function lernpfadVon(mode = window.Lernpfad?.state?.lernpfadId) {
  return window.Lernpfad?.getLernpfad?.(mode) || null;
}

// Titel eines neuen ERM in eines Szenario-Lernpfads, z. B. „ERM-Übung 2 – Krankenhaus-System“
function applySzenarioTitle(lernpfad, aufgabe) {
  if (!aufgabe?.title) return;
  state.diagramTitle = lernpfad.eigen ? aufgabe.title : `${lernpfad.titel} ${aufgabe.number} – ${aufgabe.title}`;
  const titleInput = document.getElementById('erm-title-input');
  if (titleInput) titleInput.value = state.diagramTitle;
}

// Startmodell eines Lernpfads (ERM-Kardinalitäten): das eigene Modell der abgeschlossenen Vorgänger-Lernpfads,
// sonst die Vorlage aus files/. nurKardinalitaeten: Seine Formen sind vorgegeben (gesperrt).
async function loadStartModel(lernpfad) {
  const start = lernpfad?.startModell;
  if (!start) return false;
  let geladen =
    window.Lernpfad.isLernpfadDone(start.lernpfad) && loadErmSnapshot(getArbeitsstandKey(start.lernpfad, 1));
  if (!geladen) {
    try {
      await loadErmFromFile(start.datei);
      geladen = true;
    } catch (_) {
      return false;
    }
  }
  if (lernpfad.nurKardinalitaeten) state.nodes.forEach((n) => (n.vorgegeben = true));
  return true;
}

// Leeres Relationenmodell für eine Szenario-Aufgabe; SQL-Übung: die Musterlösung ist vorgegeben
function relationenmodellNeu(lernpfad) {
  window.RelModel?.reset?.();
  if (lernpfad?.rmVorgabe) window.RelModel?.setStudentRelations?.(window.RelModel.loesungAlsRelationen());
}

function hasStorageEntry(storageKey) {
  if (!storageKey) return false;
  try {
    return localStorage.getItem(storageKey) !== null;
  } catch (_err) {
    return false;
  }
}

function applyErmPayload(data, shouldPersist = true) {
  if (!data || !Array.isArray(data.nodes) || !Array.isArray(data.edges)) return false;

  state.nodes = data.nodes;
  state.edges = data.edges;
  state.nextId =
    data.nextId ||
    Math.max(
      0,
      ...data.nodes.map((n) => parseInt(String(n.id || '').slice(1), 10) || 0),
      ...data.edges.map((ed) => parseInt(String(ed.id || '').slice(1), 10) || 0),
    ) + 1;
  state.snapToGrid = !!data.snapToGrid;
  state.kardinalitaeten = data.kardinalitaeten !== false;
  syncCardinalitySwitch();
  state.diagramTitle = typeof data.diagramTitle === 'string' ? data.diagramTitle : state.diagramTitle;
  state.edges.forEach((edge) => {
    edge.edgeType = inferEdgeType(edge);
  });

  const titleInput = document.getElementById('erm-title-input');
  if (titleInput) titleInput.value = state.diagramTitle || '';
  clearSelection();
  if (window.Diagram) window.Diagram.renderAll();
  if (window.Diagram?.setSnapToGrid) window.Diagram.setSnapToGrid(state.snapToGrid);
  if (window.Diagram?.centerView) window.Diagram.centerView();
  if (window.RelModel) window.RelModel.syncFromDiagram();
  if (shouldPersist) persistStateDebounced();
  verlaufNeu();
  aktiverArbeitsstand = null; // ein anderes Modell liegt jetzt auf der Zeichenfläche
  return true;
}

function saveErmSnapshot(storageKey) {
  if (!storageKey) return;
  try {
    localStorage.setItem(storageKey, JSON.stringify(buildPersistPayload()));
  } catch (_err) {
    // ignore
  }
}

function loadErmSnapshot(storageKey) {
  if (!storageKey) return false;
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return false;
    const data = JSON.parse(raw);
    return applyErmPayload(data, true);
  } catch (_err) {
    return false;
  }
}

function persistStateNow() {
  try {
    localStorage.setItem(PERSIST_KEY, JSON.stringify(buildPersistPayload()));
  } catch (_err) {
    // Ignore quota/storage errors silently.
  }
}

// Gespeichert wird getrennt: Das freie Modell (PERSIST_KEY) nur außerhalb von Aufgaben, in einer
// ERM-Aufgabe ihr Arbeitsstand. So bleibt das eigene Modell beim Start einer Aufgabe erhalten.
function persistTick() {
  verlaufMerken();
  const lernpfad = lernpfadVon();
  if (!window.Lernpfad?.state?.lernpfadAktiv) {
    persistStateNow();
  } else if (lernpfad?.art === 'erm') {
    saveErmSnapshot(getArbeitsstandKey(lernpfad.id, window.Lernpfad.state.aktuelleAufgabe || 1));
    // Live-Checkliste aktualisieren, wenn eine Szenario-Aufgabe aktiv ist
    if (!lernpfad.schritt) updateExpertChecklist();
  }
}

let _persistTimer = null;
function persistStateDebounced(delay = 260) {
  if (_persistTimer) clearTimeout(_persistTimer);
  _persistTimer = setTimeout(() => {
    _persistTimer = null;
    persistTick();
  }, delay);
}

// Offene Änderung sofort speichern (vor einem Wechsel zwischen freiem Modus und Aufgabe)
function flushPersist() {
  if (!_persistTimer) return;
  clearTimeout(_persistTimer);
  _persistTimer = null;
  persistTick();
}

// ---- Rückgängig / Wiederholen (Strg+Z / Strg+Y) ----
// Jeder gespeicherte Stand ist ein Schritt; ein neu geladenes Modell beginnt einen neuen Verlauf.
const verlauf = { zurueck: [], vor: [], stand: null };

function modellStand() {
  return JSON.stringify({ nodes: state.nodes, edges: state.edges, nextId: state.nextId });
}

function verlaufButtons() {
  const undo = document.getElementById('btn-undo');
  const redo = document.getElementById('btn-redo');
  if (undo) undo.disabled = !verlauf.zurueck.length;
  if (redo) redo.disabled = !verlauf.vor.length;
}

function verlaufMerken() {
  const jetzt = modellStand();
  if (verlauf.stand !== null && jetzt !== verlauf.stand) {
    verlauf.zurueck.push(verlauf.stand);
    if (verlauf.zurueck.length > 100) verlauf.zurueck.shift();
    verlauf.vor = [];
  }
  verlauf.stand = jetzt;
  verlaufButtons();
}

function verlaufNeu() {
  verlauf.zurueck = [];
  verlauf.vor = [];
  verlauf.stand = modellStand();
  verlaufButtons();
}

function verlaufSchritt(von, nach) {
  if (state.diagramLocked) {
    window.App?.showLockedWarning?.();
    return;
  }
  flushPersist();
  if (!von.length) return;
  nach.push(verlauf.stand);
  verlauf.stand = von.pop();
  const data = JSON.parse(verlauf.stand);
  state.nodes = data.nodes;
  state.edges = data.edges;
  state.nextId = data.nextId;
  clearSelection();
  if (window.Diagram) window.Diagram.renderAll();
  if (window.RelModel?.requestSyncFromDiagramDebounced) window.RelModel.requestSyncFromDiagramDebounced();
  verlaufButtons();
}

const rueckgaengig = () => verlaufSchritt(verlauf.zurueck, verlauf.vor);
const wiederholen = () => verlaufSchritt(verlauf.vor, verlauf.zurueck);

/** Aktualisiert nur die Checklisten-Einträge in-place (ohne volles Panel-Rerender). */
function updateExpertChecklist() {
  const checklistEl = document.getElementById('aufgabe-checklist');
  if (!checklistEl || !window.Lernpfad?.getChecklistStatus) return;

  const checklist = window.Lernpfad.getChecklistStatus();
  if (!checklist) return;

  const mapping =
    lernpfadVon()?.art === 'rm'
      ? {
          relations: checklist.relations,
          attributes: checklist.attributes,
          primaryKeys: checklist.primaryKeys,
          foreignKeys: checklist.foreignKeys,
        }
      : {
          entities: checklist.entities,
          relationships: checklist.relationships,
          attributes: checklist.attributes,
          primaryKeys: checklist.primaryKeys,
        };
  const labels = {
    entities: 'Entitätsklassen',
    relationships: 'Beziehungen',
    attributes: 'Attribute',
    primaryKeys: 'Primärschlüssel',
    relations: 'Relationen',
    foreignKeys: 'Fremdschlüssel',
  };

  for (const [key, data] of Object.entries(mapping)) {
    if (!data) continue;
    const row = checklistEl.querySelector(`[data-checklist-key="${key}"]`);
    if (!row) continue;
    const allDone = data.done === data.total;
    const wasDone = row.classList.contains('aufgabe-checklist-item--done');

    if (allDone && !wasDone) {
      row.classList.add('aufgabe-checklist-item--done');
      row.classList.add('aufgabe-checklist-item--just-checked');
      setTimeout(() => row.classList.remove('aufgabe-checklist-item--just-checked'), 500);
    } else if (!allDone && wasDone) {
      row.classList.remove('aufgabe-checklist-item--done');
    }

    const icon = row.querySelector('.aufgabe-checklist-icon');
    if (icon) icon.textContent = allDone ? '✓' : '✗';
    const label = row.querySelector('.aufgabe-checklist-label');
    if (label) label.textContent = `${labels[key] || key} (${data.done}/${data.total})`;
  }
}

function loadPersistedState() {
  try {
    const raw = localStorage.getItem(PERSIST_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
    return applyErmPayload(data, false);
  } catch (_err) {
    return false;
  }
}

// „ (n)“ hinter einem Namen im Eigenschaften-Panel; noch offen: „ (?)“ während einer Aufgabe, sonst nichts
function cardinalitySuffix(raw) {
  if (state.kardinalitaeten === false) return '';
  if (!raw) return window.Lernpfad?.state?.lernpfadAktiv ? ' (?)' : '';
  return ` (${String(raw).toLowerCase()})`;
}

// Schalter „Kardinalitäten“ im Header: zeigt den Modus; während einer Aufgabe legt der Lernpfad ihn fest
function syncCardinalitySwitch() {
  const toggle = document.getElementById('toggle-cardinalities');
  if (!toggle) return;
  toggle.checked = state.kardinalitaeten !== false;
  toggle.disabled = !!window.Lernpfad?.state?.lernpfadAktiv;
}

function renderRelatedItems(listElement, items, listNodeType = '') {
  listElement.innerHTML = '';
  if (listNodeType) {
    listElement.dataset.nodeType = listNodeType;
  } else {
    delete listElement.dataset.nodeType;
  }

  if (items.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'prop-related-empty';
    empty.textContent = 'Keine Einträge';
    listElement.appendChild(empty);
    return;
  }

  items.forEach((item) => {
    if (item.nodeId) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'prop-related-item prop-related-link';
      if (item.nodeType) {
        button.dataset.nodeType = item.nodeType;
      }
      button.textContent = item.label;
      button.title = item.label;
      button.addEventListener('click', () => {
        if (window.Diagram?.selectNode) {
          window.Diagram.selectNode(item.nodeId);
          return;
        }
        window.AppSelect.selectNode(item.nodeId);
      });
      listElement.appendChild(button);
      return;
    }

    const line = document.createElement('div');
    line.className = 'prop-related-item';
    line.textContent = item.label;
    listElement.appendChild(line);
  });
}

function renderRelatedInfo(node) {
  const row = document.getElementById('prop-related-row');
  const label = document.getElementById('prop-related-label');
  const list = document.getElementById('prop-related-list');
  const relationshipsRow = document.getElementById('prop-relationships-row');
  const relationshipsList = document.getElementById('prop-relationships-list');

  const relLabelEl = document.getElementById('prop-relationships-label');
  row.style.display = '';
  relationshipsRow.style.display = 'none';

  let items = [];
  let mainListType = '';

  if (node.type === 'entity') {
    label.textContent = 'Zugehörige Attribute:';
    mainListType = 'attribute';
    items = getConnectedNodes(node.id, 'attribute')
      .map(({ node: relatedNode }) => relatedNode)
      .sort(compareAttributesPrimaryFirst)
      .map((relatedNode) => ({
        nodeId: relatedNode.id,
        nodeType: relatedNode.type,
        label: `${relatedNode.name || 'Attribut'}${relatedNode.isPrimaryKey ? ' (PS)' : ''}`,
      }));

    const relationshipItems = getConnectedNodes(node.id, 'relationship')
      .map(({ edge, node: relatedNode }) => {
        const cardinality = edge.toId === node.id ? edge.chenTo : edge.chenFrom;
        return {
          nodeId: relatedNode.id,
          nodeType: relatedNode.type,
          label: `${relatedNode.name || 'Beziehung'}${cardinalitySuffix(cardinality)}`,
        };
      })
      .sort(compareRelatedItemsByLabel);

    if (relLabelEl) relLabelEl.textContent = 'Zugehörige Beziehungen:';
    relationshipsRow.style.display = '';
    renderRelatedItems(relationshipsList, relationshipItems, 'relationship');
  } else if (node.type === 'relationship') {
    label.textContent = 'Verbundene Entitätsklassen:';
    mainListType = 'entity';
    items = getConnectedNodes(node.id, 'relationship')
      .map(({ edge, node: relatedNode }) => {
        const cardinality = edge.fromId === node.id ? edge.chenTo : edge.chenFrom;
        return {
          nodeId: relatedNode.id,
          nodeType: relatedNode.type,
          label: `${relatedNode.name || 'Entitätsklasse'}${cardinalitySuffix(cardinality)}`,
        };
      })
      .sort(compareRelatedItemsByLabel);

    const attrItems = getConnectedNodes(node.id, 'attribute')
      .map(({ node: relatedNode }) => relatedNode)
      .sort(compareAttributesPrimaryFirst)
      .map((relatedNode) => ({
        nodeId: relatedNode.id,
        nodeType: relatedNode.type,
        label: `${relatedNode.name || 'Attribut'}${relatedNode.isPrimaryKey ? ' (PS)' : ''}`,
      }));

    if (relLabelEl) relLabelEl.textContent = 'Verbundene Attribute:';
    relationshipsRow.style.display = '';
    renderRelatedItems(relationshipsList, attrItems, 'attribute');
  } else {
    // Attribut-Knoten — Elternknoten bestimmen
    const parents = getConnectedNodes(node.id, 'attribute');
    const parentNode = parents.length > 0 ? parents[0].node : null;
    const parentType = parentNode?.type || 'entity';
    label.textContent = parentType === 'relationship' ? 'Zugehörige Beziehung:' : 'Zugehörige Entitätsklasse:';
    mainListType = parentType;
    items = parents.map(({ node: relatedNode }) => ({
      nodeId: relatedNode.id,
      nodeType: relatedNode.type,
      label: relatedNode.name || (relatedNode.type === 'relationship' ? 'Beziehung' : 'Entitätsklasse'),
    }));
  }

  renderRelatedItems(list, items, mainListType);
}

function inferEdgeType(edge) {
  if (!edge) return 'attribute';
  if (edge.edgeType) return edge.edgeType;
  const fromNode = getNodeById(edge.fromId);
  const toNode = getNodeById(edge.toId);
  if (!fromNode || !toNode) return 'attribute';
  return (fromNode.type === 'relationship' && toNode.type === 'entity') ||
    (fromNode.type === 'entity' && toNode.type === 'relationship')
    ? 'relationship'
    : 'attribute';
}

// Text für HTML-Vorlagen (Titel eigener Szenarien kommen von außen)
function escapeHtml(text) {
  return String(text).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}

// Seitenleiste einklappen (nur unter 1100px wirksam, siehe style.css)
const tabletMedia = window.matchMedia('(max-width: 1100px)');
function setToolbarCollapsed(zu) {
  document.body.classList.toggle('toolbar-collapsed', zu);
  const btn = document.getElementById('btn-toolbar-toggle');
  const text = zu ? 'Seitenleiste ausklappen' : 'Seitenleiste einklappen';
  btn.dataset.tooltip = text; // title wurde beim Laden zu data-tooltip
  btn.setAttribute('aria-label', text);
  btn.setAttribute('aria-expanded', String(!zu));
}

// Lernpfad-Menü: je Stufe ein nummerierter Pfad (empfohlene Reihenfolge), darunter die eigenen Szenarien
// und der Bereich für Lehrkräfte (Links, Szenario öffnen und erstellen). Fortschritt und „neu“ setzt
// updateLernpfadDots. Klicks behandelt ein Listener am Menü (DOMContentLoaded), deshalb lässt es sich neu aufbauen.
function baueLernpfadMenu() {
  const menu = document.getElementById('lernpfade-menu');
  if (!menu) return;
  const lernpfade = window.Lernpfad?.getLernpfade?.() || [];
  // ER-Modell und Relationenmodell farbig getrennt; der erste Eintrag eines Blocks trägt dessen Namen auf der Trennlinie
  const ART = { erm: 'ER-Modell', rm: 'Relationenmodell' };
  const eintrag = (r, nr, blockStart) => `<button class="tab-dropdown-item lernpfad-eintrag art-${r.art}${
    blockStart ? ' art-start' : ''
  }" type="button" data-lernpfad="${r.id}"${blockStart ? ` data-art="${ART[r.art]}"` : ''}>
      <span class="lernpfad-nr" aria-hidden="true">${nr || r.icon}</span>
      <span class="tab-dropdown-item-text">
        <span class="tab-dropdown-item-title">${nr ? `${r.icon} ` : ''}${escapeHtml(r.titel)}</span>
        <span class="tab-dropdown-item-subtitle">${r.untertitel}</span>
      </span>
      <span class="lernpfad-status"></span>
    </button>`;
  const gruppe = (titel, inhalt, klasse = '') =>
    `<div class="lernpfad-menu-group ${klasse}"><div class="lernpfad-menu-group-title">${titel}</div>${inhalt}</div>`;
  const stufen = [...new Set(lernpfade.filter((r) => !r.eigen).map((r) => r.stufe))];
  const eigene = lernpfade
    .filter((r) => r.eigen)
    .map(
      (r) => `<div class="lernpfad-menu-eigen-zeile">${eintrag(r)}<button class="lernpfad-menu-entfernen" type="button"
        data-szenario-entfernen="${r.id}" title="Szenario entfernen" aria-label="Szenario entfernen">✕</button></div>`,
    )
    .join('');
  menu.innerHTML =
    stufen
      .map((stufe) =>
        gruppe(
          stufe,
          lernpfade
            .filter((r) => r.stufe === stufe && !r.eigen)
            .map((r, i, liste) => eintrag(r, i + 1, r.art !== liste[i - 1]?.art))
            .join(''),
        ),
      )
      .join('') +
    (eigene ? gruppe('Eigene Szenarien', eigene, 'lernpfad-menu-eigene') : '') +
    `<div class="lernpfad-menu-lehrkraft">
      <span class="lernpfad-menu-lehrkraft-titel">Für Lehrkräfte</span>
      <button type="button" class="lernpfad-menu-aktion" data-menu-aktion="links">🔗 Links zu den Lernpfaden</button>
      <button type="button" class="lernpfad-menu-aktion" data-szenario-aktion="oeffnen">📂 Szenario öffnen</button>
      <button type="button" class="lernpfad-menu-aktion" data-szenario-aktion="erstellen">🛠 Szenario erstellen</button>
    </div>`;
  window.App?.updateLernpfadDots?.();
}

// Übersicht „Links zu den Lernpfaden“: je Lernpfad ein Link zum Kopieren, wahlweise ab einer Aufgabe
function baueLinkListe() {
  const liste = document.getElementById('links-liste');
  const basis = window.location.origin + window.location.pathname;
  const lernpfade = (window.Lernpfad?.getLernpfade?.() || []).filter((r) => !r.eigen);
  const link = (id, nr) => `${basis}?lernpfad=${id}${nr > 1 ? `&aufgabe=${nr}` : ''}`;
  liste.innerHTML = [...new Set(lernpfade.map((r) => r.stufe))]
    .map(
      (stufe) =>
        `<h4>${stufe}</h4>` +
        lernpfade
          .filter((r) => r.stufe === stufe)
          .map(
            (r) => `<div class="link-zeile" data-id="${r.id}">
          <span class="link-titel">${r.icon} ${escapeHtml(r.titel)}</span>
          <label class="link-ab">ab Aufgabe
            <select>${r.aufgaben.map((q) => `<option value="${q.number}">${q.number}</option>`).join('')}</select>
          </label>
          <input class="link-url" type="text" readonly value="${link(r.id, 1)}" aria-label="Link zu ${escapeHtml(r.titel)}" />
          <button class="rel-btn link-kopieren" type="button">📋 Kopieren</button>
        </div>`,
          )
          .join(''),
    )
    .join('');
  liste.querySelectorAll('.link-zeile').forEach((zeile) => {
    const url = zeile.querySelector('.link-url');
    zeile
      .querySelector('select')
      .addEventListener('change', (e) => (url.value = link(zeile.dataset.id, +e.target.value)));
    const btn = zeile.querySelector('.link-kopieren');
    btn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(url.value);
        btn.textContent = '✓ Kopiert';
      } catch (_e) {
        url.select(); // ohne Zugriff auf die Zwischenablage: markieren, Strg+C
        btn.textContent = 'Strg+C drücken';
      }
      setTimeout(() => (btn.textContent = '📋 Kopieren'), 2000);
    });
  });
}

// ---- Tabs ----
function initTabs() {
  if (seitenleisteFest !== undefined) document.body.classList.add('ansicht-laden');
  const lernpfadeToggleBtn = document.getElementById('btn-lernpfade-toggle');
  const lernpfadeMenu = document.getElementById('lernpfade-menu');
  const lernpfadeDropdown = lernpfadeToggleBtn?.closest('.tab-dropdown');
  const relmodelBtn = document.getElementById('btn-relmodel-toggle');
  const relmodelDrawer = document.getElementById('relmodel-drawer');
  const relmodelResizer = document.getElementById('relmodel-resizer');
  const mainLayout = document.getElementById('main-layout');
  if (
    !lernpfadeToggleBtn ||
    !lernpfadeMenu ||
    !lernpfadeDropdown ||
    !relmodelBtn ||
    !relmodelDrawer ||
    !relmodelResizer ||
    !mainLayout
  )
    return;

  baueLernpfadMenu();

  // Schmale Bildschirme: höchstens die halbe Breite, damit das ERM daneben sichtbar bleibt
  let lastOpenWidth =
    gespeicherteAnsicht.breite || Math.min(relmodelDrawer.getBoundingClientRect().width || 460, window.innerWidth / 2);

  const clampDrawerWidth = (value) => {
    const maxWidth = Math.max(320, Math.min(window.innerWidth * 0.72, mainLayout.getBoundingClientRect().width - 180));
    return Math.max(320, Math.min(maxWidth, value));
  };

  const setLernpfadeMenuOpen = (open) => {
    lernpfadeDropdown.classList.toggle('open', open);
    lernpfadeMenu.hidden = !open;
    lernpfadeToggleBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open && window.App?.updateLernpfadDots) window.App.updateLernpfadDots();
  };

  let syncAufgabePanelResizer = () => {}; // wird unten überschrieben

  const syncAufgabePanelRight = () => {
    const aufgabePanel = document.getElementById('aufgabe-panel');
    if (!aufgabePanel) return;
    // Tablet: Aufgabenleiste volle Breite, das Relationenmodell endet darüber (syncAufgabePanelResizer)
    if (tabletMedia.matches) {
      aufgabePanel.style.right = '';
      syncAufgabePanelResizer();
      return;
    }
    // Gemessen statt berechnet: folgt so auch der Animation beim Ein- und Ausblenden
    const breite = relmodelDrawer.getBoundingClientRect().width + relmodelResizer.getBoundingClientRect().width;
    aufgabePanel.style.right = `${breite}px`;
    syncAufgabePanelResizer();
  };

  const setDrawerState = (open) => {
    if (seitenleisteFest !== undefined) open = seitenleisteFest;
    relmodelDrawer.classList.toggle('collapsed', !open);
    relmodelResizer.classList.toggle('collapsed', !open);
    relmodelBtn.classList.toggle('active', open);
    ansichtMerken({ seitenleiste: open });

    // Tablet: Platz fürs Diagramm neben dem Relationenmodell
    if (open && tabletMedia.matches) setToolbarCollapsed(true);

    if (open) {
      relmodelDrawer.style.width = `${clampDrawerWidth(lastOpenWidth)}px`;
      if (window.RelModel) window.RelModel.syncFromDiagram();
      // Trigger Aufgaben-Validierung wenn Drawer während einer Relationenmodell-Schritt-Lernpfad geöffnet wird
      const lernpfad = lernpfadVon();
      if (lernpfad?.art === 'rm' && lernpfad.schritt && window.Lernpfad.state.lernpfadAktiv) {
        setTimeout(() => window.Lernpfad.validateCurrentAufgabe(), 100);
      }
    }

    syncAufgabePanelRight();
  };

  const stopResize = () => {
    ansichtMerken({ breite: lastOpenWidth });
    relmodelResizer.classList.remove('is-dragging');
    document.body.classList.remove('is-resizing-drawer');
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', stopResize);
  };

  const onPointerMove = (event) => {
    const layoutRect = mainLayout.getBoundingClientRect();
    const nextWidth = clampDrawerWidth(layoutRect.right - event.clientX);
    lastOpenWidth = nextWidth;
    relmodelDrawer.style.width = `${nextWidth}px`;
    syncAufgabePanelRight();
  };

  setDrawerState(false);
  setLernpfadeMenuOpen(false);

  lernpfadeToggleBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    setLernpfadeMenuOpen(lernpfadeMenu.hidden);
  });

  lernpfadeMenu.addEventListener('click', (event) => {
    event.stopPropagation();
  });

  relmodelBtn.addEventListener('click', () => {
    setLernpfadeMenuOpen(false);
    setDrawerState(relmodelDrawer.classList.contains('collapsed'));
  });

  relmodelResizer.addEventListener('pointerdown', (event) => {
    if (relmodelDrawer.classList.contains('collapsed')) return;
    event.preventDefault();
    relmodelResizer.classList.add('is-dragging');
    document.body.classList.add('is-resizing-drawer');
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', stopResize);
  });

  window.addEventListener('resize', () => {
    if (!relmodelDrawer.classList.contains('collapsed')) {
      lastOpenWidth = clampDrawerWidth(relmodelDrawer.getBoundingClientRect().width || lastOpenWidth);
      relmodelDrawer.style.width = `${lastOpenWidth}px`;
    }
    syncAufgabePanelRight();
    syncAufgabePanelResizer();
  });

  // ---- Ziehgriff der Aufgabenleiste (vertikal, obere Kante) ----
  const aufgabePanelResizer = document.getElementById('aufgabe-panel-resizer');
  const aufgabePanel = document.getElementById('aufgabe-panel');

  syncAufgabePanelResizer = () => {
    if (!aufgabePanelResizer || !aufgabePanel) return;
    const isVisible = aufgabePanel.classList.contains('visible');
    const eingeklappt = aufgabePanel.classList.contains('eingeklappt') && tabletMedia.matches;
    aufgabePanelResizer.classList.toggle('visible', isVisible && !eingeklappt);
    const h = isVisible ? aufgabePanel.getBoundingClientRect().height : 0;
    // SQL-Panel (js/sql.js) endet über der Aufgabenleiste
    document.documentElement.style.setProperty('--aufgabe-hoehe', `${h}px`);
    if (isVisible) {
      aufgabePanelResizer.style.bottom = `${h}px`;
      aufgabePanelResizer.style.right = aufgabePanel.style.right || '0';
    }
    // Tablet: Relationenmodell endet über der Aufgabenleiste
    relmodelDrawer.style.height =
      isVisible && tabletMedia.matches ? `calc(100% - ${aufgabePanel.getBoundingClientRect().height}px)` : '';
  };

  if (aufgabePanelResizer && aufgabePanel) {
    // Die Höhe folgt dem Inhalt: Ziehgriff und SQL-Panel mitführen, wenn sich die Aufgabe ändert
    new ResizeObserver(() => syncAufgabePanelResizer()).observe(aufgabePanel);
    let aufgabePanelStartY = 0;
    let aufgabePanelStartH = 0;

    const stopAufgabeResize = () => {
      aufgabePanelResizer.classList.remove('is-dragging');
      document.body.classList.remove('is-resizing-drawer');
      window.removeEventListener('pointermove', onAufgabePointerMove);
      window.removeEventListener('pointerup', stopAufgabeResize);
    };

    const onAufgabePointerMove = (event) => {
      const delta = aufgabePanelStartY - event.clientY;
      const minH = 120;
      const maxH = window.innerHeight * 0.6;
      const newH = Math.max(minH, Math.min(maxH, aufgabePanelStartH + delta));
      aufgabePanel.style.height = `${newH}px`;
      aufgabePanel.style.maxHeight = 'none'; // gezogen: bis 60 % statt der 45 % beim Anpassen an den Inhalt
      syncAufgabePanelResizer();
    };

    aufgabePanelResizer.addEventListener('pointerdown', (event) => {
      if (!aufgabePanel.classList.contains('visible')) return;
      event.preventDefault();
      aufgabePanelStartY = event.clientY;
      aufgabePanelStartH = aufgabePanel.getBoundingClientRect().height;
      aufgabePanelResizer.classList.add('is-dragging');
      document.body.classList.add('is-resizing-drawer');
      window.addEventListener('pointermove', onAufgabePointerMove);
      window.addEventListener('pointerup', stopAufgabeResize);
    });
  }

  // Während Relationenmodell oder Aufgabenleiste animiert werden: Aufgabenleiste (Breite) und Ziehgriff jedes Bild nachführen
  let laufendeAnimationen = 0;
  const nachfuehren = () => {
    syncAufgabePanelRight();
    if (laufendeAnimationen) requestAnimationFrame(nachfuehren);
  };
  [relmodelDrawer, aufgabePanel].forEach((el) => {
    el?.addEventListener('transitionrun', (e) => {
      if (e.target === el && !laufendeAnimationen++) requestAnimationFrame(nachfuehren);
    });
    const ende = (e) => {
      if (e.target !== el) return;
      laufendeAnimationen = Math.max(0, laufendeAnimationen - 1);
      if (!laufendeAnimationen) syncAufgabePanelRight();
    };
    el?.addEventListener('transitionend', ende);
    el?.addEventListener('transitioncancel', ende);
  });

  // Tablet: Aufgabenleiste auf die Kopfzeile einklappen
  const aufgabeFoldBtn = document.getElementById('btn-aufgabe-fold');
  aufgabeFoldBtn?.addEventListener('click', () => {
    const kopf = aufgabePanel.querySelector('.aufgabe-header');
    aufgabePanel.style.setProperty('--aufgabe-kopf', `${kopf.offsetHeight + aufgabePanel.clientTop}px`);
    const zu = aufgabePanel.classList.toggle('eingeklappt');
    const text = zu ? 'Aufgabenleiste ausklappen' : 'Aufgabenleiste einklappen';
    aufgabeFoldBtn.dataset.tooltip = text;
    aufgabeFoldBtn.setAttribute('aria-label', text);
    aufgabeFoldBtn.setAttribute('aria-expanded', String(!zu));
    syncAufgabePanelResizer();
  });

  // Lade den Resizer-Zustand nach Panel-Rendering
  const _origRenderPanel = window.Lernpfad?.renderPanel?.bind(window.Lernpfad);
  if (_origRenderPanel && window.Lernpfad) {
    window.Lernpfad.renderPanel = function () {
      _origRenderPanel();
      syncAufgabePanelResizer();
    };
  }

  document.addEventListener('click', (event) => {
    if (!lernpfadeDropdown.contains(event.target)) {
      setLernpfadeMenuOpen(false);
    }
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') setLernpfadeMenuOpen(false);
  });

  // ---- Aufgaben-Button & Item Hinweis-Punkte ----
  (function initLernpfadDots() {
    function isNotStarted(btn) {
      const mode = btn.dataset.lernpfad;
      if (!mode) return false;
      return !localStorage.getItem(window.Lernpfad.getStorageKey(mode));
    }

    function updateLernpfadDots() {
      const itemButtons = Array.from(lernpfadeMenu.querySelectorAll('.lernpfad-eintrag'));

      // Laufender Lernpfad hervorgehoben; Fortschritt als Ring um die Nummer, rechts „neu“, „3 / 10“ oder „✓“
      const laufend = window.Lernpfad.state.lernpfadAktiv ? window.Lernpfad.state.lernpfadId : null;
      itemButtons.forEach((btn) => {
        if (btn.dataset.lernpfad === laufend) btn.setAttribute('aria-current', 'true');
        else btn.removeAttribute('aria-current');
        const { erledigt, gesamt } = window.Lernpfad.getFortschritt(btn.dataset.lernpfad);
        const fertig = gesamt > 0 && erledigt === gesamt;
        const neu = isNotStarted(btn);
        btn.classList.toggle('fertig', fertig);
        btn.style.setProperty('--fortschritt', `${(erledigt / (gesamt || 1)) * 100}%`);
        const status = btn.querySelector('.lernpfad-status');
        status.className = `lernpfad-status${neu ? ' neu' : ''}`;
        status.textContent = fertig ? '✓' : neu ? 'neu' : `${erledigt} / ${gesamt}`;
      });

      // Haupt-Button-Dot verwalten
      const anyUnstarted = itemButtons.some(isNotStarted);
      let btnDot = lernpfadeToggleBtn.querySelector('.lernpfad-dot');
      if (anyUnstarted) {
        if (!btnDot) {
          btnDot = document.createElement('span');
          btnDot.className = 'lernpfad-dot lernpfad-dot--pulse';
          btnDot.setAttribute('aria-hidden', 'true');
          lernpfadeToggleBtn.appendChild(btnDot);

          // Nach 25 Sek. Pulse stoppen, Punkt bleibt statisch
          const pulseTimer = setTimeout(() => {
            if (btnDot) btnDot.classList.remove('lernpfad-dot--pulse');
          }, 25000);

          lernpfadeToggleBtn.addEventListener(
            'click',
            () => {
              clearTimeout(pulseTimer);
              if (btnDot) btnDot.classList.remove('lernpfad-dot--pulse');
            },
            { once: true },
          );
        }
      } else {
        if (btnDot) btnDot.remove();
      }
    }

    // Erster Stand; danach beim Öffnen des Menüs und beim Start eines Lernpfads
    updateLernpfadDots();

    // Expose for external updates (e.g. when aufgabe progress is reset)
    if (!window.App) window.App = {};
    window.App.updateLernpfadDots = updateLernpfadDots;
  })();

  window.AppTabs = { setDrawerState };
}

// ---- Properties Panel ----
let _selectedNodeId = null;

function selectNode(id) {
  _selectedNodeId = id;
  const node = getNodeById(id);
  if (!node) {
    clearSelection();
    return;
  }

  document.getElementById('prop-empty').style.display = 'none';
  document.getElementById('prop-node').style.display = '';

  document.getElementById('prop-name').value = node.name || '';
  document.getElementById('prop-type-display').textContent =
    node.type === 'entity' ? 'Entitätsklasse' : node.type === 'attribute' ? 'Attribut' : 'Beziehung';

  const pkRow = document.getElementById('prop-pk-row');
  pkRow.style.display = node.type === 'attribute' ? '' : 'none';
  if (node.type === 'attribute') {
    document.getElementById('prop-pk').checked = !!node.isPrimaryKey;
  }
  // Vorgegebene Formen (ERM-Kardinalitäten) bleiben unverändert
  const fest = !!window.Diagram?.istFest?.(node);
  document.getElementById('prop-name').disabled = fest;
  document.getElementById('prop-pk').disabled = fest;

  renderRelatedInfo(node);
  syncAttributButton();
}

function clearSelection() {
  _selectedNodeId = null;
  document.getElementById('prop-empty').style.display = '';
  document.getElementById('prop-node').style.display = 'none';
  document.getElementById('prop-related-row').style.display = 'none';
  document.getElementById('prop-relationships-row').style.display = 'none';
  syncAttributButton();
}

// Werkzeug „Attribut“: nur klickbar, wenn eine Entitätsklasse, Beziehung oder ein Attribut ausgewählt ist
function syncAttributButton() {
  const btn = document.querySelector('.tool-btn[data-tool="attribute"]');
  if (!btn) return;
  const ziel =
    _selectedNodeId && !window.Diagram?.nurKardinalitaeten?.()
      ? window.Diagram?.attributZiel?.(getNodeById(_selectedNodeId))
      : null;
  btn.disabled = !ziel;
  btn.querySelector('.tool-sublabel').textContent = ziel
    ? `zu „${ziel.name || (ziel.type === 'entity' ? 'Entitätsklasse' : 'Beziehung')}“`
    : 'erst Entitätsklasse oder Beziehung wählen';
}

function initPropertiesPanel() {
  // Name-Input
  const propNameInput = document.getElementById('prop-name');
  let propNameValueBeforeEdit = '';

  propNameInput.addEventListener('focus', () => {
    if (!_selectedNodeId) return;
    const node = getNodeById(_selectedNodeId);
    if (!node) return;
    propNameValueBeforeEdit = node.name || '';
  });

  propNameInput.addEventListener('input', (e) => {
    if (!_selectedNodeId) return;
    if (state.diagramLocked) return;
    const node = getNodeById(_selectedNodeId);
    if (!node) return;

    e.target.setCustomValidity('');
    node.name = e.target.value;
    if (window.Diagram) window.Diagram.renderAll();
    if (window.RelModel?.requestSyncFromDiagramDebounced) window.RelModel.requestSyncFromDiagramDebounced();
    persistStateDebounced();
  });

  propNameInput.addEventListener('blur', (e) => {
    if (!_selectedNodeId) return;
    const node = getNodeById(_selectedNodeId);
    if (!node) return;

    const raw = String(e.target.value || '').trim();

    if (node.type === 'entity') {
      const requestedName = raw || 'Entitätsklasse';
      if (isEntityNameTaken(requestedName, node.id)) {
        const uniqueName = getUniqueEntityName(requestedName, node.id);
        e.target.setCustomValidity('Der Name der Entitätsklasse ist bereits vergeben. Name wurde angepasst.');
        e.target.reportValidity();
        node.name = uniqueName;
        e.target.value = uniqueName;
      } else {
        node.name = requestedName;
        e.target.value = requestedName;
      }
      e.target.setCustomValidity('');
    } else if (node.type === 'attribute') {
      const owningNode = getOwningNodeForAttribute(node.id);
      const requestedName = raw || node.name || 'Attribut';
      if (owningNode && isOwnerAttributeNameTaken(owningNode.id, requestedName, node.id)) {
        const uniqueName = getUniqueOwnerAttributeName(owningNode.id, requestedName, node.id);
        const ownerLabel = owningNode.type === 'relationship' ? 'Beziehung' : 'Entitätsklasse';
        e.target.setCustomValidity(
          `Der Attributname ist in dieser ${ownerLabel} bereits vergeben. Name wurde angepasst.`,
        );
        e.target.reportValidity();
        node.name = uniqueName;
        e.target.value = uniqueName;
      } else {
        node.name = requestedName;
        e.target.value = requestedName;
      }
      e.target.setCustomValidity('');
    } else {
      node.name = raw || node.name;
    }

    if (window.Diagram) window.Diagram.renderAll();
    if (window.RelModel?.requestSyncFromDiagramDebounced) window.RelModel.requestSyncFromDiagramDebounced();
    persistStateDebounced();
    selectNode(_selectedNodeId);
  });

  propNameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      if (!_selectedNodeId) return;
      const node = getNodeById(_selectedNodeId);
      if (!node) return;

      node.name = propNameValueBeforeEdit;
      e.currentTarget.value = propNameValueBeforeEdit;
      e.currentTarget.setCustomValidity('');
      if (window.Diagram) window.Diagram.renderAll();
      if (window.RelModel?.requestSyncFromDiagramDebounced) window.RelModel.requestSyncFromDiagramDebounced();
      persistStateDebounced();
      selectNode(_selectedNodeId);
      e.currentTarget.blur();
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      e.currentTarget.blur();
    }
  });

  // PK-Toggle
  document.getElementById('prop-pk').addEventListener('change', (e) => {
    if (!_selectedNodeId) return;
    if (state.diagramLocked) {
      e.target.checked = !e.target.checked;
      return;
    }
    const node = getNodeById(_selectedNodeId);
    if (!node || node.type !== 'attribute') return;
    node.isPrimaryKey = e.target.checked;
    if (window.Diagram) window.Diagram.renderAll();
    if (window.RelModel?.requestSyncFromDiagramDebounced) window.RelModel.requestSyncFromDiagramDebounced();
    persistStateDebounced();
    selectNode(_selectedNodeId);
  });
}

// ---- JSON Export ----
function exportJSON() {
  if (!hasExportableDiagram()) {
    window.App?.showAlertModal?.('Ein leeres ER-Diagramm kann nicht exportiert werden.', 'Export nicht möglich');
    return;
  }

  const data = JSON.stringify(buildPersistPayload(), null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${getExportBaseName()}.erm-editor.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// ---- JSON Import ----
function importJSON(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);
      if (data?.format === window.Szenario?.FORMAT) {
        window.Szenario.importieren(data);
        return;
      }
      if (!applyErmPayload(data, true)) throw new Error('Ungültiges Format');
    } catch (err) {
      window.App?.showAlertModal?.(`Fehler beim Importieren: ${err.message}`, 'Import fehlgeschlagen');
    }
  };
  reader.readAsText(file);
}

// ---- PNG Export ----
function exportPNG() {
  const svgEl = document.getElementById('er-canvas');
  const margin = 10;
  const exportFontFamily = getComputedStyle(document.body).fontFamily || "system-ui, 'Segoe UI', sans-serif";

  if (!hasExportableDiagram()) {
    window.App?.showAlertModal?.('Es sind keine Elemente zum Exportieren vorhanden.', 'Export nicht möglich');
    return;
  }

  // Compute bounds from rendered node groups to match exact visuals (use hit-rect when available)
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  const nodeGroups = svgEl.querySelectorAll('.node');
  nodeGroups.forEach((g) => {
    if (!g) return;
    const transform = g.getAttribute('transform') || '';
    const m = /translate\(\s*([\-0-9\.]+)[,\s]+([\-0-9\.]+)\s*\)/.exec(transform);
    const tx = m ? parseFloat(m[1]) : 0;
    const ty = m ? parseFloat(m[2]) : 0;

    // Prefer the invisible hit rect (contains padding) if present
    const hitRect = Array.from(g.querySelectorAll('rect')).find((r) => r.getAttribute('fill') === 'transparent');
    if (hitRect) {
      const x = parseFloat(hitRect.getAttribute('x') || '0') + tx;
      const y = parseFloat(hitRect.getAttribute('y') || '0') + ty;
      const w = parseFloat(hitRect.getAttribute('width') || '0');
      const h = parseFloat(hitRect.getAttribute('height') || '0');
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x + w);
      maxY = Math.max(maxY, y + h);
      return;
    }

    // Fallback: inspect shape types
    const rect = g.querySelector('rect');
    if (rect) {
      const x = parseFloat(rect.getAttribute('x') || '0') + tx;
      const y = parseFloat(rect.getAttribute('y') || '0') + ty;
      const w = parseFloat(rect.getAttribute('width') || '0');
      const h = parseFloat(rect.getAttribute('height') || '0');
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x + w);
      maxY = Math.max(maxY, y + h);
      return;
    }

    const ellipse = g.querySelector('ellipse');
    if (ellipse) {
      const rx = parseFloat(ellipse.getAttribute('rx') || '0');
      const ry = parseFloat(ellipse.getAttribute('ry') || '0');
      const x = tx - rx;
      const y = ty - ry;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, tx + rx);
      maxY = Math.max(maxY, ty + ry);
      return;
    }

    const poly = g.querySelector('polygon');
    if (poly) {
      const pts = (poly.getAttribute('points') || '')
        .trim()
        .split(/\s+/)
        .map((p) => p.split(',').map((n) => parseFloat(n)));
      if (pts.length) {
        let lx = Infinity,
          ly = Infinity,
          hx = -Infinity,
          hy = -Infinity;
        pts.forEach((p) => {
          const px = p[0];
          const py = p[1];
          lx = Math.min(lx, px);
          ly = Math.min(ly, py);
          hx = Math.max(hx, px);
          hy = Math.max(hy, py);
        });
        minX = Math.min(minX, tx + lx);
        minY = Math.min(minY, ty + ly);
        maxX = Math.max(maxX, tx + hx);
        maxY = Math.max(maxY, ty + hy);
      }
      return;
    }
  });

  const cropX = minX - margin;
  const cropY = minY - margin;
  const cropW = Math.max(40, maxX - minX + margin * 2);
  const cropH = Math.max(40, maxY - minY + margin * 2);

  // Erzeuge serialisierten SVG-String
  const serializer = new XMLSerializer();

  // Temporäre Kopie ohne Raster für sauberes Bild
  const clone = svgEl.cloneNode(true);
  // Styles für SVG-Elemente inline setzen (damit Font-Klassen auch exportiert werden)
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', String(cropW));
  clone.setAttribute('height', String(cropH));
  clone.setAttribute('viewBox', `${cropX} ${cropY} ${cropW} ${cropH}`);
  clone.setAttribute('preserveAspectRatio', 'xMinYMin meet');
  clone.style.background = '#ffffff';

  const clonedEdgesLayer = clone.querySelector('#edges-layer');
  const clonedNodesLayer = clone.querySelector('#nodes-layer');
  const clonedGridBg = clone.querySelector('#canvas-grid-bg');
  if (clonedEdgesLayer) clonedEdgesLayer.setAttribute('transform', '');
  if (clonedNodesLayer) clonedNodesLayer.setAttribute('transform', '');
  if (clonedGridBg) clonedGridBg.setAttribute('fill', '#ffffff');

  // Selektions-Highlight nur im Editor anzeigen, nicht im Export.
  clone.querySelectorAll('.node').forEach((nodeGroup) => {
    const shape = nodeGroup.querySelector('rect, ellipse, polygon');
    if (!shape) return;

    if (nodeGroup.classList.contains('node-entity')) {
      shape.setAttribute('fill', '#dbeafe');
      shape.setAttribute('stroke', '#2563eb');
    } else if (nodeGroup.classList.contains('node-attribute')) {
      shape.setAttribute('fill', '#fef3c7');
      shape.setAttribute('stroke', '#d97706');
    } else if (nodeGroup.classList.contains('node-relationship')) {
      shape.setAttribute('fill', '#dcfce7');
      shape.setAttribute('stroke', '#16a34a');
    }

    shape.setAttribute('stroke-width', '2');
    shape.style.filter = '';
    shape.removeAttribute('filter');
  });

  const exportStyle = document.createElementNS('http://www.w3.org/2000/svg', 'style');
  exportStyle.textContent = `
    text { font-family: ${exportFontFamily}; }
    .edge-line { stroke: #475569; stroke-width: 2; }
    .edge-label { fill: #1e293b; font-size: 13px; font-weight: 700; font-family: ${exportFontFamily}; }
    .edge-hit { stroke: transparent; stroke-width: 12; fill: none; }
  `;
  clone.insertBefore(exportStyle, clone.firstChild);

  const svgStr = serializer.serializeToString(clone);
  const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement('canvas');
    const scale = window.devicePixelRatio || 2;
    canvas.width = cropW * scale;
    canvas.height = cropH * scale;
    const ctx = canvas.getContext('2d');
    ctx.scale(scale, scale);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, cropW, cropH);
    ctx.drawImage(img, 0, 0, cropW, cropH);
    URL.revokeObjectURL(url);

    canvas.toBlob((pngBlob) => {
      const pngUrl = URL.createObjectURL(pngBlob);
      const a = document.createElement('a');
      a.href = pngUrl;
      a.download = `${getExportBaseName()}.erm-editor.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(pngUrl), 3000);
    }, 'image/png');
  };
  img.onerror = () => {
    URL.revokeObjectURL(url);
    window.App?.showAlertModal?.('PNG-Export fehlgeschlagen. Bitte versuche es erneut.', 'Export fehlgeschlagen');
  };
  img.src = url;
}

// ---- Neu / Löschen ----
async function clearAll() {
  const confirmed = await (window.App?.showConfirmModal?.('Alle Elemente löschen und neu beginnen?', 'Bestätigen') ??
    Promise.resolve(confirm('Alle Elemente löschen und neu beginnen?')));
  if (!confirmed) return;
  state.nodes = [];
  state.edges = [];
  state.nextId = 1;
  // Reset diagram title when starting fresh
  state.diagramTitle = '';
  const titleInput = document.getElementById('erm-title-input');
  if (titleInput) titleInput.value = '';
  clearSelection();
  if (window.Diagram) window.Diagram.renderAll();
  if (window.RelModel) window.RelModel.reset();
  persistStateDebounced();
}

function clearDiagramSilent() {
  state.nodes = [];
  state.edges = [];
  state.nextId = 1;
  state.diagramTitle = '';
  const titleInput = document.getElementById('erm-title-input');
  if (titleInput) titleInput.value = '';
  clearSelection();
  if (window.Diagram) window.Diagram.renderAll();
  if (window.RelModel) window.RelModel.reset();
  persistStateDebounced();
  verlaufNeu();
  aktiverArbeitsstand = null;
}

// ER-Modell einer Relationenmodell-Aufgabe: aus files/ oder (eigenes Szenario) aus der Aufgabe selbst
async function loadAufgabeErm(aufgabe) {
  if (aufgabe?.erm) applyErmPayload(JSON.parse(JSON.stringify(aufgabe.erm)), true);
  else if (aufgabe?.jsonFile) await loadErmFromFile(aufgabe.jsonFile).catch(() => {});
}

function loadErmFromFile(filename) {
  return fetch('files/' + encodeURIComponent(filename))
    .then((res) => {
      if (!res.ok) throw new Error('Datei nicht gefunden');
      return res.json();
    })
    .then((data) => {
      if (!applyErmPayload(data, true)) throw new Error('Ungültiges Format');
    });
}

// ---- Bootstrap ----
document.addEventListener('DOMContentLoaded', () => {
  const hadPersistedData = loadPersistedState();
  initTabs();
  initPropertiesPanel();
  document.getElementById('btn-handy-hinweis')?.addEventListener('click', () => {
    document.getElementById('handy-hinweis').hidden = true;
  });

  document.getElementById('btn-toolbar-toggle').addEventListener('click', () => {
    setToolbarCollapsed(!document.body.classList.contains('toolbar-collapsed'));
  });

  // ☰-Menü (schmale Bildschirme): Knöpfe schließen es, Schalter nicht
  const headerMenu = document.getElementById('header-menu');
  const headerMenuBtn = document.getElementById('btn-header-menu');
  const setHeaderMenu = (open) => {
    headerMenu.classList.toggle('open', open);
    headerMenuBtn.setAttribute('aria-expanded', String(open));
  };
  headerMenuBtn.addEventListener('click', () => setHeaderMenu(!headerMenu.classList.contains('open')));
  document.addEventListener('click', (e) => {
    if (headerMenuBtn.contains(e.target)) return;
    if (headerMenu.contains(e.target) && !e.target.closest('button')) return;
    setHeaderMenu(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') setHeaderMenu(false);
  });

  // Info-Modals
  function openModal(backdropId) {
    const el = document.getElementById(backdropId);
    if (el) {
      el.style.display = 'flex';
      el.focus();
    }
  }
  function closeModal(backdropId) {
    const el = document.getElementById(backdropId);
    if (el) el.style.display = 'none';
  }
  ['info', 'rules', 'impressum', 'datenschutz', 'links'].forEach((name) => {
    const btn = document.getElementById(`btn-${name}-modal`);
    const closeBtn = document.getElementById(`btn-${name}-modal-close`);
    const backdrop = document.getElementById(`modal-${name}-backdrop`);
    if (btn) btn.addEventListener('click', () => openModal(`modal-${name}-backdrop`));
    if (closeBtn) closeBtn.addEventListener('click', () => closeModal(`modal-${name}-backdrop`));
    if (backdrop)
      backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) closeModal(`modal-${name}-backdrop`);
      });
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeModal('modal-info-backdrop');
      closeModal('modal-rules-backdrop');
      closeModal('modal-impressum-backdrop');
      closeModal('modal-datenschutz-backdrop');
      closeModal('modal-links-backdrop');
    }
  });

  // Kontakt-E-Mail wird erst zur Laufzeit zusammengesetzt, um sie vor
  // einfachen Adress-Scrapern zu verstecken (steht nicht im HTML-Quelltext).
  (function renderObfuscatedEmail() {
    const user = ['j', '-', 'mann'].join('');
    const domain = ['mail', '.', 'de'].join('');
    const address = `${user}@${domain}`;
    document.querySelectorAll('#impressum-email-link, #datenschutz-email-link').forEach((el) => {
      el.textContent = address;
      el.href = `mailto:${address}`;
    });
  })();

  document.getElementById('btn-export-json').addEventListener('click', exportJSON);
  document.getElementById('btn-export-png').addEventListener('click', exportPNG);
  document.getElementById('btn-clear').addEventListener('click', () => {
    if (state.diagramLocked) {
      window.App?.showLockedWarning?.();
      return;
    }
    if (window.Diagram?.nurKardinalitaeten?.()) {
      window.Diagram.festHinweis();
      return;
    }
    clearAll();
  });

  document.getElementById('btn-undo')?.addEventListener('click', rueckgaengig);
  document.getElementById('btn-redo')?.addEventListener('click', wiederholen);
  document.addEventListener('keydown', (e) => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
    const key = e.key.toLowerCase();
    if (key !== 'z' && key !== 'y') return;
    // In Eingabefeldern gilt das Rückgängig des Feldes; offene Dialoge zuerst schließen
    if (e.target.closest?.('input, textarea, select, [contenteditable="true"]')) return;
    if (document.querySelector('#modal-backdrop:not([style*="none"]), #app-modal-backdrop:not([style*="none"])'))
      return;
    e.preventDefault();
    if (key === 'y' || e.shiftKey) wiederholen();
    else rueckgaengig();
  });

  const cardinalityToggle = document.getElementById('toggle-cardinalities');
  if (cardinalityToggle) {
    syncCardinalitySwitch();
    cardinalityToggle.addEventListener('change', () => {
      state.kardinalitaeten = cardinalityToggle.checked;
      if (window.Diagram) window.Diagram.renderAll();
      if (window.RelModel?.requestSyncFromDiagramDebounced) window.RelModel.requestSyncFromDiagramDebounced();
      if (_selectedNodeId) selectNode(_selectedNodeId);
    });
  }

  const titleInput = document.getElementById('erm-title-input');
  if (titleInput) {
    let titleValueBeforeEdit = state.diagramTitle || '';
    titleInput.value = state.diagramTitle || '';
    titleInput.addEventListener('focus', () => {
      titleValueBeforeEdit = state.diagramTitle || '';
    });
    titleInput.addEventListener('input', (e) => {
      if (state.diagramLocked) {
        titleInput.value = state.diagramTitle || '';
        return;
      }
      state.diagramTitle = e.target.value;
      persistStateDebounced();
    });
    titleInput.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        titleInput.value = titleValueBeforeEdit;
        state.diagramTitle = titleValueBeforeEdit;
        persistStateDebounced();
        titleInput.blur();
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        titleInput.blur();
      }
    });

    const erCanvas = document.getElementById('er-canvas');
    if (erCanvas) {
      erCanvas.addEventListener('pointerdown', () => {
        titleInput.blur();
      });
    }
  }

  if (hadPersistedData) {
    if (window.Diagram) window.Diagram.renderAll();
    if (window.Diagram?.setSnapToGrid) window.Diagram.setSnapToGrid(state.snapToGrid);
    if (window.Diagram?.centerView) window.Diagram.centerView();
    if (window.RelModel) window.RelModel.syncFromDiagram();
  }

  // Seitenleiste wie vor dem Neuladen; beim ersten Besuch offen, wenn schon Relationen gespeichert sind
  window.AppTabs?.setDrawerState(gespeicherteAnsicht.seitenleiste ?? !!window.RelModel?.hadPersistedData?.());

  document.getElementById('btn-import').addEventListener('click', () => {
    if (state.diagramLocked) {
      window.App?.showLockedWarning?.();
      return;
    }
    if (window.Diagram?.nurKardinalitaeten?.()) {
      window.Diagram.festHinweis();
      return;
    }
    document.getElementById('file-input').click();
  });
  document.getElementById('file-input').addEventListener('change', (e) => {
    if (e.target.files[0]) {
      importJSON(e.target.files[0]);
      e.target.value = '';
    }
  });

  // ---- Aufgaben-Menu Event Listeners ----
  const closeLernpfadMenu = () => {
    const btn = document.getElementById('btn-lernpfade-toggle');
    const menu = document.getElementById('lernpfade-menu');
    const dropdown = btn?.closest('.tab-dropdown');
    if (!btn || !menu || !dropdown) return;
    dropdown.classList.remove('open');
    menu.hidden = true;
    btn.setAttribute('aria-expanded', 'false');
  };

  // Startet eine Lernpfad. Das freie Modell bleibt gespeichert und kommt beim Schließen der Aufgabe zurück.
  // wiederherstellen: Neuladen der Seite – kein Hinweis aufs gespeicherte eigene Modell
  async function startLernpfadFlow(mode, wiederherstellen = false) {
    const lernpfad = lernpfadVon(mode);
    if (!window.Lernpfad || !lernpfad) return false;
    closeLernpfadMenu();

    // Offene Änderungen sichern: im freien Modus das eigene Modell, sonst den Stand der laufenden Aufgabe
    flushPersist();
    const ausFreiemModus = !window.Lernpfad.state.lernpfadAktiv;
    if (
      !wiederherstellen &&
      ausFreiemModus &&
      (state.nodes.length || window.RelModel?.getStudentRelations?.().length)
    ) {
      window.App?.showTopToast?.(
        'Dein eigenes Modell ist gespeichert – es kommt zurück, wenn du den Lernpfad schließt.',
        7000,
      );
    }
    window.App?.onBeforeAufgabeChange?.(window.Lernpfad.state);

    if (lernpfad.art === 'erm') {
      // ERM-Lernpfade: Relationenmodell auf einem eigenen Übungsplatz, leer zum Start
      window.RelModel?.setPersistKey?.(RELMODEL_ERM_LERNPFAD_KEY);
      window.RelModel?.reset?.();
      window.AppTabs?.setDrawerState?.(false);
    }

    window.Lernpfad.startLernpfad(mode);
    ansichtMerken({ lernpfad: mode });

    if (lernpfad.art === 'rm' && lernpfad.schritt) {
      // Schritt-Lernpfad: ein ER-Modell und ein Arbeitsstand für den ganzen Lernpfad
      const workKey = getArbeitsstandKey(mode, 1);
      window.RelModel?.setPersistKey?.(workKey);
      try {
        await loadErmFromFile(lernpfad.ermDatei);
      } catch (err) {
        window.App?.showAlertModal?.('Das ER-Modell konnte nicht geladen werden.', 'Fehler');
        return false;
      }
      if (!window.RelModel?.loadFromStorage?.(workKey)) window.RelModel?.reset?.();
      window.AppTabs?.setDrawerState?.(!window.Lernpfad.getCurrentAufgabe()?.seitenleisteSelbstOeffnen);
      state.diagramLocked = true;
      window.Lernpfad.renderPanel();
    } else {
      await window.App?.onAufgabeChanged?.(window.Lernpfad.getCurrentAufgabe?.(), window.Lernpfad.state);
    }
    return true;
  }

  window.App.startLernpfad = startLernpfadFlow;
  window.App.baueLernpfadMenu = baueLernpfadMenu;

  // Ein Listener für das ganze Menü: Lernpfad starten, eigenes Szenario entfernen, öffnen oder erstellen
  document.getElementById('lernpfade-menu').addEventListener('click', (e) => {
    const entfernen = e.target.closest('[data-szenario-entfernen]');
    const aktion = e.target.closest('[data-szenario-aktion]');
    const lernpfad = e.target.closest('[data-lernpfad]');
    if (e.target.closest('[data-menu-aktion="links"]')) {
      closeLernpfadMenu();
      baueLinkListe();
      openModal('modal-links-backdrop');
    } else if (entfernen) {
      window.Szenario?.entfernen?.(entfernen.dataset.szenarioEntfernen);
    } else if (aktion) {
      closeLernpfadMenu();
      if (aktion.dataset.szenarioAktion === 'oeffnen') window.Szenario?.dateiWaehlen?.();
      else window.Szenario?.dialogOeffnen?.();
    } else if (lernpfad) {
      e.preventDefault();
      startLernpfadFlow(lernpfad.dataset.lernpfad);
    }
  });

  // Aufgaben-Close Button
  const aufgabeCloseBtn = document.getElementById('btn-aufgabe-close');
  if (aufgabeCloseBtn) {
    aufgabeCloseBtn.addEventListener('click', () => {
      if (window.Lernpfad && window.Lernpfad.hidePanel) {
        window.Lernpfad.hidePanel();
        state.diagramLocked = false;
      }
    });
  }

  // Aufgaben-Reset Button
  const aufgabeMehr = document.getElementById('aufgabe-mehr');
  document.addEventListener(
    'pointerdown',
    (e) => {
      if (aufgabeMehr && !aufgabeMehr.contains(e.target)) aufgabeMehr.open = false;
    },
    true,
  );
  document.querySelectorAll('[data-aufgabe-reset]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      aufgabeMehr.open = false;
      if (!window.Lernpfad || !window.Lernpfad.resetLernpfadProgress) return;
      const confirmed = await window.App?.showConfirmModal?.(
        'Soll der Fortschritt des aktuellen Lernpfads zurückgesetzt werden? Alle bisherigen Arbeitsst\u00e4nde werden gel\u00f6scht.',
        'Lernpfad zurücksetzen',
      );
      if (confirmed) {
        const lernpfad = lernpfadVon();

        window.Lernpfad.resetLernpfadProgress();
        aktiverArbeitsstand = null;

        // Leere/reload Modelle je nach Lernpfad
        if (lernpfad?.art === 'erm') {
          await window.App.onAufgabeChanged(window.Lernpfad.getCurrentAufgabe?.(), window.Lernpfad.state);
        } else if (lernpfad?.schritt) {
          // Relationenmodell-Schritt-Lernpfad: ERM bleibt, Relationen leeren
          if (window.RelModel) window.RelModel.reset();
        } else if (lernpfad) {
          // Relationenmodell-Szenario: ERM neu laden und Relationen leeren (SQL-Übung: vorgeben)
          const aufgabe = window.Lernpfad.getCurrentAufgabe?.();
          if (aufgabe?.jsonFile || aufgabe?.erm) {
            await loadAufgabeErm(aufgabe);
            relationenmodellNeu(lernpfad);
            if (window.RelModel?.openDrawer) window.RelModel.openDrawer();
            state.diagramLocked = true;
          }
        }
      }
    });
  });

  // Aufgabe Circle Click Handlers – Bestätigung nur bei noch nicht abgeschlossenen Aufgaben
  const aufgabePanel = document.getElementById('aufgabe-panel');
  if (aufgabePanel) {
    const switchAufgabeWithGuards = async (aufgabeNum) => {
      if (!window.Lernpfad) return false;
      const currentAufgabeNum = Number(window.Lernpfad.state.aktuelleAufgabe);
      if (isNaN(aufgabeNum) || isNaN(currentAufgabeNum) || aufgabeNum === currentAufgabeNum) return false;

      const qMode = window.Lernpfad.state?.lernpfadId || '';
      const isCompleted = window.Lernpfad.state.geloesteAufgaben.includes(aufgabeNum);

      // Abschlussaufgabe eines Schritt-Lernpfads: erst, wenn alle Aufgaben gelöst sind
      if (window.Lernpfad.getAufgabeByNumber(qMode, aufgabeNum)?.abschluss && !isCompleted) {
        const allPreviousCompleted = window.Lernpfad.getAufgaben(qMode).every((q) =>
          window.Lernpfad.state.geloesteAufgaben.includes(q.number),
        );
        if (!allPreviousCompleted) {
          await window.App?.showAppModal?.({
            title: 'Letzte Aufgabe gesperrt',
            message:
              'Du kannst die Abschlussaufgabe erst starten, wenn du alle vorherigen Aufgaben abgeschlossen hast.',
            mode: 'alert',
            confirmLabel: 'OK',
          });
          return false;
        }
      }

      // Schritt-Lernpfade bauen aufeinander auf: nur freigeschaltete Aufgaben; Szenarien sind frei wählbar.
      if (!isCompleted && lernpfadVon(qMode)?.schritt && !window.Lernpfad.state.freieAufgaben.includes(aufgabeNum)) {
        await window.App?.showAppModal?.({
          title: 'Aufgabe gesperrt',
          message: 'Schließe zuerst die vorherigen Aufgaben ab, bevor du zu dieser Aufgabe springst.',
          mode: 'alert',
          confirmLabel: 'OK',
        });
        return false;
      }

      window.Lernpfad.jumpToAufgabe(aufgabeNum);

      if (window.App?.onAufgabeChanged) {
        const nextAufgabe =
          window.Lernpfad.getAufgabeByNumber?.(qMode, aufgabeNum) || window.Lernpfad.getCurrentAufgabe?.();
        await window.App.onAufgabeChanged(nextAufgabe, window.Lernpfad.state);
      }

      window.Lernpfad.renderPanel();
      return true;
    };

    aufgabePanel.addEventListener('click', async (e) => {
      const manualCheckBtn = e.target.closest('#btn-aufgabe-check-manual');
      if (manualCheckBtn && window.Lernpfad?.validateCurrentAufgabe) {
        e.preventDefault();
        if (window.App?.isAufgabeCheckSuppressed?.()) return;
        if (lernpfadVon()?.art === 'rm' && !window.Lernpfad.getCurrentAufgabe?.()?.seitenleisteSelbstOeffnen) {
          window.RelModel?.openDrawer?.();
          window.RelModel?.triggerCheck?.();
        }
        window.Lernpfad.validateCurrentAufgabe(true);
        return;
      }

      const manualNextBtn = e.target.closest('#btn-aufgabe-next-manual');
      if (manualNextBtn && window.Lernpfad) {
        e.preventDefault();
        const currentAufgabeNum = Number(window.Lernpfad.state.aktuelleAufgabe);
        const qMode = window.Lernpfad.state?.lernpfadId || '';
        const total = window.Lernpfad.getMaxAufgaben?.(qMode) || 0;
        if (!isNaN(currentAufgabeNum) && currentAufgabeNum < total) {
          await switchAufgabeWithGuards(currentAufgabeNum + 1);
        }
        return;
      }

      const circle = e.target.closest('.aufgabe-circle');
      if (!circle || !window.Lernpfad) return;
      const aufgabeNum = parseInt(circle.getAttribute('data-aufgabe-number'), 10);
      await switchAufgabeWithGuards(aufgabeNum);
    });

    // Direktstart über einen Link: ?lernpfad=erm-grundlagen&aufgabe=3 (Aufgabe nur, wenn freigeschaltet).
    // setTimeout: erst nach den übrigen DOMContentLoaded-Handlern (z. B. relmodel.js) starten.
    const szenarioAusLink = async () => {
      const hash = window.location.hash;
      if (!hash.startsWith('#szenario=')) return false;
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
      await window.Szenario?.ausLink?.(hash.slice('#szenario='.length));
      return true;
    };
    window.addEventListener('hashchange', szenarioAusLink);

    async function startFromLink(params) {
      if (await szenarioAusLink()) return;
      const lernpfad = params.get('lernpfad');
      if (!lernpfad) return;
      // Parameter entfernen, damit ein Neuladen nicht erneut startet
      window.history.replaceState(null, '', window.location.pathname + window.location.hash);
      if (!lernpfadVon(lernpfad)) {
        window.App?.showAlertModal?.(
          `Den Lernpfad „${lernpfad}“ gibt es nicht. Wähle einen Lernpfad unter 🗺️ Lernpfade.`,
          'Unbekannter Lernpfad',
        );
        return;
      }
      if (!(await startLernpfadFlow(lernpfad))) return;
      const aufgabeNum = parseInt(params.get('aufgabe'), 10);
      if (aufgabeNum >= 1 && aufgabeNum <= window.Lernpfad.getMaxAufgaben()) await switchAufgabeWithGuards(aufgabeNum);
    }

    setTimeout(async () => {
      const params = new URLSearchParams(window.location.search);
      if (!params.get('lernpfad') && !window.location.hash.startsWith('#szenario=')) {
        // Neu geladen: den zuletzt offenen Lernpfad wieder öffnen, die Seitenleiste wie zuvor
        const id = gespeicherteAnsicht.lernpfad;
        if (id && lernpfadVon(id)) await startLernpfadFlow(id, true);
        seitenleisteFest = undefined;
        requestAnimationFrame(() => requestAnimationFrame(() => document.body.classList.remove('ansicht-laden')));
        return;
      }
      // Aufgabenleiste erst nach dem Laden hereingleiten lassen, damit man sie bemerkt
      document.body.classList.add('aufgabe-spaeter');
      try {
        await startFromLink(params);
      } finally {
        setTimeout(() => document.body.classList.remove('aufgabe-spaeter'), 500);
      }
    }, 0);
  }
  // Tooltip migration + global floating tooltip manager
  (function initTooltips() {
    const migrate = (root) => {
      try {
        const nodes = (root || document).querySelectorAll('[title]');
        nodes.forEach((el) => {
          const t = el.getAttribute('title');
          if (!t) return;
          if (el.hasAttribute('data-tooltip')) return;
          if (!el.hasAttribute('aria-label')) el.setAttribute('aria-label', t);
          el.setAttribute('data-tooltip', t);
          el.removeAttribute('title');
        });
      } catch (e) {
        // ignore
      }
    };

    migrate(document.body);

    // Create a single floating tooltip element used for all targets
    const tooltip = document.createElement('div');
    tooltip.id = 'global-tooltip';
    tooltip.setAttribute('aria-hidden', 'true');
    tooltip.innerHTML =
      '<div class="tooltip-content" role="tooltip"></div><div class="tooltip-arrow" aria-hidden="true"></div>';
    document.body.appendChild(tooltip);
    // Indicate to CSS that a global tooltip exists (disables pseudo rules)
    document.body.classList.add('has-global-tooltip');

    let showTimer = null;
    let hideTimer = null;
    let currentTarget = null;
    const SHOW_DELAY = 600; // ms before tooltip appears (increased)
    const HIDE_DELAY = 120; // ms after hiding

    function findTarget(node) {
      if (!node || !(node instanceof Element)) return null;
      return node.closest && node.closest('[data-tooltip]');
    }

    function positionTooltipFor(target, preferredPos) {
      const content = tooltip.querySelector('.tooltip-content');
      const arrow = tooltip.querySelector('.tooltip-arrow');
      const text = String(target.getAttribute('data-tooltip') || '').trim();
      if (!text) return;
      content.textContent = text;
      tooltip.style.display = 'block';
      tooltip.style.visibility = 'hidden';

      // measure after content set
      const ttRect = tooltip.getBoundingClientRect();
      const rect = target.getBoundingClientRect();
      const margin = 8;
      let pos = preferredPos || target.getAttribute('data-tooltip-pos') || 'top';

      // Compute candidate positions and pick one that fits vertically.
      const pad = 8;
      const topIfTop = rect.top - ttRect.height - margin;
      const topIfBottom = rect.bottom + margin;

      // If preferred is top but there isn't enough space above, try bottom.
      if (pos === 'top' && topIfTop < pad) {
        if (topIfBottom + ttRect.height <= window.innerHeight - pad) pos = 'bottom';
      } else if (pos === 'bottom' && topIfBottom + ttRect.height > window.innerHeight - pad) {
        if (topIfTop >= pad) pos = 'top';
      }

      let left = 0;
      let top = 0;
      if (pos === 'right') {
        left = rect.right + margin;
        top = rect.top + rect.height / 2 - ttRect.height / 2;
      } else if (pos === 'left') {
        left = rect.left - ttRect.width - margin;
        top = rect.top + rect.height / 2 - ttRect.height / 2;
      } else if (pos === 'bottom') {
        top = topIfBottom;
        left = rect.left + rect.width / 2 - ttRect.width / 2;
      } else {
        // top
        top = topIfTop;
        left = rect.left + rect.width / 2 - ttRect.width / 2;
      }

      // If neither top nor bottom fits, clamp inside viewport (choose best fit)
      if (top < pad) top = pad;
      if (top + ttRect.height > window.innerHeight - pad) top = Math.max(pad, window.innerHeight - ttRect.height - pad);

      // Clamp horizontally
      left = Math.max(pad, Math.min(left, window.innerWidth - ttRect.width - pad));

      tooltip.setAttribute('data-pos', pos);
      tooltip.style.left = Math.round(left) + 'px';
      tooltip.style.top = Math.round(top) + 'px';
      tooltip.style.visibility = 'visible';
      tooltip.setAttribute('aria-hidden', 'false');
      tooltip.classList.add('visible');
    }

    function showTooltipFor(target) {
      if (!target || !target.hasAttribute('data-tooltip')) return;
      clearTimeout(hideTimer);
      currentTarget = target;
      const captured = target;
      showTimer = setTimeout(() => {
        if (currentTarget !== captured) return;
        try {
          positionTooltipFor(captured);
        } catch (e) {
          // ignore positioning errors
        }
      }, SHOW_DELAY);
    }

    function hideTooltip(immediate = false) {
      clearTimeout(showTimer);
      clearTimeout(hideTimer);
      currentTarget = null;
      tooltip.setAttribute('aria-hidden', 'true');
      tooltip.classList.remove('visible');
      if (immediate) {
        tooltip.style.display = 'none';
      } else {
        hideTimer = setTimeout(() => {
          tooltip.style.display = 'none';
        }, HIDE_DELAY);
      }
    }

    // Event delegation: pointer + keyboard
    // Nur Maus: beim Tippen würde der Tooltip sonst bis zum nächsten Tippen stehen bleiben
    document.addEventListener('pointerover', (e) => {
      if (e.pointerType !== 'mouse') return;
      const t = findTarget(e.target);
      if (t) showTooltipFor(t);
    });

    document.addEventListener('pointerout', (e) => {
      const from = findTarget(e.target);
      const to = findTarget(e.relatedTarget);
      if (from && from !== to) hideTooltip(!e.relatedTarget);
    });

    document.addEventListener('pointerdown', () => hideTooltip(true));

    document.addEventListener(
      'focusin',
      (e) => {
        const t = findTarget(e.target);
        if (t) showTooltipFor(t);
      },
      true,
    );

    document.addEventListener(
      'focusout',
      (e) => {
        const t = findTarget(e.target);
        if (t) hideTooltip();
      },
      true,
    );

    // Hide on scroll/resize to avoid stale position
    window.addEventListener('scroll', () => hideTooltip(true), true);
    window.addEventListener('resize', () => hideTooltip(true));

    // Keep migrating title->data-tooltip for dynamically added content
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.type === 'attributes' && m.attributeName === 'title') {
          const target = m.target;
          if (!(target instanceof Element)) continue;
          const val = target.getAttribute('title');
          if (!val) continue;
          if (!target.hasAttribute('data-tooltip')) {
            if (!target.hasAttribute('aria-label')) target.setAttribute('aria-label', val);
            target.setAttribute('data-tooltip', val);
          }
          target.removeAttribute('title');
        } else if (m.type === 'childList' && m.addedNodes.length) {
          m.addedNodes.forEach((n) => {
            if (n.nodeType === 1) migrate(n);
          });
        }
      }
    });

    observer.observe(document.body, { attributes: true, attributeFilter: ['title'], subtree: true, childList: true });
  })();
});

// ---- Aufgabe Panel Rendering ----
window.App = {
  _suppressAufgabeCheckUntil: 0,
  _lockWarningCooldownUntil: 0,

  isAufgabeCheckSuppressed() {
    return Date.now() < this._suppressAufgabeCheckUntil;
  },

  suppressAufgabeCheck(ms = 350) {
    this._suppressAufgabeCheckUntil = Date.now() + ms;
  },

  showLockedWarning() {
    if (Date.now() < this._lockWarningCooldownUntil) return;
    this._lockWarningCooldownUntil = Date.now() + 5000;
    this.showTopToast?.('Das ER-Modell ist während der Aufgabe gesperrt.');
  },

  onRelmodelStudentChanged() {
    window.SQLExport?.aktualisieren();
    const lernpfad = lernpfadVon();
    if (lernpfad?.art === 'rm' && !lernpfad.schritt && window.Lernpfad.state.lernpfadAktiv) {
      updateExpertChecklist();
    }
  },

  onBeforeAufgabeChange(lernpfadState) {
    window.SQLExport?.schliessen();
    const lernpfad = lernpfadVon(lernpfadState?.lernpfadId);
    if (!lernpfad || !lernpfadState?.lernpfadAktiv) return;
    const storageKey = getArbeitsstandKey(lernpfad.id, lernpfadState.aktuelleAufgabe || 1);

    if (lernpfad.art === 'erm') {
      saveErmSnapshot(storageKey);
      return;
    }

    if (window.RelModel?.setPersistKey) window.RelModel.setPersistKey(storageKey);
    if (window.RelModel?.saveToStorage) window.RelModel.saveToStorage(storageKey);
  },

  // Aufgabe schließen: ihren Stand sichern und das freie Modell (ER- und Relationenmodell) zurückholen
  onLernpfadClosing(lernpfadState) {
    window.SQLExport?.schliessen();
    ansichtMerken({ lernpfad: null });
    const lernpfad = lernpfadVon(lernpfadState?.lernpfadId);
    if (!lernpfad) return;
    const storageKey = getArbeitsstandKey(lernpfad.id, lernpfadState.aktuelleAufgabe || 1);
    if (lernpfad.art === 'erm') saveErmSnapshot(storageKey);
    else window.RelModel?.saveToStorage?.(storageKey);

    if (!loadPersistedState()) {
      applyErmPayload({ nodes: [], edges: [], nextId: 1, diagramTitle: '', snapToGrid: state.snapToGrid }, false);
    }
    window.RelModel?.loesungAusblenden?.();
    window.RelModel?.setPersistKey?.(RELMODEL_PERSIST_KEY);
    if (!window.RelModel?.loadFromStorage?.()) window.RelModel?.reset?.();
  },

  async onAufgabeChanged(aufgabe, lernpfadState) {
    const lernpfad = lernpfadVon(lernpfadState?.lernpfadId);
    if (!lernpfad) return;
    // Neue Aufgabe: Musterlösung erst wieder auf Wunsch
    window.RelModel?.loesungAusblenden?.();
    const aufgabeNumber = Number(aufgabe?.number || lernpfadState?.aktuelleAufgabe || 1);
    const storageKey = getArbeitsstandKey(lernpfad.id, aufgabeNumber);

    if (lernpfad.art === 'erm') {
      // Schritt-Lernpfade teilen ein Modell: Beim Weiterschalten bleibt es stehen (Auswahl und Ansicht auch)
      const geladen = storageKey === aktiverArbeitsstand || loadErmSnapshot(storageKey);
      if (!geladen && !(await loadStartModel(lernpfad))) clearDiagramSilent();
      aktiverArbeitsstand = storageKey;
      // Den Kardinalitäten-Modus legt die Aufgabe bzw. der Lernpfad fest (ERM-Grundlagen: ohne)
      state.kardinalitaeten = aufgabe?.kardinalitaeten ?? lernpfad.kardinalitaeten ?? true;
      syncCardinalitySwitch();
      if (window.Diagram) window.Diagram.renderAll();
      if (!geladen) {
        if (!lernpfad.schritt) applySzenarioTitle(lernpfad, aufgabe);
        saveErmSnapshot(storageKey);
      }
      state.diagramLocked = false;
      return;
    }

    if (window.RelModel?.setPersistKey) window.RelModel.setPersistKey(storageKey);
    if (lernpfad.schritt) {
      state.diagramLocked = true;
      return;
    }

    await loadAufgabeErm(aufgabe);

    const loaded = window.RelModel?.loadFromStorage?.(storageKey);
    if (!loaded) relationenmodellNeu(lernpfad);
    if (window.RelModel?.openDrawer) window.RelModel.openDrawer();
    state.diagramLocked = true;
    // Checkliste nach Laden des gespeicherten Arbeitsstands neu rendern
    window.Lernpfad?.renderPanel?.();
  },

  updateAufgabePanel(aufgabe, lernpfadState) {
    syncCardinalitySwitch();
    if (!aufgabe) return;

    const panel = document.getElementById('aufgabe-panel');
    if (!panel) return;

    const mode = lernpfadState.lernpfadId;
    const lernpfad = lernpfadVon(mode);
    const isSchritt = !!lernpfad?.schritt;
    const isRelmodelSzenario = lernpfad?.art === 'rm' && !isSchritt;
    const hasChecklist = !isSchritt;

    // Titel & Fortschritt (die Abschlussaufgabe eines Schritt-Lernpfads zählt nicht)
    const titleEl = panel.querySelector('#aufgabe-title');
    const total = window.Lernpfad?.getMaxAufgaben?.(mode) || 9;
    if (titleEl) {
      titleEl.textContent = `${aufgabe.number}. ${aufgabe.title}`;
      // Aufgaben ohne Kardinalitäten sind schon im Titel gekennzeichnet
      if ((aufgabe.kardinalitaeten ?? lernpfad?.kardinalitaeten) === false)
        titleEl.insertAdjacentHTML('beforeend', ' <span class="aufgabe-title-badge">ohne Kardinalitäten</span>');
    }

    // Kreise je Aufgabe – alle klickbar; das Balkenstück vor einem Kreis ist grün, wenn die Aufgabe davor gelöst ist
    const circlesContainer = panel.querySelector('#aufgabe-circles');
    if (circlesContainer) {
      circlesContainer.innerHTML = '';
      const completedSet = new Set((lernpfadState.geloesteAufgaben || []).map((n) => Number(n)));
      const nextPending = Array.from({ length: total }, (_, idx) => idx + 1).find((n) => !completedSet.has(n)) || null;
      for (let i = 1; i <= total; i++) {
        if (i > 1) {
          const steg = document.createElement('span');
          steg.className = `aufgabe-steg${completedSet.has(i - 1) ? ' erledigt' : ''}`;
          circlesContainer.appendChild(steg);
        }
        const circle = document.createElement('div');
        circle.className = 'aufgabe-circle';
        circle.setAttribute('data-aufgabe-number', i);
        circle.textContent = i;
        const qTitle = window.Lernpfad?.getAufgabeByNumber?.(mode, i)?.title || `Aufgabe ${i}`;
        circle.setAttribute('data-tooltip', qTitle);
        if (!circle.hasAttribute('aria-label')) circle.setAttribute('aria-label', qTitle);
        if (i === aufgabe.number) circle.classList.add('current');
        else if (lernpfadState.geloesteAufgaben.includes(i)) circle.classList.add('completed');
        else if (nextPending !== null && i === nextPending) circle.classList.add('up-next');
        circlesContainer.appendChild(circle);
      }
    }

    // Update Content (nur Aufgabentext, kein Feedback)
    const content = document.getElementById('aufgabe-content');
    if (content) {
      content.innerHTML = '';

      const taskSection = document.createElement('div');
      taskSection.className = 'aufgabe-section aufgabe-task';
      const taskHeader = document.createElement('h4');
      taskHeader.textContent = isSchritt || isRelmodelSzenario ? '🎯 Aufgabe' : '🎯 Szenario';
      taskSection.appendChild(taskHeader);
      const taskContent = document.createElement('div');
      const rawTaskHtml = isSchritt ? aufgabe.objective : aufgabe.szenario;
      const taskHtml = isSchritt
        ? String(rawTaskHtml || '').replace(/^\s*<p>\s*Aufgabe\s*:\s*<\/p>\s*/i, '')
        : rawTaskHtml;
      taskContent.innerHTML = taskHtml;
      taskSection.appendChild(taskContent);
      // ERM-Szenarien: Wörter anklicken, die zum ER-Modell gehören, werden farbig markiert
      if (aufgabe.masterlösung && !isSchritt) {
        window.Lernpfad.textmarker(taskContent, aufgabe.masterlösung, `${mode}:${aufgabe.number}`, taskHeader);
      }

      // Experten (ERM + Relmodel): Wrapper für Side-by-Side-Layout
      let aufgabeBody;
      if (hasChecklist) {
        aufgabeBody = document.createElement('div');
        aufgabeBody.className = 'aufgabe-body-row';
        aufgabeBody.appendChild(taskSection);
        content.appendChild(aufgabeBody);
      } else {
        content.appendChild(taskSection);
      }

      // Checkliste (rechts neben dem Text)
      if (hasChecklist) {
        const checklist = window.Lernpfad?.getChecklistStatus?.();
        if (checklist) {
          const checklistSection = document.createElement('div');
          checklistSection.className = 'aufgabe-checklist';
          checklistSection.id = 'aufgabe-checklist';

          const checklistTitle = document.createElement('h4');
          checklistTitle.textContent = '📋 Checkliste';
          checklistSection.appendChild(checklistTitle);

          let categories;
          if (isRelmodelSzenario) {
            categories = [
              { key: 'relations', label: 'Relationen', data: checklist.relations },
              { key: 'attributes', label: 'Attribute', data: checklist.attributes },
              { key: 'primaryKeys', label: 'Primärschlüssel', data: checklist.primaryKeys },
              { key: 'foreignKeys', label: 'Fremdschlüssel', data: checklist.foreignKeys },
            ];
          } else {
            categories = [
              { key: 'entities', label: 'Entitätsklassen', data: checklist.entities },
              { key: 'relationships', label: 'Beziehungen', data: checklist.relationships },
              { key: 'attributes', label: 'Attribute', data: checklist.attributes },
              { key: 'primaryKeys', label: 'Primärschlüssel', data: checklist.primaryKeys },
            ];
          }

          for (const cat of categories) {
            if (!cat.data) continue;
            const row = document.createElement('div');
            row.className = 'aufgabe-checklist-item';
            row.setAttribute('data-checklist-key', cat.key);
            const allDone = cat.data.done === cat.data.total;
            if (allDone) row.classList.add('aufgabe-checklist-item--done');
            const icon = document.createElement('span');
            icon.className = 'aufgabe-checklist-icon';
            icon.textContent = allDone ? '✓' : '✗';
            const label = document.createElement('span');
            label.className = 'aufgabe-checklist-label';
            label.textContent = `${cat.label} (${cat.data.done}/${cat.data.total})`;
            row.appendChild(icon);
            row.appendChild(label);
            checklistSection.appendChild(row);
          }

          aufgabeBody.appendChild(checklistSection);
        }
      }

      const actions = document.createElement('div');
      actions.className = 'aufgabe-actions aufgabe-actions-visible';

      const checkBtn = document.createElement('button');
      checkBtn.id = 'btn-aufgabe-check-manual';
      checkBtn.type = 'button';
      checkBtn.className = 'aufgabe-btn aufgabe-btn-check';
      checkBtn.textContent = aufgabe.abschluss ? 'Abschließen' : 'Überprüfen';

      actions.appendChild(checkBtn);

      // Lehrkraft probiert ihr eigenes Szenario aus: zurück in den Dialog
      if (window.Szenario?.istProbe?.(mode)) {
        const zurueck = document.createElement('button');
        zurueck.type = 'button';
        zurueck.className = 'aufgabe-btn aufgabe-btn-menu';
        zurueck.textContent = '✎ Zurück zum Bearbeiten';
        zurueck.addEventListener('click', () => window.Szenario.zurueckZumBearbeiten());
        actions.appendChild(zurueck);
      }

      const isCurrentCompleted = (lernpfadState.geloesteAufgaben || []).includes(aufgabe.number);
      if (isRelmodelSzenario && isCurrentCompleted && aufgabe.number < total) {
        const nextBtn = document.createElement('button');
        nextBtn.id = 'btn-aufgabe-next-manual';
        nextBtn.type = 'button';
        nextBtn.className = 'aufgabe-btn aufgabe-btn-menu';
        nextBtn.textContent = 'Nächste Aufgabe';
        actions.appendChild(nextBtn);
      }

      content.appendChild(actions);
    }

    // Untere Feedback-Leiste ist deaktiviert.
    const feedback = document.getElementById('aufgabe-feedback');
    if (feedback) {
      feedback.textContent = '';
      feedback.className = 'aufgabe-feedback';
    }
  },

  // Alle Szenarien eines Übungs-Lernpfads gelöst
  showLernpfadDone(lernpfad) {
    this.playFullscreenConfetti();
    return this.showAppModal({
      title: `🎉 ${lernpfad.titel} geschafft!`,
      message: `Glückwunsch! ${lernpfad.abschlussText || ''}`,
      mode: 'alert',
      confirmLabel: 'Super!',
    });
  },

  showAufgabeFeedback(message, type = 'progress') {
    const feedback = document.getElementById('aufgabe-feedback');
    if (feedback) {
      // Leiste bleibt bewusst leer/unsichtbar.
      void message;
      void type;
      feedback.textContent = '';
      feedback.className = `aufgabe-feedback ${type}`;
    }
  },

  showAufgabeSuccessModal(aufgabeNumber, onComplete) {
    const modal = document.getElementById('aufgabe-success-modal');
    if (!modal) {
      onComplete?.();
      return;
    }

    const titleEl = modal.querySelector('.aufgabe-success-title');
    const barFill = modal.querySelector('.aufgabe-success-bar-fill');
    let okBtn = modal.querySelector('.aufgabe-success-ok-btn');
    const previousActiveElement = document.activeElement;

    if (titleEl) titleEl.textContent = `Aufgabe ${aufgabeNumber} geschafft!`;

    // Fokus vom Hintergrund lösen, damit Enter nicht an darunterliegende Buttons weitergereicht wird.
    if (previousActiveElement && typeof previousActiveElement.blur === 'function') {
      previousActiveElement.blur();
    }

    modal.style.display = 'flex';
    modal.setAttribute('tabindex', '-1');
    this.spawnAufgabeConfetti(modal.querySelector('.aufgabe-success-card'));

    // Ensure gradient is anchored to the full track so it is revealed while the fill grows
    if (barFill) {
      barFill.classList.add('aufgabe-success-gradient');

      const startBarAnimation = () => {
        const barTrack = modal.querySelector('.aufgabe-success-bar-track');
        let trackWidth = 0;
        try {
          if (barTrack) {
            trackWidth = Math.round(barTrack.getBoundingClientRect().width) || barTrack.offsetWidth || 0;
          }
        } catch (e) {
          trackWidth = barTrack ? barTrack.offsetWidth || 0 : 0;
        }

        barFill.style.backgroundRepeat = 'no-repeat';
        barFill.style.backgroundPosition = 'left center';
        if (trackWidth > 0) {
          // Anchor the gradient to the full track width (px) so it looks "revealed" while the element grows
          barFill.style.backgroundSize = `${trackWidth}px 100%`;
        } else {
          // Fallback: scale to cover
          barFill.style.backgroundSize = '100% 100%';
        }

        // Reset and start animation using double rAF to avoid first-load layout/measurement race conditions
        barFill.style.transition = 'none';
        barFill.style.width = '0%';
        barFill.offsetHeight; // reflow
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            barFill.style.transition = 'width 3s linear';
            barFill.style.width = '100%';
          });
        });
      };

      // Ensure fonts/layout are stable before measuring — helps on first modal after reload
      if (document.fonts && document.fonts.ready && typeof document.fonts.ready.then === 'function') {
        document.fonts.ready
          .then(() => {
            startBarAnimation();
          })
          .catch(() => startBarAnimation());
      } else {
        // Fallback small delay
        setTimeout(startBarAnimation, 60);
      }
    }
    // Optional: Zeige die Theorie/Info-Box in der Erfolgs-Modalität (Schritt-Lernpfade, SQL-Übung Aufgabe 1).
    try {
      // Immer alte Box entfernen, damit beim Wechsel von Grundlagen -> Experten nichts "hängen bleibt".
      const existing = modal.querySelector('.aufgabe-success-concept');
      if (existing) existing.remove();

      const currentAufgabe = window.Lernpfad?.getCurrentAufgabe?.();
      const theoryHtml = currentAufgabe?.theory || '';
      if (theoryHtml) {
        const conceptDiv = document.createElement('div');
        conceptDiv.className = 'aufgabe-concept aufgabe-success-concept';
        conceptDiv.innerHTML = theoryHtml;
        const barTrack = modal.querySelector('.aufgabe-success-bar-track');
        if (barTrack) modal.querySelector('.aufgabe-success-card').insertBefore(conceptDiv, barTrack);
        else modal.querySelector('.aufgabe-success-card').appendChild(conceptDiv);
      }
    } catch (e) {
      // ignore
    }

    // Alten Listener entfernen (verhindert mehrfaches Feuern)
    const newBtn = okBtn.cloneNode(true);
    okBtn.parentNode.replaceChild(newBtn, okBtn);

    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      modal.removeEventListener('keydown', onKeyDown, true);
      modal.style.display = 'none';
      this.suppressAufgabeCheck(350);

      // Nach dem Schließen den Check-Button explizit unscharf halten.
      requestAnimationFrame(() => {
        const checkBtn = document.getElementById('btn-aufgabe-check-manual');
        if (checkBtn && typeof checkBtn.blur === 'function') checkBtn.blur();
      });

      onComplete?.();
    };

    const onKeyDown = (event) => {
      // Warten bis OK aktiviert ist
      if (newBtn.disabled) return;
      if (event.key !== 'Enter' && event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      close();
    };

    modal.addEventListener('keydown', onKeyDown, true);

    // OK-Button für 3s deaktivieren, danach aktivieren – Modal schließt erst per OK
    newBtn.disabled = true;
    const enableTimer = setTimeout(() => {
      newBtn.disabled = false;
      try {
        newBtn.focus();
      } catch (e) {
        // ignore
      }
    }, 3000);

    newBtn.addEventListener('click', () => {
      clearTimeout(enableTimer);
      close();
    });
  },

  spawnAufgabeConfetti(containerEl) {
    if (!containerEl) return;

    const oldLayer = containerEl.querySelector('.aufgabe-confetti-layer');
    if (oldLayer) oldLayer.remove();

    const layer = document.createElement('div');
    layer.className = 'aufgabe-confetti-layer';

    const colors = ['#38bdf8', '#22c55e', '#f59e0b', '#a78bfa', '#f472b6', '#fde047'];
    const pieces = 28;

    for (let i = 0; i < pieces; i += 1) {
      const piece = document.createElement('span');
      piece.className = 'aufgabe-confetti-piece';
      piece.style.setProperty('--x', `${Math.random() * 100}%`);
      piece.style.setProperty('--drift', `${Math.random() * 80 - 40}px`);
      piece.style.setProperty('--rot', `${Math.random() * 900 - 450}deg`);
      piece.style.setProperty('--delay', `${Math.random() * 260}ms`);
      piece.style.setProperty('--dur', `${1300 + Math.random() * 1100}ms`);
      piece.style.setProperty('--size', `${4 + Math.random() * 6}px`);
      piece.style.background = colors[i % colors.length];
      layer.appendChild(piece);
    }

    containerEl.appendChild(layer);
    setTimeout(() => {
      if (layer.parentNode) layer.parentNode.removeChild(layer);
    }, 2800);
  },

  playFullscreenConfetti(durationMs = 4200) {
    const existing = document.querySelector('.aufgabe-confetti-fullscreen');
    if (existing) existing.remove();

    const layer = document.createElement('div');
    layer.className = 'aufgabe-confetti-fullscreen';

    const colors = ['#38bdf8', '#22c55e', '#f59e0b', '#a78bfa', '#f472b6', '#fde047'];
    const pieces = 130;

    for (let i = 0; i < pieces; i += 1) {
      const piece = document.createElement('span');
      piece.className = 'aufgabe-confetti-piece aufgabe-confetti-piece-screen';
      piece.style.setProperty('--x', `${Math.random() * 100}%`);
      piece.style.setProperty('--drift', `${Math.random() * 160 - 80}px`);
      piece.style.setProperty('--rot', `${Math.random() * 1300 - 650}deg`);
      piece.style.setProperty('--delay', `${Math.random() * 420}ms`);
      piece.style.setProperty('--dur', `${2600 + Math.random() * 2200}ms`);
      piece.style.setProperty('--size', `${6 + Math.random() * 10}px`);
      piece.style.background = colors[i % colors.length];
      layer.appendChild(piece);
    }

    document.body.appendChild(layer);
    setTimeout(() => {
      if (layer.parentNode) layer.parentNode.removeChild(layer);
    }, durationMs);
  },

  showAppModal({
    title = 'Hinweis',
    message = '',
    confirmLabel = 'OK',
    cancelLabel = 'Abbrechen',
    mode = 'alert',
    autoCloseMs = 0,
    extraLabel = '',
    extraVariant = 'secondary',
    buttonOrder = ['extra', 'cancel', 'confirm'],
    onExtra = null,
  }) {
    const backdrop = document.getElementById('app-modal-backdrop');
    const titleEl = document.getElementById('app-modal-title');
    const messageEl = document.getElementById('app-modal-message');
    const confirmBtn = document.getElementById('app-modal-confirm');
    const cancelBtn = document.getElementById('app-modal-cancel');
    const extraBtn = document.getElementById('app-modal-extra');

    if (!backdrop || !titleEl || !messageEl || !confirmBtn || !cancelBtn || !extraBtn) {
      return Promise.resolve(mode === 'confirm' ? false : true);
    }

    if (this._dialogState?.resolver) {
      this._dialogState.resolver(false);
    }

    titleEl.textContent = title;
    messageEl.textContent = message;
    confirmBtn.textContent = confirmLabel;
    cancelBtn.textContent = cancelLabel;
    confirmBtn.className = 'app-modal-btn app-modal-btn-primary';
    cancelBtn.className = 'app-modal-btn app-modal-btn-secondary';
    extraBtn.className =
      extraVariant === 'primary' ? 'app-modal-btn app-modal-btn-primary' : 'app-modal-btn app-modal-btn-secondary';
    cancelBtn.style.display = mode === 'confirm' ? '' : 'none';
    extraBtn.textContent = extraLabel || 'Hinweise';
    extraBtn.style.display = extraLabel ? '' : 'none';

    const orderMap = {
      confirm: buttonOrder.indexOf('confirm'),
      cancel: buttonOrder.indexOf('cancel'),
      extra: buttonOrder.indexOf('extra'),
    };
    confirmBtn.style.order = String(orderMap.confirm >= 0 ? orderMap.confirm : 2);
    cancelBtn.style.order = String(orderMap.cancel >= 0 ? orderMap.cancel : 1);
    extraBtn.style.order = String(orderMap.extra >= 0 ? orderMap.extra : 0);

    backdrop.style.display = 'flex';
    backdrop.dataset.mode = mode;

    return new Promise((resolve) => {
      const close = (result) => {
        if (this._dialogState?.timer) {
          clearTimeout(this._dialogState.timer);
        }
        backdrop.style.display = 'none';
        delete backdrop.dataset.mode;
        this._dialogState = null;
        resolve(result);
      };

      this._dialogState = { close, resolver: resolve, timer: null };

      confirmBtn.onclick = () => close(true);
      cancelBtn.onclick = () => close(false);
      extraBtn.onclick = () => {
        if (typeof onExtra === 'function') {
          onExtra({ titleEl, messageEl, confirmBtn, cancelBtn, extraBtn, close });
          return;
        }
        close('extra');
      };
      backdrop.onclick = (event) => {
        if (event.target !== backdrop) return;
        close(mode === 'confirm' ? false : true);
      };

      if (autoCloseMs > 0 && mode !== 'confirm') {
        this._dialogState.timer = setTimeout(() => close(true), autoCloseMs);
      }

      confirmBtn.focus();
    });
  },

  showValidationFailedModal(baseMessage, hintMessage) {
    const hints = window.Lernpfad?.getHints?.() || [];
    const singleHint = hints.length > 0 ? hints[0] : String(hintMessage || 'Kein zusätzlicher Hinweis verfügbar.');

    // Bei Szenario-Aufgaben (ERM + Relationenmodell) soll keine Hinweisbox angezeigt werden.
    const showHintButton = !!lernpfadVon()?.schritt;

    return this.showAppModal({
      title: 'Überprüfung',
      message: baseMessage || 'Noch nicht korrekt. Versuche es erneut.',
      mode: 'alert',
      confirmLabel: 'Schließen',
      autoCloseMs: 0,
      extraLabel: showHintButton ? 'Hinweis' : '',
      onExtra: ({ messageEl, extraBtn }) => {
        messageEl.textContent = singleHint;
        extraBtn.style.display = 'none';
      },
    });
  },

  showAlertModal(message, title = 'Hinweis') {
    return this.showAppModal({
      title,
      message,
      mode: 'alert',
      confirmLabel: 'OK',
      autoCloseMs: 3000,
    });
  },

  showTopToast(message, ms = 2400) {
    if (!message) return;
    let toast = document.getElementById('app-top-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'app-top-toast';
      toast.className = 'app-top-toast';
      document.body.appendChild(toast);
    }

    toast.textContent = message;
    toast.classList.add('visible');
    if (this._topToastTimer) clearTimeout(this._topToastTimer);
    this._topToastTimer = setTimeout(() => {
      toast.classList.remove('visible');
      this._topToastTimer = null;
    }, ms);
  },

  showConfirmModal(message, title = 'Bitte bestätigen') {
    return this.showAppModal({
      title,
      message,
      mode: 'confirm',
      confirmLabel: 'Ja',
      cancelLabel: 'Abbrechen',
    });
  },

  showCongratulationsModal(title, message, buttons = []) {
    const modal = document.querySelector('.lernpfad-congratulations-modal');
    if (modal) {
      if (this._congratsTimer) {
        clearTimeout(this._congratsTimer);
        this._congratsTimer = null;
      }

      const content = modal.querySelector('.lernpfad-congratulations-content');
      if (content) {
        const h2 = content.querySelector('h2');
        const p = content.querySelector('p');
        const btnContainer = content.querySelector('.lernpfad-congratulations-buttons');

        if (h2) h2.textContent = title;
        if (p) p.textContent = message;

        if (btnContainer) {
          btnContainer.innerHTML = '';
          buttons.forEach((btn) => {
            const button = document.createElement('button');
            button.className = btn.addClass || 'aufgabe-btn-next';
            button.textContent = btn.label;
            button.onclick = btn.onClick;
            btnContainer.appendChild(button);
          });
        }
      }

      modal.classList.add('visible');
      this.spawnAufgabeConfetti(content || modal);
      this._congratsTimer = setTimeout(() => {
        modal.classList.remove('visible');
        this._congratsTimer = null;
      }, 3000);
    }
  },

  hideCongratulationsModal() {
    const modal = document.querySelector('.lernpfad-congratulations-modal');
    if (this._congratsTimer) {
      clearTimeout(this._congratsTimer);
      this._congratsTimer = null;
    }
    if (modal) {
      modal.classList.remove('visible');
    }
  },
};

// ---- Globale Exports ----
window.AppState = {
  state,
  applyErmPayload,
  genId,
  getNodeById,
  isEntityNameTaken,
  getOwningNodeForAttribute,
  isOwnerAttributeNameTaken,
  getUniqueOwnerAttributeName,
  getOwningEntityForAttribute,
  isEntityAttributeNameTaken,
  getUniqueEntityAttributeName,
  persistNow: persistStateNow,
  persistDebounced: persistStateDebounced,
};
window.AppUtils = {
  normalizeEntityName,
  normalizeAttributeName,
  isEntityNameTaken,
  getUniqueEntityName,
  getOwningNodeForAttribute,
  isOwnerAttributeNameTaken,
  getUniqueOwnerAttributeName,
};
window.AppSelect = { selectNode, clearSelection };

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  const backdrop = document.getElementById('app-modal-backdrop');
  if (!backdrop || backdrop.style.display === 'none') return;
  const mode = backdrop.dataset.mode;
  const cancelBtn = document.getElementById('app-modal-cancel');
  const confirmBtn = document.getElementById('app-modal-confirm');
  if (mode === 'confirm') {
    cancelBtn?.click();
  } else {
    confirmBtn?.click();
  }
});
