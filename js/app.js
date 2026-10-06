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
const RELMODEL_ERM_QUEST_KEY = 'erm-relmodel-erm-quest-v1'; // Relationenmodell während einer ERM-Quest
let aktiverArbeitsstand = null; // Speicherschlüssel des ER-Modells, das gerade aus einer ERM-Quest geladen ist

function getQuestWorkStorageKey(mode, questNumber) {
  return window.Quest?.getWorkKey?.(mode, questNumber) || null;
}

// Quest-Reihe ({ id, stufe, art: 'erm' | 'rm', schritt, … }) oder null
function getQuestSeries(mode = window.Quest?.state?.questMode) {
  return window.Quest?.getSeries?.(mode) || null;
}

// Titel eines neuen ERM in einer Szenario-Reihe, z. B. „ERM-Übung 2 – Krankenhaus-System“
function applySzenarioTitle(reihe, quest) {
  if (!quest?.title) return;
  state.diagramTitle = reihe.eigen ? quest.title : `${reihe.titel} ${quest.number} – ${quest.title}`;
  const titleInput = document.getElementById('erm-title-input');
  if (titleInput) titleInput.value = state.diagramTitle;
}

// Startmodell einer Reihe (ERM-Kardinalitäten): das eigene Modell der abgeschlossenen Vorgänger-Reihe,
// sonst die Vorlage aus files/. nurKardinalitaeten: Seine Formen sind vorgegeben (gesperrt).
async function loadStartModel(reihe) {
  const start = reihe?.startModell;
  if (!start) return false;
  let geladen = window.Quest.isSeriesDone(start.reihe) && loadErmSnapshot(getQuestWorkStorageKey(start.reihe, 1));
  if (!geladen) {
    try {
      await loadErmFromFile(start.datei);
      geladen = true;
    } catch (_) {
      return false;
    }
  }
  if (reihe.nurKardinalitaeten) state.nodes.forEach((n) => (n.vorgegeben = true));
  return true;
}

// Leeres Relationenmodell für eine Szenario-Quest; SQL-Übung: die Musterlösung ist vorgegeben
function relationenmodellNeu(reihe) {
  window.RelModel?.reset?.();
  if (reihe?.rmVorgabe) window.RelModel?.setStudentRelations?.(window.RelModel.loesungAlsRelationen());
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

// Gespeichert wird getrennt: Das freie Modell (PERSIST_KEY) nur außerhalb von Quests, in einer
// ERM-Quest ihr Arbeitsstand. So bleibt das eigene Modell beim Start einer Quest erhalten.
function persistTick() {
  verlaufMerken();
  const reihe = getQuestSeries();
  if (!window.Quest?.state?.questsPanelVisible) {
    persistStateNow();
  } else if (reihe?.art === 'erm') {
    saveErmSnapshot(getQuestWorkStorageKey(reihe.id, window.Quest.state.currentQuestNumber || 1));
    // Live-Checkliste aktualisieren, wenn eine Szenario-Quest aktiv ist
    if (!reihe.schritt) updateExpertChecklist();
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

// Offene Änderung sofort speichern (vor einem Wechsel zwischen freiem Modus und Quest)
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
  const checklistEl = document.getElementById('quest-checklist');
  if (!checklistEl || !window.Quest?.getChecklistStatus) return;

  const checklist = window.Quest.getChecklistStatus();
  if (!checklist) return;

  const mapping =
    getQuestSeries()?.art === 'rm'
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
    const wasDone = row.classList.contains('quest-checklist-item--done');

    if (allDone && !wasDone) {
      row.classList.add('quest-checklist-item--done');
      row.classList.add('quest-checklist-item--just-checked');
      setTimeout(() => row.classList.remove('quest-checklist-item--just-checked'), 500);
    } else if (!allDone && wasDone) {
      row.classList.remove('quest-checklist-item--done');
    }

    const icon = row.querySelector('.quest-checklist-icon');
    if (icon) icon.textContent = allDone ? '✓' : '✗';
    const label = row.querySelector('.quest-checklist-label');
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

// „ (n)“ hinter einem Namen im Eigenschaften-Panel; noch offen: „ (?)“ während einer Quest, sonst nichts
function cardinalitySuffix(raw) {
  if (state.kardinalitaeten === false) return '';
  if (!raw) return window.Quest?.state?.questsPanelVisible ? ' (?)' : '';
  return ` (${String(raw).toLowerCase()})`;
}

// Schalter „Kardinalitäten“ im Header: zeigt den Modus; während einer Quest legt die Reihe ihn fest
function syncCardinalitySwitch() {
  const toggle = document.getElementById('toggle-cardinalities');
  if (!toggle) return;
  toggle.checked = state.kardinalitaeten !== false;
  toggle.disabled = !!window.Quest?.state?.questsPanelVisible;
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

// Quest-Menü aus den Reihen: Einstieg und Fortgeschritten nebeneinander, darunter die eigenen Szenarien
// der Lehrkräfte mit „öffnen“ und „erstellen“; unter jeder Reihe ein Fortschrittsbalken.
// Klicks behandelt ein Listener am Menü (DOMContentLoaded), deshalb lässt es sich neu aufbauen.
function baueQuestMenu() {
  const menu = document.getElementById('quests-menu');
  if (!menu) return;
  const reihen = window.Quest?.getSeriesList?.() || [];
  const eintrag = (r) => `<button class="tab-dropdown-item" type="button" data-quest-series="${r.id}">
      <div class="tab-dropdown-item-text">
        <span class="tab-dropdown-item-title">${r.icon} ${escapeHtml(r.titel)}</span>
        <span class="tab-dropdown-item-subtitle">${r.untertitel}</span>
        <span class="quest-menu-progress" data-mode="${r.id}">
          <span class="quest-menu-progress-track"><span class="quest-menu-progress-fill"></span></span>
          <span class="quest-menu-progress-text"></span>
        </span>
      </div>
    </button>`;
  const gruppe = (titel, inhalt, klasse = '') =>
    `<div class="quest-menu-group ${klasse}"><div class="quest-menu-group-title">${titel}</div>${inhalt}</div>`;
  const stufen = [...new Set(reihen.filter((r) => !r.eigen).map((r) => r.stufe))];
  const eigene = reihen
    .filter((r) => r.eigen)
    .map(
      (r) => `<div class="quest-menu-eigen-zeile">${eintrag(r)}<button class="quest-menu-entfernen" type="button"
        data-szenario-entfernen="${r.id}" title="Szenario entfernen" aria-label="Szenario entfernen">✕</button></div>`,
    )
    .join('');
  menu.innerHTML =
    stufen
      .map((stufe) =>
        gruppe(
          stufe,
          reihen
            .filter((r) => r.stufe === stufe && !r.eigen)
            .map(eintrag)
            .join(''),
        ),
      )
      .join('') +
    gruppe(
      'Eigene Szenarien',
      `${eigene}<div class="quest-menu-aktionen">
        <button type="button" class="quest-menu-aktion" data-szenario-aktion="oeffnen">📂 Szenario öffnen</button>
        <button type="button" class="quest-menu-aktion" data-szenario-aktion="erstellen">🛠 Szenario erstellen (für Lehrkräfte)</button>
      </div>`,
      'quest-menu-eigene',
    ) +
    '<div class="quest-menu-legende">🔷 ER-Modell lernen · <svg class="icon-rm" aria-hidden="true"><use href="#icon-tabelle"></use></svg> Relationenmodell lernen · ✏️ üben</div>';
  window.App?.updateQuestDots?.();
}

// ---- Tabs ----
function initTabs() {
  const questsToggleBtn = document.getElementById('btn-quests-toggle');
  const questsMenu = document.getElementById('quests-menu');
  const questsDropdown = questsToggleBtn?.closest('.tab-dropdown');
  const relmodelBtn = document.getElementById('btn-relmodel-toggle');
  const relmodelDrawer = document.getElementById('relmodel-drawer');
  const relmodelResizer = document.getElementById('relmodel-resizer');
  const relmodelBackdrop = document.getElementById('relmodel-backdrop');
  const mainLayout = document.getElementById('main-layout');
  if (
    !questsToggleBtn ||
    !questsMenu ||
    !questsDropdown ||
    !relmodelBtn ||
    !relmodelDrawer ||
    !relmodelResizer ||
    !relmodelBackdrop ||
    !mainLayout
  )
    return;

  baueQuestMenu();

  let lastOpenWidth = relmodelDrawer.getBoundingClientRect().width || 460;
  let isDrawerOpen = false;
  const mobileMedia = window.matchMedia('(max-width: 860px)');

  const clampDrawerWidth = (value) => {
    const maxWidth = Math.max(320, Math.min(window.innerWidth * 0.72, mainLayout.getBoundingClientRect().width - 180));
    return Math.max(320, Math.min(maxWidth, value));
  };

  const syncBackdrop = () => {
    const shouldShow = mobileMedia.matches && !relmodelDrawer.classList.contains('collapsed');
    relmodelBackdrop.classList.toggle('visible', shouldShow);
  };

  const setQuestsMenuOpen = (open) => {
    questsDropdown.classList.toggle('open', open);
    questsMenu.hidden = !open;
    questsToggleBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open && window.App?.updateQuestDots) window.App.updateQuestDots();
  };

  let syncQuestPanelResizer = () => {}; // wird unten überschrieben

  const syncQuestPanelRight = () => {
    const questPanel = document.getElementById('quest-panel');
    if (!questPanel) return;
    if (mobileMedia.matches) {
      questPanel.style.right = '';
      syncQuestPanelResizer();
      return;
    }
    if (isDrawerOpen) {
      const drawerWidth = relmodelDrawer.getBoundingClientRect().width || lastOpenWidth;
      const resizerWidth = relmodelResizer.offsetWidth || 10;
      questPanel.style.right = `${drawerWidth + resizerWidth}px`;
    } else {
      questPanel.style.right = '0';
    }
    syncQuestPanelResizer();
  };

  const setDrawerState = (open) => {
    isDrawerOpen = !!open;
    relmodelDrawer.classList.toggle('collapsed', !open);
    relmodelResizer.classList.toggle('collapsed', !open);
    relmodelBtn.classList.toggle('active', open);

    if (open) {
      relmodelDrawer.style.width = `${clampDrawerWidth(lastOpenWidth)}px`;
      if (window.RelModel) window.RelModel.syncFromDiagram();
      // Trigger Quest-Validierung wenn Drawer während einer Relationenmodell-Schritt-Reihe geöffnet wird
      const reihe = getQuestSeries();
      if (reihe?.art === 'rm' && reihe.schritt && window.Quest.state.questsPanelVisible) {
        setTimeout(() => window.Quest.validateCurrentQuest(), 100);
      }
    }

    syncBackdrop();
    syncQuestPanelRight();
  };

  const stopResize = () => {
    relmodelResizer.classList.remove('is-dragging');
    document.body.classList.remove('is-resizing-drawer');
    window.removeEventListener('mousemove', onPointerMove);
    window.removeEventListener('mouseup', stopResize);
  };

  const onPointerMove = (event) => {
    const layoutRect = mainLayout.getBoundingClientRect();
    const nextWidth = clampDrawerWidth(layoutRect.right - event.clientX);
    lastOpenWidth = nextWidth;
    relmodelDrawer.style.width = `${nextWidth}px`;
    syncQuestPanelRight();
  };

  setDrawerState(false);
  setQuestsMenuOpen(false);

  questsToggleBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    setQuestsMenuOpen(questsMenu.hidden);
  });

  questsMenu.addEventListener('click', (event) => {
    event.stopPropagation();
  });

  relmodelBtn.addEventListener('click', () => {
    setQuestsMenuOpen(false);
    setDrawerState(relmodelDrawer.classList.contains('collapsed'));
  });

  relmodelResizer.addEventListener('mousedown', (event) => {
    if (mobileMedia.matches) return;
    if (relmodelDrawer.classList.contains('collapsed')) return;
    event.preventDefault();
    relmodelResizer.classList.add('is-dragging');
    document.body.classList.add('is-resizing-drawer');
    window.addEventListener('mousemove', onPointerMove);
    window.addEventListener('mouseup', stopResize);
  });

  window.addEventListener('resize', () => {
    if (!relmodelDrawer.classList.contains('collapsed')) {
      lastOpenWidth = clampDrawerWidth(relmodelDrawer.getBoundingClientRect().width || lastOpenWidth);
      relmodelDrawer.style.width = `${lastOpenWidth}px`;
    }
    syncBackdrop();
    syncQuestPanelRight();
    syncQuestPanelResizer();
  });

  // ---- Quest-Panel Resizer (vertikal, obere Kante) ----
  const questPanelResizer = document.getElementById('quest-panel-resizer');
  const questPanel = document.getElementById('quest-panel');

  syncQuestPanelResizer = () => {
    if (!questPanelResizer || !questPanel) return;
    const isVisible = questPanel.classList.contains('visible');
    questPanelResizer.classList.toggle('visible', isVisible);
    if (isVisible) {
      const h = questPanel.getBoundingClientRect().height;
      questPanelResizer.style.bottom = `${h}px`;
      questPanelResizer.style.right = questPanel.style.right || '0';
    }
  };

  if (questPanelResizer && questPanel) {
    let questPanelStartY = 0;
    let questPanelStartH = 0;

    const stopQuestResize = () => {
      questPanelResizer.classList.remove('is-dragging');
      document.body.classList.remove('is-resizing-drawer');
      window.removeEventListener('mousemove', onQuestPointerMove);
      window.removeEventListener('mouseup', stopQuestResize);
    };

    const onQuestPointerMove = (event) => {
      const delta = questPanelStartY - event.clientY;
      const minH = 180;
      const maxH = window.innerHeight * 0.6;
      const newH = Math.max(minH, Math.min(maxH, questPanelStartH + delta));
      questPanel.style.height = `${newH}px`;
      syncQuestPanelResizer();
    };

    questPanelResizer.addEventListener('mousedown', (event) => {
      if (!questPanel.classList.contains('visible')) return;
      event.preventDefault();
      questPanelStartY = event.clientY;
      questPanelStartH = questPanel.getBoundingClientRect().height;
      questPanelResizer.classList.add('is-dragging');
      document.body.classList.add('is-resizing-drawer');
      window.addEventListener('mousemove', onQuestPointerMove);
      window.addEventListener('mouseup', stopQuestResize);
    });
  }

  // Lade den Resizer-Zustand nach Panel-Rendering
  const _origRenderPanel = window.Quest?.renderPanel?.bind(window.Quest);
  if (_origRenderPanel && window.Quest) {
    window.Quest.renderPanel = function () {
      _origRenderPanel();
      syncQuestPanelResizer();
    };
  }

  relmodelBackdrop.addEventListener('click', () => {
    setDrawerState(false);
  });

  mobileMedia.addEventListener('change', () => {
    setQuestsMenuOpen(false);
    setDrawerState(isDrawerOpen);
  });

  document.addEventListener('click', (event) => {
    if (!questsDropdown.contains(event.target)) {
      setQuestsMenuOpen(false);
    }
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') setQuestsMenuOpen(false);
  });

  // ---- Quest-Button & Item Hinweis-Punkte ----
  (function initQuestDots() {
    function isNotStarted(btn) {
      const mode = btn.dataset.questSeries;
      if (!mode) return false;
      return !localStorage.getItem(window.Quest.getStorageKey(mode));
    }

    function updateQuestDots() {
      const itemButtons = Array.from(
        questsMenu.querySelectorAll('.tab-dropdown-item:not([disabled]):not(.tab-dropdown-item-disabled)'),
      );

      // Item-Dots verwalten
      itemButtons.forEach((btn) => {
        const dot = btn.querySelector('.quest-item-dot');
        if (isNotStarted(btn)) {
          if (!dot) {
            const d = document.createElement('span');
            d.className = 'quest-item-dot';
            d.setAttribute('aria-hidden', 'true');
            btn.appendChild(d);
          }
        } else {
          if (dot) dot.remove();
        }

        // Fortschrittsbalken aktualisieren
        const fortschritt = btn.querySelector('.quest-menu-progress');
        if (fortschritt && window.Quest) {
          const { erledigt, gesamt } = window.Quest.getFortschritt(fortschritt.dataset.mode);
          const fertig = gesamt > 0 && erledigt === gesamt;
          fortschritt.classList.toggle('fertig', fertig);
          fortschritt.querySelector('.quest-menu-progress-fill').style.width = `${(erledigt / (gesamt || 1)) * 100}%`;
          fortschritt.querySelector('.quest-menu-progress-text').textContent = fertig
            ? `✓ ${gesamt} von ${gesamt}`
            : `${erledigt} von ${gesamt}`;
        }
      });

      // Haupt-Button-Dot verwalten
      const anyUnstarted = itemButtons.some(isNotStarted);
      let btnDot = questsToggleBtn.querySelector('.quest-dot');
      if (anyUnstarted) {
        if (!btnDot) {
          btnDot = document.createElement('span');
          btnDot.className = 'quest-dot quest-dot--pulse';
          btnDot.setAttribute('aria-hidden', 'true');
          questsToggleBtn.appendChild(btnDot);

          // Nach 25 Sek. Pulse stoppen, Punkt bleibt statisch
          const pulseTimer = setTimeout(() => {
            if (btnDot) btnDot.classList.remove('quest-dot--pulse');
          }, 25000);

          questsToggleBtn.addEventListener(
            'click',
            () => {
              clearTimeout(pulseTimer);
              if (btnDot) btnDot.classList.remove('quest-dot--pulse');
            },
            { once: true },
          );
        }
      } else {
        if (btnDot) btnDot.remove();
      }
    }

    // Erster Stand; danach beim Öffnen des Menüs und beim Start einer Reihe
    updateQuestDots();

    // Expose for external updates (e.g. when quest progress is reset)
    if (!window.App) window.App = {};
    window.App.updateQuestDots = updateQuestDots;
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

// ER-Modell einer Relationenmodell-Quest: aus files/ oder (eigenes Szenario) aus der Quest selbst
async function loadQuestErm(quest) {
  if (quest?.erm) applyErmPayload(JSON.parse(JSON.stringify(quest.erm)), true);
  else if (quest?.jsonFile) await loadErmFromFile(quest.jsonFile).catch(() => {});
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
  ['info', 'rules', 'impressum', 'datenschutz'].forEach((name) => {
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

  // Drawer öffnen wenn RelModel-Daten aus localStorage geladen wurden
  if (window.RelModel?.hadPersistedData?.()) {
    window.AppTabs?.setDrawerState(true);
  }

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

  // ---- Quest-Menu Event Listeners ----
  const closeQuestDropdownMenu = () => {
    const btn = document.getElementById('btn-quests-toggle');
    const menu = document.getElementById('quests-menu');
    const dropdown = btn?.closest('.tab-dropdown');
    if (!btn || !menu || !dropdown) return;
    dropdown.classList.remove('open');
    menu.hidden = true;
    btn.setAttribute('aria-expanded', 'false');
  };

  // Startet eine Quest-Reihe. Das freie Modell bleibt gespeichert und kommt beim Schließen der Quest zurück.
  async function startQuestSeriesFlow(mode) {
    const reihe = getQuestSeries(mode);
    if (!window.Quest || !reihe) return false;
    closeQuestDropdownMenu();

    // Offene Änderungen sichern: im freien Modus das eigene Modell, sonst den Stand der laufenden Quest
    flushPersist();
    const ausFreiemModus = !window.Quest.state.questsPanelVisible;
    if (ausFreiemModus && (state.nodes.length || window.RelModel?.getStudentRelations?.().length)) {
      window.App?.showTopToast?.(
        'Dein eigenes Modell ist gespeichert – es kommt zurück, wenn du die Quest schließt.',
        7000,
      );
    }
    window.App?.onBeforeQuestChange?.(window.Quest.state);

    if (reihe.art === 'erm') {
      // ERM-Reihen: Relationenmodell auf einem eigenen Übungsplatz, leer zum Start
      window.RelModel?.setPersistKey?.(RELMODEL_ERM_QUEST_KEY);
      window.RelModel?.reset?.();
      window.AppTabs?.setDrawerState?.(false);
    }

    window.Quest.startQuestSeries(mode);

    if (reihe.art === 'rm' && reihe.schritt) {
      // Schritt-Reihe: ein ER-Modell und ein Arbeitsstand für die ganze Reihe
      const workKey = getQuestWorkStorageKey(mode, 1);
      window.RelModel?.setPersistKey?.(workKey);
      try {
        await loadErmFromFile(reihe.ermDatei);
      } catch (err) {
        window.App?.showAlertModal?.('Das ER-Modell konnte nicht geladen werden.', 'Fehler');
        return false;
      }
      if (!window.RelModel?.loadFromStorage?.(workKey)) window.RelModel?.reset?.();
      window.AppTabs?.setDrawerState?.(!window.Quest.getCurrentQuest()?.seitenleisteSelbstOeffnen);
      state.diagramLocked = true;
      window.Quest.renderPanel();
    } else {
      await window.App?.onQuestChanged?.(window.Quest.getCurrentQuest?.(), window.Quest.state);
    }
    return true;
  }

  window.App.startQuestSeries = startQuestSeriesFlow;
  window.App.baueQuestMenu = baueQuestMenu;

  // Ein Listener für das ganze Menü: Reihe starten, eigenes Szenario entfernen, öffnen oder erstellen
  document.getElementById('quests-menu').addEventListener('click', (e) => {
    const entfernen = e.target.closest('[data-szenario-entfernen]');
    const aktion = e.target.closest('[data-szenario-aktion]');
    const reihe = e.target.closest('[data-quest-series]');
    if (entfernen) {
      window.Szenario?.entfernen?.(entfernen.dataset.szenarioEntfernen);
    } else if (aktion) {
      closeQuestDropdownMenu();
      if (aktion.dataset.szenarioAktion === 'oeffnen') window.Szenario?.dateiWaehlen?.();
      else window.Szenario?.dialogOeffnen?.();
    } else if (reihe) {
      e.preventDefault();
      startQuestSeriesFlow(reihe.dataset.questSeries);
    }
  });

  // Quest-Close Button
  const questCloseBtn = document.querySelector('.quest-close-btn');
  if (questCloseBtn) {
    questCloseBtn.addEventListener('click', () => {
      if (window.Quest && window.Quest.hidePanel) {
        window.Quest.hidePanel();
        state.diagramLocked = false;
      }
    });
  }

  // Quest-Reset Button
  const questResetBtn = document.getElementById('btn-quest-reset');
  if (questResetBtn) {
    questResetBtn.addEventListener('click', async () => {
      if (!window.Quest || !window.Quest.resetCurrentSeriesProgress) return;
      const confirmed = await window.App?.showConfirmModal?.(
        'Soll der Fortschritt der aktuellen Quest-Reihe zurückgesetzt werden? Alle bisherigen Arbeitsst\u00e4nde werden gel\u00f6scht.',
        'Quest-Reihe zurücksetzen',
      );
      if (confirmed) {
        const reihe = getQuestSeries();

        window.Quest.resetCurrentSeriesProgress();
        aktiverArbeitsstand = null;

        // Leere/reload Modelle je nach Quest-Reihe
        if (reihe?.art === 'erm') {
          await window.App.onQuestChanged(window.Quest.getCurrentQuest?.(), window.Quest.state);
        } else if (reihe?.schritt) {
          // Relationenmodell-Schritt-Reihe: ERM bleibt, Relationen leeren
          if (window.RelModel) window.RelModel.reset();
        } else if (reihe) {
          // Relationenmodell-Szenario: ERM neu laden und Relationen leeren (SQL-Übung: vorgeben)
          const quest = window.Quest.getCurrentQuest?.();
          if (quest?.jsonFile || quest?.erm) {
            await loadQuestErm(quest);
            relationenmodellNeu(reihe);
            if (window.RelModel?.openDrawer) window.RelModel.openDrawer();
            state.diagramLocked = true;
          }
        }
      }
    });
  }

  // Quest Circle Click Handlers – Bestätigung nur bei noch nicht abgeschlossenen Aufgaben
  const questPanel = document.getElementById('quest-panel');
  if (questPanel) {
    const switchQuestWithGuards = async (questNum) => {
      if (!window.Quest) return false;
      const currentQuestNum = Number(window.Quest.state.currentQuestNumber);
      if (isNaN(questNum) || isNaN(currentQuestNum) || questNum === currentQuestNum) return false;

      const qMode = window.Quest.state?.questMode || '';
      const isCompleted = window.Quest.state.completedQuests.includes(questNum);

      // Abschlussquest einer Schritt-Reihe: erst, wenn alle Aufgaben gelöst sind
      if (window.Quest.getQuestByNumber(qMode, questNum)?.abschluss && !isCompleted) {
        const allPreviousCompleted = window.Quest.getAufgaben(qMode).every((q) =>
          window.Quest.state.completedQuests.includes(q.number),
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

      // Schritt-Reihen bauen aufeinander auf: nur freigeschaltete Aufgaben; Szenarien sind frei wählbar.
      if (!isCompleted && getQuestSeries(qMode)?.schritt && !window.Quest.state.unlockedQuests.includes(questNum)) {
        await window.App?.showAppModal?.({
          title: 'Aufgabe gesperrt',
          message: 'Schließe zuerst die vorherigen Aufgaben ab, bevor du zu dieser Aufgabe springst.',
          mode: 'alert',
          confirmLabel: 'OK',
        });
        return false;
      }

      window.Quest.jumpToQuest(questNum);

      if (window.App?.onQuestChanged) {
        const nextQuest = window.Quest.getQuestByNumber?.(qMode, questNum) || window.Quest.getCurrentQuest?.();
        await window.App.onQuestChanged(nextQuest, window.Quest.state);
      }

      window.Quest.renderPanel();
      return true;
    };

    questPanel.addEventListener('click', async (e) => {
      const manualCheckBtn = e.target.closest('#btn-quest-check-manual');
      if (manualCheckBtn && window.Quest?.validateCurrentQuest) {
        e.preventDefault();
        if (window.App?.isQuestCheckSuppressed?.()) return;
        if (getQuestSeries()?.art === 'rm' && !window.Quest.getCurrentQuest?.()?.seitenleisteSelbstOeffnen) {
          window.RelModel?.openDrawer?.();
          window.RelModel?.triggerCheck?.();
        }
        window.Quest.validateCurrentQuest(true);
        return;
      }

      const manualNextBtn = e.target.closest('#btn-quest-next-manual');
      if (manualNextBtn && window.Quest) {
        e.preventDefault();
        const currentQuestNum = Number(window.Quest.state.currentQuestNumber);
        const qMode = window.Quest.state?.questMode || '';
        const total = window.Quest.getMaxQuests?.(qMode) || 0;
        if (!isNaN(currentQuestNum) && currentQuestNum < total) {
          await switchQuestWithGuards(currentQuestNum + 1);
        }
        return;
      }

      const circle = e.target.closest('.quest-circle');
      if (!circle || !window.Quest) return;
      const questNum = parseInt(circle.getAttribute('data-quest-number'), 10);
      await switchQuestWithGuards(questNum);
    });

    // Direktstart über einen Link: ?reihe=erm-grundlagen&quest=3 (Quest nur, wenn freigeschaltet).
    // setTimeout: erst nach den übrigen DOMContentLoaded-Handlern (z. B. relmodel.js) starten.
    const szenarioAusLink = async () => {
      const hash = window.location.hash;
      if (!hash.startsWith('#szenario=')) return false;
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
      await window.Szenario?.ausLink?.(hash.slice('#szenario='.length));
      return true;
    };
    window.addEventListener('hashchange', szenarioAusLink);

    setTimeout(async function startFromLink() {
      if (await szenarioAusLink()) return;
      const params = new URLSearchParams(window.location.search);
      const reihe = params.get('reihe');
      if (!reihe) return;
      // Parameter entfernen, damit ein Neuladen nicht erneut startet
      window.history.replaceState(null, '', window.location.pathname + window.location.hash);
      if (!getQuestSeries(reihe)) {
        window.App?.showAlertModal?.(
          `Die Quest-Reihe „${reihe}“ gibt es nicht. Wähle eine Reihe unter ⚔️ Quests.`,
          'Unbekannte Quest-Reihe',
        );
        return;
      }
      if (!(await startQuestSeriesFlow(reihe))) return;
      const questNum = parseInt(params.get('quest'), 10);
      if (questNum >= 1 && questNum <= window.Quest.getMaxQuests()) await switchQuestWithGuards(questNum);
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
    document.addEventListener('mouseover', (e) => {
      const t = findTarget(e.target);
      if (t) showTooltipFor(t);
    });

    document.addEventListener('mouseout', (e) => {
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

// ---- Quest Panel Rendering ----
window.App = {
  _suppressQuestCheckUntil: 0,
  _lockWarningCooldownUntil: 0,

  isQuestCheckSuppressed() {
    return Date.now() < this._suppressQuestCheckUntil;
  },

  suppressQuestCheck(ms = 350) {
    this._suppressQuestCheckUntil = Date.now() + ms;
  },

  showLockedWarning() {
    if (Date.now() < this._lockWarningCooldownUntil) return;
    this._lockWarningCooldownUntil = Date.now() + 5000;
    this.showTopToast?.('Das ER-Modell ist während der Quest gesperrt.');
  },

  onRelmodelStudentChanged() {
    const reihe = getQuestSeries();
    if (reihe?.art === 'rm' && !reihe.schritt && window.Quest.state.questsPanelVisible) {
      updateExpertChecklist();
    }
  },

  onBeforeQuestChange(questState) {
    const reihe = getQuestSeries(questState?.questMode);
    if (!reihe || !questState?.questsPanelVisible) return;
    const storageKey = getQuestWorkStorageKey(reihe.id, questState.currentQuestNumber || 1);

    if (reihe.art === 'erm') {
      saveErmSnapshot(storageKey);
      return;
    }

    if (window.RelModel?.setPersistKey) window.RelModel.setPersistKey(storageKey);
    if (window.RelModel?.saveToStorage) window.RelModel.saveToStorage(storageKey);
  },

  // Quest schließen: ihren Stand sichern und das freie Modell (ER- und Relationenmodell) zurückholen
  onQuestPanelClosing(questState) {
    const reihe = getQuestSeries(questState?.questMode);
    if (!reihe) return;
    const storageKey = getQuestWorkStorageKey(reihe.id, questState.currentQuestNumber || 1);
    if (reihe.art === 'erm') saveErmSnapshot(storageKey);
    else window.RelModel?.saveToStorage?.(storageKey);

    if (!loadPersistedState()) {
      applyErmPayload({ nodes: [], edges: [], nextId: 1, diagramTitle: '', snapToGrid: state.snapToGrid }, false);
    }
    window.RelModel?.setPersistKey?.(RELMODEL_PERSIST_KEY);
    if (!window.RelModel?.loadFromStorage?.()) window.RelModel?.reset?.();
  },

  async onQuestChanged(quest, questState) {
    const reihe = getQuestSeries(questState?.questMode);
    if (!reihe) return;
    const questNumber = Number(quest?.number || questState?.currentQuestNumber || 1);
    const storageKey = getQuestWorkStorageKey(reihe.id, questNumber);

    if (reihe.art === 'erm') {
      // Schritt-Reihen teilen ein Modell: Beim Weiterschalten bleibt es stehen (Auswahl und Ansicht auch)
      const geladen = storageKey === aktiverArbeitsstand || loadErmSnapshot(storageKey);
      if (!geladen && !(await loadStartModel(reihe))) clearDiagramSilent();
      aktiverArbeitsstand = storageKey;
      // Den Kardinalitäten-Modus legt die Quest bzw. Reihe fest (ERM-Grundlagen: ohne)
      state.kardinalitaeten = quest?.kardinalitaeten ?? reihe.kardinalitaeten ?? true;
      syncCardinalitySwitch();
      if (window.Diagram) window.Diagram.renderAll();
      if (!geladen) {
        if (!reihe.schritt) applySzenarioTitle(reihe, quest);
        saveErmSnapshot(storageKey);
      }
      state.diagramLocked = false;
      return;
    }

    if (window.RelModel?.setPersistKey) window.RelModel.setPersistKey(storageKey);
    if (reihe.schritt) {
      state.diagramLocked = true;
      return;
    }

    await loadQuestErm(quest);

    const loaded = window.RelModel?.loadFromStorage?.(storageKey);
    if (!loaded) relationenmodellNeu(reihe);
    if (window.RelModel?.openDrawer) window.RelModel.openDrawer();
    state.diagramLocked = true;
    // Checkliste nach Laden des gespeicherten Arbeitsstands neu rendern
    window.Quest?.renderPanel?.();
  },

  updateQuestPanel(quest, questState) {
    syncCardinalitySwitch();
    if (!quest) return;

    const panel = document.getElementById('quest-panel');
    if (!panel) return;

    const mode = questState.questMode;
    const reihe = getQuestSeries(mode);
    const isSchritt = !!reihe?.schritt;
    const isRelmodelSzenario = reihe?.art === 'rm' && !isSchritt;
    const hasChecklist = !isSchritt;

    // Titel & Fortschritt (die Abschlussquest einer Schritt-Reihe zählt nicht)
    const titleEl = panel.querySelector('#quest-title');
    const progressEl = panel.querySelector('#quest-progress');
    const total = window.Quest?.getMaxQuests?.(mode) || 9;
    const aufgaben = window.Quest?.getAufgaben?.(mode) || [];
    const effectiveTotal = Math.max(1, aufgaben.length);
    const completedCount = aufgaben.filter((q) => (questState.completedQuests || []).includes(q.number)).length;
    if (titleEl) {
      titleEl.textContent = `${quest.number}. ${quest.title}`;
      // Quests ohne Kardinalitäten sind schon im Titel gekennzeichnet
      if ((quest.kardinalitaeten ?? reihe?.kardinalitaeten) === false)
        titleEl.insertAdjacentHTML('beforeend', ' <span class="quest-title-badge">ohne Kardinalitäten</span>');
    }
    if (progressEl) progressEl.textContent = `${completedCount} / ${effectiveTotal}`;

    // Update Progress Bar (based on completed quests excluding final)
    const progressFill = panel.querySelector('#quest-progress-fill');
    if (progressFill) progressFill.style.width = (completedCount / effectiveTotal) * 100 + '%';

    // Update Progress Circles – alle klickbar
    const circlesContainer = panel.querySelector('#quest-circles');
    if (circlesContainer) {
      circlesContainer.innerHTML = '';
      const completedSet = new Set((questState.completedQuests || []).map((n) => Number(n)));
      const nextPending = Array.from({ length: total }, (_, idx) => idx + 1).find((n) => !completedSet.has(n)) || null;
      for (let i = 1; i <= total; i++) {
        const circle = document.createElement('div');
        circle.className = 'quest-circle';
        circle.setAttribute('data-quest-number', i);
        circle.textContent = i;
        const qTitle = window.Quest?.getQuestByNumber?.(mode, i)?.title || `Aufgabe ${i}`;
        circle.setAttribute('data-tooltip', qTitle);
        if (!circle.hasAttribute('aria-label')) circle.setAttribute('aria-label', qTitle);
        if (i === quest.number) circle.classList.add('current');
        else if (questState.completedQuests.includes(i)) circle.classList.add('completed');
        else if (nextPending !== null && i === nextPending) circle.classList.add('up-next');
        circlesContainer.appendChild(circle);
      }
    }

    // Update Content (nur Aufgabentext, kein Feedback)
    const content = document.getElementById('quest-content');
    if (content) {
      content.innerHTML = '';

      const taskSection = document.createElement('div');
      taskSection.className = 'quest-section quest-task';
      const taskHeader = document.createElement('h4');
      taskHeader.textContent = isSchritt || isRelmodelSzenario ? '🎯 Aufgabe' : '🎯 Szenario';
      taskSection.appendChild(taskHeader);
      const taskContent = document.createElement('div');
      const rawTaskHtml = isSchritt ? quest.objective : quest.szenario;
      const taskHtml = isSchritt
        ? String(rawTaskHtml || '').replace(/^\s*<p>\s*Aufgabe\s*:\s*<\/p>\s*/i, '')
        : rawTaskHtml;
      taskContent.innerHTML = taskHtml;
      taskSection.appendChild(taskContent);
      // ERM-Szenarien: Wörter anklicken, die zum ER-Modell gehören, werden farbig markiert
      if (quest.masterlösung && !isSchritt) {
        window.Quest.textmarker(taskContent, quest.masterlösung, `${mode}:${quest.number}`, taskHeader);
      }

      // Experten (ERM + Relmodel): Wrapper für Side-by-Side-Layout
      let questBody;
      if (hasChecklist) {
        questBody = document.createElement('div');
        questBody.className = 'quest-body-row';
        questBody.appendChild(taskSection);
        content.appendChild(questBody);
      } else {
        content.appendChild(taskSection);
      }

      // Checkliste (rechts neben dem Text)
      if (hasChecklist) {
        const checklist = window.Quest?.getChecklistStatus?.();
        if (checklist) {
          const checklistSection = document.createElement('div');
          checklistSection.className = 'quest-checklist';
          checklistSection.id = 'quest-checklist';

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
            row.className = 'quest-checklist-item';
            row.setAttribute('data-checklist-key', cat.key);
            const allDone = cat.data.done === cat.data.total;
            if (allDone) row.classList.add('quest-checklist-item--done');
            const icon = document.createElement('span');
            icon.className = 'quest-checklist-icon';
            icon.textContent = allDone ? '✓' : '✗';
            const label = document.createElement('span');
            label.className = 'quest-checklist-label';
            label.textContent = `${cat.label} (${cat.data.done}/${cat.data.total})`;
            row.appendChild(icon);
            row.appendChild(label);
            checklistSection.appendChild(row);
          }

          questBody.appendChild(checklistSection);
        }
      }

      const actions = document.createElement('div');
      actions.className = 'quest-actions quest-actions-visible';

      const checkBtn = document.createElement('button');
      checkBtn.id = 'btn-quest-check-manual';
      checkBtn.type = 'button';
      checkBtn.className = 'quest-btn quest-btn-check';
      checkBtn.textContent = quest.abschluss ? 'Abschließen' : 'Überprüfen';

      actions.appendChild(checkBtn);

      // Lehrkraft probiert ihr eigenes Szenario aus: zurück in den Dialog
      if (window.Szenario?.istProbe?.(mode)) {
        const zurueck = document.createElement('button');
        zurueck.type = 'button';
        zurueck.className = 'quest-btn quest-btn-menu';
        zurueck.textContent = '✎ Zurück zum Bearbeiten';
        zurueck.addEventListener('click', () => window.Szenario.zurueckZumBearbeiten());
        actions.appendChild(zurueck);
      }

      const isCurrentCompleted = (questState.completedQuests || []).includes(quest.number);
      if (isRelmodelSzenario && isCurrentCompleted && quest.number < total) {
        const nextBtn = document.createElement('button');
        nextBtn.id = 'btn-quest-next-manual';
        nextBtn.type = 'button';
        nextBtn.className = 'quest-btn quest-btn-menu';
        nextBtn.textContent = 'Nächste Aufgabe';
        actions.appendChild(nextBtn);
      }

      content.appendChild(actions);
    }

    // Untere Feedback-Leiste ist deaktiviert.
    const feedback = document.getElementById('quest-feedback');
    if (feedback) {
      feedback.textContent = '';
      feedback.className = 'quest-feedback';
    }
  },

  // Alle Szenarien einer Übungsreihe gelöst
  showSeriesDone(reihe) {
    this.playFullscreenConfetti();
    return this.showAppModal({
      title: `🎉 ${reihe.titel} geschafft!`,
      message: `Glückwunsch! ${reihe.abschlussText || ''}`,
      mode: 'alert',
      confirmLabel: 'Super!',
    });
  },

  showQuestFeedback(message, type = 'progress') {
    const feedback = document.getElementById('quest-feedback');
    if (feedback) {
      // Leiste bleibt bewusst leer/unsichtbar.
      void message;
      void type;
      feedback.textContent = '';
      feedback.className = `quest-feedback ${type}`;
    }
  },

  showQuestSuccessModal(questNumber, onComplete) {
    const modal = document.getElementById('quest-success-modal');
    if (!modal) {
      onComplete?.();
      return;
    }

    const titleEl = modal.querySelector('.quest-success-title');
    const barFill = modal.querySelector('.quest-success-bar-fill');
    let okBtn = modal.querySelector('.quest-success-ok-btn');
    const previousActiveElement = document.activeElement;

    if (titleEl) titleEl.textContent = `Aufgabe ${questNumber} geschafft!`;

    // Fokus vom Hintergrund lösen, damit Enter nicht an darunterliegende Buttons weitergereicht wird.
    if (previousActiveElement && typeof previousActiveElement.blur === 'function') {
      previousActiveElement.blur();
    }

    modal.style.display = 'flex';
    modal.setAttribute('tabindex', '-1');
    this.spawnQuestConfetti(modal.querySelector('.quest-success-card'));

    // Ensure gradient is anchored to the full track so it is revealed while the fill grows
    if (barFill) {
      barFill.classList.add('quest-success-gradient');

      const startBarAnimation = () => {
        const barTrack = modal.querySelector('.quest-success-bar-track');
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
    // Optional: Zeige die Theorie/Info-Box in der Erfolgs-Modalität (nur Grundlagen).
    try {
      // Immer alte Box entfernen, damit beim Wechsel von Grundlagen -> Experten nichts "hängen bleibt".
      const existing = modal.querySelector('.quest-success-concept');
      if (existing) existing.remove();

      const currentQuest = window.Quest?.getCurrentQuest?.();
      const theoryHtml = getQuestSeries()?.schritt ? currentQuest?.theory || '' : '';
      if (theoryHtml) {
        const conceptDiv = document.createElement('div');
        conceptDiv.className = 'quest-concept quest-success-concept';
        conceptDiv.innerHTML = theoryHtml;
        const barTrack = modal.querySelector('.quest-success-bar-track');
        if (barTrack) modal.querySelector('.quest-success-card').insertBefore(conceptDiv, barTrack);
        else modal.querySelector('.quest-success-card').appendChild(conceptDiv);
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
      this.suppressQuestCheck(350);

      // Nach dem Schließen den Check-Button explizit unscharf halten.
      requestAnimationFrame(() => {
        const checkBtn = document.getElementById('btn-quest-check-manual');
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

  spawnQuestConfetti(containerEl) {
    if (!containerEl) return;

    const oldLayer = containerEl.querySelector('.quest-confetti-layer');
    if (oldLayer) oldLayer.remove();

    const layer = document.createElement('div');
    layer.className = 'quest-confetti-layer';

    const colors = ['#38bdf8', '#22c55e', '#f59e0b', '#a78bfa', '#f472b6', '#fde047'];
    const pieces = 28;

    for (let i = 0; i < pieces; i += 1) {
      const piece = document.createElement('span');
      piece.className = 'quest-confetti-piece';
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
    const existing = document.querySelector('.quest-confetti-fullscreen');
    if (existing) existing.remove();

    const layer = document.createElement('div');
    layer.className = 'quest-confetti-fullscreen';

    const colors = ['#38bdf8', '#22c55e', '#f59e0b', '#a78bfa', '#f472b6', '#fde047'];
    const pieces = 130;

    for (let i = 0; i < pieces; i += 1) {
      const piece = document.createElement('span');
      piece.className = 'quest-confetti-piece quest-confetti-piece-screen';
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
    const hints = window.Quest?.getHints?.() || [];
    const singleHint = hints.length > 0 ? hints[0] : String(hintMessage || 'Kein zusätzlicher Hinweis verfügbar.');

    // Bei Szenario-Quests (ERM + Relationenmodell) soll keine Hinweisbox angezeigt werden.
    const showHintButton = !!getQuestSeries()?.schritt;

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
    const modal = document.querySelector('.quest-congratulations-modal');
    if (modal) {
      if (this._congratsTimer) {
        clearTimeout(this._congratsTimer);
        this._congratsTimer = null;
      }

      const content = modal.querySelector('.quest-congratulations-content');
      if (content) {
        const h2 = content.querySelector('h2');
        const p = content.querySelector('p');
        const btnContainer = content.querySelector('.quest-congratulations-buttons');

        if (h2) h2.textContent = title;
        if (p) p.textContent = message;

        if (btnContainer) {
          btnContainer.innerHTML = '';
          buttons.forEach((btn) => {
            const button = document.createElement('button');
            button.className = btn.addClass || 'quest-btn-next';
            button.textContent = btn.label;
            button.onclick = btn.onClick;
            btnContainer.appendChild(button);
          });
        }
      }

      modal.classList.add('visible');
      this.spawnQuestConfetti(content || modal);
      this._congratsTimer = setTimeout(() => {
        modal.classList.remove('visible');
        this._congratsTimer = null;
      }, 3000);
    }
  },

  hideCongratulationsModal() {
    const modal = document.querySelector('.quest-congratulations-modal');
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
