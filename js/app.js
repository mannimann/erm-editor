/* ============================================================
   app.js  –  Zentraler Zustand & Controller
   ============================================================ */
'use strict';

// ---- Globaler App-Zustand ----
const state = {
  notation: 'chen',
  nodes: [], // { id, type, x, y, name, isPrimaryKey, width, height }
  edges: [], // { id, fromId, toId, edgeType, chenFrom, chenTo }
  nextId: 1,
};

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

  row.style.display = '';
  relationshipsRow.style.display = 'none';

  let items = [];
  if (node.type === 'entity') {
    label.textContent = 'Zugehörige Attribute:';
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

    relationshipsRow.style.display = '';
    renderRelatedItems(relationshipsList, relationshipItems, 'relationship');
  } else if (node.type === 'relationship') {
    label.textContent = 'Verbundene Entitätsklassen:';
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
  } else {
    label.textContent = 'Zugehöriges Element:';
    items = getConnectedNodes(node.id, 'attribute')
      .map(({ node: relatedNode }) => ({
        nodeId: relatedNode.id,
        nodeType: relatedNode.type,
        label: relatedNode.name || (relatedNode.type === 'relationship' ? 'Beziehung' : 'Entitätsklasse'),
      }))
      .sort(compareRelatedItemsByLabel);
  }

  const listType =
    node.type === 'entity' ? 'attribute' :
    node.type === 'relationship' ? 'entity' :
    '';
  renderRelatedItems(list, items, listType);
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
  const diagramBtn = document.querySelector('.tab-btn[data-tab="diagram"]');
  const relmodelBtn = document.getElementById('btn-relmodel-toggle');
  const relmodelDrawer = document.getElementById('relmodel-drawer');
  const relmodelResizer = document.getElementById('relmodel-resizer');
  const relmodelBackdrop = document.getElementById('relmodel-backdrop');
  const mainLayout = document.getElementById('main-layout');
  if (!diagramBtn || !relmodelBtn || !relmodelDrawer || !relmodelResizer || !relmodelBackdrop || !mainLayout) return;

  let lastOpenWidth = relmodelDrawer.getBoundingClientRect().width || 460;
  const mobileMedia = window.matchMedia('(max-width: 860px)');

  const clampDrawerWidth = (value) => {
    const maxWidth = Math.max(320, Math.min(window.innerWidth * 0.72, mainLayout.getBoundingClientRect().width - 180));
    return Math.max(320, Math.min(maxWidth, value));
  };

  const syncBackdrop = () => {
    const shouldShow = mobileMedia.matches && !relmodelDrawer.classList.contains('collapsed');
    relmodelBackdrop.classList.toggle('visible', shouldShow);
  };

  const setDrawerState = (open) => {
    relmodelDrawer.classList.toggle('collapsed', !open);
    relmodelResizer.classList.toggle('collapsed', !open);
    relmodelBtn.classList.toggle('active', open);

    if (open) {
      relmodelDrawer.style.width = `${clampDrawerWidth(lastOpenWidth)}px`;
      if (window.RelModel) window.RelModel.syncFromDiagram();
    }

    syncBackdrop();
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
  };

  diagramBtn.classList.add('active');
  setDrawerState(false);

  relmodelBtn.addEventListener('click', () => {
    setDrawerState(relmodelDrawer.classList.contains('collapsed'));
  });

  diagramBtn.addEventListener('click', () => {
    if (mobileMedia.matches) {
      setDrawerState(false);
      return;
    }
    setDrawerState(true);
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
  });

  relmodelBackdrop.addEventListener('click', () => {
    setDrawerState(false);
  });

  mobileMedia.addEventListener('change', () => {
    if (!mobileMedia.matches) {
      setDrawerState(true);
      return;
    }
    syncBackdrop();
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
  document.getElementById('prop-name').addEventListener('input', (e) => {
    if (!_selectedNodeId) return;
    const node = getNodeById(_selectedNodeId);
    if (!node) return;
    node.name = e.target.value;
    if (window.Diagram) window.Diagram.renderAll();
    if (window.RelModel?.requestSyncFromDiagramDebounced) window.RelModel.requestSyncFromDiagramDebounced();
    selectNode(_selectedNodeId);
  });

  // PK-Toggle
  document.getElementById('prop-pk').addEventListener('change', (e) => {
    if (!_selectedNodeId) return;
    const node = getNodeById(_selectedNodeId);
    if (!node || node.type !== 'attribute') return;
    node.isPrimaryKey = e.target.checked;
    if (window.Diagram) window.Diagram.renderAll();
    if (window.RelModel?.requestSyncFromDiagramDebounced) window.RelModel.requestSyncFromDiagramDebounced();
    selectNode(_selectedNodeId);
  });
}

// ---- JSON Export ----
function exportJSON() {
  if (!hasExportableDiagram()) {
    alert('Ein leeres ER-Diagramm kann nicht exportiert werden.');
    return;
  }

  const data = JSON.stringify(
    { notation: state.notation, nodes: state.nodes, edges: state.edges, nextId: state.nextId },
    null,
    2,
  );
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'er-diagramm.json';
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
      state.edges.forEach((edge) => {
        edge.edgeType = inferEdgeType(edge);
      });
      clearSelection();
      if (window.Diagram) window.Diagram.renderAll();
      if (window.RelModel) window.RelModel.syncFromDiagram();
    } catch (err) {
      alert('Fehler beim Importieren: ' + err.message);
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
    alert('Es sind keine Elemente zum Exportieren vorhanden.');
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
  if (clonedEdgesLayer) clonedEdgesLayer.setAttribute('transform', '');
  if (clonedNodesLayer) clonedNodesLayer.setAttribute('transform', '');

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
      a.download = 'er-diagramm.png';
      a.click();
      setTimeout(() => URL.revokeObjectURL(pngUrl), 3000);
    }, 'image/png');
  };
  img.onerror = () => {
    URL.revokeObjectURL(url);
    alert('PNG-Export fehlgeschlagen. Bitte versuche es erneut.');
  };
  img.src = url;
}

// ---- Neu / Löschen ----
function clearAll() {
  if (!confirm('Alle Elemente löschen und neu beginnen?')) return;
  state.nodes = [];
  state.edges = [];
  state.nextId = 1;
  clearSelection();
  if (window.Diagram) window.Diagram.renderAll();
  if (window.RelModel) window.RelModel.reset();
}

// ---- Bootstrap ----
document.addEventListener('DOMContentLoaded', () => {
  state.notation = 'chen';
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

  document.getElementById('btn-import').addEventListener('click', () => {
    document.getElementById('file-input').click();
  });
  document.getElementById('file-input').addEventListener('change', (e) => {
    if (e.target.files[0]) {
      importJSON(e.target.files[0]);
      e.target.value = '';
    }
  });
});

// ---- Globale Exports ----
window.AppState = { state, genId, getNodeById, getEdgeById };
window.AppSelect = { selectNode, clearSelection };
