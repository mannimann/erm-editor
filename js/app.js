/* ============================================================
   app.js  –  Zentraler Zustand & Controller
   ============================================================ */
'use strict';

// ---- Globaler App-Zustand ----
const state = {
  notation: 'chen',
  snapToGrid: true,
  diagramTitle: 'er-diagramm',
  nodes: [], // { id, type, x, y, name, isPrimaryKey }
  edges: [], // { id, fromId, toId, edgeType, chenFrom, chenTo }
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
function getEdgeById(id) {
  return state.edges.find((e) => e.id === id) || null;
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
  const safe = (rawTitle || 'er-diagramm')
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, '_')
    .replace(/\.+$/g, '')
    .slice(0, 80);
  return safe || 'er-diagramm';
}

function buildPersistPayload() {
  return {
    notation: state.notation,
    snapToGrid: !!state.snapToGrid,
    diagramTitle: state.diagramTitle,
    nodes: state.nodes,
    edges: state.edges,
    nextId: state.nextId,
  };
}

const QUEST_WORK_PREFIX = 'erm-editor-quest-work-v1';

function getQuestWorkStorageKey(mode, questNumber) {
  const q = Number(questNumber) || 1;
  if (mode === 'grundlagen') return `${QUEST_WORK_PREFIX}:erm:grundlagen`;
  if (mode === 'experten') return `${QUEST_WORK_PREFIX}:erm:experten:q${q}`;
  if (mode === 'relmodel-grundlagen') return `${QUEST_WORK_PREFIX}:relmodel:grundlagen`;
  if (mode === 'relmodel-experten') return `${QUEST_WORK_PREFIX}:relmodel:experten:q${q}`;
  return null;
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
  state.notation = 'chen';
  state.snapToGrid = !!data.snapToGrid;
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

let _persistTimer = null;
function persistStateDebounced(delay = 260) {
  if (_persistTimer) clearTimeout(_persistTimer);
  _persistTimer = setTimeout(() => {
    _persistTimer = null;
    persistStateNow();

    const qMode = window.Quest?.state?.questMode || '';
    if (qMode === 'grundlagen' || qMode === 'experten') {
      const qNumber = window.Quest?.state?.currentQuestNumber || 1;
      saveErmSnapshot(getQuestWorkStorageKey(qMode, qNumber));
    }

    // Live-Checkliste aktualisieren, wenn Experten-Quest aktiv ist
    if (window.Quest?.state?.questMode === 'experten' && window.Quest?.state?.questsPanelVisible) {
      updateExpertChecklist();
    }
  }, delay);
}

/** Aktualisiert nur die Checklisten-Einträge in-place (ohne volles Panel-Rerender). */
function updateExpertChecklist() {
  const checklistEl = document.getElementById('quest-checklist');
  if (!checklistEl || !window.Quest?.getChecklistStatus) return;

  const checklist = window.Quest.getChecklistStatus();
  if (!checklist) return;

  const mapping = {
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
  };

  for (const [key, data] of Object.entries(mapping)) {
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
    if (label) label.textContent = `${labels[key]} (${data.done}/${data.total})`;
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
        const cardinality = edge.toId === node.id ? edge.chenTo || '1' : edge.chenFrom || '1';
        return {
          nodeId: relatedNode.id,
          nodeType: relatedNode.type,
          label: `${relatedNode.name || 'Beziehung'} (${String(cardinality).toLowerCase()})`,
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
        const cardinality = edge.fromId === node.id ? edge.chenTo || '1' : edge.chenFrom || '1';
        return {
          nodeId: relatedNode.id,
          nodeType: relatedNode.type,
          label: `${relatedNode.name || 'Entitätsklasse'} (${String(cardinality).toLowerCase()})`,
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
      // Trigger Quest-Validierung wenn Drawer während relmodel-grundlagen geöffnet wird
      if (window.Quest?.state?.questMode === 'relmodel-grundlagen' && window.Quest?.state?.questsPanelVisible) {
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

  // ---- Quest-Button & Item Hinweis-Punkte ----
  (function initQuestDots() {
    function isNotStarted(btn) {
      const mode = btn.dataset.questSeries;
      if (!mode) return false;
      const version = mode === 'experten' ? 'v4' : 'v1';
      const key = 'erm-editor-quests-' + mode + '-' + version;
      return !localStorage.getItem(key);
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

        // Fortschritt-Badge aktualisieren
        const badge = btn.querySelector('.quest-progress-badge');
        if (badge && window.Quest) {
          const mode = badge.getAttribute('data-mode');
          if (mode) {
            const maxQuests = window.Quest.getMaxQuests?.(mode) || 0;
            const storageKey = `erm-editor-quests-${mode === 'relmodel-grundlagen' ? 'relmodel-grundlagen' : mode === 'relmodel-experten' ? 'relmodel-experten' : mode}-v${mode === 'experten' ? '4' : mode === 'relmodel-grundlagen' ? '1' : mode === 'relmodel-experten' ? '1' : '1'}`;
            let completedCount = 0;
            try {
              const saved = localStorage.getItem(storageKey);
              if (saved) {
                const data = JSON.parse(saved);
                completedCount = (data.completedQuests || []).filter((n) => Number(n) < maxQuests).length || 0;
              }
            } catch (_) {}
            const effectiveTotal = Math.max(1, maxQuests - 1);
            badge.textContent = `(${completedCount}/${effectiveTotal})`;
            badge.style.display = effectiveTotal > 0 ? 'inline' : 'none';
          }
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

    // Initial render + attach click handlers so dots update on user interaction
    updateQuestDots();

    const itemButtons = Array.from(
      questsMenu.querySelectorAll('.tab-dropdown-item:not([disabled]):not(.tab-dropdown-item-disabled)'),
    );
    itemButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const dot = btn.querySelector('.quest-item-dot');
        if (dot) dot.remove();
        updateQuestDots();
      });
    });

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

  renderRelatedInfo(node);
}

function clearSelection() {
  _selectedNodeId = null;
  document.getElementById('prop-empty').style.display = '';
  document.getElementById('prop-node').style.display = 'none';
  document.getElementById('prop-related-row').style.display = 'none';
  document.getElementById('prop-relationships-row').style.display = 'none';
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

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  state.nodes.forEach((node) => {
    let w = 0;
    let h = 0;
    if (node.type === 'entity') {
      w = 140;
      h = 50;
    } else if (node.type === 'attribute') {
      w = 120;
      h = 52;
    } else {
      w = 130;
      h = 60;
    }
    minX = Math.min(minX, node.x);
    minY = Math.min(minY, node.y);
    maxX = Math.max(maxX, node.x + w);
    maxY = Math.max(maxY, node.y + h);
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
  clearSelection();
  if (window.Diagram) window.Diagram.renderAll();
  if (window.RelModel) window.RelModel.reset();
  persistStateDebounced();
}

function clearDiagramSilent() {
  state.nodes = [];
  state.edges = [];
  state.nextId = 1;
  clearSelection();
  if (window.Diagram) window.Diagram.renderAll();
  if (window.RelModel) window.RelModel.reset();
  persistStateDebounced();
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
  state.notation = 'chen';
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
  ['info', 'rules'].forEach((name) => {
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
    }
  });

  document.getElementById('btn-export-json').addEventListener('click', exportJSON);
  document.getElementById('btn-export-png').addEventListener('click', exportPNG);
  document.getElementById('btn-clear').addEventListener('click', () => {
    if (state.diagramLocked) {
      window.App?.showLockedWarning?.();
      return;
    }
    clearAll();
  });

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

  const grundlagenBtn = document.querySelector('[data-quest-series="grundlagen"]');
  const expertenBtn = document.querySelector('[data-quest-series="experten"]');

  async function startQuestWithConfirm(mode) {
    if (!window.Quest) return;
    const title = mode === 'experten' ? 'Expertenquests starten' : 'Grundlagenquests starten';
    const decision = await window.App?.showAppModal?.({
      title,
      message:
        'Die Quest-Reihe wird gestartet. Alle bisher angezeigten Modelle werden gelöscht. Falls vorhanden, wird dein letzter Arbeitsstand automatisch geladen.',
      mode: 'confirm',
      confirmLabel: 'Starten',
      cancelLabel: 'Abbrechen',
    });
    if (!decision) return;

    window.App?.onBeforeQuestChange?.(window.Quest.state);
    window.Quest.startQuestSeries(mode);
    const quest = window.Quest.getCurrentQuest?.();
    await window.App?.onQuestChanged?.(quest, window.Quest.state);
    closeQuestDropdownMenu();
  }

  if (grundlagenBtn) {
    grundlagenBtn.addEventListener('click', (e) => {
      e.preventDefault();
      startQuestWithConfirm('grundlagen');
    });
  }

  if (expertenBtn) {
    expertenBtn.addEventListener('click', (e) => {
      e.preventDefault();
      startQuestWithConfirm('experten');
    });
  }

  // Relmodel-Grundlagen: ERM laden und Quest starten
  const relmodelQuestBtn = document.getElementById('btn-start-relmodel');
  if (relmodelQuestBtn) {
    relmodelQuestBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      if (!window.Quest) return;
      const decision = await window.App?.showAppModal?.({
        title: 'Relationenmodell – Grundlagen',
        message:
          'Die Quest-Reihe wird gestartet. Alle bisher angezeigten Modelle werden gelöscht. Falls vorhanden, wird dein letzter Arbeitsstand automatisch geladen.',
        mode: 'confirm',
        confirmLabel: 'Starten',
        cancelLabel: 'Abbrechen',
      });
      if (!decision) return;
      closeQuestDropdownMenu();

      window.App?.onBeforeQuestChange?.(window.Quest.state);
      window.Quest.startQuestSeries('relmodel-grundlagen');

      const relmodelKey = getQuestWorkStorageKey('relmodel-grundlagen', 1);
      if (window.RelModel?.setPersistKey) window.RelModel.setPersistKey(relmodelKey);
      try {
        await loadErmFromFile('00_schule.json');
      } catch (err) {
        window.App?.showAlertModal?.('Das ER-Modell konnte nicht geladen werden.', 'Fehler');
        return;
      }
      if (!window.RelModel?.loadFromStorage?.(relmodelKey) && window.RelModel) {
        window.RelModel.reset();
      }
      if (window.AppTabs?.setDrawerState) window.AppTabs.setDrawerState(false);
      state.diagramLocked = true;
      window.Quest.renderPanel();
    });
  }

  // Relmodel-Experten: Quest starten (Modal nur bei nicht-leerem Diagramm)
  const relmodelExpertenBtn = document.getElementById('btn-start-relmodel-experten');
  if (relmodelExpertenBtn) {
    relmodelExpertenBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      if (!window.Quest) return;
      const decision = await window.App?.showAppModal?.({
        title: 'Relationenmodell – Experten',
        message:
          'Die Quest-Reihe wird gestartet. Alle bisher angezeigten Modelle werden gelöscht. Falls vorhanden, wird der letzte Arbeitsstand der aktuellen Aufgabe automatisch geladen.',
        mode: 'confirm',
        confirmLabel: 'Starten',
        cancelLabel: 'Abbrechen',
      });
      if (!decision) return;
      closeQuestDropdownMenu();

      window.App?.onBeforeQuestChange?.(window.Quest.state);
      window.Quest.startQuestSeries('relmodel-experten');
      const firstQuest = window.Quest.getCurrentQuest?.();
      await window.App?.onQuestChanged?.(firstQuest, window.Quest.state);
    });
  }

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
        const qMode = window.Quest.state?.questMode || '';

        window.Quest.resetCurrentSeriesProgress();

        // Leere/reload Modelle je nach Quest-Modus
        if (qMode === 'grundlagen' || qMode === 'experten') {
          // Leere ERM-Diagramm für Grundlagen und Experten
          clearDiagramSilent();
        } else if (qMode === 'relmodel-grundlagen') {
          // Leere Relationenmodell für Relmodel-Grundlagen
          if (window.RelModel) window.RelModel.reset();
        } else if (qMode === 'relmodel-experten') {
          // Reload ERM und leere Relationenmodell für Relmodel-Experten
          const quest = window.Quest.getCurrentQuest?.();
          if (quest?.jsonFile) {
            try {
              await loadErmFromFile(quest.jsonFile);
            } catch (_) {}
            if (window.RelModel) window.RelModel.reset();
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
      const maxQuests = window.Quest.getMaxQuests?.(qMode) || 0;

      // Letzte Aufgabe: Kann nur gestartet werden, wenn alle Vorgänger abgeschlossen sind
      if (questNum === maxQuests && !isCompleted) {
        const allPreviousCompleted = Array.from({ length: maxQuests - 1 }, (_, i) => i + 1).every((n) =>
          window.Quest.state.completedQuests.includes(n),
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

      if (!isCompleted && qMode !== 'relmodel-experten' && qMode !== 'experten') {
        const isGrundlagen = qMode === 'grundlagen' || qMode === 'relmodel-grundlagen';
        if (isGrundlagen && !window.Quest.state.unlockedQuests.includes(questNum)) {
          await window.App?.showAppModal?.({
            title: 'Aufgabe gesperrt',
            message: 'Schließe zuerst die vorherigen Aufgaben ab, bevor du zu dieser Aufgabe springst.',
            mode: 'alert',
            confirmLabel: 'OK',
          });
          return false;
        }
        if (!isGrundlagen) {
          const solvedNumbers = window.Quest.state.completedQuests
            .map((n) => Number(n))
            .filter((n) => Number.isFinite(n));
          const lastSolvedQuest = solvedNumbers.length > 0 ? Math.max(...solvedNumbers) : 0;
          const skippedCount = Math.max(0, questNum - lastSolvedQuest - 1);
          if (skippedCount > 0) {
            const confirmed = await window.App?.showConfirmModal?.(
              `Zu Aufgabe ${questNum} springen? Dabei werden ${skippedCount} Aufgabe(n) übersprungen.`,
              'Aufgabe wechseln',
            );
            if (!confirmed) return false;
          }
        }
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
        const qMode = window.Quest.state?.questMode || '';
        if (qMode.startsWith('relmodel-')) {
          if (window.RelModel?.openDrawer) window.RelModel.openDrawer();
          if (window.RelModel?.triggerCheck) window.RelModel.triggerCheck();
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
      content.innerHTML = text;
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

  onBeforeQuestChange(questState) {
    const mode = questState?.questMode || '';
    const currentNumber = Number(questState?.currentQuestNumber || 1);
    const storageKey = getQuestWorkStorageKey(mode, currentNumber);
    if (!storageKey) return;

    if (mode === 'grundlagen' || mode === 'experten') {
      saveErmSnapshot(storageKey);
      return;
    }

    if (mode === 'relmodel-grundlagen' || mode === 'relmodel-experten') {
      if (window.RelModel?.setPersistKey) window.RelModel.setPersistKey(storageKey);
      if (window.RelModel?.saveToStorage) window.RelModel.saveToStorage(storageKey);
    }
  },

  async onQuestChanged(quest, questState) {
    const mode = questState?.questMode || '';
    const questNumber = Number(quest?.number || questState?.currentQuestNumber || 1);
    const storageKey = getQuestWorkStorageKey(mode, questNumber);

    if (mode === 'grundlagen') {
      if (!loadErmSnapshot(storageKey)) {
        try {
          await loadErmFromFile('00_schule.json');
        } catch (_) {
          clearDiagramSilent();
        }
        saveErmSnapshot(storageKey);
      }
      state.diagramLocked = false;
      return;
    }

    if (mode === 'experten') {
      if (!loadErmSnapshot(storageKey)) {
        clearDiagramSilent();
        saveErmSnapshot(storageKey);
      }
      state.diagramLocked = false;
      return;
    }

    if (mode === 'relmodel-experten') {
      if (window.RelModel?.setPersistKey) window.RelModel.setPersistKey(storageKey);
      if (quest?.jsonFile) {
        try {
          await loadErmFromFile(quest.jsonFile);
        } catch (_) {}
      }

      const loaded = window.RelModel?.loadFromStorage?.(storageKey);
      if (!loaded && window.RelModel) window.RelModel.reset();
      if (window.RelModel?.openDrawer) window.RelModel.openDrawer();
      state.diagramLocked = true;
      return;
    }

    if (mode === 'relmodel-grundlagen' && storageKey) {
      if (window.RelModel?.setPersistKey) window.RelModel.setPersistKey(storageKey);
      state.diagramLocked = true;
    }
  },

  updateQuestPanel(quest, questState) {
    if (!quest) return;

    const panel = document.getElementById('quest-panel');
    if (!panel) return;

    const mode = questState.questMode;
    const isGrundlagen = mode === 'grundlagen' || mode === 'relmodel-grundlagen';
    const isRelmodel = mode === 'relmodel-grundlagen' || mode === 'relmodel-experten';
    const isErmExperten = mode === 'experten';
    const isRelmodelExperten = mode === 'relmodel-experten';
    const hasChecklist = isErmExperten;

    // Update Title & Progress (count completed quests, exclude final completion task)
    const titleEl = panel.querySelector('#quest-title');
    const progressEl = panel.querySelector('#quest-progress');
    const total = window.Quest?.getMaxQuests?.(mode) || 9;
    const effectiveTotal = Math.max(1, total - 1);
    const completedCount = (questState.completedQuests || []).filter((n) => Number(n) < total).length || 0;
    if (titleEl) titleEl.textContent = `${quest.number}. ${quest.title}`;
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
      taskHeader.textContent = isGrundlagen || isRelmodelExperten ? '🎯 Aufgabe' : '🎯 Szenario';
      taskSection.appendChild(taskHeader);
      const taskContent = document.createElement('div');
      const rawTaskHtml = isGrundlagen ? quest.objective : quest.szenario;
      const taskHtml = isGrundlagen
        ? String(rawTaskHtml || '').replace(/^\s*<p>\s*Aufgabe\s*:\s*<\/p>\s*/i, '')
        : rawTaskHtml;
      taskContent.innerHTML = taskHtml;
      taskSection.appendChild(taskContent);

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
          if (isRelmodelExperten) {
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
      checkBtn.textContent = quest.number === total ? 'Abschließen' : 'Überprüfen';

      actions.appendChild(checkBtn);

      const isCurrentCompleted = (questState.completedQuests || []).includes(quest.number);
      if (isRelmodelExperten && isCurrentCompleted && quest.number < total) {
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
      const questMode = window.Quest?.state?.questMode || '';
      const isAnyGrundlagen = questMode === 'grundlagen' || questMode === 'relmodel-grundlagen';
      const theoryHtml = isAnyGrundlagen ? currentQuest?.theory || '' : '';
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

    // Bei Experten-Quests (ERM + Relmodel) soll keine Hinweisbox angezeigt werden.
    const questMode = window.Quest?.state?.questMode || '';
    const showHintButton = questMode === 'grundlagen' || questMode === 'relmodel-grundlagen';

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

  showTopToast(message) {
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
    }, 2400);
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
  genId,
  getNodeById,
  getEdgeById,
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
