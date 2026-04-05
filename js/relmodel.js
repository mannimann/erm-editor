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

  /**
   * Prüft ob ein Schüler-FK-Name einem Lösungs-FK-Name entspricht
   * (exakt oder mit Prä-/Postfix, getrennt durch - oder _).
   * Arbeitet auf Rohnamen (vor Normalisierung).
   */
  function fkRawNameMatches(studentRaw, solutionRaw) {
    const sNorm = normAttr(studentRaw);
    const solNorm = normAttr(solutionRaw);
    if (sNorm === solNorm) return true;
    if (solNorm.length < 2) return false;
    // Rohnamen (lowercase, FK-Marker entfernt, aber - und _ bleiben)
    const sRaw = stripForeignKeyMarker(studentRaw).toLowerCase().trim();
    const solRawClean = stripForeignKeyMarker(solutionRaw).toLowerCase().trim();
    if (sRaw.length <= solRawClean.length) return false;
    // Postfix: "schülernr_fk" enthält "schülernr" + Trennzeichen danach
    if (sRaw.startsWith(solRawClean)) {
      const sep = sRaw[solRawClean.length];
      if (sep === '-' || sep === '_') return true;
    }
    // Präfix: "fk_schülernr" enthält "schülernr" + Trennzeichen davor
    if (sRaw.endsWith(solRawClean)) {
      const sep = sRaw[sRaw.length - solRawClean.length - 1];
      if (sep === '-' || sep === '_') return true;
    }
    return false;
  }

  /**
   * Prüft ob ein Schüler-Attributname dem Basis-PK einer Selbstbeziehung entspricht.
   * Erlaubt exakten Treffer oder Prä-/Postfix mit - oder _ als Trennzeichen (Affix min. 2 Zeichen).
   */
  function selfRefFkRawNameMatchesBase(studentRaw, basePkRaw) {
    const sNorm = normAttr(studentRaw);
    const baseNorm = normAttr(basePkRaw);
    if (sNorm === baseNorm) return true;
    const sRaw = stripForeignKeyMarker(studentRaw).toLowerCase().trim();
    const baseRawClean = stripForeignKeyMarker(basePkRaw).toLowerCase().trim();
    // Postfix: base + sep + affix
    if (sRaw.startsWith(baseRawClean) && sRaw.length > baseRawClean.length + 1) {
      const sep = sRaw[baseRawClean.length];
      if (sep === '-' || sep === '_') return true;
    }
    // Direkter numerischer Postfix ohne Trennzeichen: base + Ziffernfolge (z. B. schülernr1, schülernr2)
    if (sRaw.startsWith(baseRawClean) && sRaw.length > baseRawClean.length) {
      const suffix = sRaw.slice(baseRawClean.length);
      if (/^\d+$/.test(suffix)) return true;
    }
    // Präfix: affix + sep + base
    if (sRaw.endsWith(baseRawClean) && sRaw.length > baseRawClean.length + 1) {
      const sep = sRaw[sRaw.length - baseRawClean.length - 1];
      if (sep === '-' || sep === '_') return true;
    }
    return false;
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

    // Doppelte Attributnamen prüfen
    const seen = new Map();
    for (const attr of rel.attrs) {
      const name = normAttr(attr.name);
      if (!name) continue;
      if (seen.has(name)) {
        return `Das Attribut „${(attr.name || '').trim()}" ist doppelt vorhanden.`;
      }
      seen.set(name, true);
    }

    return '';
  }

  // ======================================================================
  // LÖSUNG BERECHNEN
  // ======================================================================

  /**
   * Berechnet aus dem ER-Diagramm die Musterlösung.
   * Gibt Array von { name, attrs: [{ name, isPk, isFk }] } zurück.
   */
  function generateSolution(state) {
    _oneToOneInfos = [];
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

    // Primärschlüssel einer Entität (erster Attributname, Fallback)
    function getPkAttr(entityId) {
      const attrs = getAttrs(entityId).filter((a) => a.isPrimaryKey);
      return attrs.length > 0 ? attrs[0].name : null;
    }

    // Alle Primärschlüssel-Attributnamen einer Entität (für Verbundschlüssel)
    function getPkAttrs(entityId) {
      return getAttrs(entityId)
        .filter((a) => a.isPrimaryKey)
        .map((a) => a.name);
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
            mnRel._hasSelfRefFks = true;
            mnRel._selfRefBasePk = pk;
          }
        } else {
          // Normale M:N-Beziehung: alle PK-Attribute der beteiligten Entitäten als FK übernehmen
          entityEdges.forEach((e) => {
            const entityId = e.fromId === rel.id ? e.toId : e.fromId;
            const entity = getNode(entityId);
            if (!entity) return;
            const pks = getPkAttrs(entityId);
            pks.forEach((pk) => addAttr(mnRel, pk, true, true, entity.name));
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

        // Alle PK-Attribute der 1-Seite (Verbundschlüssel) als FK in N-Seite eintragen
        const onePks = getPkAttrs(oneSide.id);
        onePks.forEach((pk) => {
          addAttr(ensureEntityRelation(nSide.name), pk, false, true, oneSide.name);
        });
        // Eigene Beziehungsattribute in N-Seite
        relAttrs.forEach((a) => addRelationshipAttr(ensureEntityRelation(nSide.name), rel.name, a.name));
      } else if (type === '1:1') {
        // 1:1-Beziehung: Standard-Richtung wählen, aber beide Richtungen werden beim Check akzeptiert
        const ids = entityEdges.map((e) => (e.fromId === rel.id ? e.toId : e.fromId));
        const sourceEntity = getNode(ids[0]);
        const targetEntity = getNode(ids[1]);

        if (sourceEntity && targetEntity) {
          const srcPk = getPkAttr(sourceEntity.id);
          const tgtPk = getPkAttr(targetEntity.id);
          if (srcPk) {
            addAttr(ensureEntityRelation(targetEntity.name), srcPk, false, true, sourceEntity.name);
          }
          relAttrs.forEach((a) => addRelationshipAttr(ensureEntityRelation(targetEntity.name), rel.name, a.name));

          // Metadata für bidirektionale Prüfung speichern
          _oneToOneInfos.push({
            sourceEntityName: sourceEntity.name,
            targetEntityName: targetEntity.name,
            sourcePk: srcPk,
            targetPk: tgtPk,
            relAttrNames: relAttrs.map((a) => a.name),
            relationshipName: rel.name,
          });
        }
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

    // Aufgelöste FK-Namen in _oneToOneInfos nachtragen
    _oneToOneInfos.forEach((info) => {
      const targetRel = relations.find(
        (r) => normalizeRelationToken(r.name) === normalizeRelationToken(info.targetEntityName),
      );
      if (targetRel && info.sourcePk) {
        // Finde den FK in der Lösung, der vom sourcePk abstammt
        const resolvedFk = targetRel.attrs.find(
          (a) =>
            a.isFk &&
            (normAttr(a.name) === normAttr(info.sourcePk) ||
              normAttr(a.name).endsWith(normAttr(info.sourcePk)) ||
              normAttr(a.name).startsWith(normAttr(info.sourcePk))),
        );
        if (resolvedFk) {
          info.resolvedSourceFkName = resolvedFk.name;
        }
      }
    });

    return relations;
  }

  // ======================================================================
  // SCHÜLER-FORMULAR
  // ======================================================================

  let _studentRelations = []; // [{ id, name, attrs:[{ id, name, isPk, isFk }], isEditing }]
  let _solution = [];
  let _oneToOneInfos = []; // Metadata über 1:1-Beziehungen für bidirektionale Prüfung
  let _nextId = 1;
  let _syncDebounceTimer = null;
  const SYNC_DEBOUNCE_MS = 180;
  const RELMODEL_PERSIST_KEY = 'erm-relmodel-student-v1';
  let _persistKey = RELMODEL_PERSIST_KEY;

  function persistStudentRelations() {
    try {
      localStorage.setItem(
        _persistKey,
        JSON.stringify({
          studentRelations: _studentRelations,
          nextId: _nextId,
        }),
      );
    } catch (_e) {
      /* ignore */
    }
    window.App?.onRelmodelStudentChanged?.();
  }

  function loadStudentRelations(storageKey = _persistKey) {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return false;
      const data = JSON.parse(raw);
      if (!Array.isArray(data.studentRelations)) return false;
      _studentRelations = data.studentRelations;
      _nextId = 1;
      if (typeof data.nextId === 'number' && data.nextId > _nextId) _nextId = data.nextId;
      ensureStudentIds();
      return true;
    } catch (_e) {
      return false;
    }
  }

  const _hadPersistedData = loadStudentRelations();

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
    try {
      localStorage.removeItem(_persistKey);
    } catch (_e) {}
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

  // Alias für Konsistenz mit Datenänderungs-Aufrufen
  function renderAndPersist() {
    persistStudentRelations();
    renderStudentForm();
    // Debounced Quest-Auto-Check bei Relmodel-Grundlagen
    notifyQuestChange();
  }

  let _questChangeTimer = null;
  function notifyQuestChange() {
    if (_questChangeTimer) clearTimeout(_questChangeTimer);
    _questChangeTimer = setTimeout(() => {
      _questChangeTimer = null;
      if (window.Quest?.state?.questMode === 'relmodel-grundlagen' && window.Quest?.state?.questsPanelVisible) {
        window.Quest.validateCurrentQuest();
      }
    }, 600);
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
      persistStudentRelations();
    });
    nameInput.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      // Springe zum ersten Attribut, falls vorhanden — sonst neu anlegen
      const firstAttrInput = document.querySelector(`.relation-card[data-id="${rel.id}"] .attr-input`);
      if (firstAttrInput) {
        firstAttrInput.focus();
        return;
      }
      const newAttr = { id: newAttrId(), name: '', isPk: false, isFk: false };
      rel.attrs.push(newAttr);
      clearInlineError(rel);
      renderAndPersist();
      const targetInput = document.querySelector(
        `.relation-card[data-id="${rel.id}"] .attr-row[data-id="${newAttr.id}"] .attr-input`,
      );
      if (targetInput) targetInput.focus();
    });

    const delBtn = document.createElement('button');
    delBtn.className = 'btn-del-relation';
    delBtn.textContent = '✕';
    delBtn.title = 'Relation löschen';
    delBtn.addEventListener('click', async () => {
      const hasData = (rel.name || '').trim() || rel.attrs.some((a) => (a.name || '').trim());
      if (hasData) {
        const confirmed = await (window.App?.showConfirmModal?.(
          `Relation „${rel.name || 'unbenannt'}" wirklich löschen?`,
          'Relation löschen',
        ) ?? Promise.resolve(confirm(`Relation „${rel.name || 'unbenannt'}" wirklich löschen?`)));
        if (!confirmed) return;
      }
      _studentRelations = _studentRelations.filter((r) => r.id !== rel.id);
      renderAndPersist();
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
          renderAndPersist();
          return;
        }
        sortAttrsPrimaryFirst(rel.attrs);
        clearInlineError(rel);
      }
      rel.isEditing = !isEditing;
      renderAndPersist();
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
      renderAndPersist();
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
      persistStudentRelations();
    });
    let _suppressBlur = false;
    inp.addEventListener('change', (e) => {
      attr.name = e.target.value.trim();
      clearInlineError(rel);
      renderAndPersist();
    });
    inp.addEventListener('blur', (e) => {
      if (_suppressBlur) {
        _suppressBlur = false;
        return;
      }
      attr.name = e.target.value.trim();
      clearInlineError(rel);
      renderAndPersist();
    });
    inp.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      attr.name = inp.value.trim();
      // Springe zum nächsten Attribut, falls vorhanden — sonst neu anlegen
      const card = document.querySelector(`.relation-card[data-id="${rel.id}"]`);
      const allInputs = card ? Array.from(card.querySelectorAll('.attr-input')) : [];
      const currentIndex = allInputs.indexOf(inp);
      const nextInput = allInputs[currentIndex + 1];
      if (nextInput) {
        _suppressBlur = true;
        persistStudentRelations();
        nextInput.focus();
        return;
      }
      _suppressBlur = true;
      const newAttr = { id: newAttrId(), name: '', isPk: false, isFk: false };
      rel.attrs.push(newAttr);
      clearInlineError(rel);
      renderAndPersist();
      const targetInput = document.querySelector(
        `.relation-card[data-id="${rel.id}"] .attr-row[data-id="${newAttr.id}"] .attr-input`,
      );
      if (targetInput) targetInput.focus();
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
      renderAndPersist();
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
      renderAndPersist();
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
      renderAndPersist();
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

  /**
   * Erstellt eine angepasste Lösung, die bei 1:1-Beziehungen die vom Schüler gewählte
   * Richtung berücksichtigt. Gibt { solution, bothDirectionErrors } zurück.
   */
  function getAdjustedSolution() {
    const solution = _solution.map((rel) => ({
      ...rel,
      attrs: rel.attrs.map((a) => ({ ...a })),
    }));
    const bothDirectionErrors = [];
    const altDirectionAttrs = {}; // { sourceEntityName: studentAttrName }

    _oneToOneInfos.forEach((info) => {
      const {
        sourceEntityName,
        targetEntityName,
        sourcePk,
        targetPk,
        relAttrNames,
        relationshipName,
        resolvedSourceFkName,
      } = info;
      if (!sourcePk || !targetPk) return;

      const studTarget = _studentRelations.find(
        (r) => normalizeRelationToken(r.name) === normalizeRelationToken(targetEntityName),
      );
      const studSource = _studentRelations.find(
        (r) => normalizeRelationToken(r.name) === normalizeRelationToken(sourceEntityName),
      );

      // Standard-Richtung: FK(sourcePk) in target – prüfe sowohl den Original-PK als auch den aufgelösten FK-Namen
      const hasStandard = studTarget?.attrs.some(
        (a) =>
          a.isFk &&
          (fkRawNameMatches(a.name, sourcePk) ||
            (resolvedSourceFkName && fkRawNameMatches(a.name, resolvedSourceFkName))),
      );
      // Alternative Richtung: FK(targetPk) in source
      // Konstruiere den erwarteten FK-Namen für alternative Richtung: z.B. "e-id"
      const altFkName = `${targetEntityName}-${targetPk}`;
      // Alternative Richtung auch dann erkennen, wenn der FK bereits markiert wurde (z. B. e-id↑)
      const altAttr = studSource?.attrs.find((a) => fkRawNameMatches(a.name, altFkName));
      const hasAlt = !!altAttr;

      if (hasStandard && hasAlt) {
        bothDirectionErrors.push(
          `@@REL:${relationshipName}@@Bei der 1:1-Beziehung „${relationshipName}" wurde der Fremdschlüssel in <strong>beide</strong> Richtungen eingetragen. ` +
            `Wähle eine Richtung: entweder in „${sourceEntityName}" oder in „${targetEntityName}".`,
        );
      } else if (hasAlt && !hasStandard) {
        // Speichere den erkannten Student-Attribut-Namen
        if (altAttr) {
          altDirectionAttrs[sourceEntityName] = altAttr.name;
        }
        // Schüler hat alternative Richtung gewählt → Lösung anpassen
        const adjTarget = solution.find(
          (r) => normalizeRelationToken(r.name) === normalizeRelationToken(targetEntityName),
        );
        const adjSource = solution.find(
          (r) => normalizeRelationToken(r.name) === normalizeRelationToken(sourceEntityName),
        );
        if (adjTarget && adjSource && altAttr) {
          // FK aus target entfernen (nutze aufgelösten Namen falls vorhanden)
          const fkNameToRemove = resolvedSourceFkName || sourcePk;
          adjTarget.attrs = adjTarget.attrs.filter(
            (a) =>
              !(a.isFk && (normAttr(a.name) === normAttr(fkNameToRemove) || normAttr(a.name) === normAttr(sourcePk))),
          );
          // Beziehungsattribute aus target entfernen
          relAttrNames.forEach((raName) => {
            adjTarget.attrs = adjTarget.attrs.filter((a) => normAttr(a.name) !== normAttr(raName));
          });
          // FK in source einfügen – nutze den tatsächlichen Student-Attribut-Namen
          adjSource.attrs.push({ name: altAttr.name, isPk: false, isFk: true });
          // Beziehungsattribute in source einfügen
          relAttrNames.forEach((raName) => {
            adjSource.attrs.push({ name: raName, isPk: false, isFk: false });
          });
        }
      }
    });

    return { solution, bothDirectionErrors, altDirectionAttrs };
  }

  function checkInput() {
    // Lösung immer aktuell aus dem ERM berechnen
    // _solution = generateSolution(window.AppState.state);

    if (_solution.length === 0) {
      showFeedback(
        'error',
        'Das ER-Diagramm enthält noch keine auswertbaren Elemente. Bitte zuerst das ER-Diagramm erstellen.',
      );
      return { passed: false };
    }

    // Angepasste Lösung: berücksichtigt vom Schüler gewählte 1:1-Richtung
    const { solution, bothDirectionErrors, altDirectionAttrs } = getAdjustedSolution();

    const missingRelations = [];
    const extraRelations = [];
    const missingAttrs = [];
    const extraAttrs = [];
    const pkErrors = [];
    const pkWarnings = [];
    const fkWarnings = [];
    const fkOverWarnings = [...bothDirectionErrors];
    const missingNmRelations = [];

    const solutionNames = solution.map((r) => normalizeRelationToken(r.name));
    const studentNames = _studentRelations.map((r) => normalizeRelationToken(r.name));

    // Prüfe, ob die Relation aus einer n:m-Beziehung stammt
    solution.forEach((rel) => {
      const isNm = rel._kind === 'mn';
      const sn = normalizeRelationToken(rel.name);
      if (!studentNames.includes(sn)) {
        if (isNm) {
          missingNmRelations.push(`Relation <strong>${rel.name}</strong> (aus n:m-Beziehung) fehlt.`);
        } else {
          missingRelations.push(`Relation <strong>${rel.name}</strong> fehlt.`);
        }
      }
    });
    _studentRelations.forEach((rel) => {
      const normalizedName = normalizeRelationToken(rel.name);
      if (!solutionNames.includes(normalizedName)) {
        const displayName = String(rel.name || '').trim() || 'Unbenannte Relation';
        extraRelations.push(`Relation <strong>${displayName}</strong> ist nicht Teil der erwarteten Lösung.`);
      }
    });

    solution.forEach((solRel) => {
      const studRel = _studentRelations.find(
        (r) => normalizeRelationToken(r.name) === normalizeRelationToken(solRel.name),
      );
      if (!studRel) return;
      // Für die Attribut-Prüfung:
      // - Pflicht: alle Nicht-Fremdschlüssel-Attribute aus der Lösung
      // - Kann: alle Fremdschlüssel-Attribute aus der Lösung
      const solNonFkAttrs = solRel.attrs.filter((a) => !a.isFk);
      const solAttrs = solNonFkAttrs.map((a) => normAttr(a.name));
      const solFkAttrs = solRel.attrs.filter((a) => a.isFk).map((a) => normAttr(a.name));
      const solFkRawNames = solRel.attrs.filter((a) => a.isFk).map((a) => a.name);
      // Pflicht-Attribute müssen vorhanden sein (egal ob als Fremdschlüssel markiert oder nicht)
      solNonFkAttrs.forEach((solAttr) => {
        const sa = normAttr(solAttr.name);
        const exists = studRel.attrs.some((a) => normAttr(a.name) === sa);
        if (!exists) missingAttrs.push(`@@REL:${solRel.name}@@Attribut <em>${(solAttr.name || '').trim()}</em> fehlt.`);
      });
      // Überflüssig sind nur Attribute, die weder Pflicht noch Kann sind
      // und auch nicht per Prä-/Postfix einem Lösungs-FK entsprechen
      studRel.attrs
        .filter((a) => !a.isFk)
        .forEach((studAttr) => {
          const sa = normAttr(studAttr.name);
          if (!sa || solAttrs.includes(sa) || solFkAttrs.includes(sa)) return;
          const rawName = studAttr.name || '';
          const matchesFk = solFkRawNames.some((sf) => fkRawNameMatches(rawName, sf));
          if (!matchesFk)
            extraAttrs.push(`@@REL:${solRel.name}@@Attribut <em>${(rawName || '').trim()}</em> ist nicht erwartet.`);
        });
      // Selbstbeziehung: Prüfung mit Basis-PK und Prä-/Postfix-Logik (Trennzeichen - oder _)
      if (solRel._hasSelfRefFks) {
        const basePk = solRel._selfRefBasePk || '';
        const validSelfFkAttrs = studRel.attrs.filter(
          (a) => a.isPk && a.isFk && selfRefFkRawNameMatchesBase(a.name, basePk),
        );
        if (validSelfFkAttrs.length < 2) {
          pkErrors.push(
            `@@REL:${solRel.name}@@Markiere mindestens 2 Attribute als PS und FS, die auf „${basePk}" basieren (z. B. ${basePk}-2 oder ${basePk}2).`,
          );
        }
        // Überflüssige PS+FS-Attribute (nicht zum Basis-PK passend)
        studRel.attrs
          .filter((a) => (a.isPk || a.isFk) && !selfRefFkRawNameMatchesBase(a.name, basePk))
          .forEach((a) => {
            pkWarnings.push(
              `@@REL:${solRel.name}@@<em>${(a.name || '').trim()}</em> passt nicht zum erwarteten Basis-Primärschlüssel „${basePk}".`,
            );
          });
        return;
      }

      // Primärschlüssel-Prüfung
      const solPkAttrs = solRel.attrs.filter((a) => a.isPk);
      const studPkAttrs = studRel.attrs.filter((a) => a.isPk);
      const solPks = solPkAttrs.map((a) => normAttr(a.name));
      const studPks = studPkAttrs.map((a) => normAttr(a.name));
      solPkAttrs.forEach((pkAttr) => {
        const pk = normAttr(pkAttr.name);
        if (!studPks.includes(pk)) {
          pkErrors.push(
            `@@REL:${solRel.name}@@<em>${(pkAttr.name || '').trim()}</em> sollte als Primärschlüssel (PS) markiert sein.`,
          );
        }
      });
      studPkAttrs.forEach((pkAttr) => {
        const pk = normAttr(pkAttr.name);
        if (!solPks.includes(pk)) {
          pkWarnings.push(
            `@@REL:${solRel.name}@@<em>${(pkAttr.name || '').trim()}</em> ist kein erwarteter Primärschlüssel (PS).`,
          );
        }
      });
      // Fremdschlüssel-Prüfung mit Prä-/Postfix-Unterstützung (Trennzeichen - oder _ erforderlich)
      // Fehlende Fremdschlüssel-Markierungen (Rohnamen-Vergleich mit Prä-/Postfix)
      const solFkRawAttrs = solRel.attrs.filter((a) => a.isFk);
      const studFkRawAttrs = studRel.attrs.filter((a) => !!a.isFk);
      solFkRawAttrs.forEach((solFkAttr) => {
        const matched = studFkRawAttrs.some((sf) => fkRawNameMatches(sf.name, solFkAttr.name));
        if (!matched) {
          // Prüfe ob ein nicht-markiertes Attribut per Prä-/Postfix dem FK entspricht
          let unmatchedAttr = studRel.attrs.find((a) => !a.isFk && fkRawNameMatches(a.name, solFkAttr.name));
          // Falls alternative Richtung erkannt wurde, nutze den gespeicherten Student-Attribut-Namen
          if (!unmatchedAttr && altDirectionAttrs[solRel.name]) {
            unmatchedAttr = { name: altDirectionAttrs[solRel.name] };
          }
          const displayName = unmatchedAttr ? unmatchedAttr.name : solFkAttr.name;
          fkWarnings.push(
            `@@REL:${solRel.name}@@<em>${displayName}</em> sollte als Fremdschlüssel (FS) markiert sein.`,
          );
        }
      });
      // Überflüssige Fremdschlüssel-Markierungen
      studFkRawAttrs.forEach((studFkAttr) => {
        const matched = solFkRawAttrs.some((sf) => fkRawNameMatches(studFkAttr.name, sf.name));
        if (!matched) {
          fkOverWarnings.push(
            `@@REL:${solRel.name}@@<em>${(studFkAttr.name || '').trim()}</em> ist kein erwarteter Fremdschlüssel (FS).`,
          );
        }
      });
    });

    const hasErrors = missingRelations.length || missingNmRelations.length || missingAttrs.length || pkErrors.length;
    const hasWarnings =
      extraRelations.length || extraAttrs.length || pkWarnings.length || fkWarnings.length || fkOverWarnings.length;
    if (!hasErrors && !hasWarnings) {
      showFeedback('success', '✅ Sehr gut! Deine Überführung ist vollständig und korrekt.');
      return { passed: true };
    }
    showFeedbackCategorized({
      missingRelations,
      missingNmRelations,
      extraRelations,
      missingAttrs,
      extraAttrs,
      pkErrors,
      pkWarnings,
      fkWarnings,
      fkOverWarnings,
    });
    return { passed: false };
  }

  function buildAccordionItem(label, messages, isWarning) {
    const wrapper = document.createElement('div');
    wrapper.className = 'feedback-group';
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'feedback-group-toggle' + (isWarning ? ' warning' : '');
    toggle.innerHTML = `<span class="feedback-group-label">${label}</span><span class="feedback-group-action">Anzeigen <span class="feedback-group-chevron">&#x276F;</span></span>`;
    const body = document.createElement('div');
    body.className = 'feedback-group-body';
    body.hidden = true;
    const ul = document.createElement('ul');
    messages.forEach((m) => {
      const li = document.createElement('li');
      li.innerHTML = m;
      ul.appendChild(li);
    });
    body.appendChild(ul);
    toggle.addEventListener('click', () => {
      const open = !body.hidden;
      body.hidden = open;
      toggle.classList.toggle('open', !open);
    });
    wrapper.appendChild(toggle);
    wrapper.appendChild(body);
    return wrapper;
  }

  function groupByRelation(messages) {
    const groups = new Map();
    // Die Gruppierung muss außerhalb von checkInput den Relationsnamen kennen.
    // Daher: Erwarte, dass showFeedbackCategorized die Nachrichten bereits nach Relation gruppiert übergibt.
    // Fallback: Wenn keine Gruppierung möglich, alles unter '—'.
    // Die Funktion wird aber weiterhin für die Gruppierung nach Relation verwendet,
    // daher erweitern wir die Nachrichten um einen Marker, z.B. "@@REL:Name@@" am Anfang.
    messages.forEach((msg) => {
      let relName = '—';
      const relMatch = msg.match(/^@@REL:([^@]+)@@/);
      let cleanMsg = msg;
      if (relMatch) {
        relName = relMatch[1];
        cleanMsg = msg.replace(/^@@REL:[^@]+@@/, '');
      }
      if (!groups.has(relName)) groups.set(relName, []);
      groups.get(relName).push(cleanMsg);
    });
    return groups;
  }

  function buildAccordionItemGrouped(label, messages, isWarning) {
    const groups = groupByRelation(messages);
    buildAccordionItem(label, messages, isWarning);
    const wrapper = document.createElement('div');
    wrapper.className = 'feedback-group';
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'feedback-group-toggle' + (isWarning ? ' warning' : '');
    toggle.innerHTML = `<span class="feedback-group-label">${label}</span><span class="feedback-group-action">Anzeigen <span class="feedback-group-chevron">&#x276F;</span></span>`;
    const body = document.createElement('div');
    body.className = 'feedback-group-body feedback-group-body--nested';
    body.hidden = true;
    groups.forEach((msgs, relName) => {
      body.appendChild(buildAccordionItem(`Relation „${relName}“`, msgs, isWarning));
    });
    toggle.addEventListener('click', () => {
      const open = !body.hidden;
      body.hidden = open;
      toggle.classList.toggle('open', !open);
    });
    wrapper.appendChild(toggle);
    wrapper.appendChild(body);
    return wrapper;
  }

  function showFeedbackCategorized({
    missingRelations,
    missingNmRelations = [],
    extraRelations,
    missingAttrs,
    extraAttrs,
    pkErrors,
    pkWarnings,
    fkWarnings,
    fkOverWarnings = [],
  }) {
    const area = document.getElementById('feedback-area');
    area.innerHTML = '';
    const hasRelationIssues = missingRelations.length || extraRelations.length;
    const hasAttrIssues = missingAttrs.length || extraAttrs.length;
    const hasPkIssues = pkErrors.length || pkWarnings.length;
    const hasFkIssues = fkWarnings.length || fkOverWarnings.length || missingNmRelations.length;
    const hasErrors = missingRelations.length || missingNmRelations.length || missingAttrs.length || pkErrors.length;

    const box = document.createElement('div');
    box.className = 'feedback-box ' + (hasErrors ? 'error' : 'success');

    const closeBtn = document.createElement('button');
    closeBtn.className = 'feedback-close';
    closeBtn.type = 'button';
    closeBtn.setAttribute('aria-label', 'Hinweis schließen');
    closeBtn.textContent = '✕';
    closeBtn.addEventListener('click', () => {
      area.innerHTML = '';
    });
    box.appendChild(closeBtn);

    const summary = document.createElement('div');
    summary.className = 'feedback-summary';
    summary.textContent = hasErrors
      ? '❌ Das Relationenmodell ist noch nicht korrekt.'
      : '⚠️ Fast richtig – es gibt noch kleine Hinweise.';
    box.appendChild(summary);

    const detailsBody = document.createElement('div');
    detailsBody.className = 'feedback-details-body';
    detailsBody.hidden = true;

    const detailsToggle = document.createElement('button');
    detailsToggle.type = 'button';
    detailsToggle.className = 'feedback-details-toggle';
    detailsToggle.innerHTML = 'Hinweise <span class="feedback-group-chevron">&#x276F;</span>';
    detailsToggle.addEventListener('click', () => {
      const open = !detailsBody.hidden;
      detailsBody.hidden = open;
      detailsToggle.classList.toggle('open', !open);
    });
    box.appendChild(detailsToggle);

    if (hasRelationIssues) {
      if (missingRelations.length)
        detailsBody.appendChild(buildAccordionItem('Fehlende Relationen', missingRelations, false));
      if (extraRelations.length)
        detailsBody.appendChild(buildAccordionItem('Überflüssige Relationen', extraRelations, true));
    } else if (hasAttrIssues) {
      if (missingAttrs.length)
        detailsBody.appendChild(buildAccordionItemGrouped('Fehlende Attribute', missingAttrs, false));
      if (extraAttrs.length)
        detailsBody.appendChild(buildAccordionItemGrouped('Überflüssige Attribute', extraAttrs, true));
    } else if (hasPkIssues || hasFkIssues) {
      if (pkErrors.length)
        detailsBody.appendChild(buildAccordionItemGrouped('Fehlende Primärschlüssel-Markierungen', pkErrors, false));
      if (pkWarnings.length)
        detailsBody.appendChild(
          buildAccordionItemGrouped('Überflüssige Primärschlüssel-Markierungen', pkWarnings, true),
        );
      if (fkWarnings.length)
        detailsBody.appendChild(buildAccordionItemGrouped('Fehlende Fremdschlüssel-Markierungen', fkWarnings, false));
      if (fkOverWarnings.length)
        detailsBody.appendChild(
          buildAccordionItemGrouped('Überflüssige Fremdschlüssel-Markierungen', fkOverWarnings, true),
        );
      if (missingNmRelations.length)
        detailsBody.appendChild(
          buildAccordionItem('Fehlende Relationen (aus n:m-Beziehungen)', missingNmRelations, false),
        );
    }

    box.appendChild(detailsBody);
    area.appendChild(box);
    area.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
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
      _studentRelations.forEach((rel) => {
        removeEmptyAttrs(rel);
        const err = validateRelationInline(rel);
        if (!err) {
          sortAttrsPrimaryFirst(rel.attrs);
          rel.isEditing = false;
          clearInlineError(rel);
        } else {
          rel.inlineError = err;
        }
        // unfertige Karten bleiben offen
      });
      renderAndPersist();
      checkInput();
    });

    document.getElementById('btn-show-solution').addEventListener('click', () => {
      // Sicherheitsabfrage: Modal anzeigen
      const modal = document.getElementById('modal-solution-confirm-backdrop');
      if (!modal) return;
      modal.style.display = 'flex';
      modal.focus();

      // Event-Handler für Modal-Buttons
      const cancelBtn = document.getElementById('btn-solution-cancel');
      const confirmBtn = document.getElementById('btn-solution-confirm');

      function closeModal() {
        modal.style.display = 'none';
      }

      // Nur einmalige Handler
      const onCancel = (e) => {
        e.preventDefault();
        closeModal();
        cancelBtn.removeEventListener('click', onCancel);
        confirmBtn.removeEventListener('click', onConfirm);
      };
      const onConfirm = (e) => {
        e.preventDefault();
        closeModal();
        cancelBtn.removeEventListener('click', onCancel);
        confirmBtn.removeEventListener('click', onConfirm);
        // Jetzt wirklich Lösung anzeigen
        _solution = generateSolution(window.AppState.state);
        renderSolution();
        const solDisplay = document.getElementById('solution-display');
        const showBtn = document.getElementById('btn-show-solution');
        const hideBtn = document.getElementById('btn-hide-solution');
        solDisplay.style.display = '';
        if (showBtn) showBtn.style.display = 'none';
        if (hideBtn) hideBtn.style.display = '';
        solDisplay.scrollIntoView({ behavior: 'smooth', block: 'start' });
      };
      cancelBtn.addEventListener('click', onCancel);
      confirmBtn.addEventListener('click', onConfirm);
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
      try {
        localStorage.removeItem(_persistKey);
      } catch (_e) {}
      document.getElementById('feedback-area').innerHTML = '';
      renderStudentForm();
      renderSolution();
    });
  }

  // ---- Import / Export ----
  function exportRelmodelJSON() {
    if (_studentRelations.length === 0) {
      window.App?.showAlertModal?.('Es sind keine Relationen zum Exportieren vorhanden.', 'Export nicht möglich');
      return;
    }
    const data = JSON.stringify({ studentRelations: _studentRelations, nextId: _nextId }, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const title = (window.AppState?.state?.diagramTitle || 'relationenmodell').replace(/[^a-zA-Z0-9äöüÄÖÜß_\- ]/g, '');
    a.download = title + '.erm-editor-relmodel.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  function importRelmodelJSON(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        if (!Array.isArray(data.studentRelations)) throw new Error('Ungültiges Format');
        _studentRelations = data.studentRelations;
        if (typeof data.nextId === 'number' && data.nextId > _nextId) _nextId = data.nextId;
        ensureStudentIds();
        persistStudentRelations();
        renderStudentForm();
        document.getElementById('feedback-area').innerHTML = '';
      } catch (err) {
        window.App?.showAlertModal?.(`Fehler beim Importieren: ${err.message}`, 'Import fehlgeschlagen');
      }
    };
    reader.readAsText(file);
  }

  function exportRelmodelPNG() {
    if (_studentRelations.length === 0) {
      window.App?.showAlertModal?.('Es sind keine Relationen zum Exportieren vorhanden.', 'Export nicht möglich');
      return;
    }

    if (typeof html2canvas !== 'function') {
      window.App?.showAlertModal?.('html2canvas ist nicht verfügbar.', 'Export fehlgeschlagen');
      return;
    }

    // Temporären Export-Container aufbauen: nur die weißen Relation-Boxen, ohne graue Card-Header
    const exportContainer = document.createElement('div');
    exportContainer.style.cssText =
      'position:fixed;left:-9999px;top:-9999px;background:#fff;padding:4px;width:fit-content;max-width:900px;';

    _studentRelations.forEach((rel) => {
      const relCopy = {
        ...rel,
        attrs: rel.attrs.map((a) => ({ ...a })),
        isEditing: false,
      };
      removeEmptyAttrs(relCopy);
      sortAttrsPrimaryFirst(relCopy.attrs);
      const preview = buildRelationPreview(relCopy, false);
      // Abstand zwischen den Boxen verringern: Padding des Wrappers und margin der Box reduzieren
      preview.style.padding = '2px 0';
      const box = preview.querySelector('.solution-relation');
      if (box) box.style.marginBottom = '0';
      exportContainer.appendChild(preview);
    });

    document.body.appendChild(exportContainer);

    html2canvas(exportContainer, { backgroundColor: '#ffffff', scale: 2 })
      .then((canvas) => {
        canvas.toBlob((blob) => {
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          const title = (window.AppState?.state?.diagramTitle || 'relationenmodell').replace(
            /[^a-zA-Z0-9äöüÄÖÜß_\- ]/g,
            '',
          );
          a.download = title + '.erm-editor-relmodel.png';
          a.click();
          setTimeout(() => URL.revokeObjectURL(url), 3000);
        }, 'image/png');
      })
      .catch(() => {
        window.App?.showAlertModal?.('PNG-Export fehlgeschlagen. Bitte versuche es erneut.', 'Export fehlgeschlagen');
      })
      .finally(() => {
        document.body.removeChild(exportContainer);
      });
  }

  // ======================================================================
  // INIT
  // ======================================================================
  document.addEventListener('DOMContentLoaded', () => {
    if (_hadPersistedData) {
      renderStudentForm();
    }
    initEvents();

    // Import/Export Event-Listener
    const importBtn = document.getElementById('btn-relmodel-import');
    const fileInput = document.getElementById('relmodel-file-input');
    if (importBtn && fileInput) {
      importBtn.addEventListener('click', () => fileInput.click());
      fileInput.addEventListener('change', (e) => {
        if (e.target.files[0]) {
          importRelmodelJSON(e.target.files[0]);
          e.target.value = '';
        }
      });
    }
    const exportJsonBtn = document.getElementById('btn-relmodel-export-json');
    if (exportJsonBtn) exportJsonBtn.addEventListener('click', exportRelmodelJSON);
    const exportPngBtn = document.getElementById('btn-relmodel-export-png');
    if (exportPngBtn) exportPngBtn.addEventListener('click', exportRelmodelPNG);
  });

  // Globale Exports
  window.RelModel = {
    syncFromDiagram,
    requestSyncFromDiagramDebounced,
    reset,
    generateSolution,
    hadPersistedData: () => _hadPersistedData,
    getStudentRelations: () => JSON.parse(JSON.stringify(_studentRelations)),
    setStudentRelations: (rels) => {
      _studentRelations = Array.isArray(rels) ? rels : [];
      ensureStudentIds();
      persistStudentRelations();
      renderStudentForm();
    },
    getPersistKey: () => _persistKey,
    setPersistKey: (key) => {
      _persistKey = key || RELMODEL_PERSIST_KEY;
    },
    saveToStorage: (key) => {
      const previous = _persistKey;
      _persistKey = key || previous;
      persistStudentRelations();
      _persistKey = previous;
    },
    loadFromStorage: (key) => {
      const storageKey = key || _persistKey;
      const loaded = loadStudentRelations(storageKey);
      if (!loaded) return false;
      renderStudentForm();
      return true;
    },
    clearStorage: (key) => {
      const storageKey = key || _persistKey;
      try {
        localStorage.removeItem(storageKey);
      } catch (_e) {}
    },
    isDrawerOpen: () => {
      const drawer = document.getElementById('relmodel-drawer');
      return drawer ? !drawer.classList.contains('collapsed') : false;
    },
    openDrawer: () => {
      if (window.AppTabs?.setDrawerState) window.AppTabs.setDrawerState(true);
    },
    checkAndGetResult: () => {
      removeCompletelyEmptyRelations();
      _studentRelations.forEach((rel) => {
        removeEmptyAttrs(rel);
        const err = validateRelationInline(rel);
        if (!err) {
          sortAttrsPrimaryFirst(rel.attrs);
          rel.isEditing = false;
        }
      });
      renderStudentForm();
      return checkInput();
    },
    triggerCheck: () => {
      const btn = document.getElementById('btn-check');
      if (btn) btn.click();
    },
    exportJSON: exportRelmodelJSON,
    importJSON: importRelmodelJSON,
    exportPNG: exportRelmodelPNG,
  };
})();
