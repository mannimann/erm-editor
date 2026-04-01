/* ============================================================
   diagram.js  –  SVG-Editor: Rendering, Drag & Drop, Werkzeuge
   ============================================================ */
'use strict';

(function () {
  const NODE_ENTITY_W = 140;
  const NODE_ENTITY_H = 50;
  const NODE_ATTR_RX = 60;
  const NODE_ATTR_RY = 26;
  const NODE_REL_W = 130;
  const NODE_REL_H = 60;
  const GRID_SIZE = 20;

  function S() {
    return window.AppState.state;
  }

  function requestRelModelSync(debounced = true) {
    if (window.AppState?.persistDebounced) window.AppState.persistDebounced();
    if (!window.RelModel) return;
    if (debounced && typeof window.RelModel.requestSyncFromDiagramDebounced === 'function') {
      window.RelModel.requestSyncFromDiagramDebounced();
      return;
    }
    if (typeof window.RelModel.syncFromDiagram === 'function') {
      window.RelModel.syncFromDiagram();
    }
  }

  function genId() {
    return window.AppState.genId();
  }
  function byId(id) {
    return window.AppState.getNodeById(id);
  }

  const svg = document.getElementById('er-canvas');
  const edgesLayer = document.getElementById('edges-layer');
  const nodesLayer = document.getElementById('nodes-layer');
  const modalBackdrop = document.getElementById('modal-backdrop');
  const modalTitle = document.getElementById('modal-title');
  const modalSubtitle = document.getElementById('modal-subtitle');
  const modalEntity1 = document.getElementById('modal-entity-1');
  const modalEntity2 = document.getElementById('modal-entity-2');
  const modalCardinality = document.getElementById('modal-cardinality');
  const modalOk = document.getElementById('modal-ok');
  const modalCancel = document.getElementById('modal-cancel');
  const contextMenu = document.getElementById('context-menu');
  const ctxRename = document.getElementById('ctx-rename');
  const ctxEditRelationship = document.getElementById('ctx-edit-relationship');
  const ctxAddAttr = document.getElementById('ctx-add-attr');
  const ctxTogglePk = document.getElementById('ctx-toggle-pk');
  const ctxDelete = document.getElementById('ctx-delete');
  const btnZoomIn = document.getElementById('btn-zoom-in');
  const btnZoomOut = document.getElementById('btn-zoom-out');
  const btnZoom100 = document.getElementById('btn-zoom-100');
  const btnCenter = document.getElementById('btn-center');
  const zoomLevel = document.getElementById('zoom-level');
  const gridBackground = document.getElementById('canvas-grid-bg');
  const snapGridToggle = document.getElementById('toggle-snap-grid');
  const autoLayoutButton = document.getElementById('btn-auto-layout');

  let dragging = null;
  let panning = null;
  let spacePressed = false;
  let hasPanned = false;
  let selectedNodeId = null;
  let suppressClick = false;
  let ctxTarget = null;
  let activeModalCleanup = null;
  const viewState = { x: 0, y: 0, scale: 1 };
  let questValidateTimeout = null; // Debounce timer for quest validation

  const ZOOM_MIN = 0.35;
  const ZOOM_MAX = 3;
  const ZOOM_STEP = 1.15;

  function isSnapToGridEnabled() {
    return !!S().snapToGrid;
  }

  function snapValue(value) {
    return Math.round(value / GRID_SIZE) * GRID_SIZE;
  }

  function getNodeSize(type) {
    if (type === 'entity') return { w: NODE_ENTITY_W, h: NODE_ENTITY_H };
    if (type === 'attribute') return { w: NODE_ATTR_RX * 2, h: NODE_ATTR_RY * 2 };
    return { w: NODE_REL_W, h: NODE_REL_H };
  }

  function maybeSnapPosition(type, x, y) {
    if (!isSnapToGridEnabled()) return { x, y };
    const size = getNodeSize(type);
    const centerX = x + size.w / 2;
    const centerY = y + size.h / 2;
    const snappedCenterX = snapValue(centerX);
    const snappedCenterY = snapValue(centerY);
    return {
      x: snappedCenterX - size.w / 2,
      y: snappedCenterY - size.h / 2,
    };
  }

  function setSnapToGrid(enabled) {
    S().snapToGrid = !!enabled;
    if (snapGridToggle && snapGridToggle.checked !== S().snapToGrid) {
      snapGridToggle.checked = S().snapToGrid;
    }
    if (gridBackground) {
      gridBackground.setAttribute('fill', S().snapToGrid ? 'url(#grid)' : '#ffffff');
    }
  }

  function applyViewTransform() {
    const transform = `matrix(${viewState.scale} 0 0 ${viewState.scale} ${viewState.x} ${viewState.y})`;
    edgesLayer.setAttribute('transform', transform);
    nodesLayer.setAttribute('transform', transform);
  }

  function updateZoomIndicator() {
    if (!zoomLevel) return;
    const zoomPercent = Math.round(viewState.scale * 100);
    zoomLevel.textContent = `${zoomPercent}%`;
    zoomLevel.style.display = zoomPercent === 100 ? 'none' : 'inline-flex';
  }

  function isRelationshipEdge(edge) {
    if (!edge) return false;
    if (edge.edgeType) return edge.edgeType === 'relationship';
    const fromNode = byId(edge.fromId);
    const toNode = byId(edge.toId);
    if (!fromNode || !toNode) return false;
    return (
      (fromNode.type === 'relationship' && toNode.type === 'entity') ||
      (fromNode.type === 'entity' && toNode.type === 'relationship')
    );
  }

  function getLocalSVGPoint(e) {
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    return pt.matrixTransform(svg.getScreenCTM().inverse());
  }

  function getSVGPoint(e) {
    const local = getLocalSVGPoint(e);
    return {
      x: (local.x - viewState.x) / viewState.scale,
      y: (local.y - viewState.y) / viewState.scale,
    };
  }

  function getCanvasCenterLocal() {
    const box = svg.getBoundingClientRect();
    let visibleTop = box.top;
    let visibleBottom = box.bottom;

    // Wenn das Quest-Panel sichtbar ist, liegt es ueber dem unteren Teil des Canvas.
    // Die Mitte soll dann auf den verbleibenden sichtbaren Bereich bezogen werden.
    const questPanel = document.getElementById('quest-panel');
    if (questPanel && questPanel.classList.contains('visible')) {
      const panelRect = questPanel.getBoundingClientRect();
      const overlapTop = Math.max(box.top, panelRect.top);
      const overlapBottom = Math.min(box.bottom, panelRect.bottom);
      if (overlapBottom > overlapTop) {
        visibleBottom = overlapTop;
      }
    }

    const visibleCenterY = (visibleTop + visibleBottom) / 2;
    return {
      x: box.width / 2,
      y: visibleCenterY - box.top,
    };
  }

  function setZoom(nextScale, anchorLocalX, anchorLocalY) {
    const clamped = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, nextScale));
    const worldX = (anchorLocalX - viewState.x) / viewState.scale;
    const worldY = (anchorLocalY - viewState.y) / viewState.scale;
    viewState.scale = clamped;
    viewState.x = anchorLocalX - worldX * clamped;
    viewState.y = anchorLocalY - worldY * clamped;
    applyViewTransform();
    updateZoomIndicator();
  }

  function getDiagramBounds() {
    if (!S().nodes.length) return null;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    S().nodes.forEach((node) => {
      const box = getNodeBounds(node);
      minX = Math.min(minX, box.x);
      minY = Math.min(minY, box.y);
      maxX = Math.max(maxX, box.x + box.w);
      maxY = Math.max(maxY, box.y + box.h);
    });

    return { minX, minY, maxX, maxY };
  }

  function centerView() {
    const bounds = getDiagramBounds();
    if (!bounds) {
      viewState.x = 0;
      viewState.y = 0;
      viewState.scale = 1;
      applyViewTransform();
      updateZoomIndicator();
      return;
    }

    const centerX = (bounds.minX + bounds.maxX) / 2;
    const centerY = (bounds.minY + bounds.maxY) / 2;
    const viewportCenter = getCanvasCenterLocal();
    viewState.x = viewportCenter.x - centerX * viewState.scale;
    viewState.y = viewportCenter.y - centerY * viewState.scale;
    applyViewTransform();
    updateZoomIndicator();
  }

  function bindViewportControls() {
    if (btnZoomIn) {
      btnZoomIn.addEventListener('click', () => {
        const c = getCanvasCenterLocal();
        setZoom(viewState.scale * ZOOM_STEP, c.x, c.y);
      });
    }
    if (btnZoomOut) {
      btnZoomOut.addEventListener('click', () => {
        const c = getCanvasCenterLocal();
        setZoom(viewState.scale / ZOOM_STEP, c.x, c.y);
      });
    }
    if (btnZoom100) {
      btnZoom100.addEventListener('click', () => {
        const c = getCanvasCenterLocal();
        setZoom(1, c.x, c.y);
      });
    }
    if (btnCenter) {
      btnCenter.addEventListener('click', () => {
        centerView();
      });
    }
  }

  function getNodeCenter(node) {
    switch (node.type) {
      case 'entity':
        return { x: node.x + NODE_ENTITY_W / 2, y: node.y + NODE_ENTITY_H / 2 };
      case 'attribute':
        return { x: node.x + NODE_ATTR_RX, y: node.y + NODE_ATTR_RY };
      case 'relationship':
        return { x: node.x + NODE_REL_W / 2, y: node.y + NODE_REL_H / 2 };
      default:
        return { x: node.x, y: node.y };
    }
  }

  function isEntityNameTaken(name, excludeId = null) {
    if (window.AppUtils?.isEntityNameTaken) {
      return window.AppUtils.isEntityNameTaken(name, excludeId);
    }
    const normalized = String(name || '')
      .trim()
      .toLocaleLowerCase('de');
    if (!normalized) return false;
    return S().nodes.some((node) => {
      return (
        node.type === 'entity' &&
        node.id !== excludeId &&
        String(node.name || '')
          .trim()
          .toLocaleLowerCase('de') === normalized
      );
    });
  }

  function getUniqueEntityName(baseName = 'Entitätsklasse', excludeId = null) {
    if (window.AppUtils?.getUniqueEntityName) {
      return window.AppUtils.getUniqueEntityName(baseName, excludeId);
    }
    if (!isEntityNameTaken(baseName, excludeId)) return baseName;
    let idx = 2;
    while (isEntityNameTaken(`${baseName} ${idx}`, excludeId)) idx += 1;
    return `${baseName} ${idx}`;
  }

  function getOwningNodeForAttribute(attributeId) {
    if (window.AppUtils?.getOwningNodeForAttribute) {
      return window.AppUtils.getOwningNodeForAttribute(attributeId);
    }
    const edge = S().edges.find((candidateEdge) => {
      if (candidateEdge.fromId !== attributeId && candidateEdge.toId !== attributeId) return false;
      if (candidateEdge.edgeType && candidateEdge.edgeType !== 'attribute') return false;
      const otherId = candidateEdge.fromId === attributeId ? candidateEdge.toId : candidateEdge.fromId;
      const otherNode = byId(otherId);
      return otherNode?.type === 'entity' || otherNode?.type === 'relationship';
    });
    if (!edge) return null;

    const otherId = edge.fromId === attributeId ? edge.toId : edge.fromId;
    const otherNode = byId(otherId);
    return otherNode?.type === 'entity' || otherNode?.type === 'relationship' ? otherNode : null;
  }

  function isOwnerAttributeNameTaken(ownerId, name, excludeAttributeId = null) {
    if (window.AppUtils?.isOwnerAttributeNameTaken) {
      return window.AppUtils.isOwnerAttributeNameTaken(ownerId, name, excludeAttributeId);
    }
    const normalized = String(name || '')
      .trim()
      .toLocaleLowerCase('de');
    if (!ownerId || !normalized) return false;

    return S().edges.some((edge) => {
      if (edge.edgeType && edge.edgeType !== 'attribute') return false;
      if (edge.fromId !== ownerId && edge.toId !== ownerId) return false;
      const otherId = edge.fromId === ownerId ? edge.toId : edge.fromId;
      const otherNode = byId(otherId);
      if (!otherNode || otherNode.type !== 'attribute') return false;
      if (otherNode.id === excludeAttributeId) return false;
      return (
        String(otherNode.name || '')
          .trim()
          .toLocaleLowerCase('de') === normalized
      );
    });
  }

  function getUniqueOwnerAttributeName(ownerId, baseName, excludeAttributeId = null) {
    if (window.AppUtils?.getUniqueOwnerAttributeName) {
      return window.AppUtils.getUniqueOwnerAttributeName(ownerId, baseName, excludeAttributeId);
    }
    const cleanedBase = String(baseName || '').trim() || 'Attribut';
    if (!isOwnerAttributeNameTaken(ownerId, cleanedBase, excludeAttributeId)) return cleanedBase;
    let index = 2;
    while (isOwnerAttributeNameTaken(ownerId, `${cleanedBase} ${index}`, excludeAttributeId)) index += 1;
    return `${cleanedBase} ${index}`;
  }

  function getRelationshipCorners(node) {
    return [
      { index: 0, x: node.x + NODE_REL_W / 2, y: node.y },
      { index: 1, x: node.x + NODE_REL_W, y: node.y + NODE_REL_H / 2 },
      { index: 2, x: node.x + NODE_REL_W / 2, y: node.y + NODE_REL_H },
      { index: 3, x: node.x, y: node.y + NODE_REL_H / 2 },
    ];
  }

  function getNearestRelationshipCorner(node, targetX, targetY) {
    const corners = getRelationshipCorners(node);

    let nearest = corners[0];
    let nearestDist = Infinity;
    corners.forEach((corner) => {
      const dx = targetX - corner.x;
      const dy = targetY - corner.y;
      const distSq = dx * dx + dy * dy;
      if (distSq < nearestDist) {
        nearest = corner;
        nearestDist = distSq;
      }
    });

    return nearest;
  }

  function segmentsIntersect(ax, ay, bx, by, cx, cy, dx, dy) {
    const d1x = bx - ax;
    const d1y = by - ay;
    const d2x = dx - cx;
    const d2y = dy - cy;
    const denom = d1x * d2y - d1y * d2x;
    if (Math.abs(denom) < 1e-10) return false;
    const t = ((cx - ax) * d2y - (cy - ay) * d2x) / denom;
    const u = ((cx - ax) * d1y - (cy - ay) * d1x) / denom;
    return t > 0.02 && t < 0.98 && u > 0.02 && u < 0.98;
  }

  function buildRelationshipCornerAssignments() {
    const assignments = new Map();
    const relationshipNodes = S().nodes.filter((node) => node.type === 'relationship');

    relationshipNodes.forEach((relationshipNode) => {
      const incidentEdges = S().edges.filter(
        (edge) =>
          isRelationshipEdge(edge) && (edge.fromId === relationshipNode.id || edge.toId === relationshipNode.id),
      );
      if (!incidentEdges.length) return;

      const relCenter = getNodeCenter(relationshipNode);

      // Sort corners by angle around diamond center
      const corners = getRelationshipCorners(relationshipNode)
        .map((c) => ({ ...c, angle: Math.atan2(c.y - relCenter.y, c.x - relCenter.x) }))
        .sort((a, b) => a.angle - b.angle);

      // Resolve each edge to its target entity center + angle
      const edgeData = incidentEdges
        .map((edge) => {
          const otherId = edge.fromId === relationshipNode.id ? edge.toId : edge.fromId;
          const otherNode = byId(otherId);
          if (!otherNode) return null;
          const c = getNodeCenter(otherNode);
          return { edge, otherId, cx: c.x, cy: c.y, angle: Math.atan2(c.y - relCenter.y, c.x - relCenter.x) };
        })
        .filter(Boolean)
        .sort((a, b) => a.angle - b.angle);

      const n = edgeData.length;
      if (n === 0) return;

      if (n === 2 && edgeData[0].otherId === edgeData[1].otherId) {
        const targetX = edgeData[0].cx;
        const targetY = edgeData[0].cy;
        const corners = getRelationshipCorners(relationshipNode);
        const nearestCorner = getNearestRelationshipCorner(relationshipNode, targetX, targetY);
        const relDx = targetX - relCenter.x;
        const relDy = targetY - relCenter.y;
        const useVerticalPair = Math.abs(relDx) >= Math.abs(relDy);
        const preferredPair = useVerticalPair
          ? corners.filter((corner) => Math.abs(corner.y - relCenter.y) > Math.abs(corner.x - relCenter.x))
          : corners.filter((corner) => Math.abs(corner.x - relCenter.x) > Math.abs(corner.y - relCenter.y));
        const fallbackPair = corners
          .filter((corner) => corner !== nearestCorner)
          .sort((a, b) => {
            const distA = (targetX - a.x) ** 2 + (targetY - a.y) ** 2;
            const distB = (targetX - b.x) ** 2 + (targetY - b.y) ** 2;
            return distA - distB;
          })
          .slice(0, 2);
        const pair = preferredPair.length === 2 ? preferredPair : fallbackPair;

        pair
          .slice()
          .sort((a, b) => {
            if (useVerticalPair) return a.y - b.y;
            return a.x - b.x;
          })
          .forEach((corner, index) => {
            assignments.set(`${edgeData[index].edge.id}:${relationshipNode.id}`, { x: corner.x, y: corner.y });
          });
        return;
      }

      // Generate all combinations of n corners from 4
      const subsets = [];
      const buildSubsets = (start, current) => {
        if (current.length === n) {
          subsets.push([...current]);
          return;
        }
        for (let i = start; i < 4; i++) {
          current.push(i);
          buildSubsets(i + 1, current);
          current.pop();
        }
      };
      buildSubsets(0, []);

      let bestScore = Infinity;
      let bestAssignment = null;

      subsets.forEach((subset) => {
        const subCorners = subset.map((i) => corners[i]);

        // Try all n cyclic rotations of the corner→edge matching
        for (let rot = 0; rot < n; rot++) {
          const candidate = edgeData.map((ed, i) => ({
            edge: ed.edge,
            corner: subCorners[(i + rot) % n],
            cx: ed.cx,
            cy: ed.cy,
          }));

          // Count crossing pairs (use entity centers as far-end proxy)
          let crossings = 0;
          for (let a = 0; a < candidate.length; a++) {
            for (let b = a + 1; b < candidate.length; b++) {
              const A = candidate[a];
              const B = candidate[b];
              if (segmentsIntersect(A.corner.x, A.corner.y, A.cx, A.cy, B.corner.x, B.corner.y, B.cx, B.cy)) {
                crossings++;
              }
            }
          }

          // Secondary criterion: minimize total squared distance
          const totalDist = candidate.reduce(
            (sum, { corner, cx, cy }) => sum + (cx - corner.x) ** 2 + (cy - corner.y) ** 2,
            0,
          );

          const score = crossings * 1e12 + totalDist;
          if (score < bestScore) {
            bestScore = score;
            bestAssignment = candidate;
          }
        }
      });

      if (bestAssignment) {
        bestAssignment.forEach(({ edge, corner }) => {
          assignments.set(`${edge.id}:${relationshipNode.id}`, { x: corner.x, y: corner.y });
        });
      }
    });

    return assignments;
  }

  // Returns all relationship-edges that connect `relationshipId` to `entityId`.
  function getSelfPairEdges(relationshipId, entityId) {
    return S().edges.filter((e) => {
      if (!isRelationshipEdge(e)) return false;
      if (e.fromId !== relationshipId && e.toId !== relationshipId) return false;
      const other = e.fromId === relationshipId ? e.toId : e.fromId;
      return other === entityId;
    });
  }

  // Returns -1/+1 side for a self-pair edge based on assigned relationship corners.
  function selfPairOffset(edge, relationshipNode, relationshipCornerAssignments) {
    const relationshipId = relationshipNode.id;
    const entityId = edge.fromId === relationshipId ? edge.toId : edge.fromId;
    const pair = getSelfPairEdges(relationshipId, entityId);
    if (pair.length !== 2) return 0;

    const thisCorner = relationshipCornerAssignments.get(`${edge.id}:${relationshipId}`);
    const otherEdge = pair[0].id === edge.id ? pair[1] : pair[0];
    const otherCorner = relationshipCornerAssignments.get(`${otherEdge.id}:${relationshipId}`);

    if (thisCorner && otherCorner) {
      const relCenter = getNodeCenter(relationshipNode);
      const dx = Math.abs(thisCorner.x - otherCorner.x);
      const dy = Math.abs(thisCorner.y - otherCorner.y);

      if (dy >= dx) {
        return thisCorner.y <= relCenter.y ? -1 : 1;
      }
      return thisCorner.x <= relCenter.x ? -1 : 1;
    }

    // Fallback: deterministic by id if corner-assignment is unavailable.
    const sorted = pair.slice().sort((a, b) => a.id.localeCompare(b.id));
    return sorted[0].id === edge.id ? -1 : 1;
  }

  function getEdgeEndpoint(node, targetX, targetY) {
    const c = getNodeCenter(node);
    const dx = targetX - c.x;
    const dy = targetY - c.y;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const ux = dx / len;
    const uy = dy / len;

    if (node.type === 'entity') {
      const hw = NODE_ENTITY_W / 2;
      const hh = NODE_ENTITY_H / 2;
      const t = Math.min(hw / Math.abs(ux || 0.0001), hh / Math.abs(uy || 0.0001));
      return { x: c.x + ux * t, y: c.y + uy * t };
    }
    if (node.type === 'attribute') {
      const rx = NODE_ATTR_RX;
      const ry = NODE_ATTR_RY;
      const angle = Math.atan2(dy * rx, dx * ry);
      return { x: c.x + rx * Math.cos(angle), y: c.y + ry * Math.sin(angle) };
    }
    if (node.type === 'relationship') {
      const hw = NODE_REL_W / 2;
      const hh = NODE_REL_H / 2;
      const denom = Math.abs(ux) / hw + Math.abs(uy) / hh || 1;
      const t = 1 / denom;
      return { x: c.x + ux * t, y: c.y + uy * t };
    }
    return { x: c.x, y: c.y };
  }

  function edgeLabel(edge, side) {
    const raw = side === 'from' ? edge.chenFrom || '1' : edge.chenTo || 'n';
    return String(raw).toLowerCase();
  }

  function makeText(x, y, text) {
    const t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    t.setAttribute('x', x);
    t.setAttribute('y', y);
    t.setAttribute('text-anchor', 'middle');
    t.setAttribute('dominant-baseline', 'middle');
    t.setAttribute('font-size', '13');
    t.setAttribute('fill', '#1e293b');
    t.textContent = text;
    return t;
  }

  function makePrimaryKeyDecoration(text, centerX, centerY) {
    const width = Math.max(8, (text || '').trim().length * 7.1);
    const underline = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    underline.setAttribute('x1', centerX - width / 2);
    underline.setAttribute('x2', centerX + width / 2);
    underline.setAttribute('y1', centerY + 14);
    underline.setAttribute('y2', centerY + 14);
    underline.setAttribute('stroke', '#1e293b');
    underline.setAttribute('stroke-width', '2.5');
    underline.setAttribute('stroke-linecap', 'round');
    return underline;
  }

  function makeLabelText(x, y, text) {
    const t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    t.setAttribute('x', x);
    t.setAttribute('y', y);
    t.setAttribute('class', 'edge-label');
    t.setAttribute('font-size', '13');
    t.setAttribute('font-weight', '700');
    t.setAttribute('fill', '#1e293b');
    t.textContent = text;
    return t;
  }

  function getNodeBounds(node) {
    if (node.type === 'entity') return { x: node.x, y: node.y, w: NODE_ENTITY_W, h: NODE_ENTITY_H };
    if (node.type === 'attribute') return { x: node.x, y: node.y, w: NODE_ATTR_RX * 2, h: NODE_ATTR_RY * 2 };
    return { x: node.x, y: node.y, w: NODE_REL_W, h: NODE_REL_H };
  }

  function clampValue(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function movePointToRectClearance(point, rect, clearance, fallbackDirX, fallbackDirY) {
    const nearestX = clampValue(point.x, rect.x, rect.x + rect.w);
    const nearestY = clampValue(point.y, rect.y, rect.y + rect.h);

    let dirX = point.x - nearestX;
    let dirY = point.y - nearestY;
    let distance = Math.sqrt(dirX * dirX + dirY * dirY);

    if (distance < 0.0001) {
      dirX = fallbackDirX;
      dirY = fallbackDirY;
      distance = Math.sqrt(dirX * dirX + dirY * dirY) || 1;
    }

    return {
      x: nearestX + (dirX / distance) * clearance,
      y: nearestY + (dirY / distance) * clearance,
    };
  }

  function boxesOverlap(a, b, padding = 18) {
    return !(
      a.x + a.w + padding <= b.x ||
      b.x + b.w + padding <= a.x ||
      a.y + a.h + padding <= b.y ||
      b.y + b.h + padding <= a.y
    );
  }

  function clampPosition(type, x, y) {
    const snapped = maybeSnapPosition(type, x, y);
    return { x: snapped.x, y: snapped.y };
  }

  function findNonOverlappingPlacement(type, preferredX, preferredY, occupiedBounds, padding = 18) {
    const angles = 16;
    for (let ring = 0; ring < 26; ring += 1) {
      const radius = ring * 26;
      for (let step = 0; step < angles; step += 1) {
        const angle = (step / angles) * Math.PI * 2;
        const candidate = clampPosition(
          type,
          preferredX + Math.cos(angle) * radius,
          preferredY + Math.sin(angle) * radius,
        );
        const candidateBounds = getNodeBounds({ type, x: candidate.x, y: candidate.y });
        const isFree = !occupiedBounds.some((bounds) => boxesOverlap(candidateBounds, bounds, padding));
        if (isFree) return { position: candidate, bounds: candidateBounds };
      }
    }

    const fallback = clampPosition(type, preferredX, preferredY);
    return {
      position: fallback,
      bounds: getNodeBounds({ type, x: fallback.x, y: fallback.y }),
    };
  }

  function findConstrainedPlacement(type, preferredX, preferredY, occupiedBounds, padding = 18, validator = null) {
    const angles = 24;
    for (let ring = 0; ring < 34; ring += 1) {
      const radius = ring * 24;
      for (let step = 0; step < angles; step += 1) {
        const angle = (step / angles) * Math.PI * 2;
        const candidate = clampPosition(
          type,
          preferredX + Math.cos(angle) * radius,
          preferredY + Math.sin(angle) * radius,
        );
        if (validator && !validator(candidate)) continue;
        const candidateBounds = getNodeBounds({ type, x: candidate.x, y: candidate.y });
        const isFree = !occupiedBounds.some((bounds) => boxesOverlap(candidateBounds, bounds, padding));
        if (isFree) return { position: candidate, bounds: candidateBounds };
      }
    }

    return null;
  }

  function autoArrangeDiagram() {
    // Aktiviere Snap-to-Grid automatisch
    setSnapToGrid(true);

    const nodes = S().nodes;
    if (!nodes.length) return;

    const entities = nodes.filter((node) => node.type === 'entity');
    const relationships = nodes.filter((node) => node.type === 'relationship');
    const attributes = nodes.filter((node) => node.type === 'attribute');

    const attributeCountByParent = new Map();
    S().edges.forEach((edge) => {
      if (edge.edgeType !== 'attribute') return;
      const fromNode = byId(edge.fromId);
      const toNode = byId(edge.toId);
      if (!fromNode || !toNode) return;
      const parentNode = fromNode.type === 'attribute' ? toNode : toNode.type === 'attribute' ? fromNode : null;
      if (!parentNode) return;
      attributeCountByParent.set(parentNode.id, (attributeCountByParent.get(parentNode.id) || 0) + 1);
    });
    const maxAttributesPerParent =
      attributeCountByParent.size > 0 ? Math.max(...Array.from(attributeCountByParent.values())) : 0;
    const attrDensityBoost = Math.min(140, Math.max(0, maxAttributesPerParent - 4) * 18);

    const occupiedBounds = [];
    const entityCols = Math.max(1, Math.ceil(Math.sqrt(Math.max(1, entities.length))));
    const entityGapX = 420 + attrDensityBoost;
    const entityGapY = 280 + Math.round(attrDensityBoost * 0.7);
    const startX = 120;
    const startY = 100;
    const reserveNode = (node, padding = 18) => {
      const candidateBounds = getNodeBounds(node);
      const overlaps = occupiedBounds.some((bounds) => boxesOverlap(candidateBounds, bounds, padding));
      if (!overlaps) {
        occupiedBounds.push(candidateBounds);
        return;
      }

      const moved = findNonOverlappingPlacement(node.type, node.x, node.y, occupiedBounds, padding);
      node.x = moved.position.x;
      node.y = moved.position.y;
      occupiedBounds.push(moved.bounds);
    };
    const tryPlaceNodeAt = (type, x, y, padding = 18, validator = null) => {
      const candidate = clampPosition(type, x, y);
      if (validator && !validator(candidate)) return null;
      const candidateBounds = getNodeBounds({ type, x: candidate.x, y: candidate.y });
      const isFree = !occupiedBounds.some((bounds) => boxesOverlap(candidateBounds, bounds, padding));
      if (!isFree) return null;
      occupiedBounds.push(candidateBounds);
      return candidate;
    };
    const placeNode = (node, preferredX, preferredY, padding = 18) => {
      const placed = findNonOverlappingPlacement(node.type, preferredX, preferredY, occupiedBounds, padding);
      node.x = placed.position.x;
      node.y = placed.position.y;
      occupiedBounds.push(placed.bounds);
    };

    // Phase 1: place entities
    entities
      .slice()
      .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'de', { sensitivity: 'base' }))
      .forEach((entity, index) => {
        const row = Math.floor(index / entityCols);
        const col = index % entityCols;
        placeNode(entity, startX + col * entityGapX, startY + row * entityGapY, 20);
      });

    const relFallbackY = startY + Math.max(1, Math.ceil(entities.length / entityCols)) * entityGapY + 140;
    const pairPlacementCount = new Map();

    // Phase 2: place relationships between entities
    relationships.forEach((relationship, index) => {
      const connectedEntityEdges = getRelationshipEntityEdges(relationship.id);
      const connectedEntities = connectedEntityEdges
        .map((edge) => byId(edge.fromId === relationship.id ? edge.toId : edge.fromId))
        .filter((node) => !!node && node.type === 'entity');

      if (connectedEntities.length >= 2) {
        const first = connectedEntities[0];
        const second = connectedEntities[1];
        const firstCenter = getNodeCenter(first);
        const secondCenter = getNodeCenter(second);

        const pairKey = [first.id, second.id].sort().join('|');
        const pairIndex = pairPlacementCount.get(pairKey) || 0;
        pairPlacementCount.set(pairKey, pairIndex + 1);

        // Platziere Beziehungen moeglichst auf der geraden Verbindungslinie.
        const vx = secondCenter.x - firstCenter.x;
        const vy = secondCenter.y - firstCenter.y;
        const dist = Math.sqrt(vx * vx + vy * vy) || 1;
        const ux = vx / dist;
        const uy = vy / dist;

        const lineStep = 48;
        const rawOffset = pairIndex * lineStep;
        const maxOffset = Math.max(0, dist / 2 - Math.max(NODE_REL_W, NODE_REL_H));
        const clampedOffset = Math.min(rawOffset, maxOffset);
        const side = pairIndex % 2 === 0 ? 1 : -1;

        const relCenterX = (firstCenter.x + secondCenter.x) / 2 + ux * clampedOffset * side;
        const relCenterY = (firstCenter.y + secondCenter.y) / 2 + uy * clampedOffset * side;

        // Berechne obere linke Ecke aus dem Mittelpunkt
        const relPos = clampPosition(relationship.type, relCenterX - NODE_REL_W / 2, relCenterY - NODE_REL_H / 2);
        relationship.x = relPos.x;
        relationship.y = relPos.y;
        reserveNode(relationship, 24);
        return;
      }

      if (connectedEntities.length === 1) {
        const entityCenter = getNodeCenter(connectedEntities[0]);
        const orbit = 165 + index * 6;
        const angle = (-Math.PI / 2 + (index % 6) * (Math.PI / 3)) % (Math.PI * 2);
        const relPos = clampPosition(
          relationship.type,
          entityCenter.x + Math.cos(angle) * orbit - NODE_REL_W / 2,
          entityCenter.y + Math.sin(angle) * orbit - NODE_REL_H / 2,
        );
        relationship.x = relPos.x;
        relationship.y = relPos.y;
        reserveNode(relationship, 24);
        return;
      }

      const row = Math.floor(index / entityCols);
      const col = index % entityCols;
      const relPos = clampPosition(relationship.type, startX + col * entityGapX, relFallbackY + row * entityGapY);
      relationship.x = relPos.x;
      relationship.y = relPos.y;
      reserveNode(relationship, 24);
    });

    const attrsByParent = new Map();
    const orphanAttributes = [];
    attributes.forEach((attr) => {
      const parentEdge = S().edges.find(
        (edge) => edge.edgeType === 'attribute' && (edge.fromId === attr.id || edge.toId === attr.id),
      );
      if (!parentEdge) {
        orphanAttributes.push(attr);
        return;
      }
      const parentId = parentEdge.fromId === attr.id ? parentEdge.toId : parentEdge.fromId;
      const parentNode = byId(parentId);
      if (!parentNode || (parentNode.type !== 'entity' && parentNode.type !== 'relationship')) {
        orphanAttributes.push(attr);
        return;
      }
      if (!attrsByParent.has(parentId)) attrsByParent.set(parentId, []);
      attrsByParent.get(parentId).push(attr);
    });

    // Phase 3: place attributes last
    attrsByParent.forEach((attrs, parentId) => {
      const parentNode = byId(parentId);
      if (!parentNode) return;
      const center = getNodeCenter(parentNode);
      const parentCandidates = nodes.filter((n) => n.type === parentNode.type);
      const isClosestToOwnParent = (candidatePos) => {
        const candidateCenter = {
          x: candidatePos.x + NODE_ATTR_RX,
          y: candidatePos.y + NODE_ATTR_RY,
        };
        const ownCenter = getNodeCenter(parentNode);
        const ownDistSq = (candidateCenter.x - ownCenter.x) ** 2 + (candidateCenter.y - ownCenter.y) ** 2;

        for (let i = 0; i < parentCandidates.length; i += 1) {
          const otherParent = parentCandidates[i];
          if (!otherParent || otherParent.id === parentNode.id) continue;
          const otherCenter = getNodeCenter(otherParent);
          const otherDistSq = (candidateCenter.x - otherCenter.x) ** 2 + (candidateCenter.y - otherCenter.y) ** 2;
          if (otherDistSq + 64 < ownDistSq) return false;
        }
        return true;
      };
      const baseRadius = parentNode.type === 'relationship' ? 120 : 112;
      const radius = baseRadius + Math.max(0, attrs.length - 6) * 10;
      const radiusOffsets = [0, 12, 24, 36, 52, 70, 90, 112];
      const angleOffsets = [0, 0.2, -0.2, 0.38, -0.38, 0.56, -0.56];
      attrs
        .slice()
        .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'de', { sensitivity: 'base' }))
        .forEach((attr, index) => {
          const baseAngle = -Math.PI / 2 + (index / Math.max(1, attrs.length)) * Math.PI * 2;
          let placed = false;

          // Prefer close positions around the parent before allowing farther fallback.
          for (let r = 0; r < radiusOffsets.length && !placed; r += 1) {
            for (let a = 0; a < angleOffsets.length; a += 1) {
              const angle = baseAngle + angleOffsets[a];
              const rCandidate = radius + radiusOffsets[r];
              const x = center.x + Math.cos(angle) * rCandidate - NODE_ATTR_RX;
              const y = center.y + Math.sin(angle) * rCandidate - NODE_ATTR_RY;
              const pos = tryPlaceNodeAt(attr.type, x, y, 12, isClosestToOwnParent);
              if (!pos) continue;
              attr.x = pos.x;
              attr.y = pos.y;
              placed = true;
              break;
            }
          }

          if (!placed) {
            const fallbackX = center.x + Math.cos(baseAngle) * (radius + 84) - NODE_ATTR_RX;
            const fallbackY = center.y + Math.sin(baseAngle) * (radius + 84) - NODE_ATTR_RY;
            const constrained = findConstrainedPlacement(
              attr.type,
              fallbackX,
              fallbackY,
              occupiedBounds,
              12,
              isClosestToOwnParent,
            );
            if (constrained) {
              attr.x = constrained.position.x;
              attr.y = constrained.position.y;
              occupiedBounds.push(constrained.bounds);
              placed = true;
            }

            // Absolute fallback: keep layout running but stay as close to the own parent as possible.
            if (!placed) {
              const forced = clampPosition(attr.type, fallbackX, fallbackY);
              attr.x = forced.x;
              attr.y = forced.y;
              reserveNode(attr, 12);
            }
          }
        });
    });

    if (orphanAttributes.length > 0) {
      const orphanY = relFallbackY + entityGapY * 1.4;
      orphanAttributes.forEach((attr, index) => {
        const row = Math.floor(index / entityCols);
        const col = index % entityCols;
        placeNode(attr, startX + col * entityGapX, orphanY + row * entityGapY - 18, 12);
      });
    }

    renderAll();
    requestRelModelSync();
  }

  function positionIsFree(type, x, y) {
    const candidate = getNodeBounds({ type, x, y });
    return !S().nodes.some((node) => boxesOverlap(candidate, getNodeBounds(node)));
  }

  function findFreePosition(type, preferredX, preferredY) {
    const angles = 12;
    for (let ring = 0; ring < 12; ring += 1) {
      const radius = ring * 42;
      for (let step = 0; step < angles; step += 1) {
        const angle = (step / angles) * Math.PI * 2;
        const candidate = clampPosition(
          type,
          preferredX + Math.cos(angle) * radius,
          preferredY + Math.sin(angle) * radius,
        );
        if (positionIsFree(type, candidate.x, candidate.y)) return candidate;
      }
    }
    return clampPosition(type, preferredX, preferredY);
  }

  function getCardinalityTypeFromEdges(existingEdges) {
    const left = existingEdges[0] ? edgeLabel(existingEdges[0], 'to') : '1';
    const right = existingEdges[1] ? edgeLabel(existingEdges[1], 'to') : '1';
    return `${left}:${right}`;
  }

  function getCardinalityParts(type) {
    switch ((type || '1:1').toLowerCase()) {
      case '1:n':
        return ['1', 'n'];
      case 'n:1':
        return ['n', '1'];
      case 'n:m':
        return ['n', 'm'];
      default:
        return ['1', '1'];
    }
  }

  function renderAll() {
    edgesLayer.innerHTML = '';
    nodesLayer.innerHTML = '';
    const relationshipCornerAssignments = buildRelationshipCornerAssignments();
    S().edges.forEach((edge) => renderEdge(edge, relationshipCornerAssignments));
    S().nodes.forEach(renderNode);
    if (window.AppState?.persistDebounced) window.AppState.persistDebounced();

    // Debounced Quest Validation – nur wenn Panel aktiv
    if (questValidateTimeout) clearTimeout(questValidateTimeout);
    questValidateTimeout = setTimeout(() => {
      if (window.Quest?.state?.questsPanelVisible) {
        window.Quest.validateCurrentQuest();
      }
      questValidateTimeout = null;
    }, 600);
  }

  function applySelectedStyle(shape, strokeColor) {
    shape.setAttribute('stroke', strokeColor);
    shape.setAttribute('stroke-width', '3');
    shape.style.filter = 'drop-shadow(0 6px 14px rgba(30, 41, 59, 0.18))';
  }

  function renderNode(node) {
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('class', 'node node-' + node.type);
    g.setAttribute('data-id', node.id);
    g.setAttribute('transform', `translate(${node.x},${node.y})`);
    const isSelected = selectedNodeId === node.id;

    let shape;
    let textEl;
    if (node.type === 'entity') {
      shape = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      shape.setAttribute('width', NODE_ENTITY_W);
      shape.setAttribute('height', NODE_ENTITY_H);
      shape.setAttribute('fill', isSelected ? '#bfdbfe' : '#dbeafe');
      shape.setAttribute('stroke', '#2563eb');
      shape.setAttribute('stroke-width', '2');
      textEl = makeText(NODE_ENTITY_W / 2, NODE_ENTITY_H / 2, node.name || 'Entitätsklasse');
    } else if (node.type === 'attribute') {
      shape = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
      shape.setAttribute('cx', NODE_ATTR_RX);
      shape.setAttribute('cy', NODE_ATTR_RY);
      shape.setAttribute('rx', NODE_ATTR_RX);
      shape.setAttribute('ry', NODE_ATTR_RY);
      shape.setAttribute('fill', isSelected ? '#fde68a' : '#fef3c7');
      shape.setAttribute('stroke', '#d97706');
      shape.setAttribute('stroke-width', '2');

      textEl = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      textEl.setAttribute('x', NODE_ATTR_RX);
      textEl.setAttribute('y', NODE_ATTR_RY);
      textEl.setAttribute('text-anchor', 'middle');
      textEl.setAttribute('dominant-baseline', 'middle');
      textEl.setAttribute('font-size', '13');
      textEl.setAttribute('fill', '#1e293b');
      if (node.isPrimaryKey) {
        textEl.setAttribute('font-weight', '800');
        textEl.textContent = node.name || 'Attribut';
      } else {
        textEl.textContent = node.name || 'Attribut';
      }
    } else {
      shape = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
      shape.setAttribute(
        'points',
        `${NODE_REL_W / 2},0 ${NODE_REL_W},${NODE_REL_H / 2} ${NODE_REL_W / 2},${NODE_REL_H} 0,${NODE_REL_H / 2}`,
      );
      shape.setAttribute('fill', isSelected ? '#bbf7d0' : '#dcfce7');
      shape.setAttribute('stroke', '#16a34a');
      shape.setAttribute('stroke-width', '2');
      textEl = makeText(NODE_REL_W / 2, NODE_REL_H / 2, node.name || 'Beziehung');
    }

    if (isSelected) {
      const selectedStroke = node.type === 'entity' ? '#1d4ed8' : node.type === 'attribute' ? '#b45309' : '#15803d';
      applySelectedStyle(shape, selectedStroke);
    }

    const hit = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    hit.setAttribute('x', -5);
    hit.setAttribute('y', -5);
    const bbox =
      node.type === 'entity'
        ? { w: NODE_ENTITY_W + 10, h: NODE_ENTITY_H + 10 }
        : node.type === 'attribute'
          ? { w: NODE_ATTR_RX * 2 + 10, h: NODE_ATTR_RY * 2 + 10 }
          : { w: NODE_REL_W + 10, h: NODE_REL_H + 10 };
    hit.setAttribute('width', bbox.w);
    hit.setAttribute('height', bbox.h);
    hit.setAttribute('fill', 'transparent');

    g.appendChild(shape);
    if (textEl) g.appendChild(textEl);
    if (node.type === 'attribute' && node.isPrimaryKey) {
      g.appendChild(makePrimaryKeyDecoration(node.name || 'Attribut', NODE_ATTR_RX, NODE_ATTR_RY));
    }
    g.appendChild(hit);

    nodesLayer.appendChild(g);
  }

  function renderEdge(edge, relationshipCornerAssignments) {
    const fromNode = byId(edge.fromId);
    const toNode = byId(edge.toId);
    if (!fromNode || !toNode) return;

    // Detect self-pair (same entity connected twice to one relationship)
    const relNodeForPair = fromNode.type === 'relationship' ? fromNode : toNode.type === 'relationship' ? toNode : null;
    const entNodeForPair =
      relNodeForPair && fromNode.type === 'entity'
        ? fromNode
        : relNodeForPair && toNode.type === 'entity'
          ? toNode
          : null;
    const pairSide =
      relNodeForPair && entNodeForPair && isRelationshipEdge(edge)
        ? selfPairOffset(edge, relNodeForPair, relationshipCornerAssignments)
        : 0;
    const SELF_PAIR_AIM = 16;

    const fc = getNodeCenter(fromNode);
    const tc = getNodeCenter(toNode);
    const fp =
      isRelationshipEdge(edge) && fromNode.type === 'relationship'
        ? relationshipCornerAssignments.get(`${edge.id}:${fromNode.id}`) || getEdgeEndpoint(fromNode, tc.x, tc.y)
        : getEdgeEndpoint(fromNode, tc.x, tc.y);

    let toTargetX = fc.x;
    let toTargetY = fc.y;
    if (pairSide !== 0 && toNode.type === 'entity' && fromNode.type === 'relationship') {
      const toCenter = getNodeCenter(toNode);
      const vx = toCenter.x - fp.x;
      const vy = toCenter.y - fp.y;
      const vLen = Math.sqrt(vx * vx + vy * vy) || 1;
      const perpX = -vy / vLen;
      const perpY = vx / vLen;
      toTargetX = fp.x + perpX * pairSide * SELF_PAIR_AIM;
      toTargetY = fp.y + perpY * pairSide * SELF_PAIR_AIM;
    }

    const tp =
      isRelationshipEdge(edge) && toNode.type === 'relationship'
        ? relationshipCornerAssignments.get(`${edge.id}:${toNode.id}`) || getEdgeEndpoint(toNode, fc.x, fc.y)
        : getEdgeEndpoint(toNode, toTargetX, toTargetY);

    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', fp.x);
    line.setAttribute('y1', fp.y);
    line.setAttribute('x2', tp.x);
    line.setAttribute('y2', tp.y);
    line.setAttribute('class', 'edge-line');
    line.setAttribute('data-id', edge.id);
    line.setAttribute('stroke', '#475569');
    line.setAttribute('stroke-width', '2');
    line.setAttribute('fill', 'none');

    const hit = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    hit.setAttribute('x1', fp.x);
    hit.setAttribute('y1', fp.y);
    hit.setAttribute('x2', tp.x);
    hit.setAttribute('y2', tp.y);
    hit.setAttribute('class', 'edge-hit');
    hit.setAttribute('data-id', edge.id);

    edgesLayer.appendChild(line);

    if (isRelationshipEdge(edge)) {
      const OFFSET = 30;
      const LABEL_OFFSET = 16;
      const ENTITY_CLEARANCE = 24;
      const VERTICAL_ALIGN_TOLERANCE = 28;
      const UPPER_LOWER_DOMINANCE_RATIO = 0.6;
      const dx = tp.x - fp.x;
      const dy = tp.y - fp.y;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      const ux = dx / len;
      const uy = dy / len;
      const entityIsTarget = toNode.type === 'entity';
      const entityNode = entityIsTarget ? toNode : fromNode;
      const label = entityIsTarget ? edgeLabel(edge, 'to') : edgeLabel(edge, 'from');
      const anchorX = entityIsTarget ? tp.x : fp.x;
      const anchorY = entityIsTarget ? tp.y : fp.y;
      const direction = entityIsTarget ? -1 : 1;
      const baseLabelX = anchorX + ux * OFFSET * direction;
      const baseLabelY = anchorY + uy * OFFSET * direction;
      const relCenterForPlacement = relNodeForPair ? getNodeCenter(relNodeForPair) : null;
      const entCenterForPlacement = entNodeForPair ? getNodeCenter(entNodeForPair) : null;
      const relToEntDx =
        relCenterForPlacement && entCenterForPlacement ? entCenterForPlacement.x - relCenterForPlacement.x : 0;
      const relToEntDy =
        relCenterForPlacement && entCenterForPlacement ? entCenterForPlacement.y - relCenterForPlacement.y : 0;
      const isVerticalSelfPair =
        pairSide !== 0 &&
        relCenterForPlacement &&
        entCenterForPlacement &&
        (Math.abs(relToEntDx) <= VERTICAL_ALIGN_TOLERANCE ||
          Math.abs(relToEntDy) >= Math.abs(relToEntDx) * UPPER_LOWER_DOMINANCE_RATIO);
      const isVerticalLine = Math.abs(dx) <= 8;

      let normalX = -uy;
      let normalY = ux;

      // Senkrechte Linien: Kardinalitaet immer rechts von der Linie.
      if (isVerticalLine) {
        normalX = 1;
        normalY = 0;
      } else {
        // If entity is directly above/below relationship, place labels outside left/right of the two lines.
        if (isVerticalSelfPair) {
          normalX = pairSide;
          normalY = 0;
        }

        // Default label side: upper/left. Self-pair second edge gets flipped.
        if (!isVerticalSelfPair && normalY > 0) {
          normalX *= -1;
          normalY *= -1;
        }
        if (!isVerticalSelfPair && pairSide > 0) {
          normalX *= -1;
          normalY *= -1;
        }
      }

      const preferredPoint = {
        x: baseLabelX + normalX * LABEL_OFFSET,
        y: baseLabelY + normalY * LABEL_OFFSET,
      };
      const entityBounds = getNodeBounds(entityNode);
      const finalPoint = movePointToRectClearance(preferredPoint, entityBounds, ENTITY_CLEARANCE, normalX, normalY);

      const text = makeLabelText(finalPoint.x, finalPoint.y, label);
      edgesLayer.appendChild(text);
    }

    edgesLayer.appendChild(hit);

    hit.addEventListener('click', (e) => {
      e.stopPropagation();
    });
    hit.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      hideContextMenu();
    });
  }

  function setSelectModeVisual() {
    document.querySelectorAll('.tool-btn').forEach((btn) => btn.classList.remove('active'));
    svg.className.baseVal = '';
    svg.classList.add('tool-select');
  }

  function getSpawnPosition(type) {
    const localCenter = getCanvasCenterLocal();
    const worldCenterX = (-viewState.x + localCenter.x) / viewState.scale;
    const worldCenterY = (-viewState.y + localCenter.y) / viewState.scale;
    const dims =
      type === 'entity'
        ? { w: NODE_ENTITY_W, h: NODE_ENTITY_H }
        : type === 'attribute'
          ? { w: NODE_ATTR_RX * 2, h: NODE_ATTR_RY * 2 }
          : { w: NODE_REL_W, h: NODE_REL_H };
    return findFreePosition(type, worldCenterX - dims.w / 2, worldCenterY - dims.h / 2);
  }

  function getAttributeSpawnPosition(entityNode) {
    const center = getNodeCenter(entityNode);
    for (let ring = 0; ring < 4; ring += 1) {
      const radius = 116 + ring * 34;
      for (let step = 0; step < 12; step += 1) {
        const angle = (step / 12) * Math.PI * 2;
        const candidate = clampPosition(
          'attribute',
          center.x + Math.cos(angle) * radius - NODE_ATTR_RX,
          center.y + Math.sin(angle) * radius - NODE_ATTR_RY,
        );
        if (positionIsFree('attribute', candidate.x, candidate.y)) return candidate;
      }
    }
    return findFreePosition('attribute', center.x + 90 - NODE_ATTR_RX, center.y - NODE_ATTR_RY);
  }

  function addNode(type, x, y) {
    const snapped = clampPosition(type, x, y);
    const nodeName =
      type === 'entity' ? getUniqueEntityName('Entitätsklasse') : type === 'attribute' ? 'Attribut' : 'Beziehung';
    const node = {
      id: genId(),
      type,
      x: snapped.x,
      y: snapped.y,
      name: nodeName,
      isPrimaryKey: false,
    };
    S().nodes.push(node);
    renderAll();
    setTimeout(() => startInlineEdit(node), 30);
    return node;
  }

  function findEdge(fromId, toId, edgeType) {
    return S().edges.find(
      (e) =>
        e.edgeType === edgeType &&
        ((e.fromId === fromId && e.toId === toId) || (e.fromId === toId && e.toId === fromId)),
    );
  }

  function createEdge(fromId, toId, edgeType) {
    const existing = findEdge(fromId, toId, edgeType);
    if (existing) return existing.id;
    const edge = {
      id: genId(),
      fromId,
      toId,
      edgeType,
      chenFrom: '1',
      chenTo: 'n',
    };
    S().edges.push(edge);
    renderAll();
    return edge.id;
  }

  function addEntityAction() {
    const p = getSpawnPosition('entity');
    addNode('entity', p.x, p.y);
  }

  function addAttributeToEntity(entityId) {
    const entityNode = byId(entityId);
    if (!entityNode || entityNode.type !== 'entity') return;
    const p = getAttributeSpawnPosition(entityNode);
    const attrNode = addNode('attribute', p.x, p.y);
    attrNode.name = getUniqueOwnerAttributeName(entityNode.id, attrNode.name || 'Attribut', attrNode.id);
    createEdge(entityNode.id, attrNode.id, 'attribute');
  }

  function getAttributeSpawnPositionForNode(node) {
    const center = getNodeCenter(node);
    for (let ring = 0; ring < 4; ring += 1) {
      const radius = 116 + ring * 34;
      for (let step = 0; step < 12; step += 1) {
        const angle = (step / 12) * Math.PI * 2;
        const candidate = clampPosition(
          'attribute',
          center.x + Math.cos(angle) * radius - NODE_ATTR_RX,
          center.y + Math.sin(angle) * radius - NODE_ATTR_RY,
        );
        if (positionIsFree('attribute', candidate.x, candidate.y)) return candidate;
      }
    }
    return findFreePosition('attribute', center.x + 90 - NODE_ATTR_RX, center.y - NODE_ATTR_RY);
  }

  function addAttributeToRelationship(relationshipId) {
    const relationshipNode = byId(relationshipId);
    if (!relationshipNode || relationshipNode.type !== 'relationship') return;
    const p = getAttributeSpawnPositionForNode(relationshipNode);
    const attrNode = addNode('attribute', p.x, p.y);
    attrNode.name = getUniqueOwnerAttributeName(relationshipNode.id, attrNode.name || 'Attribut', attrNode.id);
    createEdge(relationshipNode.id, attrNode.id, 'attribute');
  }

  function addRelationshipAction() {
    const p = getSpawnPosition('relationship');
    addNode('relationship', p.x, p.y);
  }

  function bindToolbarActions() {
    document.querySelectorAll('.tool-btn[data-tool]').forEach((btn) => {
      btn.addEventListener('click', () => {
        hideContextMenu();
        if (S().diagramLocked) {
          window.App?.showLockedWarning?.();
          return;
        }
        const tool = btn.dataset.tool;
        if (tool === 'entity') addEntityAction();
        if (tool === 'relationship') addRelationshipAction();
        setSelectModeVisual();
      });
    });
  }

  function bindLayoutControls() {
    if (snapGridToggle) {
      snapGridToggle.checked = isSnapToGridEnabled();
      snapGridToggle.addEventListener('change', () => {
        setSnapToGrid(snapGridToggle.checked);
      });
    }

    if (autoLayoutButton) {
      autoLayoutButton.addEventListener('click', () => {
        hideContextMenu();
        autoArrangeDiagram();
        centerView();
      });
    }

    setSnapToGrid(isSnapToGridEnabled());
  }

  function getRelationshipEntityEdges(relationshipId) {
    return S().edges.filter((edge) => {
      if (!isRelationshipEdge(edge)) return false;
      if (edge.fromId !== relationshipId && edge.toId !== relationshipId) return false;
      const otherId = edge.fromId === relationshipId ? edge.toId : edge.fromId;
      const otherNode = byId(otherId);
      return otherNode && otherNode.type === 'entity';
    });
  }

  function fillEntitySelect(select, entities, selectedId) {
    select.innerHTML = '';
    const empty = document.createElement('option');
    empty.value = '';
    empty.textContent = '- keine -';
    select.appendChild(empty);

    entities.forEach((entity) => {
      const option = document.createElement('option');
      option.value = entity.id;
      option.textContent = entity.name || 'Entitätsklasse';
      select.appendChild(option);
    });

    select.value = selectedId || '';
  }

  function getRelationshipEntityId(edge, relationshipId) {
    return edge.fromId === relationshipId ? edge.toId : edge.fromId;
  }

  function getRelationshipNodeIdFromEdge(edge) {
    if (!edge || !isRelationshipEdge(edge)) return null;
    const fromNode = byId(edge.fromId);
    const toNode = byId(edge.toId);
    if (fromNode?.type === 'relationship') return fromNode.id;
    if (toNode?.type === 'relationship') return toNode.id;
    return null;
  }

  function attributeBelongsToRelationship(attributeId) {
    const edge = S().edges.find(
      (e) => e.edgeType === 'attribute' && (e.fromId === attributeId || e.toId === attributeId),
    );
    if (!edge) return false;
    const otherId = edge.fromId === attributeId ? edge.toId : edge.fromId;
    const otherNode = byId(otherId);
    return !!otherNode && otherNode.type === 'relationship';
  }

  function createRelationshipEdge(relationshipId, entityId, cardinality) {
    const edge = {
      id: genId(),
      fromId: relationshipId,
      toId: entityId,
      edgeType: 'relationship',
      chenFrom: '1',
      chenTo: (cardinality || '1').toLowerCase(),
    };
    S().edges.push(edge);
    return edge.id;
  }

  function openRelationshipModal(relationshipId) {
    const relationshipNode = byId(relationshipId);
    if (!relationshipNode || relationshipNode.type !== 'relationship') return;

    if (activeModalCleanup) activeModalCleanup();

    const entities = S().nodes.filter((node) => node.type === 'entity');
    const existingEdges = getRelationshipEntityEdges(relationshipId).slice(0, 2);

    modalTitle.textContent = 'Beziehung bearbeiten';
    modalSubtitle.textContent = `Verbinde ${relationshipNode.name || 'Beziehung'} mit bis zu zwei Entitätsklassen.`;

    fillEntitySelect(
      modalEntity1,
      entities,
      existingEdges[0] ? getRelationshipEntityId(existingEdges[0], relationshipId) : '',
    );
    fillEntitySelect(
      modalEntity2,
      entities,
      existingEdges[1] ? getRelationshipEntityId(existingEdges[1], relationshipId) : '',
    );
    modalCardinality.value = getCardinalityTypeFromEdges(existingEdges);

    modalBackdrop.style.display = '';

    const cleanup = () => {
      modalOk.removeEventListener('click', onOk);
      modalCancel.removeEventListener('click', onCancel);
      modalBackdrop.style.display = 'none';
      if (activeModalCleanup === cleanup) activeModalCleanup = null;
    };

    const onOk = () => {
      const entityId1 = modalEntity1.value;
      const entityId2 = modalEntity2.value;
      const [leftCardinality, rightCardinality] = getCardinalityParts(modalCardinality.value);

      S().edges = S().edges.filter((edge) => {
        if (!isRelationshipEdge(edge)) return true;
        if (edge.fromId !== relationshipId && edge.toId !== relationshipId) return true;
        const otherId = edge.fromId === relationshipId ? edge.toId : edge.fromId;
        const otherNode = byId(otherId);
        return !(otherNode && otherNode.type === 'entity');
      });

      if (entityId1) createRelationshipEdge(relationshipId, entityId1, leftCardinality);
      if (entityId2) createRelationshipEdge(relationshipId, entityId2, rightCardinality);

      cleanup();
      selectNodeFn(relationshipId);
      renderAll();
      requestRelModelSync();
    };

    const onCancel = () => cleanup();

    activeModalCleanup = cleanup;
    modalOk.addEventListener('click', onOk);
    modalCancel.addEventListener('click', onCancel);
  }

  function showContextMenu(event, type, id) {
    ctxTarget = { type, id };

    let showRename = false;
    let showEditRelationship = false;
    let showAddAttr = false;
    let showTogglePk = false;
    let showDelete = false;

    if (type === 'node') {
      const node = byId(id);
      if (!node) return;
      showRename = true;
      showEditRelationship = node.type === 'relationship';
      showAddAttr = node.type === 'entity' || node.type === 'relationship';
      showTogglePk = node.type === 'attribute' && !attributeBelongsToRelationship(node.id);
      showDelete = true;

      if (showTogglePk) {
        ctxTogglePk.textContent = node.isPrimaryKey ? 'Primärschlüssel entfernen' : 'Als Primärschlüssel markieren';
      }
    }

    ctxRename.style.display = showRename ? '' : 'none';
    ctxEditRelationship.style.display = showEditRelationship ? '' : 'none';
    ctxAddAttr.style.display = showAddAttr ? '' : 'none';
    ctxTogglePk.style.display = showTogglePk ? '' : 'none';
    ctxDelete.style.display = showDelete ? '' : 'none';

    if (!showRename && !showEditRelationship && !showAddAttr && !showTogglePk && !showDelete) {
      ctxTarget = null;
      return;
    }

    contextMenu.style.display = 'block';
    const { innerWidth, innerHeight } = window;
    const menuWidth = contextMenu.offsetWidth;
    const menuHeight = contextMenu.offsetHeight;
    const left = Math.min(event.clientX, innerWidth - menuWidth - 8);
    const top = Math.min(event.clientY, innerHeight - menuHeight - 8);
    contextMenu.style.left = `${Math.max(8, left)}px`;
    contextMenu.style.top = `${Math.max(8, top)}px`;
  }

  function hideContextMenu() {
    contextMenu.style.display = 'none';
    ctxTarget = null;
  }

  // --- Node interaction via event delegation ---
  // nodesLayer persists across renderAll() calls, so listeners here
  // are registered once and always work regardless of re-renders.
  let nodeClickTimer = null;

  function bindNodeLayerEvents() {
    function getNodeFromTarget(target) {
      const g = target.closest('.node');
      if (!g) return null;
      const id = g.getAttribute('data-id');
      return id ? byId(id) : null;
    }

    let lastMousedownNodeId = null;
    let lastMousedownTime = 0;
    const DBLCLICK_MS = 350;

    nodesLayer.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      const node = getNodeFromTarget(e.target);
      if (!node) return;
      e.stopPropagation();
      hideContextMenu();
      if (S().diagramLocked) {
        window.App?.showLockedWarning?.();
        return;
      }

      const now = Date.now();
      const isDoubleClick = node.id === lastMousedownNodeId && now - lastMousedownTime < DBLCLICK_MS;

      if (isDoubleClick) {
        // Reset so a third click doesn't re-trigger
        lastMousedownNodeId = null;
        lastMousedownTime = 0;
        // Cancel pending single-click modal (relationship nodes)
        if (nodeClickTimer !== null) {
          clearTimeout(nodeClickTimer);
          nodeClickTimer = null;
        }
        e.preventDefault();
        startInlineEdit(node);
        return;
      }

      lastMousedownNodeId = node.id;
      lastMousedownTime = now;

      selectNodeFn(node.id);

      const svgPt = getSVGPoint(e);
      dragging = {
        nodeId: node.id,
        offsetX: svgPt.x - node.x,
        offsetY: svgPt.y - node.y,
        linkedAttributeIds:
          node.type === 'entity' || node.type === 'relationship'
            ? S()
                .edges.filter(
                  (edge) => edge.edgeType === 'attribute' && (edge.fromId === node.id || edge.toId === node.id),
                )
                .map((edge) => (edge.fromId === node.id ? edge.toId : edge.fromId))
            : [],
      };
      suppressClick = false;
      e.preventDefault();
    });

    nodesLayer.addEventListener('click', (e) => {
      const node = getNodeFromTarget(e.target);
      if (!node) return;
      e.stopPropagation();
      if (suppressClick) {
        suppressClick = false;
        return;
      }
      if (node.type === 'relationship') {
        if (S().diagramLocked) {
          window.App?.showLockedWarning?.();
          return;
        }
        const capturedId = node.id;
        nodeClickTimer = setTimeout(() => {
          nodeClickTimer = null;
          openRelationshipModal(capturedId);
        }, DBLCLICK_MS + 50);
      }
    });

    nodesLayer.addEventListener('contextmenu', (e) => {
      const node = getNodeFromTarget(e.target);
      if (!node) return;
      e.preventDefault();
      e.stopPropagation();
      hideContextMenu();
      if (S().diagramLocked) {
        window.App?.showLockedWarning?.();
        return;
      }
      showContextMenu(e, 'node', node.id);
    });
  }

  svg.addEventListener('mousemove', (e) => {
    if (panning) {
      const local = getLocalSVGPoint(e);
      viewState.x = panning.startViewX + (local.x - panning.startX);
      viewState.y = panning.startViewY + (local.y - panning.startY);
      hasPanned = hasPanned || Math.abs(local.x - panning.startX) > 2 || Math.abs(local.y - panning.startY) > 2;
      applyViewTransform();
      return;
    }
    if (!dragging) return;
    const svgPt = getSVGPoint(e);
    const node = byId(dragging.nodeId);
    if (!node) {
      dragging = null;
      return;
    }
    const newX = svgPt.x - dragging.offsetX;
    const newY = svgPt.y - dragging.offsetY;
    const snapped = clampPosition(node.type, newX, newY);
    const dx = snapped.x - node.x;
    const dy = snapped.y - node.y;
    node.x = snapped.x;
    node.y = snapped.y;
    if ((node.type === 'entity' || node.type === 'relationship') && dragging.linkedAttributeIds.length) {
      dragging.linkedAttributeIds.forEach((attrId) => {
        const attrNode = byId(attrId);
        if (!attrNode || attrNode.type !== 'attribute') return;
        attrNode.x += dx;
        attrNode.y += dy;
      });
    }
    suppressClick = true;
    renderAll();
  });

  svg.addEventListener('mouseup', () => {
    dragging = null;
    panning = null;
    svg.classList.remove('is-panning');
  });
  svg.addEventListener('mouseleave', () => {
    dragging = null;
    panning = null;
    svg.classList.remove('is-panning');
  });

  svg.addEventListener('mousedown', (e) => {
    const backgroundClick = e.target === svg || (e.target.tagName === 'rect' && !e.target.closest('.node'));
    const shouldPan = backgroundClick && (e.button === 0 || e.button === 1 || (e.button === 0 && spacePressed));
    if (!shouldPan) return;

    const local = getLocalSVGPoint(e);
    panning = {
      startX: local.x,
      startY: local.y,
      startViewX: viewState.x,
      startViewY: viewState.y,
    };
    hasPanned = false;
    svg.classList.add('is-panning');
    hideContextMenu();
    e.preventDefault();
  });

  svg.addEventListener('wheel', (e) => {
    if (e.ctrlKey || e.metaKey) {
      const local = getLocalSVGPoint(e);
      const factor = e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
      setZoom(viewState.scale * factor, local.x, local.y);
    } else {
      const panFactor = e.shiftKey ? 1 : 0.65;
      viewState.x -= e.deltaX * panFactor;
      viewState.y -= e.deltaY * panFactor;
      applyViewTransform();
    }
    e.preventDefault();
  });

  svg.addEventListener('click', (e) => {
    if (hasPanned) {
      hasPanned = false;
      return;
    }
    hideContextMenu();
    if (e.target === svg || (e.target.tagName === 'rect' && !e.target.closest('.node'))) {
      deselectAll();
    }
  });

  svg.addEventListener('contextmenu', (e) => {
    if (e.target === svg || (e.target.tagName === 'rect' && !e.target.closest('.node'))) {
      hideContextMenu();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === ' ') {
      spacePressed = true;
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      const tag = document.activeElement.tagName.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      if (S().diagramLocked) {
        window.App?.showLockedWarning?.();
        return;
      }
      if (selectedNodeId) {
        deleteNode(selectedNodeId);
        return;
      }
    }
    if (e.key === 'Escape') {
      hideContextMenu();
      if (activeModalCleanup) activeModalCleanup();
      deselectAll();
    }
  });

  document.addEventListener('keyup', (e) => {
    if (e.key === ' ') {
      spacePressed = false;
    }
  });

  function deleteNode(nodeId) {
    S().nodes = S().nodes.filter((n) => n.id !== nodeId);
    S().edges = S().edges.filter((e) => e.fromId !== nodeId && e.toId !== nodeId);
    deselectAll();
    renderAll();
    requestRelModelSync();
  }

  function deleteEdge(edgeId) {
    S().edges = S().edges.filter((e) => e.id !== edgeId);
    deselectAll();
    renderAll();
    requestRelModelSync();
  }

  function selectNodeFn(id) {
    selectedNodeId = id;
    window.AppSelect.selectNode(id);
    renderAll();
  }

  function deselectAll() {
    selectedNodeId = null;
    window.AppSelect.clearSelection();
    renderAll();
  }

  modalBackdrop.addEventListener('click', (e) => {
    if (e.target === modalBackdrop) {
      if (activeModalCleanup) activeModalCleanup();
    }
  });

  document.addEventListener('click', (e) => {
    if (!contextMenu.contains(e.target)) {
      hideContextMenu();
    }
  });

  ctxRename.addEventListener('click', () => {
    if (!ctxTarget || ctxTarget.type !== 'node') return;
    if (S().diagramLocked) {
      hideContextMenu();
      window.App?.showLockedWarning?.();
      return;
    }
    const node = byId(ctxTarget.id);
    hideContextMenu();
    if (node) startInlineEdit(node);
  });

  ctxEditRelationship.addEventListener('click', () => {
    if (!ctxTarget || ctxTarget.type !== 'node') return;
    if (S().diagramLocked) {
      hideContextMenu();
      window.App?.showLockedWarning?.();
      return;
    }

    let relationshipId = null;
    const node = byId(ctxTarget.id);
    if (node?.type === 'relationship') relationshipId = node.id;

    hideContextMenu();
    if (relationshipId) {
      selectNodeFn(relationshipId);
      openRelationshipModal(relationshipId);
    }
  });

  ctxAddAttr.addEventListener('click', () => {
    if (!ctxTarget || ctxTarget.type !== 'node') return;
    if (S().diagramLocked) {
      hideContextMenu();
      window.App?.showLockedWarning?.();
      return;
    }

    const node = byId(ctxTarget.id);
    hideContextMenu();
    if (node && node.type === 'entity') addAttributeToEntity(node.id);
    if (node && node.type === 'relationship') addAttributeToRelationship(node.id);
  });

  ctxTogglePk.addEventListener('click', () => {
    if (!ctxTarget || ctxTarget.type !== 'node') return;
    if (S().diagramLocked) {
      hideContextMenu();
      window.App?.showLockedWarning?.();
      return;
    }
    const node = byId(ctxTarget.id);
    hideContextMenu();
    if (!node || node.type !== 'attribute') return;

    node.isPrimaryKey = !node.isPrimaryKey;
    selectNodeFn(node.id);
    const pkCheckbox = document.getElementById('prop-pk');
    if (pkCheckbox) pkCheckbox.checked = !!node.isPrimaryKey;
    renderAll();
    requestRelModelSync();
  });

  ctxDelete.addEventListener('click', () => {
    if (!ctxTarget) return;
    if (S().diagramLocked) {
      hideContextMenu();
      window.App?.showLockedWarning?.();
      return;
    }
    const target = ctxTarget;
    hideContextMenu();
    if (target.type === 'node') deleteNode(target.id);
    if (target.type === 'edge') deleteEdge(target.id);
  });

  function startInlineEdit(node) {
    const originalName = node.name || '';
    let finished = false;
    let finishAction = 'commit';
    let cx;
    let cy;
    let fw;
    if (node.type === 'entity') {
      cx = node.x + NODE_ENTITY_W / 2;
      cy = node.y + NODE_ENTITY_H / 2;
      fw = NODE_ENTITY_W - 10;
    } else if (node.type === 'attribute') {
      cx = node.x + NODE_ATTR_RX;
      cy = node.y + NODE_ATTR_RY;
      fw = NODE_ATTR_RX * 2 - 10;
    } else {
      cx = node.x + NODE_REL_W / 2;
      cy = node.y + NODE_REL_H / 2;
      fw = NODE_REL_W - 20;
    }

    const fo = document.createElementNS('http://www.w3.org/2000/svg', 'foreignObject');
    fo.setAttribute('x', cx - fw / 2);
    fo.setAttribute('y', cy - 14);
    fo.setAttribute('width', fw);
    fo.setAttribute('height', 28);

    const input = document.createElement('input');
    input.type = 'text';
    input.value = node.name || '';
    input.className = 'svg-inline-input';
    input.style.width = fw + 'px';

    fo.appendChild(input);
    nodesLayer.appendChild(fo);
    input.focus();
    input.select();

    const onOutsidePointerDown = (e) => {
      if (finished) return;
      if (e.target === input) return;
      finishAction = 'commit';
      input.blur();
    };
    document.addEventListener('pointerdown', onOutsidePointerDown, true);

    const cleanup = () => {
      document.removeEventListener('pointerdown', onOutsidePointerDown, true);
      if (nodesLayer.contains(fo)) nodesLayer.removeChild(fo);
      document.getElementById('prop-name').value = node.name;
      renderAll();
      requestRelModelSync();
    };

    const commit = () => {
      if (finished) return;
      const val = input.value.trim();
      let nextName = val || node.name;

      if (node.type === 'entity' && val && isEntityNameTaken(val, node.id)) {
        const uniqueName = getUniqueEntityName(val, node.id);
        input.setCustomValidity('Der Name der Entitätsklasse ist bereits vergeben. Name wurde angepasst.');
        input.reportValidity();
        nextName = uniqueName;
        input.value = uniqueName;
      }

      if (node.type === 'attribute' && val) {
        const owningNode = getOwningNodeForAttribute(node.id);
        if (owningNode && isOwnerAttributeNameTaken(owningNode.id, val, node.id)) {
          const uniqueName = getUniqueOwnerAttributeName(owningNode.id, val, node.id);
          const ownerLabel = owningNode.type === 'relationship' ? 'Beziehung' : 'Entitätsklasse';
          input.setCustomValidity(
            `Der Attributname ist in dieser ${ownerLabel} bereits vergeben. Name wurde angepasst.`,
          );
          input.reportValidity();
          nextName = uniqueName;
          input.value = uniqueName;
        }
      }

      input.setCustomValidity('');

      node.name = nextName || node.name;
      finished = true;
      cleanup();
    };

    const cancel = () => {
      if (finished) return;
      node.name = originalName;
      finished = true;
      cleanup();
    };

    input.addEventListener('blur', () => {
      if (finishAction === 'cancel') {
        cancel();
        return;
      }
      commit();
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        finishAction = 'commit';
        input.blur();
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        finishAction = 'cancel';
        input.blur();
      }
    });
  }

  bindToolbarActions();
  bindLayoutControls();
  bindViewportControls();
  bindNodeLayerEvents();
  setSelectModeVisual();
  applyViewTransform();
  updateZoomIndicator();

  window.Diagram = {
    renderAll,
    selectNode: selectNodeFn,
    clearSelection: deselectAll,
    deleteNode,
    deleteEdge,
    centerView,
    autoLayout: autoArrangeDiagram,
    setSnapToGrid,
    isEntityNameTaken,
  };
})();
