/* ============================================================
   relmodel.js  –  Relationenmodell: Konverter + Schüler-Eingabe + Prüfung
   ============================================================ */
'use strict';

(function () {
  const FK_SUFFIX = '↑';

  function normalize(s) {
    return (s || '').trim().toLowerCase().replace(/\s+/g, '');
  }

  function hasForeignKeyMarker(name) {
    return /[↑*]\s*$/u.test((name || '').trim());
  }

  function stripForeignKeyMarker(name) {
    return (name || '')
      .trim()
      .replace(/[↑*]\s*$/u, '')
      .trim();
  }

  function normalizeForeignKeyMarker(name) {
    const base = stripForeignKeyMarker(name);
    if (!base) return '';
    return hasForeignKeyMarker(name) ? `${base}${FK_SUFFIX}` : base;
  }

  function normalizeAttrToken(name) {
    return stripForeignKeyMarker(name)
      .toLowerCase()
      .replace(/[\s_-]+/g, '')
      .trim();
  }

  function normalizeRelationToken(name) {
    return String(name || '')
      .toLowerCase()
      .replace(/[\s_-]+/g, '')
      .trim();
  }

  function normAttr(name) {
    return normalizeAttrToken(name);
  }

  function sortAttrsPrimaryFirst(attrs) {
    return attrs.sort((a, b) => {
      if (!!a.isPk !== !!b.isPk) return a.isPk ? -1 : 1;

      const aIsFk = !!a.isFk || hasForeignKeyMarker(a.name);
      const bIsFk = !!b.isFk || hasForeignKeyMarker(b.name);
      if (!a.isPk && !b.isPk && aIsFk !== bIsFk) return aIsFk ? 1 : -1;

      return stripForeignKeyMarker(a.name || '').localeCompare(stripForeignKeyMarker(b.name || ''), 'de', {
        sensitivity: 'base',
      });
    });
  }

  function ensureStudentIds() {
    _studentRelations.forEach((rel) => {
      if (!rel.id) rel.id = newRelId();
      rel.attrs = Array.isArray(rel.attrs) ? rel.attrs : [];
      rel.attrs.forEach((attr) => {
        if (!attr.id) attr.id = newAttrId();
      });
    });
  }

  function removeEmptyAttrs(rel) {
    rel.attrs = (rel.attrs || []).filter((attr) => (attr.name || '').trim().length > 0);
  }

  function hasAnyAttrName(rel) {
    return (rel.attrs || []).some((attr) => (attr.name || '').trim().length > 0);
  }

  function removeCompletelyEmptyRelations() {
    _studentRelations = _studentRelations.filter((rel) => {
      const hasName = (rel.name || '').trim().length > 0;
      const hasAttrs = hasAnyAttrName(rel);
      return hasName || hasAttrs;
    });
  }

  function clearInlineError(rel) {
    if (!rel) return;
    rel.inlineError = '';
  }

  function validateRelationInline(rel) {
    if (!(rel.name || '').trim()) {
      return 'Bitte Relationsnamen eintragen.';
    }

    if (!Array.isArray(rel.attrs) || rel.attrs.length === 0) {
      return 'Jede Relation braucht mindestens ein Attribut.';
    }

    const hasPk = rel.attrs.some((attr) => !!attr.isPk && (attr.name || '').trim().length > 0);
    if (!hasPk) {
      return 'Jede Relation benötigt einen Primärschlüssel.';
    }

    return '';
  }

  function validateAllRelationsInline() {
    let hasErrors = false;
    _studentRelations.forEach((rel) => {
      removeEmptyAttrs(rel);
      const error = validateRelationInline(rel);
      rel.inlineError = error;
      if (error) hasErrors = true;
    });
    return hasErrors;
  }

  // ======================================================================
  // LÖSUNG BERECHNEN
  // ======================================================================

  /**
   * Berechnet aus dem ER-Diagramm die Musterlösung.
   * Gibt Array von { name, attrs: [{ name, isPk, isFk }] } zurück.
   */
  function generateSolution(state) {
    const { nodes, edges } = state;

    // Hilfsfunktionen
    const getNode = (id) => nodes.find((n) => n.id === id);

    // Alle Entitäten
    const entities = nodes.filter((n) => n.type === 'entity');
    // Alle Beziehungen
    const rels = nodes.filter((n) => n.type === 'relationship');

    // Attribute zu einem Knoten (direkt verbunden)
    function getAttrs(nodeId) {
      return edges
        .filter((e) => e.fromId === nodeId || e.toId === nodeId)
        .map((e) => {
          const otherId = e.fromId === nodeId ? e.toId : e.fromId;
          return getNode(otherId);
        })
        .filter((n) => n && n.type === 'attribute');
    }

    // Beziehungstyp anhand der Kanten zur Beziehung (nur Entitäts-Seiten)
    function getRelationshipType(relNode) {
      const incidentEdges = edges.filter((e) => e.fromId === relNode.id || e.toId === relNode.id);
      const entityEdges = incidentEdges.filter((e) => {
        const otherId = e.fromId === relNode.id ? e.toId : e.fromId;
        const other = getNode(otherId);
        return other && other.type === 'entity';
      });

      if (entityEdges.length < 2) return null; // unvollständig

      const sides = entityEdges.map((e) => {
        const isFrom = e.fromId === relNode.id;
        return String(isFrom ? e.chenTo || '1' : e.chenFrom || '1').toLowerCase();
      });

      const s0 = sides[0] === '1' ? '1' : 'N';
      const s1 = sides[1] === '1' ? '1' : 'N';

      if (s0 === '1' && s1 === '1') return '1:1';
      if ((s0 === '1' && s1 === 'N') || (s0 === 'N' && s1 === '1')) return '1:N';
      return 'M:N';
    }

    // Primärschlüssel einer Entität (Attributname)
    function getPkAttr(entityId) {
      const attrs = getAttrs(entityId).filter((a) => a.isPrimaryKey);
      return attrs.length > 0 ? attrs[0].name : null;
    }

    // Ergebnis-Relationen (als Map: key → { name, attrs })
    const relMap = new Map();

    function ensureRelation(key, name) {
      if (!relMap.has(key)) relMap.set(key, { name, attrs: [] });
      return relMap.get(key);
    }

    function ensureEntityRelation(name) {
      const key = `entity:${normalizeRelationToken(name)}`;
      return ensureRelation(key, name);
    }

    function ensureManyToManyRelation(relNode) {
      const key = `mn:${relNode.id}`;
      const rel = ensureRelation(key, relNode.name || 'Beziehung');
      rel._kind = 'mn';
      rel._baseName = relNode.name || 'Beziehung';
      return rel;
    }

    function getDirectedEntityNamesForRelationship(relNode, entityEdges) {
      const incoming = [];
      const outgoing = [];

      entityEdges.forEach((e) => {
        const entityId = e.fromId === relNode.id ? e.toId : e.fromId;
        const entity = getNode(entityId);
        if (!entity || entity.type !== 'entity') return;

        if (e.toId === relNode.id) incoming.push(entity.name || 'Entität');
        else outgoing.push(entity.name || 'Entität');
      });

      const ordered = [...incoming, ...outgoing].filter((name) => !!String(name || '').trim());
      if (ordered.length >= 2) return [ordered[0], ordered[1]];

      const fallback = entityEdges
        .map((e) => {
          const entityId = e.fromId === relNode.id ? e.toId : e.fromId;
          const entity = getNode(entityId);
          return entity && entity.type === 'entity' ? entity.name || 'Entität' : '';
        })
        .filter((name) => !!String(name || '').trim());

      if (fallback.length >= 2) return [fallback[0], fallback[1]];
      return [fallback[0] || 'Entität', fallback[1] || 'Entität'];
    }

    function resolveManyToManyRelationNameConflicts(relations) {
      const mnRelations = relations.filter((rel) => rel._kind === 'mn');
      if (!mnRelations.length) return;

      const groups = new Map();
      mnRelations.forEach((rel) => {
        const key = normalizeRelationToken(rel._baseName || rel.name);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(rel);
      });

      const duplicateRelations = new Set();
      groups.forEach((group) => {
        if (group.length >= 2) group.forEach((rel) => duplicateRelations.add(rel));
      });

      const usedNames = new Set(
        relations
          .filter((rel) => !duplicateRelations.has(rel))
          .map((rel) => normalizeRelationToken(rel.name))
          .filter((name) => !!name),
      );

      groups.forEach((group) => {
        if (group.length < 2) return;

        group.forEach((rel) => {
          const pair = Array.isArray(rel._edgeEntityNames) ? rel._edgeEntityNames : ['Entität', 'Entität'];
          const baseRelName = String(rel._baseName || rel.name || 'Beziehung').trim() || 'Beziehung';
          const candidateBase = `${pair[0]}-${baseRelName}-${pair[1]}`;
          let candidate = candidateBase;
          let suffix = 2;

          while (usedNames.has(normalizeRelationToken(candidate))) {
            candidate = `${candidateBase}${suffix}`;
            suffix += 1;
          }

          rel.name = candidate;
          usedNames.add(normalizeRelationToken(candidate));
        });
      });
    }

    function buildFkCandidateName(entityName, baseName) {
      const cleanEntity = String(entityName || '').trim();
      const cleanBase = stripForeignKeyMarker(baseName);
      if (!cleanEntity) return cleanBase;
      return `${cleanEntity}-${cleanBase}`;
    }

    function buildRelationshipAttrCandidateName(relationshipName, baseName) {
      const cleanRelationship = String(relationshipName || '').trim() || 'Beziehung';
      const cleanBase = stripForeignKeyMarker(baseName);
      return `${cleanRelationship}-${cleanBase}`;
    }

    function getUniqueAttrName(rel, proposedName, ignoreAttr = null) {
      const cleanBase = stripForeignKeyMarker(proposedName);
      let candidate = cleanBase;
      let suffix = 2;
      while (rel.attrs.some((a) => a !== ignoreAttr && normAttr(a.name) === normAttr(candidate))) {
        candidate = `${cleanBase}-${suffix}`;
        suffix += 1;
      }
      return candidate;
    }

    function resolveForeignKeyConflicts(rel) {
      const attrs = rel.attrs || [];
      const baseGroups = new Map();

      attrs.forEach((attr) => {
        if (!attr.isFk) return;
        const key = normAttr(attr._fkBaseName || attr.name);
        if (!key) return;
        if (!baseGroups.has(key)) baseGroups.set(key, []);
        baseGroups.get(key).push(attr);
      });

      baseGroups.forEach((fkAttrs, key) => {
        const nonFkConflict = attrs.some((a) => !a.isFk && normAttr(a.name) === key);
        const distinctSources = new Set(
          fkAttrs.map((a) => normalize(a._fkSourceEntity || '')).filter((source) => !!source),
        );
        const mustPrefixAll = nonFkConflict || distinctSources.size >= 2 || fkAttrs.length >= 2;
        if (!mustPrefixAll) return;

        fkAttrs.forEach((attr) => {
          const baseName = attr._fkBaseName || attr.name;
          const prefixed = buildFkCandidateName(attr._fkSourceEntity, baseName);
          attr.name = getUniqueAttrName(rel, prefixed, attr);
        });
      });
    }

    function addAttr(rel, attrName, isPk = false, isFk = false, sourceEntityName = '') {
      const cleanName = stripForeignKeyMarker(attrName);
      const normalized = normAttr(cleanName);
      const existing = rel.attrs.find((a) => {
        if (normAttr(a.name) !== normalized) return false;
        if (isFk && a.isFk) {
          const existingSource = normalize(a._fkSourceEntity || '');
          const currentSource = normalize(sourceEntityName || '');
          if (existingSource && currentSource && existingSource !== currentSource) return false;
        }
        if (isFk && !a.isFk) return false;
        return true;
      });

      if (existing) {
        existing.isPk = !!existing.isPk || !!isPk;
        existing.isFk = !!existing.isFk || !!isFk;
        if (isFk && sourceEntityName && !existing._fkSourceEntity) {
          existing._fkSourceEntity = sourceEntityName;
        }
        if (isFk && !existing._fkBaseName) {
          existing._fkBaseName = cleanName;
        }
        return;
      }

      // Doppeleinträge vermeiden
      rel.attrs.push({
        name: cleanName,
        isPk,
        isFk,
        _fkSourceEntity: isFk ? String(sourceEntityName || '').trim() : '',
        _fkBaseName: isFk ? cleanName : '',
      });
    }

    function addRelationshipAttr(rel, relationshipName, attrName) {
      const cleanName = stripForeignKeyMarker(attrName);
      if (!cleanName) return;

      const hasCollision = rel.attrs.some((a) => normAttr(a.name) === normAttr(cleanName));
      if (!hasCollision) {
        addAttr(rel, cleanName, false, false);
        return;
      }

      const prefixed = buildRelationshipAttrCandidateName(relationshipName, cleanName);
      const uniqueName = getUniqueAttrName(rel, prefixed);
      addAttr(rel, uniqueName, false, false);
    }

    // 1. Jede Entität → eigene Relation
    entities.forEach((entity) => {
      const entityRel = ensureEntityRelation(entity.name);
      const attrs = getAttrs(entity.id);
      attrs.forEach((attr) => {
        addAttr(entityRel, attr.name, !!attr.isPrimaryKey, false);
      });
    });

    // 2. Beziehungen auswerten
    rels.forEach((rel) => {
      const type = getRelationshipType(rel);
      if (!type) return;

      const incidentEdges = edges.filter((e) => e.fromId === rel.id || e.toId === rel.id);
      const entityEdges = incidentEdges.filter((e) => {
        const otherId = e.fromId === rel.id ? e.toId : e.fromId;
        const other = getNode(otherId);
        return other && other.type === 'entity';
      });

      const relAttrs = getAttrs(rel.id); // eigene Attribute der Beziehung

      if (type === 'M:N') {
        // Eigene Relation pro M:N-Beziehung
        const mnRel = ensureManyToManyRelation(rel);
        mnRel._edgeEntityNames = getDirectedEntityNamesForRelationship(rel, entityEdges);
        // Prüfen auf Selbstbeziehung (beide Kanten zeigen auf dieselbe Entitätsklasse)
        const entityIds = entityEdges.map((e) => (e.fromId === rel.id ? e.toId : e.fromId));
        if (entityIds.length === 2 && entityIds[0] === entityIds[1]) {
          // Selbstbeziehung: Primärschlüssel zweimal einfügen, mit Suffix ...1 und ...2
          const entity = getNode(entityIds[0]);
          const pk = getPkAttr(entityIds[0]);
          if (entity && pk) {
            addAttr(mnRel, pk + '1', true, true, entity.name + '1');
            addAttr(mnRel, pk + '2', true, true, entity.name + '2');
          }
        } else {
          // Normale M:N-Beziehung
          entityEdges.forEach((e, idx) => {
            const entityId = e.fromId === rel.id ? e.toId : e.fromId;
            const entity = getNode(entityId);
            if (!entity) return;
            const pk = getPkAttr(entityId);
            if (pk) addAttr(mnRel, pk, true, true, entity.name);
          });
        }
        relAttrs.forEach((a) => addRelationshipAttr(mnRel, rel.name, a.name));
      } else if (type === '1:N') {
        // FS der 1-Seite in die N-Seite
        // Herausfinden welche Seite die „1"-Seite ist
        let oneSide = null;
        let nSide = null;

        entityEdges.forEach((e) => {
          const entityId = e.fromId === rel.id ? e.toId : e.fromId;
          const entity = getNode(entityId);
          const max = String((e.fromId === rel.id ? e.chenTo : e.chenFrom) || '1').toLowerCase();
          if (max === '1') oneSide = entity;
          else nSide = entity;
        });

        // Fallback wenn beide gleich
        if (!oneSide || !nSide) {
          const ids = entityEdges.map((e) => (e.fromId === rel.id ? e.toId : e.fromId));
          oneSide = getNode(ids[0]);
          nSide = getNode(ids[1]);
        }

        const onePk = getPkAttr(oneSide.id);
        if (onePk) {
          // FS in N-Seite eintragen (FS markiert, kein PS)
          addAttr(ensureEntityRelation(nSide.name), onePk, false, true, oneSide.name);
        }
        // Eigene Beziehungsattribute in N-Seite
        relAttrs.forEach((a) => addRelationshipAttr(ensureEntityRelation(nSide.name), rel.name, a.name));
      } else if (type === '1:1') {
        // FS auf der Seite mit min=0 (wenn Min-Max) oder einfach Seite 0→Seite 1 (Chen)
        let targetEntity = null;
        let sourceEntity = null;

        entityEdges.forEach((e) => {
          const entityId = e.fromId === rel.id ? e.toId : e.fromId;
          const entity = getNode(entityId);
          const min = 0; // Chen 1:1 → feste Reihenfolge
          if (min === 0 && !targetEntity) targetEntity = entity;
          else if (!sourceEntity) sourceEntity = entity;
        });

        if (!targetEntity || !sourceEntity) {
          const ids = entityEdges.map((e) => (e.fromId === rel.id ? e.toId : e.fromId));
          sourceEntity = getNode(ids[0]);
          targetEntity = getNode(ids[1]);
        }

        const srcPk = getPkAttr(sourceEntity.id);
        if (srcPk) {
          addAttr(ensureEntityRelation(targetEntity.name), srcPk, false, true, sourceEntity.name);
        }
        relAttrs.forEach((a) => addRelationshipAttr(ensureEntityRelation(targetEntity.name), rel.name, a.name));
      }
    });

    const relations = Array.from(relMap.values());
    resolveManyToManyRelationNameConflicts(relations);
    relations.forEach((rel) => {
      resolveForeignKeyConflicts(rel);
      sortAttrsPrimaryFirst(rel.attrs);
      rel.attrs = rel.attrs.map((attr) => ({
        name: attr.name,
        isPk: !!attr.isPk,
        isFk: !!attr.isFk,
      }));
    });
    return relations;
  }

  // ======================================================================
  // SCHÜLER-FORMULAR
  // ======================================================================

  let _studentRelations = []; // [{ id, name, attrs:[{ id, name, isPk, isFk }], isEditing }]
  let _solution = [];
  let _nextId = 1;
  let _syncDebounceTimer = null;
  const SYNC_DEBOUNCE_MS = 180;

  function newRelId() {
    return 'r' + _nextId++;
  }
  function newAttrId() {
    return 'a' + _nextId++;
  }

  function syncFromDiagram() {
    _solution = generateSolution(window.AppState.state);
    renderSolution();
    // Schüler-Liste NICHT zurücksetzen – sie können schon etwas eingegeben haben
    if (_studentRelations.length === 0) {
      renderStudentForm();
    }
  }

  function requestSyncFromDiagramDebounced() {
    if (_syncDebounceTimer) {
      clearTimeout(_syncDebounceTimer);
    }
    _syncDebounceTimer = setTimeout(() => {
      _syncDebounceTimer = null;
      syncFromDiagram();
    }, SYNC_DEBOUNCE_MS);
  }

  function reset() {
    _studentRelations = [];
    _solution = [];
    document.getElementById('feedback-area').innerHTML = '';
    document.getElementById('solution-display').style.display = 'none';
    document.getElementById('btn-hide-solution').style.display = 'none';
    document.getElementById('btn-show-solution').style.display = '';
    renderStudentForm();
    renderSolution();
  }

  // ---- Render: Schüler-Eingabe ----
  function renderStudentForm() {
    ensureStudentIds();
    const container = document.getElementById('student-relations-list');
    container.innerHTML = '';
    _studentRelations.forEach((rel) => {
      container.appendChild(buildRelationCard(rel));
    });
  }

  function buildRelationCard(rel) {
    const isEditing = rel.isEditing !== false;
    const card = document.createElement('div');
    card.className = 'relation-card';
    card.dataset.id = rel.id;

    // Header
    const header = document.createElement('div');
    header.className = 'relation-card-header';

    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.className = 'relation-name-input';
    nameInput.placeholder = 'Relationsname';
    nameInput.value = rel.name;
    nameInput.addEventListener('input', (e) => {
      rel.name = e.target.value;
      clearInlineError(rel);
    });

    const delBtn = document.createElement('button');
    delBtn.className = 'btn-del-relation';
    delBtn.textContent = '✕';
    delBtn.title = 'Relation löschen';
    delBtn.addEventListener('click', () => {
      _studentRelations = _studentRelations.filter((r) => r.id !== rel.id);
      renderStudentForm();
    });

    const modeBtn = document.createElement('button');
    modeBtn.className = 'btn-toggle-relation-mode';
    modeBtn.textContent = isEditing ? '✔' : '✎';
    modeBtn.title = isEditing ? 'Bearbeitung abschließen' : 'Bearbeiten';
    modeBtn.addEventListener('click', () => {
      if (isEditing) {
        removeEmptyAttrs(rel);
        const error = validateRelationInline(rel);
        if (error) {
          rel.inlineError = error;
          rel.isEditing = true;
          renderStudentForm();
          return;
        }
        sortAttrsPrimaryFirst(rel.attrs);
        clearInlineError(rel);
      }
      rel.isEditing = !isEditing;
      renderStudentForm();
    });

    if (isEditing) {
      header.appendChild(nameInput);
    } else {
      header.appendChild(buildRelationPreview(rel, true));
    }

    const actions = document.createElement('div');
    actions.className = 'relation-card-actions';
    actions.appendChild(modeBtn);
    actions.appendChild(delBtn);

    header.appendChild(actions);
    card.appendChild(header);

    if (rel.inlineError) {
      const inlineError = document.createElement('div');
      inlineError.className = 'relation-inline-error';
      inlineError.textContent = rel.inlineError;
      card.appendChild(inlineError);
    }

    if (!isEditing) {
      return card;
    }

    // Attribute
    const attrsDiv = document.createElement('div');
    attrsDiv.className = 'relation-attrs';

    rel.attrs.forEach((attr) => {
      attrsDiv.appendChild(buildAttrRow(rel, attr));
    });

    // + Attribut Button
    const addAttrBtn = document.createElement('button');
    addAttrBtn.className = 'btn-add-attr';
    addAttrBtn.textContent = '+ Attribut';
    addAttrBtn.addEventListener('click', () => {
      const newAttr = { id: newAttrId(), name: '', isPk: false, isFk: false };
      rel.attrs.push(newAttr);
      clearInlineError(rel);
      renderStudentForm();
      const targetInput = document.querySelector(
        `.relation-card[data-id="${rel.id}"] .attr-row[data-id="${newAttr.id}"] .attr-input`,
      );
      if (targetInput) targetInput.focus();
    });

    attrsDiv.appendChild(addAttrBtn);
    card.appendChild(attrsDiv);
    return card;
  }

  function buildRelationPreview(rel, compact = false) {
    const wrapper = document.createElement('div');
    wrapper.className = compact ? 'relation-preview relation-preview-inline' : 'relation-preview';

    const formatted = document.createElement('div');
    formatted.className = compact
      ? 'solution-relation relation-preview-output relation-preview-output-inline'
      : 'solution-relation relation-preview-output';

    const nameSpan = document.createElement('span');
    nameSpan.className = 'solution-relation-name';
    nameSpan.textContent = rel.name || 'Relation';
    formatted.appendChild(nameSpan);

    formatted.appendChild(document.createTextNode(' ( '));

    const attrSpan = document.createElement('span');
    attrSpan.className = 'solution-attr-list';

    const attrs = [...rel.attrs];
    const parts = attrs
      .filter((a) => (a.name || '').trim())
      .map((a) => {
        const sp = document.createElement('span');
        if (a.isPk && a.isFk) sp.className = 'solution-attr fkpk';
        else if (a.isPk) sp.className = 'solution-attr pk';
        else if (a.isFk) sp.className = 'solution-attr fk';
        else sp.className = 'solution-attr';

        let display = stripForeignKeyMarker(a.name);
        if (a.isFk) display += FK_SUFFIX;
        sp.textContent = display;
        return sp;
      });

    parts.forEach((p, i) => {
      attrSpan.appendChild(p);
      if (i < parts.length - 1) {
        attrSpan.appendChild(document.createTextNode(', '));
      }
    });

    formatted.appendChild(attrSpan);
    formatted.appendChild(document.createTextNode(' )'));
    wrapper.appendChild(formatted);

    return wrapper;
  }

  function buildAttrRow(rel, attr) {
    const row = document.createElement('div');
    row.className = 'attr-row';
    row.dataset.id = attr.id;

    const inp = document.createElement('input');
    inp.type = 'text';
    inp.className = 'attr-input';
    inp.placeholder = 'Attributname';
    inp.value = attr.name;
    inp.addEventListener('input', (e) => {
      attr.name = e.target.value;
      clearInlineError(rel);
    });
    inp.addEventListener('change', (e) => {
      attr.name = e.target.value.trim();
      clearInlineError(rel);
      renderStudentForm();
    });
    inp.addEventListener('blur', (e) => {
      attr.name = e.target.value.trim();
      clearInlineError(rel);
      renderStudentForm();
    });

    const pkCb = document.createElement('input');
    pkCb.type = 'checkbox';
    pkCb.className = 'attr-pk-checkbox';
    pkCb.checked = attr.isPk;
    pkCb.id = 'pk-cb-' + attr.id;
    pkCb.title = 'Primärschlüssel';
    pkCb.addEventListener('change', (e) => {
      attr.isPk = e.target.checked;
      clearInlineError(rel);
      renderStudentForm();
    });

    const pkLbl = document.createElement('label');
    pkLbl.className = 'attr-pk-label';
    pkLbl.htmlFor = pkCb.id;
    pkLbl.textContent = 'PS';

    const fkCb = document.createElement('input');
    fkCb.type = 'checkbox';
    fkCb.className = 'attr-fk-checkbox';
    fkCb.checked = !!attr.isFk;
    fkCb.id = 'fk-cb-' + attr.id;
    fkCb.title = 'Fremdschlüssel';
    fkCb.addEventListener('change', (e) => {
      attr.isFk = e.target.checked;
      clearInlineError(rel);
      renderStudentForm();
    });

    const fkLbl = document.createElement('label');
    fkLbl.className = 'attr-fk-label';
    fkLbl.htmlFor = fkCb.id;
    fkLbl.textContent = 'FS';

    inp.id = 'attr-input-' + attr.id;
    pkCb.addEventListener('click', (e) => e.stopPropagation());
    fkCb.addEventListener('click', (e) => e.stopPropagation());

    const delAttrBtn = document.createElement('button');
    delAttrBtn.className = 'btn-del-attr';
    delAttrBtn.textContent = '✕';
    delAttrBtn.title = 'Attribut löschen';
    delAttrBtn.addEventListener('click', () => {
      rel.attrs = rel.attrs.filter((a) => a.id !== attr.id);
      clearInlineError(rel);
      renderStudentForm();
    });

    row.appendChild(inp);
    row.appendChild(pkCb);
    row.appendChild(pkLbl);
    row.appendChild(fkCb);
    row.appendChild(fkLbl);
    row.appendChild(delAttrBtn);
    return row;
  }

  // ---- Render: Musterlösung ----
  function renderSolution() {
    const container = document.getElementById('solution-display');
    container.innerHTML = '';

    if (_solution.length === 0) {
      container.innerHTML = '<p style="color:#94a3b8;font-size:0.85rem">Noch kein ER-Diagramm vorhanden.</p>';
      return;
    }

    _solution.forEach((rel) => {
      const div = document.createElement('div');
      div.className = 'solution-relation';

      const nameSpan = document.createElement('span');
      nameSpan.className = 'solution-relation-name';
      nameSpan.textContent = rel.name;
      div.appendChild(nameSpan);

      div.appendChild(document.createTextNode(' ( '));

      const attrSpan = document.createElement('span');
      attrSpan.className = 'solution-attr-list';

      const attrs = sortAttrsPrimaryFirst([...rel.attrs]);
      const parts = attrs.map((a) => {
        const sp = document.createElement('span');
        if (a.isPk && a.isFk) sp.className = 'solution-attr fkpk';
        else if (a.isPk) sp.className = 'solution-attr pk';
        else if (a.isFk) sp.className = 'solution-attr fk';
        else sp.className = 'solution-attr';

        let display = stripForeignKeyMarker(a.name);
        if (a.isFk) display += FK_SUFFIX;
        sp.textContent = display;
        return sp;
      });

      parts.forEach((p, i) => {
        attrSpan.appendChild(p);
        if (i < parts.length - 1) {
          attrSpan.appendChild(document.createTextNode(', '));
        }
      });
      div.appendChild(attrSpan);
      div.appendChild(document.createTextNode(' )'));

      container.appendChild(div);
    });
  }

  // ======================================================================
  // PRÜFUNG
  // ======================================================================

  function checkInput() {
    if (_solution.length === 0) {
      showFeedback(
        'error',
        'Das ER-Diagramm enthält noch keine auswertbaren Elemente. Bitte zuerst das ER-Diagramm erstellen.',
      );
      return;
    }

    const errors = [];
    const warnings = [];

    // Alle Relation-Namen der Lösung (normalisiert)
    const solutionNames = _solution.map((r) => normalizeRelationToken(r.name));
    const studentNames = _studentRelations.map((r) => normalizeRelationToken(r.name));

    // 1. Fehlende Relationen
    solutionNames.forEach((sn) => {
      if (!studentNames.includes(sn)) {
        errors.push(`Relation <strong>${sn}</strong> fehlt.`);
      }
    });

    // 2. Überflüssige Relationen
    studentNames.forEach((sn) => {
      if (!solutionNames.includes(sn)) {
        warnings.push(`Relation <strong>${sn}</strong> ist nicht Teil der erwarteten Lösung.`);
      }
    });

    // 3. Attribute & PS je Relation prüfen
    _solution.forEach((solRel) => {
      const studRel = _studentRelations.find(
        (r) => normalizeRelationToken(r.name) === normalizeRelationToken(solRel.name),
      );
      if (!studRel) return; // bereits als fehlend markiert

      const solAttrs = solRel.attrs.map((a) => normAttr(a.name));
      const studAttrs = studRel.attrs.map((a) => normAttr(a.name));

      // Fehlende Attribute
      solAttrs.forEach((sa) => {
        if (!studAttrs.includes(sa)) {
          errors.push(`Relation <strong>${solRel.name}</strong>: Attribut <em>${sa}</em> fehlt.`);
        }
      });

      // Überflüssige Attribute
      studAttrs.forEach((sa) => {
        if (sa && !solAttrs.includes(sa)) {
          warnings.push(`Relation <strong>${solRel.name}</strong>: Attribut <em>${sa}</em> ist nicht erwartet.`);
        }
      });

      // PS-Prüfung
      const solPks = solRel.attrs.filter((a) => a.isPk).map((a) => normAttr(a.name));
      const studPks = studRel.attrs.filter((a) => a.isPk).map((a) => normAttr(a.name));

      solPks.forEach((pk) => {
        if (!studPks.includes(pk)) {
          errors.push(
            `Relation <strong>${solRel.name}</strong>: <em>${pk}</em> sollte als Primärschlüssel (PS) markiert sein.`,
          );
        }
      });

      studPks.forEach((pk) => {
        if (!solPks.includes(pk)) {
          warnings.push(
            `Relation <strong>${solRel.name}</strong>: <em>${pk}</em> ist kein erwarteter Primärschlüssel (PS).`,
          );
        }
      });

      // FS-Prüfung (über isFk-Checkbox)
      const solFks = solRel.attrs.filter((a) => a.isFk).map((a) => normAttr(a.name));
      const studFks = studRel.attrs.filter((a) => !!a.isFk).map((a) => normAttr(a.name));

      solFks.forEach((fk) => {
        if (!studFks.includes(fk)) {
          warnings.push(
            `Relation <strong>${solRel.name}</strong>: <em>${fk}</em> sollte als Fremdschlüssel (FS) markiert sein.`,
          );
        }
      });
    });

    if (errors.length === 0 && warnings.length === 0) {
      showFeedback('success', '✅ Sehr gut! Deine Überführung ist vollständig und korrekt.');
    } else if (errors.length === 0) {
      let msg = '⚠️ Fast richtig – kleine Hinweise:\n<ul>';
      warnings.forEach((w) => {
        msg += `<li>${w}</li>`;
      });
      msg += '</ul>';
      showFeedback('success', msg);
    } else {
      let msg = `❌ Es gibt noch ${errors.length} Fehler`;
      if (warnings.length) msg += ` und ${warnings.length} Hinweise`;
      msg += ':<ul>';
      errors.forEach((e) => {
        msg += `<li>${e}</li>`;
      });
      warnings.forEach((w) => {
        msg += `<li style="color:#92400e">⚠️ ${w}</li>`;
      });
      msg += '</ul>';
      showFeedback('error', msg);
    }
  }

  function showFeedback(type, html) {
    const area = document.getElementById('feedback-area');
    area.innerHTML = `<div class="feedback-box ${type}"><button id="feedback-close" class="feedback-close" type="button" aria-label="Hinweis schließen">✕</button>${html}</div>`;
    const closeBtn = document.getElementById('feedback-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        area.innerHTML = '';
      });
    }
    area.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  // ======================================================================
  // BUTTON-EVENTS
  // ======================================================================

  function initEvents() {
    document.getElementById('btn-add-relation').addEventListener('click', () => {
      const rel = { id: newRelId(), name: '', attrs: [], isEditing: true };
      _studentRelations.push(rel);
      const card = buildRelationCard(rel);
      document.getElementById('student-relations-list').appendChild(card);
      card.querySelector('.relation-name-input').focus();
    });

    document.getElementById('btn-check').addEventListener('click', () => {
      removeCompletelyEmptyRelations();

      const hasInlineErrors = validateAllRelationsInline();
      if (hasInlineErrors) {
        _studentRelations.forEach((rel) => {
          rel.isEditing = !!rel.inlineError;
        });
        renderStudentForm();
        document.getElementById('feedback-area').innerHTML = '';
        return;
      }

      _studentRelations.forEach((rel) => {
        removeEmptyAttrs(rel);
        sortAttrsPrimaryFirst(rel.attrs);
        rel.isEditing = false;
      });
      renderStudentForm();
      checkInput();
    });

    document.getElementById('btn-show-solution').addEventListener('click', () => {
      _solution = generateSolution(window.AppState.state);
      renderSolution();
      const solDisplay = document.getElementById('solution-display');
      const showBtn = document.getElementById('btn-show-solution');
      const hideBtn = document.getElementById('btn-hide-solution');
      solDisplay.style.display = '';
      if (showBtn) showBtn.style.display = 'none';
      if (hideBtn) hideBtn.style.display = '';
      solDisplay.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    document.getElementById('btn-hide-solution').addEventListener('click', () => {
      const solDisplay = document.getElementById('solution-display');
      const showBtn = document.getElementById('btn-show-solution');
      const hideBtn = document.getElementById('btn-hide-solution');
      solDisplay.style.display = 'none';
      if (showBtn) showBtn.style.display = '';
      if (hideBtn) hideBtn.style.display = 'none';
    });

    document.getElementById('btn-reset-relmodel').addEventListener('click', async () => {
      const confirmed = await (window.App?.showConfirmModal?.(
        'Alle eingegebenen Relationen zurücksetzen?',
        'Relationen zurücksetzen',
      ) ?? Promise.resolve(confirm('Alle eingegebenen Relationen zurücksetzen?')));
      if (!confirmed) return;
      _studentRelations = [];
      document.getElementById('feedback-area').innerHTML = '';
      renderStudentForm();
      renderSolution();
    });
  }

  // ======================================================================
  // INIT
  // ======================================================================
  document.addEventListener('DOMContentLoaded', () => {
    initEvents();
  });

  // Globale Exports
  window.RelModel = {
    syncFromDiagram,
    requestSyncFromDiagramDebounced,
    reset,
    generateSolution,
  };
})();
