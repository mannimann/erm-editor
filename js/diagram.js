/* ============================================================
   diagram.js  –  SVG-Editor: Rendering, Drag & Drop, Werkzeuge
   ============================================================ */
'use strict';

(function () {
  const NODE_ENTITY_W = 140;
  const NODE_ENTITY_H = 50;
  const NODE_ENTITY_W_MAX = 320;
  const NODE_ATTR_RX = 60;
  const NODE_ATTR_RY = 26;
  const NODE_ATTR_RX_MAX = 170;
  const NODE_REL_W = 130;
  const NODE_REL_H = 60;
  const NODE_REL_W_MAX = 300;
  const GRID_SIZE = 20;

  function truncateLabelToApproxWidth(text, maxWidth, avgCharWidth) {
    const raw = String(text || '').trim();
    if (!raw) return '';
    if (Math.ceil(raw.length * avgCharWidth) <= maxWidth) return raw;
    const allowedChars = Math.max(1, Math.floor((maxWidth - avgCharWidth * 3) / avgCharWidth));
    return `${raw.slice(0, allowedChars)}...`;
  }

  function wrapLabelToTwoLines(text, maxWidth, avgCharWidth) {
    const raw = String(text || '').trim();
    if (!raw) return [''];

    const maxChars = Math.max(3, Math.floor(maxWidth / avgCharWidth));
    if (raw.length <= maxChars) return [raw];

    const words = raw.split(/\s+/).filter((w) => !!w);

    // Fallback for single very long token.
    if (words.length <= 1) {
      if (raw.length <= maxChars * 2) {
        return [raw.slice(0, maxChars), raw.slice(maxChars)];
      }
      return [raw.slice(0, maxChars), `${raw.slice(maxChars, maxChars * 2 - 3)}...`];
    }

    const lines = ['', ''];
    let currentLine = 0;

    words.forEach((word) => {
      if (currentLine > 1) return;
      const candidate = lines[currentLine] ? `${lines[currentLine]} ${word}` : word;
      if (candidate.length <= maxChars) {
        lines[currentLine] = candidate;
        return;
      }
      if (currentLine === 0) {
        currentLine = 1;
        const secondCandidate = lines[currentLine] ? `${lines[currentLine]} ${word}` : word;
        if (secondCandidate.length <= maxChars) {
          lines[currentLine] = secondCandidate;
          return;
        }
      }
      // Word doesn't fit in second line: truncate with ellipsis.
      const base = lines[1] || '';
      const withWord = base ? `${base} ${word}` : word;
      lines[1] = withWord.slice(0, Math.max(1, maxChars - 3)).trimEnd() + '...';
      currentLine = 2;
    });

    const first = lines[0] || raw.slice(0, maxChars);
    const second = lines[1] || '';
    return second ? [first, second] : [first];
  }

  function getNodeVisual(nodeOrType, explicitName = '') {
    const type = typeof nodeOrType === 'string' ? nodeOrType : nodeOrType?.type;
    const rawName = typeof nodeOrType === 'string' ? explicitName : nodeOrType?.name;

    if (type === 'entity') {
      const label = String(rawName || 'Entitätsklasse').trim() || 'Entitätsklasse';
      const avgCharWidth = 7.4;
      // Kleinerer Innenabstand: Text näher am Rand der Entitätsklasse
      const horizontalPadding = 18;
      const maxTextWidth = NODE_ENTITY_W_MAX - horizontalPadding;
      const displayLines = wrapLabelToTwoLines(label, maxTextWidth, avgCharWidth);
      const longest = displayLines.reduce((maxLen, line) => Math.max(maxLen, line.length), 0);
      const width = Math.max(
        NODE_ENTITY_W,
        Math.min(NODE_ENTITY_W_MAX, Math.ceil(longest * avgCharWidth + horizontalPadding)),
      );
      return { w: width, h: NODE_ENTITY_H, displayLines, displayName: displayLines.join(' ') };
    }

    if (type === 'attribute') {
      const label = String(rawName || 'Attribut').trim() || 'Attribut';
      const avgCharWidth = 7.0;
      // Etwas größerer Innenabstand: mehr Luft bis zum Rand der Ellipse
      const horizontalPadding = 36;
      const maxTextWidth = NODE_ATTR_RX_MAX * 2 - horizontalPadding;
      const displayName = truncateLabelToApproxWidth(label, maxTextWidth, avgCharWidth);
      const w = Math.max(
        NODE_ATTR_RX * 2,
        Math.min(NODE_ATTR_RX_MAX * 2, Math.ceil(displayName.length * avgCharWidth + horizontalPadding)),
      );
      const rx = Math.ceil(w / 2);
      return { rx, ry: NODE_ATTR_RY, w, h: NODE_ATTR_RY * 2, displayName };
    }

    const label = String(rawName || 'Beziehung').trim() || 'Beziehung';
    const avgCharWidth = 7.1;
    const horizontalPadding = 36;
    const maxTextWidth = NODE_REL_W_MAX - horizontalPadding;
    const displayLines = wrapLabelToTwoLines(label, maxTextWidth, avgCharWidth);
    const longest = displayLines.reduce((maxLen, line) => Math.max(maxLen, line.length), 0);
    const width = Math.max(NODE_REL_W, Math.min(NODE_REL_W_MAX, Math.ceil(longest * avgCharWidth + horizontalPadding)));
    return { w: width, h: NODE_REL_H, displayLines, displayName: displayLines.join(' ') };
  }

  function getAttributeEllipseSize(nodeOrName) {
    const visual = getNodeVisual(
      typeof nodeOrName === 'string' ? 'attribute' : nodeOrName,
      typeof nodeOrName === 'string' ? nodeOrName : '',
    );
    return { rx: visual.rx, ry: visual.ry, w: visual.w, h: visual.h, displayName: visual.displayName };
  }

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
  const modalCard = document.getElementById('modal-card');
  const modalTitle = document.getElementById('modal-title');
  const modalSubtitle = document.getElementById('modal-subtitle');
  const modalName = document.getElementById('modal-name');
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
  let autoLayoutVariantCounter = 0;

  const ZOOM_MIN = 0.35;
  const ZOOM_MAX = 3;
  const ZOOM_STEP = 1.15;

  function isSnapToGridEnabled() {
    return !!S().snapToGrid;
  }

  function snapValue(value) {
    return Math.round(value / GRID_SIZE) * GRID_SIZE;
  }

  function getNodeSize(type, node = null) {
    if (type === 'entity') {
      const visual = getNodeVisual(node || 'entity', node ? '' : 'Entitätsklasse');
      return { w: visual.w, h: visual.h };
    }
    if (type === 'attribute') {
      const attrSize = getAttributeEllipseSize(node);
      return { w: attrSize.w, h: attrSize.h };
    }
    const visual = getNodeVisual(node || 'relationship', node ? '' : 'Beziehung');
    return { w: visual.w, h: visual.h };
  }

  function maybeSnapPosition(type, x, y) {
    if (!isSnapToGridEnabled()) return { x, y };
    const snappedX = snapValue(x);
    const snappedY = snapValue(y);
    return { x: snappedX, y: snappedY };
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
    return { x: node.x, y: node.y };
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
    const visual = getNodeVisual(node);
    return [
      { index: 0, x: node.x, y: node.y - visual.h / 2 },
      { index: 1, x: node.x + visual.w / 2, y: node.y },
      { index: 2, x: node.x, y: node.y + visual.h / 2 },
      { index: 3, x: node.x - visual.w / 2, y: node.y },
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

  function angleBetweenDirections(ax, ay, bx, by, cx, cy) {
    const v1x = bx - ax;
    const v1y = by - ay;
    const v2x = cx - ax;
    const v2y = cy - ay;
    const l1 = Math.sqrt(v1x * v1x + v1y * v1y) || 1;
    const l2 = Math.sqrt(v2x * v2x + v2y * v2y) || 1;
    const dot = (v1x * v2x + v1y * v2y) / (l1 * l2);
    const clamped = Math.max(-1, Math.min(1, dot));
    return Math.acos(clamped);
  }

  function buildRelationshipCornerAssignments() {
    const OPPOSITE_ANGLE_THRESHOLD = (100 * Math.PI) / 180;
    const OPPOSITE_PENALTY = 1e8;
    const SMALL_ANGLE_OPPOSITE_PENALTY = 2e4;
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

          let oppositePenalty = 0;
          if (n === 2 && edgeData[0].otherId !== edgeData[1].otherId) {
            const angle = angleBetweenDirections(
              relCenter.x,
              relCenter.y,
              edgeData[0].cx,
              edgeData[0].cy,
              edgeData[1].cx,
              edgeData[1].cy,
            );
            const shouldPreferOpposite = angle >= OPPOSITE_ANGLE_THRESHOLD;
            const isOppositePair = Math.abs(candidate[0].corner.index - candidate[1].corner.index) === 2;
            if (shouldPreferOpposite && !isOppositePair) oppositePenalty += OPPOSITE_PENALTY;
            if (!shouldPreferOpposite && isOppositePair) oppositePenalty += SMALL_ANGLE_OPPOSITE_PENALTY;
          }

          const score = crossings * 1e12 + oppositePenalty + totalDist;
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
      const visual = getNodeVisual(node);
      const hw = visual.w / 2;
      const hh = visual.h / 2;
      const t = Math.min(hw / Math.abs(ux || 0.0001), hh / Math.abs(uy || 0.0001));
      return { x: c.x + ux * t, y: c.y + uy * t };
    }
    if (node.type === 'attribute') {
      const attrSize = getAttributeEllipseSize(node);
      const rx = attrSize.rx;
      const ry = attrSize.ry;
      const angle = Math.atan2(dy * rx, dx * ry);
      return { x: c.x + rx * Math.cos(angle), y: c.y + ry * Math.sin(angle) };
    }
    if (node.type === 'relationship') {
      const visual = getNodeVisual(node);
      const hw = visual.w / 2;
      const hh = visual.h / 2;
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
    const lines = Array.isArray(text) ? text.filter((line) => String(line || '').length > 0) : [text];
    if (lines.length <= 1) {
      t.textContent = lines[0] || '';
      return t;
    }

    const lineHeight = 14;
    const startY = y - ((lines.length - 1) * lineHeight) / 2;
    lines.forEach((line, index) => {
      const span = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
      span.setAttribute('x', x);
      span.setAttribute('y', startY + index * lineHeight);
      span.textContent = line;
      t.appendChild(span);
    });
    return t;
  }

  function makePrimaryKeyDecoration(text, rx, ry) {
    const width = Math.max(8, (text || '').trim().length * 7.1);
    const underline = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    underline.setAttribute('x1', -width / 2);
    underline.setAttribute('x2', width / 2);
    underline.setAttribute('y1', 8);
    underline.setAttribute('y2', 8);
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
    if (node.type === 'entity') {
      const visual = getNodeVisual(node);
      return { x: node.x - visual.w / 2, y: node.y - visual.h / 2, w: visual.w, h: visual.h };
    }
    if (node.type === 'attribute') {
      const attrSize = getAttributeEllipseSize(node);
      return { x: node.x - attrSize.rx, y: node.y - attrSize.ry, w: attrSize.w, h: attrSize.h };
    }
    const visual = getNodeVisual(node);
    return { x: node.x - visual.w / 2, y: node.y - visual.h / 2, w: visual.w, h: visual.h };
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

  function pointToSegmentDistance(px, py, ax, ay, bx, by) {
    const abx = bx - ax;
    const aby = by - ay;
    const abLenSq = abx * abx + aby * aby;
    if (abLenSq < 0.0001) return Math.hypot(px - ax, py - ay);

    const apx = px - ax;
    const apy = py - ay;
    const t = Math.max(0, Math.min(1, (apx * abx + apy * aby) / abLenSq));
    const closestX = ax + abx * t;
    const closestY = ay + aby * t;
    return Math.hypot(px - closestX, py - closestY);
  }

  function pointToRectDistance(px, py, rect) {
    const nx = clampValue(px, rect.x, rect.x + rect.w);
    const ny = clampValue(py, rect.y, rect.y + rect.h);
    return Math.hypot(px - nx, py - ny);
  }

  function segmentsIntersect(ax, ay, bx, by, cx, cy, dx, dy) {
    const orient = (px, py, qx, qy, rx, ry) => (qy - py) * (rx - qx) - (qx - px) * (ry - qy);
    const onSeg = (px, py, qx, qy, rx, ry) =>
      Math.min(px, qx) - 1e-9 <= rx &&
      rx <= Math.max(px, qx) + 1e-9 &&
      Math.min(py, qy) - 1e-9 <= ry &&
      ry <= Math.max(py, qy) + 1e-9;

    const o1 = orient(ax, ay, bx, by, cx, cy);
    const o2 = orient(ax, ay, bx, by, dx, dy);
    const o3 = orient(cx, cy, dx, dy, ax, ay);
    const o4 = orient(cx, cy, dx, dy, bx, by);

    if (o1 * o2 < 0 && o3 * o4 < 0) return true;
    if (Math.abs(o1) <= 1e-9 && onSeg(ax, ay, bx, by, cx, cy)) return true;
    if (Math.abs(o2) <= 1e-9 && onSeg(ax, ay, bx, by, dx, dy)) return true;
    if (Math.abs(o3) <= 1e-9 && onSeg(cx, cy, dx, dy, ax, ay)) return true;
    if (Math.abs(o4) <= 1e-9 && onSeg(cx, cy, dx, dy, bx, by)) return true;
    return false;
  }

  function segmentIntersectsRect(ax, ay, bx, by, rect) {
    const left = rect.x;
    const right = rect.x + rect.w;
    const top = rect.y;
    const bottom = rect.y + rect.h;

    const aInside = ax >= left && ax <= right && ay >= top && ay <= bottom;
    const bInside = bx >= left && bx <= right && by >= top && by <= bottom;
    if (aInside || bInside) return true;

    return (
      segmentsIntersect(ax, ay, bx, by, left, top, right, top) ||
      segmentsIntersect(ax, ay, bx, by, right, top, right, bottom) ||
      segmentsIntersect(ax, ay, bx, by, right, bottom, left, bottom) ||
      segmentsIntersect(ax, ay, bx, by, left, bottom, left, top)
    );
  }

  function segmentToRectDistance(ax, ay, bx, by, rect) {
    if (segmentIntersectsRect(ax, ay, bx, by, rect)) return 0;

    const corners = [
      { x: rect.x, y: rect.y },
      { x: rect.x + rect.w, y: rect.y },
      { x: rect.x + rect.w, y: rect.y + rect.h },
      { x: rect.x, y: rect.y + rect.h },
    ];

    let minDist = Math.min(pointToRectDistance(ax, ay, rect), pointToRectDistance(bx, by, rect));
    corners.forEach((c) => {
      minDist = Math.min(minDist, pointToSegmentDistance(c.x, c.y, ax, ay, bx, by));
    });
    return minDist;
  }

  function rectsTouchOrOverlap(a, b) {
    return !(a.x + a.w < b.x || b.x + b.w < a.x || a.y + a.h < b.y || b.y + b.h < a.y);
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
    // Auto-Layout soll bei jedem Klick Varianten erzeugen.
    setSnapToGrid(true);
    autoLayoutVariantCounter += 1;
    const layoutVariant = autoLayoutVariantCounter;

    const nodes = S().nodes;
    if (!nodes.length) return;

    const entities = nodes.filter((node) => node.type === 'entity');
    const relationships = nodes.filter((node) => node.type === 'relationship');
    const attributes = nodes.filter((node) => node.type === 'attribute');

    const shuffleInPlace = (arr) => {
      for (let i = arr.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        const temp = arr[i];
        arr[i] = arr[j];
        arr[j] = temp;
      }
      return arr;
    };

    const getCenterFromCandidate = (type, x, y) => {
      return { x, y };
    };

    const segmentsIntersect = (a, b, c, d) => {
      const orient = (p, q, r) => (q.y - p.y) * (r.x - q.x) - (q.x - p.x) * (r.y - q.y);
      const onSegment = (p, q, r) =>
        q.x <= Math.max(p.x, r.x) + 0.001 &&
        q.x >= Math.min(p.x, r.x) - 0.001 &&
        q.y <= Math.max(p.y, r.y) + 0.001 &&
        q.y >= Math.min(p.y, r.y) - 0.001;

      const o1 = orient(a, b, c);
      const o2 = orient(a, b, d);
      const o3 = orient(c, d, a);
      const o4 = orient(c, d, b);

      if (Math.sign(o1) !== Math.sign(o2) && Math.sign(o3) !== Math.sign(o4)) return true;
      if (Math.abs(o1) < 0.001 && onSegment(a, c, b)) return true;
      if (Math.abs(o2) < 0.001 && onSegment(a, d, b)) return true;
      if (Math.abs(o3) < 0.001 && onSegment(c, a, d)) return true;
      if (Math.abs(o4) < 0.001 && onSegment(c, b, d)) return true;
      return false;
    };

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

    const entityDegree = new Map();
    entities.forEach((entity) => entityDegree.set(entity.id, 0));
    relationships.forEach((relationship) => {
      const relEdges = getRelationshipEntityEdges(relationship.id);
      relEdges.forEach((edge) => {
        const entityId = edge.fromId === relationship.id ? edge.toId : edge.fromId;
        entityDegree.set(entityId, (entityDegree.get(entityId) || 0) + 1);
      });
    });

    const occupiedBounds = [];
    const relationshipSegments = [];
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

    const entityCount = Math.max(1, entities.length);
    // Kompakter, moeglichst quadratischer Block: 4 Entitaeten => 2x2 statt 3x2.
    const entityCols = Math.max(1, Math.ceil(Math.sqrt(entityCount)));
    const entityRows = Math.max(1, Math.ceil(entityCount / entityCols));
    const maxEntityWidth = Math.max(...entities.map((entity) => getNodeVisual(entity).w), NODE_ENTITY_W);
    const maxEntityHeight = Math.max(...entities.map((entity) => getNodeVisual(entity).h), NODE_ENTITY_H);
    const maxRelationshipWidth = Math.max(...relationships.map((rel) => getNodeVisual(rel).w), NODE_REL_W);
    const maxRelationshipHeight = Math.max(...relationships.map((rel) => getNodeVisual(rel).h), NODE_REL_H);
    const toEvenGridStep = (value) => Math.ceil(value / (GRID_SIZE * 2)) * (GRID_SIZE * 2);

    // Feste, gleichmäßige Abstände: in der Mitte muss ein Beziehungsknoten Platz finden.
    const entityGapX = toEvenGridStep(maxEntityWidth + maxRelationshipWidth + 120);
    const entityGapY = toEvenGridStep(maxEntityHeight + maxRelationshipHeight + 110 + maxAttributesPerParent * 2);
    const startX = 120;
    const startY = 100;

    const cellPositions = [];
    for (let row = 0; row < entityRows; row += 1) {
      for (let col = 0; col < entityCols; col += 1) {
        cellPositions.push({
          x: startX + col * entityGapX,
          y: startY + row * entityGapY,
          row,
          col,
        });
      }
    }

    const compactCells = cellPositions.slice(0, entities.length);

    // Vary entity target cells across runs so the same entities do not repeatedly occupy
    // almost identical positions.
    const variantCells = compactCells.slice();
    if (variantCells.length > 1) {
      if (layoutVariant % 2 === 1) variantCells.reverse();
      if (layoutVariant % 4 >= 2) {
        variantCells.sort((a, b) => (a.col === b.col ? a.row - b.row : a.col - b.col));
      }
      const shift = (layoutVariant * 3) % variantCells.length;
      if (shift > 0) {
        const rotated = variantCells.slice(shift).concat(variantCells.slice(0, shift));
        variantCells.length = 0;
        variantCells.push(...rotated);
      }
      // Extra randomness for larger diagrams to avoid repeated placements.
      if (entities.length >= 4 || layoutVariant % 3 === 0) {
        shuffleInPlace(variantCells);
      }
    }

    const entityOrder = entities.slice();
    shuffleInPlace(entityOrder);
    entityOrder.sort((a, b) => {
      const degreeDiff = (entityDegree.get(b.id) || 0) - (entityDegree.get(a.id) || 0);
      if (degreeDiff !== 0) return degreeDiff;
      return Math.random() - 0.5;
    });

    entityOrder.forEach((entity, index) => {
      const cell = variantCells[index] || compactCells[index];
      const snapped = clampPosition(entity.type, cell.x, cell.y);
      entity.x = snapped.x;
      entity.y = snapped.y;
      occupiedBounds.push(getNodeBounds(entity));
    });

    const relFallbackY = startY + entityRows * entityGapY + 140;
    const shuffledRelationships = shuffleInPlace(relationships.slice());
    shuffledRelationships.forEach((relationship, index) => {
      const relVisual = getNodeVisual(relationship);
      const relEdges = getRelationshipEntityEdges(relationship.id);
      const connectedEntities = relEdges
        .map((edge) => byId(edge.fromId === relationship.id ? edge.toId : edge.fromId))
        .filter((node) => !!node && node.type === 'entity');

      if (connectedEntities.length >= 2) {
        const entityCenters = connectedEntities.map((entity) => getNodeCenter(entity));
        const centroid = entityCenters.reduce((acc, center) => ({ x: acc.x + center.x, y: acc.y + center.y }), {
          x: 0,
          y: 0,
        });
        centroid.x /= entityCenters.length;
        centroid.y /= entityCenters.length;

        const firstCenter = entityCenters[0];
        const secondCenter = entityCenters[1];
        const vx = secondCenter.x - firstCenter.x;
        const vy = secondCenter.y - firstCenter.y;
        const dist = Math.sqrt(vx * vx + vy * vy) || 1;
        const ux = vx / dist;
        const uy = vy / dist;
        const nx = -uy;
        const ny = ux;
        const randomPhase = Math.random() * Math.PI * 2;

        const midpoint = {
          x: (firstCenter.x + secondCenter.x) / 2,
          y: (firstCenter.y + secondCenter.y) / 2,
        };

        const candidateCenters = [
          midpoint,
          { x: centroid.x, y: centroid.y },
          { x: centroid.x + nx * 60, y: centroid.y + ny * 60 },
          { x: centroid.x - nx * 60, y: centroid.y - ny * 60 },
          { x: centroid.x + nx * 110, y: centroid.y + ny * 110 },
          { x: centroid.x - nx * 110, y: centroid.y - ny * 110 },
          { x: centroid.x + ux * 70, y: centroid.y + uy * 70 },
          { x: centroid.x - ux * 70, y: centroid.y - uy * 70 },
          {
            x: centroid.x + Math.cos(randomPhase) * 90,
            y: centroid.y + Math.sin(randomPhase) * 90,
          },
        ];

        let bestPos = null;
        let bestScore = Number.POSITIVE_INFINITY;
        candidateCenters.forEach((candidateCenter) => {
          const snapped = clampPosition('relationship', candidateCenter.x, candidateCenter.y);
          const bounds = getNodeBounds({ type: 'relationship', x: snapped.x, y: snapped.y });
          const relCenter = snapped;

          let score = 0;
          if (occupiedBounds.some((b) => boxesOverlap(bounds, b, 22))) score += 8000;

          connectedEntities.forEach((entity) => {
            const entityCenter = getNodeCenter(entity);
            const dx = relCenter.x - entityCenter.x;
            const dy = relCenter.y - entityCenter.y;
            score += Math.sqrt(dx * dx + dy * dy) * 0.9;

            relationshipSegments.forEach((segment) => {
              if (
                segmentsIntersect(
                  { x: relCenter.x, y: relCenter.y },
                  { x: entityCenter.x, y: entityCenter.y },
                  segment.a,
                  segment.b,
                )
              ) {
                score += 1400;
              }
            });
          });

          const toMidX = relCenter.x - midpoint.x;
          const toMidY = relCenter.y - midpoint.y;
          score += Math.sqrt(toMidX * toMidX + toMidY * toMidY) * 0.45;
          score += Math.random() * 12;
          if (score < bestScore) {
            bestScore = score;
            bestPos = snapped;
          }
        });

        const finalPlacement = findNonOverlappingPlacement(
          relationship.type,
          bestPos ? bestPos.x : centroid.x,
          bestPos ? bestPos.y : centroid.y,
          occupiedBounds,
          22,
        );
        relationship.x = finalPlacement.position.x;
        relationship.y = finalPlacement.position.y;
        occupiedBounds.push(finalPlacement.bounds);

        const relationshipCenter = getNodeCenter(relationship);
        connectedEntities.forEach((entity) => {
          relationshipSegments.push({
            a: { x: relationshipCenter.x, y: relationshipCenter.y },
            b: getNodeCenter(entity),
          });
        });
        return;
      }

      if (connectedEntities.length === 1) {
        const entityCenter = getNodeCenter(connectedEntities[0]);
        const orbit = 160 + Math.random() * 70;
        const angle = Math.random() * Math.PI * 2;
        const relPos = clampPosition(
          relationship.type,
          entityCenter.x + Math.cos(angle) * orbit,
          entityCenter.y + Math.sin(angle) * orbit,
        );
        relationship.x = relPos.x;
        relationship.y = relPos.y;
        reserveNode(relationship, 24);
        return;
      }

      const row = Math.floor(index / entityCols);
      const col = index % entityCols;
      const centerX = startX + col * entityGapX + (Math.random() - 0.5) * 60;
      const centerY = relFallbackY + row * entityGapY + (Math.random() - 0.5) * 60;
      const relPos = clampPosition(relationship.type, centerX, centerY);
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

    const layoutAnchorNodes = entities.concat(relationships);
    const layoutCenter = layoutAnchorNodes.length
      ? layoutAnchorNodes.reduce(
          (acc, node) => {
            const c = getNodeCenter(node);
            return { x: acc.x + c.x, y: acc.y + c.y };
          },
          { x: 0, y: 0 },
        )
      : { x: startX, y: startY };
    if (layoutAnchorNodes.length) {
      layoutCenter.x /= layoutAnchorNodes.length;
      layoutCenter.y /= layoutAnchorNodes.length;
    }

    attrsByParent.forEach((attrs, parentId) => {
      const parentNode = byId(parentId);
      if (!parentNode) return;
      const center = getNodeCenter(parentNode);
      const parentCandidates = nodes.filter((n) => n.type === parentNode.type);
      let currentAttr = null;
      const isClosestToOwnParent = (candidatePos) => {
        const candidateCenter = candidatePos;
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

      // Primäres Ziel: konstante sichtbare Linienlaenge (Rand-zu-Rand), nicht Mittelpunktabstand.
      const desiredLineLength = (parentNode.type === 'relationship' ? 68 : 76) + Math.max(0, attrs.length - 10) * 2;
      const lineLengthOffsets = [0, 6, -6, 12, -12, 18, -18, 26, -26];
      const hemisphereSpan = Math.PI * 0.9;
      const hemisphereSteps = Math.max(20, attrs.length * 7);
      const fullCircleSteps = Math.max(30, attrs.length * 10);
      const parentVisual = getNodeVisual(parentNode);
      const parentHalfW = parentVisual.w / 2;
      const parentHalfH = parentVisual.h / 2;
      let outwardAngle = Math.atan2(center.y - layoutCenter.y, center.x - layoutCenter.x);
      if (Math.abs(center.x - layoutCenter.x) < 0.001 && Math.abs(center.y - layoutCenter.y) < 0.001) {
        outwardAngle = -Math.PI / 2;
      }

      const rayDistanceToParentBoundary = (angle) => {
        const ux = Math.cos(angle);
        const uy = Math.sin(angle);
        const absUx = Math.abs(ux);
        const absUy = Math.abs(uy);
        const tx = absUx < 0.0001 ? Number.POSITIVE_INFINITY : parentHalfW / absUx;
        const ty = absUy < 0.0001 ? Number.POSITIVE_INFINITY : parentHalfH / absUy;
        return Math.min(tx, ty);
      };

      const rayDistanceToAttributeBoundary = (attrSize, angle) => {
        const ux = Math.cos(angle);
        const uy = Math.sin(angle);
        const denom = (ux * ux) / (attrSize.rx * attrSize.rx) + (uy * uy) / (attrSize.ry * attrSize.ry);
        if (denom <= 0.000001) return Math.max(attrSize.rx, attrSize.ry);
        return 1 / Math.sqrt(denom);
      };

      attrs
        .slice()
        .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'de', { sensitivity: 'base' }))
        .forEach((attr, index) => {
          currentAttr = attr;
          const spreadRatio = attrs.length <= 1 ? 0.5 : index / (attrs.length - 1);
          const baseAngle = outwardAngle - hemisphereSpan / 2 + spreadRatio * hemisphereSpan;
          let placed = false;

          for (let r = 0; r < lineLengthOffsets.length && !placed; r += 1) {
            for (let step = 0; step < hemisphereSteps; step += 1) {
              const localOffset = (step / Math.max(1, hemisphereSteps - 1) - 0.5) * hemisphereSpan;
              const angle = baseAngle + localOffset;
              const attrSize = getAttributeEllipseSize(attr);
              const parentBoundary = rayDistanceToParentBoundary(angle);
              const attrBoundary = rayDistanceToAttributeBoundary(attrSize, angle);
              const rCandidate = parentBoundary + desiredLineLength + lineLengthOffsets[r] + attrBoundary;
              const x = center.x + Math.cos(angle) * rCandidate;
              const y = center.y + Math.sin(angle) * rCandidate;
              const pos = tryPlaceNodeAt(attr.type, x, y, 10, isClosestToOwnParent);
              if (!pos) continue;
              attr.x = pos.x;
              attr.y = pos.y;
              placed = true;
              break;
            }

            for (let step = 0; step < fullCircleSteps && !placed; step += 1) {
              const angle = outwardAngle + (step / fullCircleSteps) * Math.PI * 2;
              const attrSize = getAttributeEllipseSize(attr);
              const parentBoundary = rayDistanceToParentBoundary(angle);
              const attrBoundary = rayDistanceToAttributeBoundary(attrSize, angle);
              const rCandidate = parentBoundary + desiredLineLength + lineLengthOffsets[r] + attrBoundary;
              const x = center.x + Math.cos(angle) * rCandidate;
              const y = center.y + Math.sin(angle) * rCandidate;
              const pos = tryPlaceNodeAt(attr.type, x, y, 10, isClosestToOwnParent);
              if (!pos) continue;
              attr.x = pos.x;
              attr.y = pos.y;
              placed = true;
            }
          }

          if (!placed) {
            const attrSize = getAttributeEllipseSize(attr);
            const parentBoundary = rayDistanceToParentBoundary(baseAngle);
            const attrBoundary = rayDistanceToAttributeBoundary(attrSize, baseAngle);
            const fallbackRadius = parentBoundary + desiredLineLength + 24 + attrBoundary;
            const fallbackX = center.x + Math.cos(baseAngle) * fallbackRadius;
            const fallbackY = center.y + Math.sin(baseAngle) * fallbackRadius;
            const constrained = findConstrainedPlacement(
              attr.type,
              fallbackX,
              fallbackY,
              occupiedBounds,
              10,
              isClosestToOwnParent,
            );
            if (constrained) {
              attr.x = constrained.position.x;
              attr.y = constrained.position.y;
              occupiedBounds.push(constrained.bounds);
              placed = true;
            }

            if (!placed) {
              const lastTry = findNonOverlappingPlacement(attr.type, fallbackX, fallbackY, occupiedBounds, 10);
              attr.x = lastTry.position.x;
              attr.y = lastTry.position.y;
              occupiedBounds.push(lastTry.bounds);
            }
          }
        });
    });

    if (orphanAttributes.length > 0) {
      const orphanY = relFallbackY + entityGapY * 1.35;
      orphanAttributes.forEach((attr, index) => {
        const row = Math.floor(index / entityCols);
        const col = index % entityCols;
        placeNode(
          attr,
          startX + col * entityGapX + (Math.random() - 0.5) * 42,
          orphanY + row * entityGapY + (Math.random() - 0.5) * 28,
          12,
        );
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

  function buildRelationshipLabelSideAssignments() {
    const sideAssignments = new Map();
    // Priority order for tie-breaking: top(0), right(1), bottom(2), left(3)
    const cardinals = [
      { x: 0, y: -1 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: -1, y: 0 },
    ];
    const bestCardinalIdx = (vx, vy) => {
      let idx = 0;
      let best = -Infinity;
      cardinals.forEach((c, i) => {
        const d = c.x * vx + c.y * vy;
        if (d > best + 1e-9) {
          best = d;
          idx = i;
        }
      });
      return idx;
    };

    S()
      .nodes.filter((node) => node.type === 'relationship')
      .forEach((relNode) => {
        const incidentEdges = S().edges.filter(
          (edge) => isRelationshipEdge(edge) && (edge.fromId === relNode.id || edge.toId === relNode.id),
        );
        if (incidentEdges.length !== 2) return;

        const eIds = incidentEdges.map((e) => (e.fromId === relNode.id ? e.toId : e.fromId));
        if (eIds[0] === eIds[1]) return;

        const e0 = byId(eIds[0]);
        const e1 = byId(eIds[1]);
        if (!e0 || !e1 || e0.type !== 'entity' || e1.type !== 'entity') return;

        const rc = getNodeCenter(relNode);

        // Unit vectors from relationship center to each entity
        const d0x = e0.x - rc.x,
          d0y = e0.y - rc.y;
        const d1x = e1.x - rc.x,
          d1y = e1.y - rc.y;
        const d0l = Math.hypot(d0x, d0y) || 1;
        const d1l = Math.hypot(d1x, d1y) || 1;
        const u0x = d0x / d0l,
          u0y = d0y / d0l;
        const u1x = d1x / d1l,
          u1y = d1y / d1l;

        // Sum of unit vectors; its opposite gives the large-sector bisector.
        // This formula is symmetric (independent of entity ordering).
        const sx = u0x + u1x,
          sy = u0y + u1y;
        const sl = Math.hypot(sx, sy);

        let bx, by;
        let cx, cy;
        if (sl < 0.1) {
          // Equal sectors (180°): force top/right priority exactly as requested.
          if (Math.abs(u0x) >= Math.abs(u0y)) {
            cx = 0;
            cy = -1;
          } else {
            cx = 1;
            cy = 0;
          }
          bx = cx;
          by = cy;
        } else {
          // General case: large-sector bisector = opposite of average entity direction
          bx = -sx / sl;
          by = -sy / sl;
          const cIdx = bestCardinalIdx(bx, by);
          cx = cardinals[cIdx].x;
          cy = cardinals[cIdx].y;
        }

        sideAssignments.set(relNode.id, { bx, by, cx, cy });
      });

    return sideAssignments;
  }

  function renderAll() {
    edgesLayer.innerHTML = '';
    nodesLayer.innerHTML = '';
    const relationshipCornerAssignments = buildRelationshipCornerAssignments();
    const relationshipLabelSideAssignments = buildRelationshipLabelSideAssignments();
    S().edges.forEach((edge) => renderEdge(edge, relationshipCornerAssignments, relationshipLabelSideAssignments));
    S().nodes.forEach(renderNode);
    if (window.AppState?.persistDebounced) window.AppState.persistDebounced();

    // Debounced Quest Validation – nur wenn Panel aktiv
    if (questValidateTimeout) clearTimeout(questValidateTimeout);
    questValidateTimeout = setTimeout(() => {
      const mode = window.Quest?.state?.questMode;
      const shouldAutoValidate = mode === 'grundlagen' || mode === 'experten';
      if (window.Quest?.state?.questsPanelVisible && shouldAutoValidate) {
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
      const visual = getNodeVisual(node);
      shape = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      shape.setAttribute('x', -visual.w / 2);
      shape.setAttribute('y', -visual.h / 2);
      shape.setAttribute('width', visual.w);
      shape.setAttribute('height', visual.h);
      shape.setAttribute('fill', isSelected ? '#bfdbfe' : '#dbeafe');
      shape.setAttribute('stroke', '#2563eb');
      shape.setAttribute('stroke-width', '2');
      textEl = makeText(0, 0, visual.displayLines || visual.displayName || 'Entitätsklasse');
    } else if (node.type === 'attribute') {
      const attrSize = getAttributeEllipseSize(node);
      shape = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
      shape.setAttribute('cx', '0');
      shape.setAttribute('cy', '0');
      shape.setAttribute('rx', attrSize.rx);
      shape.setAttribute('ry', attrSize.ry);
      shape.setAttribute('fill', isSelected ? '#fde68a' : '#fef3c7');
      shape.setAttribute('stroke', '#d97706');
      shape.setAttribute('stroke-width', '2');

      textEl = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      textEl.setAttribute('x', '0');
      textEl.setAttribute('y', '0');
      textEl.setAttribute('text-anchor', 'middle');
      textEl.setAttribute('dominant-baseline', 'middle');
      textEl.setAttribute('font-size', '13');
      textEl.setAttribute('fill', '#1e293b');
      if (node.isPrimaryKey) {
        textEl.setAttribute('font-weight', '800');
        textEl.textContent = attrSize.displayName || 'Attribut';
      } else {
        textEl.textContent = attrSize.displayName || 'Attribut';
      }
    } else {
      const visual = getNodeVisual(node);
      shape = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
      shape.setAttribute('points', `0,-${visual.h / 2} ${visual.w / 2},0 0,${visual.h / 2} -${visual.w / 2},0`);
      shape.setAttribute('fill', isSelected ? '#bbf7d0' : '#dcfce7');
      shape.setAttribute('stroke', '#16a34a');
      shape.setAttribute('stroke-width', '2');
      textEl = makeText(0, 0, visual.displayLines || visual.displayName || 'Beziehung');
    }

    if (isSelected) {
      const selectedStroke = node.type === 'entity' ? '#1d4ed8' : node.type === 'attribute' ? '#b45309' : '#15803d';
      applySelectedStyle(shape, selectedStroke);
    }

    const hit = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    const bbox =
      node.type === 'entity'
        ? {
            w: getNodeVisual(node).w + 10,
            h: getNodeVisual(node).h + 10,
          }
        : node.type === 'attribute'
          ? {
              w: getAttributeEllipseSize(node).w + 10,
              h: getAttributeEllipseSize(node).h + 10,
            }
          : {
              w: getNodeVisual(node).w + 10,
              h: getNodeVisual(node).h + 10,
            };
    hit.setAttribute('x', -bbox.w / 2);
    hit.setAttribute('y', -bbox.h / 2);
    hit.setAttribute('width', bbox.w);
    hit.setAttribute('height', bbox.h);
    hit.setAttribute('fill', 'transparent');

    g.appendChild(shape);
    if (textEl) g.appendChild(textEl);
    if (node.type === 'attribute' && node.isPrimaryKey) {
      const attrSize = getAttributeEllipseSize(node);
      g.appendChild(makePrimaryKeyDecoration(attrSize.displayName || 'Attribut', attrSize.rx, attrSize.ry));
    }
    g.appendChild(hit);

    nodesLayer.appendChild(g);
  }

  function renderEdge(edge, relationshipCornerAssignments, relationshipLabelSideAssignments) {
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

      if (pairSide !== 0) {
        if (isVerticalLine) {
          normalX = 1;
          normalY = 0;
        } else if (isVerticalSelfPair) {
          normalX = pairSide;
          normalY = 0;
        } else {
          if (normalY > 0) {
            normalX *= -1;
            normalY *= -1;
          }
          if (pairSide > 0) {
            normalX *= -1;
            normalY *= -1;
          }
        }
      } else {
        const sideData = relNodeForPair ? relationshipLabelSideAssignments.get(relNodeForPair.id) : null;
        if (sideData) {
          const { bx: sbx, by: sby, cx: scx, cy: scy } = sideData;
          const n1x = -uy,
            n1y = ux;
          const n2x = uy,
            n2y = -ux;
          const d1 = n1x * sbx + n1y * sby;
          const d2 = n2x * sbx + n2y * sby;
          if (Math.abs(d1 - d2) <= 1e-9) {
            const c1 = n1x * scx + n1y * scy;
            const c2 = n2x * scx + n2y * scy;
            if (c1 >= c2) {
              normalX = n1x;
              normalY = n1y;
            } else {
              normalX = n2x;
              normalY = n2y;
            }
          } else if (d1 > d2) {
            normalX = n1x;
            normalY = n1y;
          } else {
            normalX = n2x;
            normalY = n2y;
          }
        } else {
          normalX = -uy;
          normalY = ux;
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

      // If the rendered label touches its own edge line, push it farther away along the chosen normal.
      try {
        const MIN_LINE_CLEARANCE = 3;
        const ENTITY_LABEL_PADDING = 2;
        let current = { x: finalPoint.x, y: finalPoint.y };
        for (let attempt = 0; attempt < 6; attempt += 1) {
          const bbox = text.getBBox();
          if (!bbox || bbox.width <= 0 || bbox.height <= 0) break;

          const labelRect = {
            x: bbox.x - 1,
            y: bbox.y - 1,
            w: bbox.width + 2,
            h: bbox.height + 2,
          };
          const lineDist = segmentToRectDistance(fp.x, fp.y, tp.x, tp.y, labelRect);
          if (lineDist >= MIN_LINE_CLEARANCE) break;

          const extra = MIN_LINE_CLEARANCE - lineDist + 4;
          const pushedPoint = {
            x: current.x + normalX * extra,
            y: current.y + normalY * extra,
          };
          current = movePointToRectClearance(pushedPoint, entityBounds, ENTITY_CLEARANCE, normalX, normalY);
          text.setAttribute('x', current.x);
          text.setAttribute('y', current.y);
        }

        // Keep the full text box outside of the entity box (not just the anchor point).
        for (let attempt = 0; attempt < 8; attempt += 1) {
          const bbox = text.getBBox();
          if (!bbox || bbox.width <= 0 || bbox.height <= 0) break;

          const labelRect = {
            x: bbox.x,
            y: bbox.y,
            w: bbox.width,
            h: bbox.height,
          };
          const paddedEntityRect = {
            x: entityBounds.x - ENTITY_LABEL_PADDING,
            y: entityBounds.y - ENTITY_LABEL_PADDING,
            w: entityBounds.w + ENTITY_LABEL_PADDING * 2,
            h: entityBounds.h + ENTITY_LABEL_PADDING * 2,
          };
          if (!rectsTouchOrOverlap(labelRect, paddedEntityRect)) break;

          const pushedPoint = {
            x: current.x + normalX * 6,
            y: current.y + normalY * 6,
          };
          current = movePointToRectClearance(pushedPoint, entityBounds, ENTITY_CLEARANCE, normalX, normalY);
          text.setAttribute('x', current.x);
          text.setAttribute('y', current.y);
        }

        // Hard safety fallback: if overlap still exists, force the label box out of the entity box.
        for (let attempt = 0; attempt < 12; attempt += 1) {
          const bbox = text.getBBox();
          if (!bbox || bbox.width <= 0 || bbox.height <= 0) break;

          const labelRect = { x: bbox.x, y: bbox.y, w: bbox.width, h: bbox.height };
          const paddedEntityRect = {
            x: entityBounds.x - ENTITY_LABEL_PADDING,
            y: entityBounds.y - ENTITY_LABEL_PADDING,
            w: entityBounds.w + ENTITY_LABEL_PADDING * 2,
            h: entityBounds.h + ENTITY_LABEL_PADDING * 2,
          };
          if (!rectsTouchOrOverlap(labelRect, paddedEntityRect)) break;

          const labelCx = labelRect.x + labelRect.w / 2;
          const labelCy = labelRect.y + labelRect.h / 2;
          const nearX = clampValue(labelCx, paddedEntityRect.x, paddedEntityRect.x + paddedEntityRect.w);
          const nearY = clampValue(labelCy, paddedEntityRect.y, paddedEntityRect.y + paddedEntityRect.h);

          let escapeX = labelCx - nearX;
          let escapeY = labelCy - nearY;
          let escapeLen = Math.hypot(escapeX, escapeY);
          if (escapeLen < 0.0001) {
            escapeX = normalX;
            escapeY = normalY;
            escapeLen = Math.hypot(escapeX, escapeY) || 1;
          }

          const push = 4;
          const pushedPoint = {
            x: current.x + (escapeX / escapeLen) * push,
            y: current.y + (escapeY / escapeLen) * push,
          };
          current = movePointToRectClearance(pushedPoint, entityBounds, ENTITY_CLEARANCE, normalX, normalY);
          text.setAttribute('x', current.x);
          text.setAttribute('y', current.y);
        }
      } catch (err) {
        // getBBox can fail in rare transient SVG states; keep initial position as fallback.
      }
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
        ? getNodeVisual('entity', 'Entitätsklasse')
        : type === 'attribute'
          ? getAttributeEllipseSize('Attribut')
          : getNodeVisual('relationship', 'Beziehung');
    return findFreePosition(type, worldCenterX - dims.w / 2, worldCenterY - dims.h / 2);
  }

  function getAttributeSpawnPosition(entityNode) {
    const center = getNodeCenter(entityNode);
    const attrSize = getAttributeEllipseSize('Attribut');
    for (let ring = 0; ring < 4; ring += 1) {
      const radius = 116 + ring * 34;
      for (let step = 0; step < 12; step += 1) {
        const angle = (step / 12) * Math.PI * 2;
        const candidate = clampPosition(
          'attribute',
          center.x + Math.cos(angle) * radius - attrSize.rx,
          center.y + Math.sin(angle) * radius - attrSize.ry,
        );
        if (positionIsFree('attribute', candidate.x, candidate.y)) return candidate;
      }
    }
    return findFreePosition('attribute', center.x + 90 - attrSize.rx, center.y - attrSize.ry);
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
    };
    if (edgeType === 'relationship') {
      edge.chenFrom = '1';
      edge.chenTo = '1';
    }
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
    const attrSize = getAttributeEllipseSize('Attribut');
    for (let ring = 0; ring < 4; ring += 1) {
      const radius = 116 + ring * 34;
      for (let step = 0; step < 12; step += 1) {
        const angle = (step / 12) * Math.PI * 2;
        const candidate = clampPosition(
          'attribute',
          center.x + Math.cos(angle) * radius - attrSize.rx,
          center.y + Math.sin(angle) * radius - attrSize.ry,
        );
        if (positionIsFree('attribute', candidate.x, candidate.y)) return candidate;
      }
    }
    return findFreePosition('attribute', center.x + 90 - attrSize.rx, center.y - attrSize.ry);
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
    // Kein einleitender Satz anzeigen (Subtitle entfernt auf Wunsch)
    modalSubtitle.textContent = '';

    // Set relationship name field (if present in the modal)
    if (modalName) modalName.value = relationshipNode.name || '';

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

    // Fokus auf das Namensfeld setzen (falls vorhanden)
    if (modalName) {
      setTimeout(() => {
        try {
          modalName.focus();
          // Select all text for quicker Umbenennen
          modalName.select && modalName.select();
        } catch (err) {
          /* ignore */
        }
      }, 10);
    }

    const cleanup = () => {
      modalOk.removeEventListener('click', onOk);
      modalCancel.removeEventListener('click', onCancel);
      modalBackdrop.style.display = 'none';
      if (activeModalCleanup === cleanup) activeModalCleanup = null;
    };

    const onOk = () => {
      // Apply name change from modal (if present)
      if (modalName) {
        relationshipNode.name = String(modalName.value || '').trim();
      }

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
      ctxDelete.textContent =
        node.type === 'entity' || node.type === 'relationship' ? 'Löschen (inkl. Attribute)' : 'Löschen';
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
        // For relationships: open the edit modal on double-click instead of inline rename
        if (node.type === 'relationship') {
          openRelationshipModal(node.id);
          return;
        }
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
    const node = byId(nodeId);
    // Beim Löschen einer Entität oder Beziehung: alle direkt verbundenen Attribut-Nodes mitlöschen
    if (node && (node.type === 'entity' || node.type === 'relationship')) {
      const attrIds = S()
        .edges.filter((e) => e.edgeType === 'attribute' && (e.fromId === nodeId || e.toId === nodeId))
        .map((e) => (e.fromId === nodeId ? e.toId : e.fromId))
        .filter((id) => byId(id)?.type === 'attribute');
      const attrIdSet = new Set(attrIds);
      S().nodes = S().nodes.filter((n) => n.id !== nodeId && !attrIdSet.has(n.id));
      S().edges = S().edges.filter(
        (e) => e.fromId !== nodeId && e.toId !== nodeId && !attrIdSet.has(e.fromId) && !attrIdSet.has(e.toId),
      );
    } else {
      S().nodes = S().nodes.filter((n) => n.id !== nodeId);
      S().edges = S().edges.filter((e) => e.fromId !== nodeId && e.toId !== nodeId);
    }
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

  // Klick außerhalb schließt das Beziehungs-Dialog NICHT mehr.
  // Stattdessen eine kurze Shake-Animation am Dialog zeigen, um Feedback zu geben.
  if (modalBackdrop) {
    modalBackdrop.addEventListener('click', (e) => {
      if (e.target !== modalBackdrop) return;
      if (!activeModalCleanup) return;
      if (!modalCard) return;
      // Restart animation
      modalCard.classList.remove('shake');
      // Force reflow to allow re-triggering the animation
      // eslint-disable-next-line no-unused-expressions
      modalCard.offsetWidth;
      modalCard.classList.add('shake');
      // Keep focus on name field for convenience
      if (modalName) {
        try {
          modalName.focus();
          modalName.select && modalName.select();
        } catch (err) {
          /* ignore */
        }
      }
    });

    // Remove shake class after animation ends
    modalCard && modalCard.addEventListener('animationend', () => modalCard.classList.remove('shake'));
  }

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
      const visual = getNodeVisual(node);
      cx = node.x;
      cy = node.y;
      fw = visual.w - 10;
    } else if (node.type === 'attribute') {
      const attrSize = getAttributeEllipseSize(node);
      cx = node.x;
      cy = node.y;
      fw = attrSize.w - 10;
    } else {
      const visual = getNodeVisual(node);
      cx = node.x;
      cy = node.y;
      fw = visual.w - 20;
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
