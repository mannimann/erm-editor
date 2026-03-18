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

function renderRelatedInfo(node) {
  const row = document.getElementById('prop-related-row');
  const label = document.getElementById('prop-related-label');
  const list = document.getElementById('prop-related-list');

  row.style.display = '';
  list.innerHTML = '';

  let items = [];
  if (node.type === 'entity') {
    label.textContent = 'Zugehörige Attribute:';
    items = getConnectedNodes(node.id, 'attribute').map(
      ({ node: relatedNode }) => `${relatedNode.name || 'Attribut'}${relatedNode.isPrimaryKey ? ' (PK)' : ''}`,
    );
  } else if (node.type === 'relationship') {
    label.textContent = 'Verbundene Entitätsklassen:';
    items = getConnectedNodes(node.id, 'relationship').map(({ edge, node: relatedNode }) => {
      const cardinality = edge.fromId === node.id ? edge.chenTo || '1' : edge.chenFrom || '1';
      return `${relatedNode.name || 'Entitätsklasse'} (${String(cardinality).toLowerCase()})`;
    });
  } else {
    label.textContent = 'Zugehörige Entitätsklasse:';
    items = getConnectedNodes(node.id, 'attribute').map(
      ({ node: relatedNode }) => relatedNode.name || 'Entitätsklasse',
    );
  }

  if (items.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'prop-related-empty';
    empty.textContent = 'Keine Einträge';
    list.appendChild(empty);
    return;
  }

  items.forEach((item) => {
    const line = document.createElement('div');
    line.className = 'prop-related-item';
    line.textContent = item;
    list.appendChild(line);
  });
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
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');

      document.getElementById('canvas-container').style.display = tab === 'diagram' ? '' : 'none';
      document.getElementById('relmodel-container').style.display = tab === 'relmodel' ? '' : 'none';

      if (tab === 'relmodel') {
        // Relmodelformular synchronisieren wenn ER-Diagramm vorliegt
        if (window.RelModel) window.RelModel.syncFromDiagram();
      }
    });
  });
}

// ---- Notation-Umschalter ----
function initNotation() {
  state.notation = 'chen';
  const chenBtn = document.getElementById('btn-chen');
  const minmaxBtn = document.getElementById('btn-minmax');
  chenBtn.classList.add('active');
  minmaxBtn.classList.remove('active');
  minmaxBtn.disabled = true;

  document.getElementById('btn-chen').addEventListener('click', () => {
    state.notation = 'chen';
    document.getElementById('btn-chen').classList.add('active');
    document.getElementById('btn-minmax').classList.remove('active');
    if (window.Diagram) window.Diagram.renderAll();
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
}

function initPropertiesPanel() {
  // Name-Input
  document.getElementById('prop-name').addEventListener('input', (e) => {
    if (!_selectedNodeId) return;
    const node = getNodeById(_selectedNodeId);
    if (!node) return;
    node.name = e.target.value;
    if (window.Diagram) window.Diagram.renderAll();
    selectNode(_selectedNodeId);
  });

  // PK-Toggle
  document.getElementById('prop-pk').addEventListener('change', (e) => {
    if (!_selectedNodeId) return;
    const node = getNodeById(_selectedNodeId);
    if (!node || node.type !== 'attribute') return;
    node.isPrimaryKey = e.target.checked;
    if (window.Diagram) window.Diagram.renderAll();
    selectNode(_selectedNodeId);
  });
}

// ---- JSON Export ----
function exportJSON() {
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
      document.getElementById('btn-chen').classList.add('active');
      document.getElementById('btn-minmax').classList.remove('active');
      clearSelection();
      if (window.Diagram) window.Diagram.renderAll();
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

  if (!state.nodes.length) {
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
  initTabs();
  initNotation();
  initPropertiesPanel();

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
