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
    if (!Array.isArray(data.nodes) || !Array.isArray(data.edges)) return false;

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
    return true;
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
      questPanel.style.right = `${drawerWidth}px`;
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
      if (!Array.isArray(data.nodes) || !Array.isArray(data.edges)) throw new Error('Ungültiges Format');
      state.nodes = data.nodes;
      state.edges = data.edges;
      state.nextId =
        data.nextId ||
        Math.max(
          0,
          ...data.nodes.map((n) => parseInt(n.id.slice(1)) || 0),
          ...data.edges.map((ed) => parseInt(ed.id.slice(1)) || 0),
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
      persistStateDebounced();
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
  document.getElementById('btn-clear').addEventListener('click', clearAll);

  const titleInput = document.getElementById('erm-title-input');
  if (titleInput) {
    let titleValueBeforeEdit = state.diagramTitle || '';
    titleInput.value = state.diagramTitle || '';
    titleInput.addEventListener('focus', () => {
      titleValueBeforeEdit = state.diagramTitle || '';
    });
    titleInput.addEventListener('input', (e) => {
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

  document.getElementById('btn-import').addEventListener('click', () => {
    document.getElementById('file-input').click();
  });
  document.getElementById('file-input').addEventListener('change', (e) => {
    if (e.target.files[0]) {
      importJSON(e.target.files[0]);
      e.target.value = '';
    }
  });

  // ---- Quest-Menu Event Listeners ----
  const grundlagenBtn = document.querySelector('[data-quest-series="grundlagen"]');
  const expertenBtn = document.querySelector('[data-quest-series="experten"]');

  async function startQuestWithConfirm(mode) {
    if (!window.Quest) return;
    if (state.nodes.length > 0) {
      const decision = await window.App?.showAppModal?.({
        title: 'Quest starten',
        message: 'Soll das aktuelle ER-Modell gelöscht werden?',
        mode: 'confirm',
        confirmLabel: 'Mit Löschen starten',
        cancelLabel: 'Abbrechen',
        extraLabel: 'Ohne Löschen starten',
        extraVariant: 'primary',
        buttonOrder: ['cancel', 'extra', 'confirm'],
      });

      if (decision === false) return;
      if (decision === true) {
        clearDiagramSilent();
      }
    }
    window.Quest.startQuestSeries(mode);
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

  // Coming-soon Eintrag – nur Info-Modal zeigen
  const relmodelQuestBtn = document.getElementById('btn-start-relmodel');
  if (relmodelQuestBtn) {
    relmodelQuestBtn.addEventListener('click', (e) => {
      e.preventDefault();
      window.App?.showAlertModal?.('Diese Quest-Reihe ist noch in Arbeit und wird bald verfügbar sein.', 'Coming soon');
    });
  }

  // Quest-Close Button
  const questCloseBtn = document.querySelector('.quest-close-btn');
  if (questCloseBtn) {
    questCloseBtn.addEventListener('click', () => {
      if (window.Quest && window.Quest.hidePanel) {
        window.Quest.hidePanel();
      }
    });
  }

  // Quest-Reset Button
  const questResetBtn = document.getElementById('btn-quest-reset');
  if (questResetBtn) {
    questResetBtn.addEventListener('click', async () => {
      if (!window.Quest || !window.Quest.resetCurrentSeriesProgress) return;
      const confirmed = await window.App?.showConfirmModal?.(
        'Soll der Fortschritt der aktuellen Quest-Reihe zurückgesetzt werden?',
        'Quest-Reihe zurücksetzen',
      );
      if (confirmed) {
        window.Quest.resetCurrentSeriesProgress();
      }
    });
  }

  // Quest Circle Click Handlers – Bestätigung nur bei noch nicht abgeschlossenen Aufgaben
  const questPanel = document.getElementById('quest-panel');
  if (questPanel) {
    questPanel.addEventListener('click', async (e) => {
      const manualCheckBtn = e.target.closest('#btn-quest-check-manual');
      if (manualCheckBtn && window.Quest?.validateCurrentQuest) {
        e.preventDefault();
        if (window.App?.isQuestCheckSuppressed?.()) return;
        window.Quest.validateCurrentQuest(true);
        return;
      }

      const circle = e.target.closest('.quest-circle');
      if (!circle || !window.Quest) return;
      const questNum = parseInt(circle.getAttribute('data-quest-number'), 10);
      const currentQuestNum = Number(window.Quest.state.currentQuestNumber);
      if (isNaN(questNum) || isNaN(currentQuestNum) || questNum === currentQuestNum) return;

      const isCompleted = window.Quest.state.completedQuests.includes(questNum);
      if (!isCompleted) {
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
          if (!confirmed) return;
        }
      }

      window.Quest.jumpToQuest(questNum);
      window.Quest.renderPanel();
    });
  }
});

// ---- Quest Panel Rendering ----
window.App = {
  _suppressQuestCheckUntil: 0,

  isQuestCheckSuppressed() {
    return Date.now() < this._suppressQuestCheckUntil;
  },

  suppressQuestCheck(ms = 350) {
    this._suppressQuestCheckUntil = Date.now() + ms;
  },

  updateQuestPanel(quest, questState) {
    if (!quest) return;

    const panel = document.getElementById('quest-panel');
    if (!panel) return;

    // Update Title & Progress
    const titleEl = panel.querySelector('#quest-title');
    const progressEl = panel.querySelector('#quest-progress');
    const total = questState.questMode === 'grundlagen' ? 13 : 9;
    if (titleEl) titleEl.textContent = `${quest.number}. ${quest.title}`;
    if (progressEl) progressEl.textContent = `${quest.number} / ${total}`;

    // Update Progress Bar
    const progressFill = panel.querySelector('#quest-progress-fill');
    if (progressFill) progressFill.style.width = (quest.number / total) * 100 + '%';

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

      if (quest.theory) {
        const conceptDiv = document.createElement('div');
        conceptDiv.className = 'quest-concept';
        conceptDiv.innerHTML = quest.theory;
        content.appendChild(conceptDiv);
      }

      const taskSection = document.createElement('div');
      taskSection.className = 'quest-section quest-task';
      const taskHeader = document.createElement('h4');
      taskHeader.textContent = questState.questMode === 'grundlagen' ? '🎯 Aufgabe' : '🎯 Szenario';
      taskSection.appendChild(taskHeader);
      const taskContent = document.createElement('div');
      const rawTaskHtml = questState.questMode === 'grundlagen' ? quest.objective : quest.szenario;
      taskContent.innerHTML =
        questState.questMode === 'grundlagen'
          ? String(rawTaskHtml || '').replace(/^\s*<p>\s*Aufgabe\s*:\s*<\/p>\s*/i, '')
          : rawTaskHtml;
      taskSection.appendChild(taskContent);
      // Experten: Wrapper für Side-by-Side-Layout (Text links, Checkliste rechts)
      const isExperten = questState.questMode === 'experten' && window.Quest?.getChecklistStatus;
      let questBody;
      if (isExperten) {
        questBody = document.createElement('div');
        questBody.className = 'quest-body-row';
        questBody.appendChild(taskSection);
        content.appendChild(questBody);
      } else {
        content.appendChild(taskSection);
      }

      // Experten-Checkliste (rechts neben dem Text)
      if (isExperten) {
        const checklist = window.Quest.getChecklistStatus();
        if (checklist) {
          const checklistSection = document.createElement('div');
          checklistSection.className = 'quest-checklist';
          checklistSection.id = 'quest-checklist';

          const checklistTitle = document.createElement('h4');
          checklistTitle.textContent = '📋 Checkliste';
          checklistSection.appendChild(checklistTitle);

          const categories = [
            { key: 'entities', label: 'Entitätsklassen', data: checklist.entities },
            { key: 'relationships', label: 'Beziehungen', data: checklist.relationships },
            { key: 'attributes', label: 'Attribute', data: checklist.attributes },
            { key: 'primaryKeys', label: 'Primärschlüssel', data: checklist.primaryKeys },
          ];

          for (const cat of categories) {
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

    const msgEl = modal.querySelector('.quest-success-message');
    const barFill = modal.querySelector('.quest-success-bar-fill');
    let okBtn = modal.querySelector('.quest-success-ok-btn');
    const previousActiveElement = document.activeElement;

    if (msgEl) msgEl.textContent = `Aufgabe ${questNumber} erfolgreich gelöst!`;

    // Fokus vom Hintergrund lösen, damit Enter nicht an darunterliegende Buttons weitergereicht wird.
    if (previousActiveElement && typeof previousActiveElement.blur === 'function') {
      previousActiveElement.blur();
    }

    modal.style.display = 'flex';
    modal.setAttribute('tabindex', '-1');
    this.spawnQuestConfetti(modal.querySelector('.quest-success-card'));

    // Balken zurücksetzen und Animation starten
    if (barFill) {
      barFill.style.transition = 'none';
      barFill.style.width = '0%';
      barFill.offsetHeight; // reflow
      barFill.style.transition = 'width 3s linear';
      barFill.style.width = '100%';
    }

    // Alten Listener entfernen (verhindert mehrfaches Feuern)
    const newBtn = okBtn.cloneNode(true);
    okBtn.parentNode.replaceChild(newBtn, okBtn);

    let timer;
    let closed = false;
    const onKeyDown = (event) => {
      if (event.key !== 'Enter' && event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      close();
    };

    const close = () => {
      if (closed) return;
      closed = true;
      clearTimeout(timer);
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

    modal.addEventListener('keydown', onKeyDown, true);
    timer = setTimeout(close, 3000);
    newBtn.addEventListener('click', close);
    newBtn.focus();
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

    return this.showAppModal({
      title: 'Überprüfung',
      message: baseMessage || 'Noch nicht korrekt. Versuche es erneut.',
      mode: 'alert',
      confirmLabel: 'Schließen',
      autoCloseMs: 0,
      extraLabel: 'Hinweis',
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
