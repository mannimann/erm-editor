/* ============================================================
   relmodel.js  –  Relationenmodell: Konverter + Schüler-Eingabe + Prüfung
   ============================================================ */
'use strict';

(function () {
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
        if (state.notation === 'chen') {
          return String(isFrom ? e.chenTo || '1' : e.chenFrom || '1').toLowerCase();
        } else {
          const max = isFrom ? e.mmToMax || '1' : e.mmFromMax || '1';
          return max === '1' ? '1' : 'N';
        }
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

    // Ergebnis-Relationen (als Map: name → { name, attrs })
    const relMap = new Map();

    function ensureRelation(name) {
      if (!relMap.has(name)) relMap.set(name, { name, attrs: [] });
      return relMap.get(name);
    }

    function addAttr(relName, attrName, isPk = false, isFk = false) {
      const rel = ensureRelation(relName);
      // Doppeleinträge vermeiden
      if (!rel.attrs.find((a) => a.name === attrName)) {
        rel.attrs.push({ name: attrName, isPk, isFk });
      }
    }

    // 1. Jede Entität → eigene Relation
    entities.forEach((entity) => {
      ensureRelation(entity.name);
      const attrs = getAttrs(entity.id);
      attrs.forEach((attr) => {
        addAttr(entity.name, attr.name, !!attr.isPrimaryKey, false);
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
        // Neue Relation mit dem Beziehungsnamen
        ensureRelation(rel.name);
        entityEdges.forEach((e) => {
          const entityId = e.fromId === rel.id ? e.toId : e.fromId;
          const entity = getNode(entityId);
          if (!entity) return;
          const pk = getPkAttr(entityId);
          if (pk) addAttr(rel.name, pk, true, true); // zusammengesetzter PK = FK*
        });
        relAttrs.forEach((a) => addAttr(rel.name, a.name, false, false));
      } else if (type === '1:N') {
        // FK der 1-Seite in die N-Seite
        // Herausfinden welche Seite die „1"-Seite ist
        let oneSide = null;
        let nSide = null;

        entityEdges.forEach((e) => {
          const entityId = e.fromId === rel.id ? e.toId : e.fromId;
          const entity = getNode(entityId);
          let max;
          if (state.notation === 'chen') {
            max = String((e.fromId === rel.id ? e.chenTo : e.chenFrom) || '1').toLowerCase();
          } else {
            max = (e.fromId === rel.id ? e.mmToMax : e.mmFromMax) || '1';
          }
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
          // FK in N-Seite eintragen (FK markiert, kein PK)
          addAttr(nSide.name, onePk + '*', false, true);
        }
        // Eigene Beziehungsattribute in N-Seite
        relAttrs.forEach((a) => addAttr(nSide.name, a.name, false, false));
      } else if (type === '1:1') {
        // FK auf der Seite mit min=0 (wenn Min-Max) oder einfach Seite 0→Seite 1 (Chen)
        let targetEntity = null;
        let sourceEntity = null;

        entityEdges.forEach((e) => {
          const entityId = e.fromId === rel.id ? e.toId : e.fromId;
          const entity = getNode(entityId);
          let min;
          if (state.notation === 'minmax') {
            min = parseInt(e.fromId === rel.id ? (e.mmToMin ?? '1') : (e.mmFromMin ?? '1'));
          } else {
            min = 0; // Chen 1:1 → feste Reihenfolge
          }
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
          addAttr(targetEntity.name, srcPk + '*', false, true);
        }
        relAttrs.forEach((a) => addAttr(targetEntity.name, a.name, false, false));
      }
    });

    return Array.from(relMap.values());
  }

  // ======================================================================
  // SCHÜLER-FORMULAR
  // ======================================================================

  let _studentRelations = []; // [{ id, name, attrs:[{ id, name, isPk }] }]
  let _solution = [];
  let _nextId = 1;

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

  function reset() {
    _studentRelations = [];
    _solution = [];
    document.getElementById('feedback-area').innerHTML = '';
    document.getElementById('solution-area').style.display = 'none';
    renderStudentForm();
    renderSolution();
  }

  // ---- Render: Schüler-Eingabe ----
  function renderStudentForm() {
    const container = document.getElementById('student-relations-list');
    container.innerHTML = '';
    _studentRelations.forEach((rel) => {
      container.appendChild(buildRelationCard(rel));
    });
  }

  function buildRelationCard(rel) {
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
    });

    const delBtn = document.createElement('button');
    delBtn.className = 'btn-del-relation';
    delBtn.textContent = '✕';
    delBtn.title = 'Relation löschen';
    delBtn.addEventListener('click', () => {
      _studentRelations = _studentRelations.filter((r) => r.id !== rel.id);
      renderStudentForm();
    });

    header.appendChild(nameInput);
    header.appendChild(delBtn);
    card.appendChild(header);

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
      const newAttr = { id: newAttrId(), name: '', isPk: false };
      rel.attrs.push(newAttr);
      const row = buildAttrRow(rel, newAttr);
      attrsDiv.insertBefore(row, addAttrBtn);
      row.querySelector('.attr-input').focus();
    });

    attrsDiv.appendChild(addAttrBtn);
    card.appendChild(attrsDiv);
    return card;
  }

  function buildAttrRow(rel, attr) {
    const row = document.createElement('div');
    row.className = 'attr-row';
    row.dataset.id = attr.id;

    const inp = document.createElement('input');
    inp.type = 'text';
    inp.className = 'attr-input';
    inp.placeholder = 'Attributname (FK mit *)';
    inp.value = attr.name;
    inp.title = 'Fremdschlüssel mit * markieren, z.B. KundeNr*';
    inp.addEventListener('input', (e) => {
      attr.name = e.target.value;
    });

    const pkCb = document.createElement('input');
    pkCb.type = 'checkbox';
    pkCb.className = 'attr-pk-checkbox';
    pkCb.checked = attr.isPk;
    pkCb.id = 'pk-cb-' + attr.id;
    pkCb.title = 'Primärschlüssel';
    pkCb.addEventListener('change', (e) => {
      attr.isPk = e.target.checked;
    });

    const pkLbl = document.createElement('label');
    pkLbl.className = 'attr-pk-label';
    pkLbl.htmlFor = pkCb.id;
    pkLbl.textContent = 'PK';

    const delAttrBtn = document.createElement('button');
    delAttrBtn.className = 'btn-del-attr';
    delAttrBtn.textContent = '✕';
    delAttrBtn.title = 'Attribut löschen';
    delAttrBtn.addEventListener('click', () => {
      rel.attrs = rel.attrs.filter((a) => a.id !== attr.id);
      row.remove();
    });

    row.appendChild(inp);
    row.appendChild(pkCb);
    row.appendChild(pkLbl);
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

      const parts = rel.attrs.map((a, i) => {
        const sp = document.createElement('span');
        if (a.isPk && a.isFk) sp.className = 'solution-attr fkpk';
        else if (a.isPk) sp.className = 'solution-attr pk';
        else if (a.isFk) sp.className = 'solution-attr fk';
        else sp.className = 'solution-attr';

        let display = a.name;
        if (a.isFk && !a.name.endsWith('*')) display += '*';
        sp.textContent = display + (i < rel.attrs.length - 1 ? ', ' : '');
        return sp;
      });

      parts.forEach((p) => attrSpan.appendChild(p));
      div.appendChild(attrSpan);
      div.appendChild(document.createTextNode(' )'));

      // Legende
      const legend = document.createElement('div');
      legend.style.cssText = 'font-size:0.75rem;color:#94a3b8;margin-top:4px;font-family:sans-serif';
      legend.innerHTML = '<u>unterstrichen</u> = PK &nbsp;|&nbsp; <span style="color:#2563eb">blau</span> = FK';
      div.appendChild(legend);

      container.appendChild(div);
    });
  }

  // ======================================================================
  // PRÜFUNG
  // ======================================================================

  function normalize(s) {
    return (s || '').trim().toLowerCase().replace(/\s+/g, '');
  }

  // Normalisiert Attributnamen: entfernt abschliessendes * für FK-Vergleich
  function normAttr(s) {
    return normalize(s).replace(/\*$/, '');
  }

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
    const solutionNames = _solution.map((r) => normalize(r.name));
    const studentNames = _studentRelations.map((r) => normalize(r.name));

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

    // 3. Attribute & PK je Relation prüfen
    _solution.forEach((solRel) => {
      const studRel = _studentRelations.find((r) => normalize(r.name) === normalize(solRel.name));
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

      // PK-Prüfung
      const solPks = solRel.attrs.filter((a) => a.isPk).map((a) => normAttr(a.name));
      const studPks = studRel.attrs.filter((a) => a.isPk).map((a) => normAttr(a.name));

      solPks.forEach((pk) => {
        if (!studPks.includes(pk)) {
          errors.push(
            `Relation <strong>${solRel.name}</strong>: <em>${pk}</em> sollte als Primärschlüssel markiert sein.`,
          );
        }
      });

      studPks.forEach((pk) => {
        if (!solPks.includes(pk)) {
          warnings.push(
            `Relation <strong>${solRel.name}</strong>: <em>${pk}</em> ist kein erwarteter Primärschlüssel.`,
          );
        }
      });

      // FK-Prüfung (Attribut endet mit *)
      const solFks = solRel.attrs.filter((a) => a.isFk).map((a) => normAttr(a.name));
      const studFks = studRel.attrs.filter((a) => a.name.endsWith('*')).map((a) => normAttr(a.name));

      solFks.forEach((fk) => {
        if (!studFks.includes(fk)) {
          warnings.push(
            `Relation <strong>${solRel.name}</strong>: <em>${fk}</em> sollte als Fremdschlüssel (mit *) markiert sein.`,
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
    area.innerHTML = `<div class="feedback-box ${type}">${html}</div>`;
    area.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  // ======================================================================
  // BUTTON-EVENTS
  // ======================================================================

  function initEvents() {
    document.getElementById('btn-add-relation').addEventListener('click', () => {
      const rel = { id: newRelId(), name: '', attrs: [] };
      _studentRelations.push(rel);
      const card = buildRelationCard(rel);
      document.getElementById('student-relations-list').appendChild(card);
      card.querySelector('.relation-name-input').focus();
    });

    document.getElementById('btn-check').addEventListener('click', () => {
      checkInput();
    });

    document.getElementById('btn-show-solution').addEventListener('click', () => {
      _solution = generateSolution(window.AppState.state);
      renderSolution();
      const solArea = document.getElementById('solution-area');
      solArea.style.display = '';
      solArea.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    document.getElementById('btn-reset-relmodel').addEventListener('click', () => {
      if (!confirm('Alle eingegebenen Relationen zurücksetzen?')) return;
      _studentRelations = [];
      document.getElementById('feedback-area').innerHTML = '';
      document.getElementById('solution-area').style.display = 'none';
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
    reset,
    generateSolution,
  };
})();
