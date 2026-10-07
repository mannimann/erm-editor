/* ============================================================
   lernpfad.js – Aufgaben-Manager, Definitionen & Validatoren
   ============================================================ */
'use strict';

(function () {
  // ---- Hilfsfunktionen ----

  function S() {
    return window.AppState?.state || {};
  }

  // Gemeinsame Normalisierung mit dem Relationenmodell (relmodel.js): Groß-/Kleinschreibung,
  // Leerzeichen, _ und - egal, ä = ae, ö = oe, ü = ue, ß = ss.
  const normalizeName = window.RelModel.normalizeName;

  function getEntityByName(name) {
    const normalized = normalizeName(name);
    return S().nodes?.find((n) => n.type === 'entity' && normalizeName(n.name) === normalized) || null;
  }

  function getAttributeByName(parentId, name) {
    const normalized = normalizeName(name);
    const attrs = S().nodes?.filter((n) => n.type === 'attribute' && normalizeName(n.name) === normalized) || [];
    if (attrs.length === 0) return null;

    return (
      attrs.find((attr) =>
        S().edges?.some(
          (e) =>
            ((e.fromId === parentId && e.toId === attr.id) || (e.fromId === attr.id && e.toId === parentId)) &&
            e.edgeType === 'attribute',
        ),
      ) || null
    );
  }

  function getAttributesOf(parentId) {
    return (
      S().nodes?.filter(
        (n) =>
          n.type === 'attribute' &&
          S().edges?.some(
            (e) =>
              e.edgeType === 'attribute' &&
              ((e.fromId === parentId && e.toId === n.id) || (e.fromId === n.id && e.toId === parentId)),
          ),
      ) || []
    );
  }

  // spec ({ from, to }): Heißen zwei Beziehungen gleich („hat“), zählt die zwischen den erwarteten Entitätsklassen.
  // Mit spec gilt auch eine andere Form desselben Verbs („teilnehmen“ für „nimmt teil an“, „gehören“ für
  // „gehört zu“) – aber nur zwischen den richtigen Entitätsklassen.
  function getRelationshipByName(name, spec = null) {
    const normalized = normalizeName(name);
    const rels = (S().nodes || []).filter((n) => n.type === 'relationship');
    const kandidaten = rels.filter((n) => normalizeName(n.name) === normalized);
    if (!spec) return kandidaten[0] || null;
    const verbunden = (rel, entityName) =>
      S().edges.some(
        (e) =>
          e.edgeType === 'relationship' &&
          [e.fromId, e.toId].includes(rel.id) &&
          normalizeName(getNodeName(e.fromId === rel.id ? e.toId : e.fromId)) === normalizeName(entityName),
      );
    const passend = (r) => verbunden(r, spec.from) && verbunden(r, spec.to);
    if (kandidaten.length) return kandidaten.find(passend) || kandidaten[0];
    const formen = new Set(verbformen(name));
    return rels.find((r) => formen.has(normalizeName(r.name)) && passend(r)) || null;
  }

  function getNodeName(id) {
    return S().nodes.find((n) => n.id === id)?.name || '';
  }

  // '' = Kardinalität noch nicht festgelegt
  function normalizeCardinality(value) {
    const v = String(value || '')
      .trim()
      .toLowerCase();
    return v === 'm' ? 'n' : v;
  }

  function getRelationshipEdgeToEntity(relationshipId, entityId) {
    return (
      S().edges?.find(
        (e) =>
          e.edgeType === 'relationship' &&
          ((e.fromId === relationshipId && e.toId === entityId) ||
            (e.fromId === entityId && e.toId === relationshipId)),
      ) || null
    );
  }

  // null: nicht verbunden; '' : verbunden, Kardinalität noch offen
  function getCardinalityForEntityOnRelationship(relationshipId, entityId) {
    const edge = getRelationshipEdgeToEntity(relationshipId, entityId);
    if (!edge) return null;
    if (edge.fromId === relationshipId) return normalizeCardinality(edge.chenTo);
    return normalizeCardinality(edge.chenFrom);
  }

  function countEntities() {
    return S().nodes?.filter((n) => n.type === 'entity')?.length || 0;
  }

  function toArray(value) {
    if (Array.isArray(value)) return value;
    if (value == null) return [];
    return [value];
  }

  function validateEntityRequirements(entityName, spec) {
    const entity = getEntityByName(entityName);
    if (!entity) {
      return { passed: false, error: `Die Entitätsklasse „${entityName}“ fehlt.` };
    }

    const expectedAttributes = spec.attributes?.[entityName] || [];
    for (const attributeName of expectedAttributes) {
      if (!getAttributeByName(entity.id, attributeName)) {
        return {
          passed: false,
          error: `Bei der Entitätsklasse „${entityName}“ fehlt das Attribut „${attributeName}“.`,
        };
      }
    }

    const expectedPrimaryKeys = toArray(spec.primaryKeys?.[entityName]);
    for (const primaryKeyName of expectedPrimaryKeys) {
      const attribute = getAttributeByName(entity.id, primaryKeyName);
      if (!attribute) {
        return {
          passed: false,
          error: `Bei der Entitätsklasse „${entityName}“ fehlt der Primärschlüssel „${primaryKeyName}“.`,
        };
      }
      if (!attribute.isPrimaryKey) {
        return {
          passed: false,
          error: `Das Attribut „${primaryKeyName}“ muss bei „${entityName}“ als Primärschlüssel markiert sein.`,
        };
      }
    }

    return { passed: true };
  }

  function validateRelationshipRequirements(spec) {
    for (const relationshipSpec of spec.relationships || []) {
      const relationship = getRelationshipByName(relationshipSpec.name, relationshipSpec);
      if (!relationship) {
        return { passed: false, error: `Die Beziehung „${relationshipSpec.name}“ fehlt.` };
      }

      // Selbstbeziehung: from === to
      if (normalizeName(relationshipSpec.from) === normalizeName(relationshipSpec.to)) {
        const entity = getEntityByName(relationshipSpec.from);
        if (!entity) {
          return { passed: false, error: `Die Entitätsklasse „${relationshipSpec.from}“ muss existieren.` };
        }

        const edges =
          S().edges?.filter(
            (e) =>
              e.edgeType === 'relationship' &&
              ((e.fromId === relationship.id && e.toId === entity.id) ||
                (e.fromId === entity.id && e.toId === relationship.id)),
          ) || [];

        if (edges.length < 2) {
          return {
            passed: false,
            error: `Die Selbstbeziehung „${relationshipSpec.name}“ muss auf beiden Seiten mit „${relationshipSpec.from}“ verbunden sein.`,
          };
        }

        const cards = edges.map((e) => {
          if (e.fromId === relationship.id) return normalizeCardinality(e.chenTo);
          return normalizeCardinality(e.chenFrom);
        });

        const [expectedFrom, expectedTo] = String(relationshipSpec.cardinality || '')
          .split(':')
          .map((value) => normalizeCardinality(value));
        const sortedCards = [...cards].sort();
        const sortedExpected = [expectedFrom, expectedTo].sort();

        // Ohne vorgegebene Kardinalität (ERM-Grundlagen) zählt nur die Verbindung
        if (
          relationshipSpec.cardinality &&
          (sortedCards[0] !== sortedExpected[0] || sortedCards[1] !== sortedExpected[1])
        ) {
          return {
            passed: false,
            error:
              relationshipSpec.hinweis ||
              `Die Selbstbeziehung „${relationshipSpec.name}“ braucht die Kardinalität ${relationshipSpec.cardinality}.`,
          };
        }
      } else {
        // Normale Beziehung zwischen zwei verschiedenen Entitätsklassen
        const fromEntity = getEntityByName(relationshipSpec.from);
        const toEntity = getEntityByName(relationshipSpec.to);
        if (!fromEntity || !toEntity) {
          return {
            passed: false,
            error: `Die Entitätsklassen „${relationshipSpec.from}“ und „${relationshipSpec.to}“ müssen existieren.`,
          };
        }

        const fromCardinality = getCardinalityForEntityOnRelationship(relationship.id, fromEntity.id);
        const toCardinality = getCardinalityForEntityOnRelationship(relationship.id, toEntity.id);
        if (fromCardinality === null || toCardinality === null) {
          return {
            passed: false,
            error: `Die Beziehung „${relationshipSpec.name}“ muss „${relationshipSpec.from}“ und „${relationshipSpec.to}“ verbinden.`,
          };
        }

        const [expectedFrom, expectedTo] = String(relationshipSpec.cardinality || '')
          .split(':')
          .map((value) => normalizeCardinality(value));

        if (relationshipSpec.cardinality && (fromCardinality !== expectedFrom || toCardinality !== expectedTo)) {
          return {
            passed: false,
            error:
              relationshipSpec.hinweis ||
              `Die Beziehung „${relationshipSpec.name}“ braucht die Kardinalität ` +
                `${relationshipSpec.cardinality} zwischen „${relationshipSpec.from}“ und „${relationshipSpec.to}“.`,
          };
        }
      }

      const relationshipAttributes = relationshipSpec.attributes || [];
      for (const attributeName of relationshipAttributes) {
        if (!getAttributeByName(relationship.id, attributeName)) {
          return {
            passed: false,
            error: `Bei der Beziehung „${relationshipSpec.name}“ fehlt das Attribut „${attributeName}“.`,
          };
        }
      }
    }

    return { passed: true };
  }

  function validateExpertAufgabe(spec) {
    if (!spec) {
      return { passed: false, error: 'Für diese Aufgabe ist keine Musterlösung hinterlegt.' };
    }

    for (const entityName of spec.entities || []) {
      const entityCheck = validateEntityRequirements(entityName, spec);
      if (!entityCheck.passed) return entityCheck;
    }

    return validateRelationshipRequirements(spec);
  }

  /**
   * Liefert den Live-Checklistenstatus für die aktuelle Szenario-Aufgabe.
   * Gibt ein Objekt mit vier Kategorien zurück, jeweils { total, done, items[] }.
   */
  function getExpertChecklistStatus(spec) {
    if (!spec) return null;

    const entities = { total: 0, done: 0, items: [] };
    for (const name of spec.entities || []) {
      entities.total++;
      const found = !!getEntityByName(name);
      if (found) entities.done++;
      entities.items.push({ label: name, ok: found });
    }

    const relationships = { total: 0, done: 0, items: [] };
    for (const rel of spec.relationships || []) {
      relationships.total++;
      const relNode = getRelationshipByName(rel.name, rel);
      if (!relNode) {
        relationships.items.push({ label: rel.name, ok: false });
        continue;
      }
      const fromEntity = getEntityByName(rel.from);
      const toEntity = getEntityByName(rel.to);
      if (!fromEntity || !toEntity) {
        relationships.items.push({ label: rel.name, ok: false });
        continue;
      }
      const [expectedFrom, expectedTo] = String(rel.cardinality || '')
        .split(':')
        .map((v) => normalizeCardinality(v));
      let ok;
      if (normalizeName(rel.from) === normalizeName(rel.to)) {
        const edges =
          S().edges?.filter(
            (e) =>
              e.edgeType === 'relationship' &&
              ((e.fromId === relNode.id && e.toId === fromEntity.id) ||
                (e.fromId === fromEntity.id && e.toId === relNode.id)),
          ) || [];
        if (edges.length < 2) {
          ok = false;
        } else {
          const cards = edges.map((e) => {
            if (e.fromId === relNode.id) return normalizeCardinality(e.chenTo);
            return normalizeCardinality(e.chenFrom);
          });
          const sortedCards = [...cards].sort();
          const sortedExpected = [expectedFrom, expectedTo].sort();
          ok = !rel.cardinality || (sortedCards[0] === sortedExpected[0] && sortedCards[1] === sortedExpected[1]);
        }
      } else {
        const fromCard = getCardinalityForEntityOnRelationship(relNode.id, fromEntity.id);
        const toCard = getCardinalityForEntityOnRelationship(relNode.id, toEntity.id);
        ok =
          fromCard !== null &&
          toCard !== null &&
          (!rel.cardinality || (fromCard === expectedFrom && toCard === expectedTo));
      }
      if (ok) relationships.done++;
      relationships.items.push({ label: rel.cardinality ? `${rel.name} (${rel.cardinality})` : rel.name, ok });
    }

    const attributes = { total: 0, done: 0, items: [] };
    // Entity attributes
    for (const entityName of spec.entities || []) {
      const entity = getEntityByName(entityName);
      for (const attrName of spec.attributes?.[entityName] || []) {
        attributes.total++;
        const found = entity ? !!getAttributeByName(entity.id, attrName) : false;
        if (found) attributes.done++;
        attributes.items.push({ label: `${entityName}.${attrName}`, ok: found });
      }
    }
    // Relationship attributes
    for (const rel of spec.relationships || []) {
      for (const attrName of rel.attributes || []) {
        attributes.total++;
        const relNode = getRelationshipByName(rel.name, rel);
        const found = relNode ? !!getAttributeByName(relNode.id, attrName) : false;
        if (found) attributes.done++;
        attributes.items.push({ label: `${rel.name}.${attrName}`, ok: found });
      }
    }

    const primaryKeys = { total: 0, done: 0, items: [] };
    for (const entityName of spec.entities || []) {
      const entity = getEntityByName(entityName);
      for (const pkName of toArray(spec.primaryKeys?.[entityName])) {
        primaryKeys.total++;
        const attr = entity ? getAttributeByName(entity.id, pkName) : null;
        const ok = attr ? !!attr.isPrimaryKey : false;
        if (ok) primaryKeys.done++;
        primaryKeys.items.push({ label: `${entityName}.${pkName}`, ok });
      }
    }

    return { entities, relationships, attributes, primaryKeys };
  }

  /**
   * Liefert eine geordnete Liste von Hinweisen für die aktuelle Szenario-Aufgabe.
   * Reihenfolge: fehlende Entitäten → fehlende Beziehungen/Kardinalitäten →
   * fehlende Attribute → fehlende Primärschlüssel.
   */
  function getExpertHints(spec) {
    if (!spec) return [];
    const hints = [];

    for (const name of spec.entities || []) {
      if (!getEntityByName(name)) {
        hints.push(`Die Entitätsklasse „${name}“ fehlt.`);
      }
    }

    for (const rel of spec.relationships || []) {
      const relNode = getRelationshipByName(rel.name, rel);
      if (!relNode) {
        hints.push(`Die Beziehung „${rel.name}“ fehlt.`);
        continue;
      }
      const fromEntity = getEntityByName(rel.from);
      const toEntity = getEntityByName(rel.to);
      if (!fromEntity || !toEntity) {
        hints.push(`Die Beziehung „${rel.name}“ muss „${rel.from}“ und „${rel.to}“ verbinden.`);
        continue;
      }
      const [expectedFrom, expectedTo] = String(rel.cardinality || '')
        .split(':')
        .map((v) => normalizeCardinality(v));
      if (normalizeName(rel.from) === normalizeName(rel.to)) {
        const edges =
          S().edges?.filter(
            (e) =>
              e.edgeType === 'relationship' &&
              ((e.fromId === relNode.id && e.toId === fromEntity.id) ||
                (e.fromId === fromEntity.id && e.toId === relNode.id)),
          ) || [];
        if (edges.length < 2) {
          hints.push(`Die Selbstbeziehung „${rel.name}“ muss auf beiden Seiten mit „${rel.from}“ verbunden sein.`);
        } else {
          const cards = edges.map((e) => {
            if (e.fromId === relNode.id) return normalizeCardinality(e.chenTo);
            return normalizeCardinality(e.chenFrom);
          });
          const sortedCards = [...cards].sort();
          const sortedExpected = [expectedFrom, expectedTo].sort();
          if (rel.cardinality && (sortedCards[0] !== sortedExpected[0] || sortedCards[1] !== sortedExpected[1])) {
            hints.push(
              `Die Kardinalität bei „${rel.name}“ muss ${rel.cardinality} sein (Selbstbeziehung auf „${rel.from}“).`,
            );
          }
        }
      } else {
        const fromCard = getCardinalityForEntityOnRelationship(relNode.id, fromEntity.id);
        const toCard = getCardinalityForEntityOnRelationship(relNode.id, toEntity.id);
        if (fromCard === null || toCard === null) {
          hints.push(`Die Beziehung „${rel.name}“ muss „${rel.from}“ und „${rel.to}“ verbinden.`);
        } else if (rel.cardinality && (fromCard !== expectedFrom || toCard !== expectedTo)) {
          hints.push(
            `Die Kardinalität bei „${rel.name}“ muss ${rel.cardinality} sein (zwischen „${rel.from}“ und „${rel.to}“).`,
          );
        }
      }
      for (const attrName of rel.attributes || []) {
        if (!getAttributeByName(relNode.id, attrName)) {
          hints.push(`Bei der Beziehung „${rel.name}“ fehlt das Attribut „${attrName}“.`);
        }
      }
    }

    for (const entityName of spec.entities || []) {
      const entity = getEntityByName(entityName);
      if (!entity) continue;
      for (const attrName of spec.attributes?.[entityName] || []) {
        if (!getAttributeByName(entity.id, attrName)) {
          hints.push(`Bei „${entityName}“ fehlt das Attribut „${attrName}“.`);
        }
      }
    }

    for (const entityName of spec.entities || []) {
      const entity = getEntityByName(entityName);
      if (!entity) continue;
      for (const pkName of toArray(spec.primaryKeys?.[entityName])) {
        const attr = getAttributeByName(entity.id, pkName);
        if (!attr) {
          hints.push(`Bei „${entityName}“ fehlt der Primärschlüssel „${pkName}“.`);
        } else if (!attr.isPrimaryKey) {
          hints.push(`„${pkName}“ muss bei „${entityName}“ als Primärschlüssel markiert sein.`);
        }
      }
    }

    return hints;
  }

  // ---- Hilfsfunktionen für Relationenmodell-Validatoren ----

  function getStudentRelByName(name) {
    const rels = window.RelModel?.getStudentRelations?.() || [];
    const n = normalizeName(name);
    return rels.find((r) => normalizeName(r.name) === n) || null;
  }

  function getStudentRelAttr(relName, attrName) {
    const n = normalizeName(attrName);
    return getStudentRelByName(relName)?.attrs.find((a) => normalizeName(a.name) === n) || null;
  }

  function studentRelHasAttr(relName, attrName) {
    return !!getStudentRelAttr(relName, attrName);
  }

  function studentRelAttrIsPk(relName, attrName) {
    return !!getStudentRelAttr(relName, attrName)?.isPk;
  }

  function studentRelAttrIsFk(relName, attrName) {
    return !!getStudentRelAttr(relName, attrName)?.isFk;
  }

  // Fremdschlüssel (kein PS) in relName, die auf baseName zeigen – auch umbenannt („SchülerNr-Sprecher“)
  // oder nach der Zieltabelle benannt („Klasse“).
  function getStudentFks(relName, baseName) {
    const R = window.RelModel;
    const solRel = (R.getCheckSolution?.() || []).find((r) => normalizeName(r.name) === normalizeName(relName));
    const solFks = (solRel?.attrs || []).filter(
      (a) => a.isFk && !a.isPk && normalizeName(a._fkBaseName || a.name) === normalizeName(baseName),
    );
    return (getStudentRelByName(relName)?.attrs || []).filter(
      (a) =>
        a.isFk && !a.isPk && (R.fkRawNameMatches(a.name, baseName) || solFks.some((sf) => R.fkMatches(a.name, sf))),
    );
  }

  // Relation mit Attributen und Primärschlüsseln prüfen; liefert den ersten Fehler als Text.
  function checkStudentRelation(relName, attrs, pks = []) {
    if (!getStudentRelByName(relName)) return `Die Relation „${relName}“ fehlt.`;
    for (const attr of attrs) {
      if (!studentRelHasAttr(relName, attr)) return `Bei der Relation „${relName}“ fehlt das Attribut „${attr}“.`;
    }
    for (const attr of pks) {
      if (!studentRelAttrIsPk(relName, attr))
        return `„${attr}“ muss bei „${relName}“ als Primärschlüssel markiert sein.`;
    }
    return '';
  }

  /**
   * Prüft NOT NULL und UNIQUE der Fremdschlüssel nach den Regeln einer Aufgabe (Stufe Fortgeschritten).
   * Regel: { relation, spalte (Primärschlüssel, auf den der FS zeigt), notNull?, unique?, optional?, grund }
   * optional: Spalte darf fehlen (zweite Richtung einer 1:1-Beziehung).
   */
  function checkSqlRegeln(regeln) {
    for (const regel of regeln || []) {
      const rel = getStudentRelByName(regel.relation);
      const cols = getStudentFks(regel.relation, regel.spalte);
      if (!cols.length) {
        if (regel.optional) continue;
        return { passed: false, error: `In „${regel.relation}“ fehlt der Fremdschlüssel „${regel.spalte}“.` };
      }
      for (const col of cols) {
        const ort = `Unter „SQL erzeugen“: „${col.name}“ in „${rel.name}“`;
        if (regel.notNull === true && !col.notNull)
          return { passed: false, error: `${ort} braucht NOT NULL. ${regel.grund}` };
        if (regel.notNull === false && col.notNull)
          return { passed: false, error: `${ort} darf leer bleiben – entferne NOT NULL. ${regel.grund}` };
        if (regel.unique === true && !col.unique)
          return { passed: false, error: `${ort} braucht UNIQUE. ${regel.grund}` };
      }
    }
    return { passed: true };
  }

  /**
   * Checkliste für Relationenmodell-Szenarien: vergleicht die Relationen des Schülers
   * mit der Musterlösung – mit denselben Namensregeln wie die Prüfung in relmodel.js.
   */
  function getRelmodelChecklistStatus() {
    const R = window.RelModel;
    const solution = R?.getCheckSolution?.() || [];
    const studentRels = R?.getStudentRelations?.() || [];
    if (solution.length === 0) return null;

    const relations = { total: 0, done: 0, items: [] };
    const attributes = { total: 0, done: 0, items: [] };
    const primaryKeys = { total: 0, done: 0, items: [] };
    const foreignKeys = { total: 0, done: 0, items: [] };
    const tick = (cat, label, ok) => {
      cat.total++;
      if (ok) cat.done++;
      cat.items.push({ label, ok });
    };

    for (const solRel of solution) {
      // Fehlt die Relation, zählen ihre Attribute und Schlüssel als offen
      const studRel = studentRels.find((r) => normalizeName(r.name) === normalizeName(solRel.name)) || {
        attrs: [],
      };
      tick(
        relations,
        solRel.name,
        studentRels.some((r) => normalizeName(r.name) === normalizeName(solRel.name)),
      );

      const matches = (studAttr, solAttr) => {
        if (normalizeName(studAttr.name) === normalizeName(solAttr.name)) return true;
        if (!solAttr.isFk) return false;
        return solRel._hasSelfRefFks
          ? R.selfRefFkRawNameMatchesBase(studAttr.name, solRel._selfRefBasePk)
          : R.fkMatches(studAttr.name, solAttr);
      };
      // Jedem Lösungsattribut genau ein Schülerattribut zuordnen
      const assign = (cat, solAttrs, studAttrs) => {
        const used = new Set();
        for (const solAttr of solAttrs) {
          const match = studAttrs.find((a) => !used.has(a) && matches(a, solAttr));
          if (match) used.add(match);
          tick(cat, `${solRel.name}.${solAttr.name}`, !!match);
        }
      };

      for (const attr of solRel.attrs.filter((a) => !a.isFk)) {
        tick(
          attributes,
          `${solRel.name}.${attr.name}`,
          studRel.attrs.some((a) => normalizeName(a.name) === normalizeName(attr.name)),
        );
      }
      assign(
        primaryKeys,
        solRel.attrs.filter((a) => a.isPk),
        studRel.attrs.filter((a) => a.isPk),
      );
      assign(
        foreignKeys,
        solRel.attrs.filter((a) => a.isFk),
        studRel.attrs.filter((a) => a.isFk),
      );
    }

    return { relations, attributes, primaryKeys, foreignKeys };
  }

  // Nummern ergeben sich aus der Reihenfolge.
  function nummeriert(aufgaben) {
    return aufgaben.map((aufgabe, index) => ({ ...aufgabe, number: index + 1 }));
  }

  // ---- Aufgaben-Datenbank: ERM-GRUNDLAGEN (Stufe Einstieg) ----
  const ermGrundlagenAufgaben = nummeriert([
    {
      title: 'Erste Entitätsklasse',
      theory: `<p class="aufgabe-begriff">Neuer Begriff: Entitätsklasse · Symbol: Rechteck</p>
        <p><strong>Entitätsklasse:</strong> Ein Rechteck im ER-Modell, das eine Gruppe von ähnlichen Objekten der realen Welt darstellt. Beispiel: Schüler, Auto, Person.</p>
        <p class="aufgabe-begriff">Neuer Begriff: Entität · Symbol: –</p>
        <p>Ein einzelnes Objekt, z. B. die Schülerin Lena, heißt <strong>Entität</strong>.</p>`,
      objective: `<p>Erstelle eine Entitätsklasse mit dem Namen <strong>„Schüler“</strong>.</p>`,
      validator: function () {
        const schueler = getEntityByName('Schüler');
        if (!schueler) return { passed: false, error: 'Erstelle eine Entitätsklasse mit dem Namen „Schüler“.' };
        return { passed: true };
      },
    },
    {
      title: 'Attribute hinzufügen',
      theory: `<p class="aufgabe-begriff">Neuer Begriff: Attribut · Symbol: Ellipse</p>
        <p><strong>Attribut:</strong> Eine Eigenschaft einer Entitätsklasse. Beispiele: Name, E-Mail, Geburtsdatum.</p>`,
      objective: `<p>Füge zur Entitätsklasse <strong>„Schüler“</strong> zwei Attribute hinzu:</p>
        <ol>
          <li>Attribut <strong>„Vorname“</strong></li>
          <li>Attribut <strong>„Nachname“</strong></li>
        </ol>
        <p><strong>So geht's:</strong> „Schüler“ anklicken, dann links auf <strong>„Attribut“</strong>.</p>
        <p><strong>Hinweis:</strong> Markiere sie NICHT als Primärschlüssel.</p>`,
      validator: function () {
        const schueler = getEntityByName('Schüler');
        if (!schueler) return { passed: false, error: 'Die Entitätsklasse „Schüler“ existiert nicht.' };
        if (!getAttributeByName(schueler.id, 'Vorname'))
          return { passed: false, error: 'Das Attribut „Vorname“ fehlt.' };
        if (!getAttributeByName(schueler.id, 'Nachname'))
          return { passed: false, error: 'Das Attribut „Nachname“ fehlt.' };
        return { passed: true };
      },
    },
    {
      title: 'Primärschlüssel setzen',
      theory: `<p class="aufgabe-begriff">Neuer Begriff: Primärschlüssel · Symbol: unterstrichenes Attribut</p>
        <p><strong>Primärschlüssel:</strong> Ein oder mehrere Attribute, die jede Entität eindeutig kennzeichnen. Keine zwei Schüler haben die gleiche SchülerNr. Der Primärschlüssel wird unterstrichen dargestellt.</p>`,
      objective: `<ol>
          <li>Erstelle ein Attribut <strong>„SchülerNr“</strong> bei der Entitätsklasse <strong>„Schüler“</strong></li>
          <li>Markiere „SchülerNr“ als <strong>Primärschlüssel</strong></li>
        </ol>`,
      validator: function () {
        const schueler = getEntityByName('Schüler');
        if (!schueler) return { passed: false, error: 'Die Entitätsklasse „Schüler“ existiert nicht.' };
        const attr = getAttributeByName(schueler.id, 'SchülerNr');
        if (!attr) return { passed: false, error: 'Das Attribut „SchülerNr“ fehlt.' };
        if (!attr.isPrimaryKey) return { passed: false, error: '„SchülerNr“ muss als Primärschlüssel markiert sein.' };
        return { passed: true };
      },
    },
    {
      title: 'Zweite Entitätsklasse',
      theory: `<p><strong>Mehrere Entitätsklassen:</strong> Realistische Systeme brauchen oft mehrere Entitätsklassen, die miteinander in Beziehung stehen.</p>`,
      objective: `<p>Erstelle eine neue Entitätsklasse mit dem Namen <strong>„Klasse“</strong>.</p>`,
      validator: function () {
        if (!getEntityByName('Klasse')) return { passed: false, error: 'Die Entitätsklasse „Klasse“ existiert nicht.' };
        return { passed: true };
      },
    },
    {
      title: 'Attribute für Klasse',
      theory: `<p><strong>Regel:</strong> Jede Entitätsklasse braucht einen Primärschlüssel. Für „Klasse“ verwenden wir die Bezeichnung als eindeutiges Merkmal (z. B. 9a, 10c).</p>
        <p><strong>Ausblick „Verbundschlüssel“:</strong> Manchmal werden mehrere Attribute kombiniert, um eine Entität eindeutig zu kennzeichnen. Man könnte die Bezeichnung aufspalten in Klassenstufe (z. B. 9, 10) und Parallelklasse (z. B. a, b, c). Diese beiden Attribute zusammen bilden dann den eindeutigen Schlüssel einer Klasse.</p>`,
      objective: `<ol>
          <li>Erstelle zwei Attribute bei der Entitätsklasse <strong>„Klasse“</strong>:
            <ul>
              <li><strong>„Bezeichnung“</strong></li>
              <li><strong>„Klassenraum“</strong></li>
            </ul>
          </li>
          <li>Markiere nur <strong>„Bezeichnung“</strong> als Primärschlüssel</li>
        </ol>`,
      validator: function () {
        const klasse = getEntityByName('Klasse');
        if (!klasse) return { passed: false, error: 'Die Entitätsklasse „Klasse“ existiert nicht.' };
        const bezeichnung = getAttributeByName(klasse.id, 'Bezeichnung');
        const klassenraum = getAttributeByName(klasse.id, 'Klassenraum');
        if (!bezeichnung) return { passed: false, error: 'Das Attribut „Bezeichnung“ fehlt.' };
        if (!klassenraum) return { passed: false, error: 'Das Attribut „Klassenraum“ fehlt.' };
        if (!bezeichnung.isPrimaryKey)
          return { passed: false, error: '„Bezeichnung“ muss als Primärschlüssel markiert sein.' };
        if (klassenraum.isPrimaryKey)
          return { passed: false, error: '„Klassenraum“ darf nicht als Primärschlüssel markiert sein.' };
        return { passed: true };
      },
    },
    {
      title: 'Beziehung erstellen',
      theory: `<p class="aufgabe-begriff">Neuer Begriff: Beziehung · Symbol: Raute</p>
        <p><strong>Beziehung (Relationship):</strong> Eine Raute, die zwei Entitätsklassen verbindet. Mit ihnen zusammen ergibt ihr Name einen Satz: „Schüler geht in Klasse“. In welche Richtung der Satz gemeint ist, ergibt sich aus dem Sinn – nicht aus links und rechts, denn nach dem Verschieben oder dem Auto-Layout kann „Klasse“ auch links stehen.</p>`,
      objective: `<p>Erstelle eine Beziehung zwischen <strong>„Schüler“</strong> und <strong>„Klasse“</strong>:</p>
        <ol>
          <li>Klicke links auf <strong>„Beziehung“</strong>: Der Dialog „Beziehung bearbeiten“ öffnet sich.</li>
          <li>Name der Beziehung: <strong>„geht in“</strong></li>
          <li>Wähle die Entitätsklassen <strong>„Schüler“</strong> und <strong>„Klasse“</strong> und klicke auf <strong>„Speichern“</strong>.</li>
        </ol>`,
      validator: function () {
        return validateRelationshipRequirements({
          relationships: [{ name: 'geht in', from: 'Schüler', to: 'Klasse' }],
        });
      },
    },
    {
      title: 'Dritte Entitätsklasse',
      theory: `<p><strong>Erweitern des Modells:</strong> Ein ER-Modell kann mehrere Entitätsklassen enthalten. Jede Entitätsklasse braucht einen Primärschlüssel. Für Lehrer verwenden wir ein kurzes Kürzel als Kennzeichnung (z. B. MUS, MAN, BER).</p>`,
      objective: `<ol>
          <li>Erstelle eine neue Entitätsklasse mit dem Namen <strong>„Lehrer“</strong></li>
          <li>Füge drei Attribute hinzu:
            <ul>
              <li><strong>„Lehrer-Kürzel“</strong></li>
              <li><strong>„Vorname“</strong></li>
              <li><strong>„Nachname“</strong></li>
            </ul>
          </li>
          <li>Markiere nur <strong>„Lehrer-Kürzel“</strong> als Primärschlüssel</li>
        </ol>`,
      validator: function () {
        if (countEntities() !== 3) return { passed: false, error: 'Du brauchst jetzt genau 3 Entitätsklassen.' };
        const lehrer = getEntityByName('Lehrer');
        if (!lehrer) return { passed: false, error: 'Die Entitätsklasse „Lehrer“ existiert nicht.' };
        const attr = getAttributeByName(lehrer.id, 'Lehrer-Kürzel');
        if (!attr) return { passed: false, error: 'Das Attribut „Lehrer-Kürzel“ fehlt.' };
        if (!getAttributeByName(lehrer.id, 'Vorname')) return { passed: false, error: 'Das Attribut „Vorname“ fehlt.' };
        if (!getAttributeByName(lehrer.id, 'Nachname'))
          return { passed: false, error: 'Das Attribut „Nachname“ fehlt.' };
        if (!attr.isPrimaryKey)
          return { passed: false, error: '„Lehrer-Kürzel“ muss als Primärschlüssel markiert sein.' };
        return { passed: true };
      },
    },
    {
      title: 'Zweite Beziehung',
      theory: `<p><strong>Mehrere Beziehungen:</strong> Eine Entitätsklasse kann mit mehreren anderen Entitätsklassen in Beziehung stehen. „Klasse“ ist jetzt mit „Schüler“ und mit „Lehrer“ verbunden.</p>`,
      objective: `<p>Erstelle eine Beziehung zwischen <strong>„Lehrer“</strong> und <strong>„Klasse“</strong>:</p>
        <ol>
          <li>Name der Beziehung: <strong>„unterrichtet“</strong></li>
          <li>Entitätsklassen: <strong>„Lehrer“</strong> und <strong>„Klasse“</strong></li>
        </ol>`,
      validator: function () {
        return validateRelationshipRequirements({
          relationships: [{ name: 'unterrichtet', from: 'Lehrer', to: 'Klasse' }],
        });
      },
    },
    {
      title: 'Beziehungsattribute',
      theory: `<p class="aufgabe-begriff">Neuer Begriff: Beziehungsattribut · Symbol: Ellipse an der Raute</p>
        <p><strong>Beziehungsattribut:</strong> Auch Beziehungen können Attribute haben! Ein Beispiel: Die Beziehung „unterrichtet“ kann das Attribut „Fach“ besitzen, um das in dieser Klasse unterrichtete Fach festzuhalten.</p>`,
      objective: `<ol>
          <li>Füge zur Beziehung <strong>„unterrichtet“</strong> ein Attribut mit dem Namen <strong>„Fach“</strong> hinzu</li>
          <li>Raute „unterrichtet“ anklicken, dann links auf <strong>„Attribut“</strong></li>
        </ol>`,
      validator: function () {
        const rel = getRelationshipByName('unterrichtet');
        if (!rel) return { passed: false, error: 'Die Beziehung „unterrichtet“ existiert nicht.' };
        if (!getAttributeByName(rel.id, 'Fach'))
          return { passed: false, error: 'Das Attribut „Fach“ fehlt bei der Beziehung „unterrichtet“.' };
        return { passed: true };
      },
    },
    {
      title: 'Weitere Beziehung ergänzen',
      theory: `<p><strong>Zusätzliche Beziehung:</strong> Zwischen denselben Entitätsklassen kann es mehrere Beziehungen geben, wenn sie verschiedene Bedeutungen haben.</p>`,
      objective: `<ol>
          <li>Erstelle eine <strong>NEUE</strong> Beziehung zwischen <strong>„Schüler“</strong> und <strong>„Klasse“</strong></li>
          <li>Name: <strong>„ist Klassensprecher“</strong></li>
        </ol>
        <p><strong>Hinweis:</strong> Das ist eine NEUE Beziehung, zusätzlich zur bisherigen Beziehung.</p>`,
      validator: function () {
        return validateRelationshipRequirements({
          relationships: [{ name: 'ist Klassensprecher', from: 'Schüler', to: 'Klasse' }],
        });
      },
    },
    {
      title: '🎉 Abschluss',
      abschluss: true,
      theory: `<p><strong>Glückwunsch!</strong> Du hast alle Grundlagen-Aufgaben abgeschlossen!</p>
        <p><strong>Du hast gelernt:</strong></p>
        <ul>
          <li>Entitätsklassen modellieren</li>
          <li>Attribute hinzufügen</li>
          <li>Primärschlüssel setzen</li>
          <li>Beziehungen erstellen</li>
          <li>Beziehungsattribute ergänzen</li>
          <li>Verbundschlüssel (Ausblick)</li>
        </ul>`,
      objective: `<p>🏆 <strong>Fast geschafft – speichere dein Ergebnis!</strong></p>
        <ol>
          <li>Gib deinem ER-Modell in der Titelleiste einen <strong>Namen</strong> (z. B. „Schule“)</li>
          <li>Klicke auf <strong>„JSON-Export“</strong> in der Titelleiste oben rechts und speichere die Datei</li>
          <li>Klicke auf <strong>„PNG-Export“</strong> und speichere das Bild</li>
        </ol>
        <p>Danach geht es im Menü mit dem Lernpfad „ERM-Übung“ weiter: Bearbeite dort Szenario 1 „Hotel-Verwaltung“ – auch noch ohne Kardinalitäten.</p>`,
      validator: function () {
        // Abschluss-Screen ist immer erfolgreich
        return { passed: true };
      },
    },
  ]);

  // ---- Aufgaben-Datenbank: ERM-KARDINALITÄTEN (Stufe Einstieg) ----
  // Startet mit dem Schul-ERM aus den Grundlagen; an den Linien steht noch „?“.
  const ermKardinalitaetenAufgaben = nummeriert([
    {
      title: 'Kardinalität und Leserichtung',
      theory: `<p class="aufgabe-begriff">Neuer Begriff: Kardinalität · Symbol: 1, n oder m an der Linie</p>
        <p><strong>Kardinalität:</strong> Sie gibt an, wie viele Entitäten auf jeder Seite einer Beziehung beteiligt sein können:</p>
        <ul>
          <li><strong>1:1</strong> (eins zu eins): Ein Schüler hat einen Schülerausweis, ein Schülerausweis gehört einem Schüler.</li>
          <li><strong>1:n</strong> (eins zu vielen): Eine Klasse hat viele Schüler, ein Schüler gehört zu einer Klasse.</li>
          <li><strong>n:m</strong> (viele zu vielen): Ein Lehrer unterrichtet viele Schüler, ein Schüler hat Unterricht bei vielen Lehrern.</li>
        </ul>
        <p>Die Zahl steht an der Linie zu der Entitätsklasse, deren Anzahl sie angibt: Ein Schüler geht in <em>eine</em> Klasse – an der Linie zu „Klasse“ steht 1. Eine Klasse hat <em>viele</em> Schüler – an der Linie zu „Schüler“ steht n.</p>
        <p>Im Dialog „Beziehung bearbeiten“ gehört die erste Zahl zur linken Auswahl, die zweite zur rechten: Schüler (links), Klasse (rechts) → n:1.</p>`,
      objective: `<p>Das Schul-ERM aus den Grundlagen ist geladen – dein eigenes, wenn du die Grundlagen abgeschlossen hast. An den Linien steht noch <strong>„?“</strong>: Die Kardinalitäten fehlen.</p>
        <ol>
          <li>Rechtsklick (Tablet: lange tippen) auf die Raute <strong>„geht in“</strong> → Beziehung bearbeiten</li>
          <li>Im Dialog „Schüler“ links, „Klasse“ rechts, Kardinalität <strong>n:1</strong> (viele Schüler gehen in eine Klasse)</li>
        </ol>`,
      validator: function () {
        return validateRelationshipRequirements({
          relationships: [
            {
              name: 'geht in',
              from: 'Schüler',
              to: 'Klasse',
              cardinality: 'n:1',
              hinweis: 'Wähle bei „geht in“ die Kardinalität n:1: Viele Schüler gehen in eine Klasse.',
            },
          ],
        });
      },
    },
    {
      title: 'Beide Richtungen prüfen',
      theory: `<p><strong>Beide Richtungen prüfen:</strong> Frage von jeder Seite aus, mit wie vielen Partnern sie verbunden ist. Ein Lehrer unterrichtet viele Klassen — und eine Klasse hat viele Lehrer. Erst wenn beide Richtungen „viele“ ergeben, ist es n:m.</p>
        <p><strong>Hinweis:</strong> Eine n:m-Beziehung wird im Relationenmodell später eine eigene Tabelle (Relation), die Beziehungstabelle.</p>`,
      objective: `<p>Bestimme die Kardinalität von <strong>„unterrichtet“</strong> zwischen „Lehrer“ und „Klasse“. Prüfe beide Richtungen:</p>
        <ul>
          <li>Wie viele Klassen kann ein Lehrer unterrichten?</li>
          <li>Von wie vielen Lehrern wird eine Klasse unterrichtet?</li>
        </ul>`,
      validator: function () {
        return validateRelationshipRequirements({
          relationships: [
            {
              name: 'unterrichtet',
              from: 'Lehrer',
              to: 'Klasse',
              cardinality: 'n:m',
              hinweis:
                'Ein Lehrer unterrichtet viele Klassen, und eine Klasse hat viele Lehrer: auf beiden Seiten „viele“.',
            },
          ],
        });
      },
    },
    {
      title: 'Eins zu eins',
      theory: `<p><strong>1:1-Beziehung:</strong> Auf beiden Seiten ist höchstens eine Entität beteiligt. Auch hier hilft der Blick in beide Richtungen.</p>`,
      objective: `<p>Jede Klasse hat genau einen Klassensprecher. Ein Schüler kann höchstens in einer Klasse Klassensprecher sein.</p>
        <p>Bestimme die Kardinalität von <strong>„ist Klassensprecher“</strong>.</p>`,
      validator: function () {
        return validateRelationshipRequirements({
          relationships: [
            {
              name: 'ist Klassensprecher',
              from: 'Schüler',
              to: 'Klasse',
              cardinality: '1:1',
              hinweis:
                'Prüfe beide Richtungen: Wie viele Klassensprecher hat eine Klasse? Für wie viele Klassen kann ein Schüler Sprecher sein?',
            },
          ],
        });
      },
    },
    {
      title: 'Eine Beziehung selbst bestimmen',
      theory: `<p>Zwischen „Lehrer“ und „Klasse“ gibt es jetzt zwei Beziehungen mit verschiedener Bedeutung – und verschiedenen Kardinalitäten.</p>`,
      objective: `<p>Jede Klasse hat genau einen Klassenleiter. An unserer Schule leiten manche Lehrer auch zwei Klassen.</p>
        <ol>
          <li>Klicke links auf <strong>„Beziehung“</strong> und lege <strong>„ist Klassenleiter von“</strong> zwischen „Lehrer“ und „Klasse“ an.</li>
          <li>Die Kardinalität bestimmst du selbst.</li>
        </ol>`,
      validator: function () {
        return validateRelationshipRequirements({
          relationships: [
            {
              name: 'ist Klassenleiter von',
              from: 'Lehrer',
              to: 'Klasse',
              cardinality: '1:n',
              hinweis:
                'Ein Lehrer kann Klassenleiter mehrerer Klassen sein, jede Klasse hat genau einen: Lehrer 1, Klasse n.',
            },
          ],
        });
      },
    },
    {
      title: '🎉 Abschluss',
      abschluss: true,
      theory: `<p><strong>Glückwunsch!</strong> Dein Schul-ERM ist jetzt vollständig.</p>
        <p><strong>Du hast gelernt:</strong></p>
        <ul>
          <li>Kardinalitäten 1:1, 1:n und n:m festlegen</li>
          <li>die Zahl an der richtigen Linie ablesen</li>
          <li>beide Richtungen prüfen</li>
        </ul>`,
      objective: `<p>🏆 <strong>Fast geschafft – speichere dein Ergebnis!</strong></p>
        <ol>
          <li>Speichere dein ER-Modell mit <strong>„JSON-Export“</strong> und <strong>„PNG-Export“</strong></li>
        </ol>
        <p>Danach geht es im Lernpfad „ERM-Übung“ ab Szenario 2 weiter: erst mit vorgegebenen Kardinalitäten, dann bestimmst du sie selbst aus dem Text.</p>`,
      validator: function () {
        return { passed: true };
      },
    },
  ]);

  // ---- Aufgaben-Datenbank: ERM-AUFFRISCHUNG (Stufe Fortgeschritten) ----
  // Schul-ERM in großen Schritten; endet mit dem Modell aus files/schule-auffrischung.json.
  const ermAuffrischungAufgaben = nummeriert([
    {
      title: 'Entitätsklassen mit Schlüsseln',
      theory: `<p><strong>Entitätsklasse</strong> (Rechteck): eine Gruppe gleichartiger Objekte, z. B. alle Schüler. Ein einzelnes Objekt, z. B. die Schülerin Lena, ist eine <strong>Entität</strong>.</p>
        <p><strong>Attribut</strong> (Ellipse): eine Eigenschaft. Der <strong>Primärschlüssel</strong> (unterstrichen) kennzeichnet jede Entität eindeutig – jede Entitätsklasse braucht einen.</p>`,
      objective: `<p>Modelliere die Schule mit drei Entitätsklassen und markiere jeweils den Primärschlüssel (unterstrichen):</p>
        <ul>
          <li><strong>„Schüler“</strong>: „<u>SchülerNr</u>“, „Vorname“, „Nachname“</li>
          <li><strong>„Klasse“</strong>: „<u>Bezeichnung</u>“, „Klassenraum“</li>
          <li><strong>„Lehrer“</strong>: „<u>Lehrer-Kürzel</u>“, „Vorname“, „Nachname“</li>
        </ul>`,
      validator: function () {
        return validateExpertAufgabe({
          entities: ['Schüler', 'Klasse', 'Lehrer'],
          attributes: {
            Schüler: ['SchülerNr', 'Vorname', 'Nachname'],
            Klasse: ['Bezeichnung', 'Klassenraum'],
            Lehrer: ['Lehrer-Kürzel', 'Vorname', 'Nachname'],
          },
          primaryKeys: { Schüler: 'SchülerNr', Klasse: 'Bezeichnung', Lehrer: 'Lehrer-Kürzel' },
        });
      },
    },
    {
      title: 'Beziehungen mit Kardinalitäten',
      theory: `<p><strong>Beziehung</strong> (Raute): verbindet Entitätsklassen. Die <strong>Kardinalität</strong> sagt, wie viele Entitäten jeder Seite beteiligt sind: 1:1, 1:n oder n:m. Die Zahl steht an der Linie zu der Entitätsklasse, deren Anzahl sie angibt.</p>
        <p>Prüfe immer beide Richtungen: Ein Lehrer unterrichtet viele Klassen — und eine Klasse hat viele Lehrer. Also n:m.</p>`,
      objective: `<p>Verbinde die Entitätsklassen durch zwei Beziehungen:</p>
        <ol>
          <li><strong>„geht in“</strong> zwischen „Schüler“ und „Klasse“: Schüler <strong>n : 1</strong> Klasse</li>
          <li><strong>„unterrichtet“</strong> zwischen „Lehrer“ und „Klasse“: Lehrer <strong>n : m</strong> Klasse</li>
        </ol>`,
      validator: function () {
        return validateRelationshipRequirements({
          relationships: [
            { name: 'geht in', from: 'Schüler', to: 'Klasse', cardinality: 'n:1' },
            { name: 'unterrichtet', from: 'Lehrer', to: 'Klasse', cardinality: 'n:m' },
          ],
        });
      },
    },
    {
      title: 'Beziehungsattribut',
      theory: `<p><strong>Beziehungsattribut</strong> (Ellipse an der Raute): eine Eigenschaft, die erst durch die Beziehung entsteht. Das Fach gehört weder allein zum Lehrer noch allein zur Klasse, sondern zum Paar aus beiden.</p>`,
      objective: `<p>Füge der Beziehung <strong>„unterrichtet“</strong> das Attribut <strong>„Fach“</strong> hinzu (Rechtsklick oder lange tippen auf die Raute → Attribut hinzufügen).</p>`,
      validator: function () {
        return validateRelationshipRequirements({
          relationships: [
            { name: 'unterrichtet', from: 'Lehrer', to: 'Klasse', cardinality: 'n:m', attributes: ['Fach'] },
          ],
        });
      },
    },
    {
      title: 'Zwei Beziehungen zwischen denselben Klassen',
      theory: `<p>Zwischen denselben Entitätsklassen kann es mehrere Beziehungen geben, wenn sie Verschiedenes bedeuten: „geht in“ und „ist Klassensprecher“ verbinden beide „Schüler“ und „Klasse“.</p>`,
      objective: `<p>Jede Klasse wählt einen Klassensprecher: Jede Klasse hat genau einen Klassensprecher, und ein Schüler kann höchstens in einer Klasse Klassensprecher sein.</p>
        <p>Erstelle dafür eine zweite Beziehung <strong>„ist Klassensprecher“</strong> zwischen „Schüler“ und „Klasse“. Die Kardinalität bestimmst du selbst.</p>`,
      validator: function () {
        return validateRelationshipRequirements({
          relationships: [
            {
              name: 'ist Klassensprecher',
              from: 'Schüler',
              to: 'Klasse',
              cardinality: '1:1',
              hinweis:
                'Prüfe beide Richtungen: Wie viele Klassensprecher hat eine Klasse? Für wie viele Klassen kann ein Schüler Sprecher sein?',
            },
          ],
        });
      },
    },
    {
      title: 'Selbstbeziehung',
      theory: `<p class="aufgabe-begriff">Neuer Begriff: Selbstbeziehung · Symbol: Raute mit zwei Linien zur selben Entitätsklasse</p>
        <p><strong>Selbstbeziehung</strong> (auch: rekursive Beziehung): Eine Entitätsklasse steht mit sich selbst in Beziehung. Beide Seiten der Raute zeigen auf dieselbe Entitätsklasse.</p>`,
      objective: `<p>Schüler sind miteinander befreundet: Ein Schüler kann mit vielen anderen Schülern befreundet sein.</p>
        <ol>
          <li>Erstelle die Beziehung <strong>„ist befreundet mit“</strong>.</li>
          <li>Verbinde sie auf <strong>beiden Seiten</strong> mit „Schüler“ (im Dialog „Beziehung bearbeiten“ links und rechts „Schüler“ wählen).</li>
          <li>Die Kardinalität bestimmst du selbst.</li>
        </ol>`,
      validator: function () {
        return validateRelationshipRequirements({
          relationships: [
            {
              name: 'ist befreundet mit',
              from: 'Schüler',
              to: 'Schüler',
              cardinality: 'n:m',
              hinweis:
                'Wie viele Freunde kann ein Schüler haben – und wie viele Freunde kann jeder dieser Freunde haben? Prüfe beide Seiten.',
            },
          ],
        });
      },
    },
    {
      title: 'Verbundschlüssel',
      theory: `<p class="aufgabe-begriff">Neuer Begriff: Verbundschlüssel · Symbol: mehrere unterstrichene Attribute</p>
        <p><strong>Verbundschlüssel:</strong> Ein Primärschlüssel aus mehreren Attributen. Erst zusammen kennzeichnen sie jede Entität eindeutig: Stufe 9 gibt es mehrmals, Parallelklasse a auch – aber 9 und a zusammen nur einmal.</p>`,
      objective: `<p>Die Bezeichnung „9a“ besteht eigentlich aus zwei Teilen. Ersetze bei „Klasse“ den Primärschlüssel durch einen Verbundschlüssel:</p>
        <ol>
          <li>Benenne „Bezeichnung“ in <strong>„Klassenstufe“</strong> um (z. B. 9).</li>
          <li>Füge das Attribut <strong>„Parallelklasse“</strong> hinzu (z. B. a).</li>
          <li>Markiere <strong>beide</strong> als Primärschlüssel.</li>
        </ol>`,
      validator: function () {
        const pks = ['Klassenstufe', 'Parallelklasse'];
        const check = validateEntityRequirements('Klasse', {
          attributes: { Klasse: pks },
          primaryKeys: { Klasse: pks },
        });
        if (!check.passed) return check;
        const klasse = getEntityByName('Klasse');
        const extra = getAttributesOf(klasse.id).find(
          (a) => a.isPrimaryKey && !pks.some((pk) => normalizeName(pk) === normalizeName(a.name)),
        );
        if (extra)
          return {
            passed: false,
            error: `„${extra.name}“ gehört nicht mehr zum Schlüssel: Der Verbundschlüssel besteht nur aus „Klassenstufe“ und „Parallelklasse“.`,
          };
        return { passed: true };
      },
    },
    {
      title: '🎉 Abschluss',
      abschluss: true,
      theory: `<p><strong>Glückwunsch!</strong> Du hast das ER-Modell aufgefrischt:</p>
        <ul>
          <li>Entitätsklassen, Attribute und Primärschlüssel</li>
          <li>Beziehungen und Kardinalitäten</li>
          <li>Beziehungsattribute</li>
          <li>mehrere Beziehungen zwischen denselben Entitätsklassen</li>
          <li>Selbstbeziehungen</li>
          <li>Verbundschlüssel</li>
        </ul>`,
      objective: `<p>🏆 <strong>Fast geschafft – speichere dein Ergebnis!</strong></p>
        <ol>
          <li>Gib deinem ER-Modell in der Titelleiste einen <strong>Namen</strong> (z. B. „Schule“)</li>
          <li>Speichere es mit <strong>„JSON-Export“</strong> und <strong>„PNG-Export“</strong></li>
        </ol>
        <p>Danach geht es im Menü mit dem Lernpfad „ERM-Experten“ weiter!</p>`,
      validator: function () {
        return { passed: true };
      },
    },
  ]);

  // ---- Szenarien: je einmal definiert, genutzt im ERM (masterlösung) und im Relationenmodell (jsonFile) ----
  // regeln/sqlRegeln: Muss-/Kann-Beziehungen und UNIQUE für die Relationenmodell-Experten (Fortgeschritten).
  const SZENARIEN = {
    hotel: {
      title: 'Hotel-Verwaltung',
      jsonFile: 'uebung-1-hotel.json',
      // Im ERM ohne Kardinalitäten: wird im Kapitel ER-Modell vor den Kardinalitäten gelöst
      ohneKardinalitaeten: true,
      szenario: `<p>Ein kleines Hotel möchte seine Reservierungen sauber modellieren. Dafür werden Gäste, Zimmer und einzelne Buchungen getrennt verwaltet, damit nachvollziehbar bleibt, wer wann welches Zimmer reserviert hat.</p>
        <p>Lege die Entitätsklasse <strong>„Gast“</strong> mit den Attributen <strong>„Gastnummer“</strong>, <strong>„Vorname“</strong>, <strong>„Nachname“</strong>, <strong>„E-Mail“</strong> und <strong>„Telefon“</strong> an. Verwende <strong>„Gastnummer“</strong> als Primärschlüssel.</p>
        <p>Lege außerdem die Entitätsklasse <strong>„Zimmer“</strong> mit den Attributen <strong>„Zimmernummer“</strong>, <strong>„Kategorie“</strong> und <strong>„PreisProNacht“</strong> an. <strong>„Zimmernummer“</strong> ist der Primärschlüssel. Jede Reservierung wird als Entitätsklasse <strong>„Buchung“</strong> mit den Attributen <strong>„Buchungsnummer“</strong>, <strong>„Anreisedatum“</strong>, <strong>„Abreisedatum“</strong> und <strong>„AnzahlNächte“</strong> modelliert; Primärschlüssel ist <strong>„Buchungsnummer“</strong>.</p>
        <p>Verbinde das Modell über die Beziehungen <strong>„bucht“</strong> zwischen <strong>„Gast“</strong> und <strong>„Buchung“</strong> sowie <strong>„gilt für“</strong> zwischen <strong>„Zimmer“</strong> und <strong>„Buchung“</strong>. Kardinalitäten brauchst du hier noch nicht.</p>`,
      masterlösung: {
        entities: ['Gast', 'Zimmer', 'Buchung'],
        attributes: {
          Gast: ['Gastnummer', 'Vorname', 'Nachname', 'E-Mail', 'Telefon'],
          Zimmer: ['Zimmernummer', 'Kategorie', 'PreisProNacht'],
          Buchung: ['Buchungsnummer', 'Anreisedatum', 'Abreisedatum', 'AnzahlNächte'],
        },
        primaryKeys: { Gast: 'Gastnummer', Zimmer: 'Zimmernummer', Buchung: 'Buchungsnummer' },
        relationships: [
          { name: 'bucht', from: 'Gast', to: 'Buchung' },
          { name: 'gilt für', from: 'Zimmer', to: 'Buchung' },
        ],
      },
    },
    krankenhaus: {
      title: 'Krankenhaus-System',
      jsonFile: 'uebung-2-krankenhaus.json',
      // Übung 2: wichtige Wörter hervorgehoben, Kardinalitäten vorgegeben (ab Übung 3 nur noch im Text)
      szenario: `<p>Ein Krankenhaus soll nachvollziehen können, welche Patienten behandelt werden, welche Ärzte die Behandlungen durchführen und auf welcher Station ein Patient liegt.</p>
        <p>Für die Entitätsklasse <strong>„Patient“</strong> werden <strong>„Versicherungsnummer“</strong>, <strong>„Name“</strong>, <strong>„Geburtsdatum“</strong> und <strong>„Adresse“</strong> gespeichert, für <strong>„Arzt“</strong> <strong>„Personalnummer“</strong>, <strong>„Name“</strong> und <strong>„Fachbereich“</strong>, für <strong>„Station“</strong> <strong>„Stationscode“</strong>, <strong>„Name“</strong> und <strong>„Bettenzahl“</strong>. Jeder medizinische Vorgang wird als <strong>„Behandlung“</strong> mit <strong>„Behandlungsnummer“</strong>, <strong>„Datum“</strong>, <strong>„Diagnose“</strong> und <strong>„Medikation“</strong> dokumentiert. Primärschlüssel sind die Versicherungsnummer, die Personalnummer, der Stationscode und die Behandlungsnummer.</p>
        <p>Lege diese Beziehungen mit ihren Kardinalitäten an:</p>
        <ul>
          <li><strong>„erhält“</strong>: Patient <strong>1 : n</strong> Behandlung – ein Patient erhält viele Behandlungen, jede Behandlung gehört zu genau einem Patienten.</li>
          <li><strong>„führt durch“</strong>: Arzt <strong>1 : n</strong> Behandlung – ein Arzt führt viele Behandlungen durch, jede Behandlung verantwortet genau ein Arzt.</li>
          <li><strong>„arbeitet auf“</strong>: Arzt <strong>n : 1</strong> Station – ein Arzt arbeitet auf genau einer Station, auf einer Station arbeiten viele Ärzte.</li>
          <li><strong>„liegt auf“</strong>: Patient <strong>n : 1</strong> Station – ein Patient liegt auf genau einer Station, eine Station nimmt viele Patienten auf.</li>
        </ul>`,
      masterlösung: {
        entities: ['Patient', 'Arzt', 'Behandlung', 'Station'],
        attributes: {
          Patient: ['Versicherungsnummer', 'Name', 'Geburtsdatum', 'Adresse'],
          Arzt: ['Personalnummer', 'Name', 'Fachbereich'],
          Behandlung: ['Behandlungsnummer', 'Datum', 'Diagnose', 'Medikation'],
          Station: ['Stationscode', 'Name', 'Bettenzahl'],
        },
        primaryKeys: {
          Patient: 'Versicherungsnummer',
          Arzt: 'Personalnummer',
          Behandlung: 'Behandlungsnummer',
          Station: 'Stationscode',
        },
        relationships: [
          { name: 'erhält', from: 'Patient', to: 'Behandlung', cardinality: '1:n' },
          { name: 'führt durch', from: 'Arzt', to: 'Behandlung', cardinality: '1:n' },
          { name: 'arbeitet auf', from: 'Arzt', to: 'Station', cardinality: 'n:1' },
          { name: 'liegt auf', from: 'Patient', to: 'Station', cardinality: 'n:1' },
        ],
      },
    },
    bibliothek: {
      title: 'Bibliothek',
      jsonFile: 'uebung-3-bibliothek.json',
      szenario: `<p>Eine Stadtbibliothek möchte ihren Bestand und die Ausleihe so organisieren, dass nicht nur Titel, sondern auch einzelne physische Exemplare sauber nachverfolgt werden können. Mitglieder sollen mit ihrer Mitgliedsnummer eindeutig erfasst werden; zusätzlich werden Name, Adresse und Telefonnummer gespeichert. Bücher werden über ihre ISBN identifiziert, außerdem sollen Titel, Autor und Erscheinungsjahr festgehalten werden. Da ein Buch mehrfach im Regal stehen kann, braucht jedes konkrete Exemplar eine eigene Inventarnummer; zu jedem Exemplar werden außerdem Anschaffungsdatum und Zustand dokumentiert.</p>
        <p>Wenn ein Mitglied ein Exemplar ausleiht, soll dies über einen eigenen Ausleihe-Vorgang laufen. Für jede Ausleihe gibt es daher eine Ausleihnummer sowie die Angaben Ausleihdatum, Fälligkeitsdatum und Rückgabedatum. Aus dem Modell soll hervorgehen, dass ein Buch viele Exemplare haben kann, ein Exemplar aber immer genau zu einem Buch gehört (ist Exemplar von). Ebenso kann ein Mitglied im Laufe der Zeit mehrere Ausleihen auslösen, während jede einzelne Ausleihe genau einem Mitglied zugeordnet ist (leiht aus). Auch ein Exemplar kann mehrfach ausgeliehen werden, jede konkrete Ausleihe bezieht sich jedoch immer auf genau ein Exemplar (wird ausgeliehen in).</p>`,
      masterlösung: {
        entities: ['Mitglied', 'Buch', 'Exemplar', 'Ausleihe'],
        attributes: {
          Mitglied: ['Mitgliedsnummer', 'Name', 'Adresse', 'Telefonnummer'],
          Buch: ['ISBN', 'Titel', 'Autor', 'Erscheinungsjahr'],
          Exemplar: ['Inventarnummer', 'Anschaffungsdatum', 'Zustand'],
          Ausleihe: ['Ausleihnummer', 'Ausleihdatum', 'Fälligkeitsdatum', 'Rückgabedatum'],
        },
        primaryKeys: {
          Mitglied: 'Mitgliedsnummer',
          Buch: 'ISBN',
          Exemplar: 'Inventarnummer',
          Ausleihe: 'Ausleihnummer',
        },
        relationships: [
          { name: 'ist Exemplar von', from: 'Exemplar', to: 'Buch', cardinality: 'n:1' },
          { name: 'leiht aus', from: 'Mitglied', to: 'Ausleihe', cardinality: '1:n' },
          { name: 'wird ausgeliehen in', from: 'Exemplar', to: 'Ausleihe', cardinality: '1:n' },
        ],
      },
    },
    fussball: {
      title: 'Fußball-Turnier',
      jsonFile: 'uebung-4-fussball.json',
      szenario: `<p>Ein Schulturnier soll so modelliert werden, dass klar sichtbar wird, welche Spieler in welchen Teams spielen, welcher Trainer welches Team betreut und welche Teams an welchen Spielen beteiligt sind. Für Spieler werden SpielerNr, Name und Position erfasst. Teams werden über Teamname eindeutig identifiziert; zusätzlich werden Altersklasse und Ort gespeichert. Spiele werden mit SpielID, Datum, Heimtore und Gasttore geführt. Trainer werden mit TrainerNr, Name und Lizenz verwaltet.</p>
        <p>Damit die Organisation des Turniers nachvollziehbar bleibt, werden mehrere Beziehungen benötigt. Ein Trainer kann mehrere Teams trainieren, jedes Team hat jedoch genau einen Trainer (trainiert). Ein Spieler spielt in genau einem Team, während ein Team viele Spieler haben kann (spielt in). Zusätzlich wird die Teamführung erfasst: Ein Team hat genau einen Kapitän und ein Spieler kann Kapitän genau eines Teams sein (ist Kapitän). Auch die Spielteilnahmen sollen abgebildet werden: Ein Team kann viele Spiele bestreiten, und ein Spiel wird von mehreren Teams bestritten (bestreitet).</p>`,
      masterlösung: {
        entities: ['Spieler', 'Team', 'Spiel', 'Trainer'],
        attributes: {
          Spieler: ['SpielerNr', 'Name', 'Position'],
          Team: ['Teamname', 'Altersklasse', 'Ort'],
          Spiel: ['SpielID', 'Datum', 'Heimtore', 'Gasttore'],
          Trainer: ['TrainerNr', 'Name', 'Lizenz'],
        },
        primaryKeys: { Spieler: 'SpielerNr', Team: 'Teamname', Spiel: 'SpielID', Trainer: 'TrainerNr' },
        relationships: [
          { name: 'trainiert', from: 'Trainer', to: 'Team', cardinality: '1:n' },
          { name: 'spielt in', from: 'Spieler', to: 'Team', cardinality: 'n:1' },
          { name: 'ist Kapitän', from: 'Spieler', to: 'Team', cardinality: '1:1' },
          { name: 'bestreitet', from: 'Team', to: 'Spiel', cardinality: 'n:m' },
        ],
      },
    },
    fitnessstudio: {
      title: 'Fitnessstudio-Kursplanung',
      jsonFile: 'uebung-5-fitnessstudio.json',
      szenario: `<p>Ein Fitnessstudio möchte seine Kursorganisation so abbilden, dass sichtbar wird, welche Mitglieder an welchen Kursen teilnehmen und welche Trainer welche Kurse übernehmen. Für Mitglied sollen Mitgliedsnummer, Name, Telefonnummer und E-Mail gespeichert werden. Für Kurs werden Kurscode, Titel, Schwierigkeitsstufe und Maximalplätze erfasst. Für Trainer sollen Trainerkürzel, Name und Lizenz geführt werden.</p>
        <p>Ein Mitglied kann im Laufe der Zeit mehrere Kurse belegen, und ein Kurs kann von vielen Mitgliedern besucht werden (belegt). Zu jeder Belegung soll zusätzlich das Anmeldedatum festgehalten werden. Ebenso kann ein Trainer mehrere Kurse leiten, während ein Kurs auch von mehreren Trainern betreut werden kann (leitet). Zu dieser Zuordnung soll der Wochentag dokumentiert werden.</p>`,
      masterlösung: {
        entities: ['Mitglied', 'Kurs', 'Trainer'],
        attributes: {
          Mitglied: ['Mitgliedsnummer', 'Name', 'Telefonnummer', 'E-Mail'],
          Kurs: ['Kurscode', 'Titel', 'Schwierigkeitsstufe', 'Maximalplätze'],
          Trainer: ['Trainerkürzel', 'Name', 'Lizenz'],
        },
        primaryKeys: { Mitglied: 'Mitgliedsnummer', Kurs: 'Kurscode', Trainer: 'Trainerkürzel' },
        relationships: [
          { name: 'belegt', from: 'Mitglied', to: 'Kurs', cardinality: 'n:m', attributes: ['Anmeldedatum'] },
          { name: 'leitet', from: 'Trainer', to: 'Kurs', cardinality: 'n:m', attributes: ['Wochentag'] },
        ],
      },
    },
    // Knackpunkt: Der Text verführt zu „Fahrschüler n:m Fahrlehrer“. Weil dasselbe Paar viele
    // Fahrstunden hat, braucht es die Entitätsklasse Fahrstunde mit zwei 1:n-Beziehungen.
    fahrschule: {
      title: 'Fahrschule',
      jsonFile: 'experten-1-fahrschule.json',
      // Experten 1: wichtige Wörter hervorgehoben (ab Experten 2 nicht mehr)
      szenario: `<p>Eine Fahrschule möchte ihre Ausbildung verwalten. Jeder <strong>Fahrschüler</strong> hat eine eindeutige <strong>Kundennummer</strong>; außerdem werden <strong>Name</strong>, <strong>Geburtsdatum</strong> und <strong>Führerscheinklasse</strong> gespeichert. Jeder <strong>Fahrlehrer</strong> hat eine eindeutige <strong>Personalnummer</strong>, dazu kommen <strong>Name</strong> und <strong>Telefonnummer</strong>. Ein Fahrschüler lernt im Lauf seiner Ausbildung bei mehreren Fahrlehrern, und ein Fahrlehrer hat viele Fahrschüler.</p>
        <p>Festgehalten wird jede einzelne <strong>Fahrstunde</strong> mit eindeutiger <strong>Stundennummer</strong>, <strong>Datum</strong>, <strong>Uhrzeit</strong> und <strong>Art</strong> (z. B. Überlandfahrt). Derselbe Fahrschüler fährt oft viele Stunden beim selben Fahrlehrer. Jede Fahrstunde fährt genau ein Fahrschüler, ein Fahrschüler fährt viele Fahrstunden (<strong>fährt</strong>). Jede Fahrstunde gibt genau ein Fahrlehrer, ein Fahrlehrer gibt viele Fahrstunden (<strong>gibt</strong>).</p>`,
      masterlösung: {
        entities: ['Fahrschüler', 'Fahrlehrer', 'Fahrstunde'],
        attributes: {
          Fahrschüler: ['Kundennummer', 'Name', 'Geburtsdatum', 'Führerscheinklasse'],
          Fahrlehrer: ['Personalnummer', 'Name', 'Telefonnummer'],
          Fahrstunde: ['Stundennummer', 'Datum', 'Uhrzeit', 'Art'],
        },
        primaryKeys: { Fahrschüler: 'Kundennummer', Fahrlehrer: 'Personalnummer', Fahrstunde: 'Stundennummer' },
        relationships: [
          { name: 'fährt', from: 'Fahrschüler', to: 'Fahrstunde', cardinality: '1:n' },
          { name: 'gibt', from: 'Fahrlehrer', to: 'Fahrstunde', cardinality: '1:n' },
        ],
      },
      regeln: ['Jede Fahrstunde fährt genau ein Fahrschüler mit genau einem Fahrlehrer.'],
      sqlRegeln: [
        {
          relation: 'Fahrstunde',
          spalte: 'Kundennummer',
          notNull: true,
          grund: 'Jede Fahrstunde fährt genau ein Fahrschüler.',
        },
        {
          relation: 'Fahrstunde',
          spalte: 'Personalnummer',
          notNull: true,
          grund: 'Jede Fahrstunde gibt genau ein Fahrlehrer.',
        },
      ],
    },
    // Knackpunkte: zwei Beziehungen zwischen Flug und Flughafen, rekursive 1:n-Beziehung bei Pilot.
    flugbetrieb: {
      title: 'Flugbetrieb',
      jsonFile: 'experten-2-flugbetrieb.json',
      szenario: `<p>Eine Fluggesellschaft plant ihre Flüge. Jeder Flughafen hat einen eindeutigen Flughafencode (z. B. LEJ); außerdem werden Name und Stadt gespeichert. Jeder Flug hat eine eindeutige FlugID sowie Datum, Abflugzeit und Ankunftszeit. Jeder Pilot hat eine eindeutige Lizenznummer, dazu werden Name und Flugstunden gespeichert.</p>
        <p>Jeder Flug startet von genau einem Flughafen, und von einem Flughafen starten viele Flüge (startet von). Ebenso landet jeder Flug in genau einem Flughafen, und in einem Flughafen landen viele Flüge (landet in). Jeden Flug führt genau ein Pilot als Kapitän, ein Pilot führt viele Flüge (führt).</p>
        <p>Erfahrene Piloten bilden den Nachwuchs aus: Ein Pilot kann viele andere Piloten ausbilden. Jeder Pilot hat höchstens einen Ausbilder aus der eigenen Fluggesellschaft – wer anderswo gelernt hat, hat hier keinen (bildet aus).</p>`,
      masterlösung: {
        entities: ['Flughafen', 'Flug', 'Pilot'],
        attributes: {
          Flughafen: ['Flughafencode', 'Name', 'Stadt'],
          Flug: ['FlugID', 'Datum', 'Abflugzeit', 'Ankunftszeit'],
          Pilot: ['Lizenznummer', 'Name', 'Flugstunden'],
        },
        primaryKeys: { Flughafen: 'Flughafencode', Flug: 'FlugID', Pilot: 'Lizenznummer' },
        relationships: [
          { name: 'startet von', from: 'Flug', to: 'Flughafen', cardinality: 'n:1' },
          { name: 'landet in', from: 'Flug', to: 'Flughafen', cardinality: 'n:1' },
          { name: 'führt', from: 'Pilot', to: 'Flug', cardinality: '1:n' },
          { name: 'bildet aus', from: 'Pilot', to: 'Pilot', cardinality: '1:n' },
        ],
      },
      regeln: [
        'Jeder Flug startet von genau einem Flughafen und landet in genau einem.',
        'Jeden Flug führt genau ein Pilot.',
        'Nicht jeder Pilot hat einen Ausbilder aus der eigenen Fluggesellschaft.',
      ],
      sqlRegeln: [
        {
          relation: 'Flug',
          spalte: 'Flughafencode',
          notNull: true,
          grund: 'Jeder Flug startet und landet an genau einem Flughafen.',
        },
        { relation: 'Flug', spalte: 'Lizenznummer', notNull: true, grund: 'Jeden Flug führt genau ein Pilot.' },
        { relation: 'Pilot', spalte: 'Lizenznummer', notNull: false, grund: 'Nicht jeder Pilot hat einen Ausbilder.' },
      ],
    },
    universitaet: {
      title: 'Universität',
      jsonFile: 'experten-3-universitaet.json',
      szenario: `<p>Eine Hochschule möchte ihre Lehrorganisation so modellieren, dass sichtbar wird, welche Dozenten welche Vorlesungen halten, welche Hilfskräfte sie dabei unterstützen und welche Seminare zu einer Vorlesung gehören. Für Dozent werden Dozentenkürzel, Name und Fachgebiet gespeichert. Für Student werden Matrikelnummer, Name, Telefonnummer und E-Mail erfasst. Nicht jeder Student arbeitet zusätzlich an der Hochschule, aber einige Studierende sind zugleich Hilfskraft. Für Hilfskraft sollen HiwiNummer, Wochenstunden und Vertragsbeginn gespeichert werden.</p>
        <p>Jede Vorlesung wird mit Vorlesungscode, Titel und Credits geführt, jedes Seminar mit Seminarnummer, Wochentag und Raum. Ein Dozent kann mehrere Vorlesungen halten, jede Vorlesung wird jedoch genau von einem Dozenten gehalten (hält). Eine Hilfskraft unterstützt genau einen Dozenten, ein Dozent kann jedoch mehrere Hilfskräfte haben (hat Hilfskraft). Gleichzeitig ist jede Hilfskraft genau einem Studenten zugeordnet, denn eine Hilfskraft ist immer auch ein Student (ist). Zu jeder Vorlesung können mehrere Seminare gehören, jedes Seminar gehört aber genau zu einer Vorlesung (gehört zu). Ein Seminar wird jeweils genau von einer Hilfskraft geleitet, eine Hilfskraft kann jedoch mehrere Seminare leiten (leitet).</p>
        <p>Auch die Teilnahme der Studierenden soll abgebildet werden. Ein Student kann an mehreren Vorlesungen teilnehmen, und eine Vorlesung kann von vielen Studenten besucht werden (besucht). Dasselbe gilt für Seminare: Ein Student kann mehrere Seminare besuchen, und ein Seminar kann viele Studenten haben (nimmt teil an).</p>`,
      masterlösung: {
        entities: ['Dozent', 'Student', 'Hilfskraft', 'Vorlesung', 'Seminar'],
        attributes: {
          Dozent: ['Dozentenkürzel', 'Name', 'Fachgebiet'],
          Student: ['Matrikelnummer', 'Name', 'Telefonnummer', 'E-Mail'],
          Hilfskraft: ['HiwiNummer', 'Wochenstunden', 'Vertragsbeginn'],
          Vorlesung: ['Vorlesungscode', 'Titel', 'Credits'],
          Seminar: ['Seminarnummer', 'Wochentag', 'Raum'],
        },
        primaryKeys: {
          Dozent: 'Dozentenkürzel',
          Student: 'Matrikelnummer',
          Hilfskraft: 'HiwiNummer',
          Vorlesung: 'Vorlesungscode',
          Seminar: 'Seminarnummer',
        },
        relationships: [
          { name: 'hält', from: 'Dozent', to: 'Vorlesung', cardinality: '1:n' },
          { name: 'hat Hilfskraft', from: 'Dozent', to: 'Hilfskraft', cardinality: '1:n' },
          { name: 'ist', from: 'Student', to: 'Hilfskraft', cardinality: '1:1' },
          { name: 'gehört zu', from: 'Seminar', to: 'Vorlesung', cardinality: 'n:1' },
          { name: 'leitet', from: 'Hilfskraft', to: 'Seminar', cardinality: '1:n' },
          { name: 'besucht', from: 'Student', to: 'Vorlesung', cardinality: 'n:m' },
          { name: 'nimmt teil an', from: 'Student', to: 'Seminar', cardinality: 'n:m' },
        ],
      },
      regeln: [
        'Jede Vorlesung hält genau ein Dozent.',
        'Jede Hilfskraft unterstützt genau einen Dozenten.',
        'Jede Hilfskraft ist genau ein Student, aber nicht jeder Student ist Hilfskraft.',
        'Jedes Seminar gehört zu genau einer Vorlesung und wird von genau einer Hilfskraft geleitet.',
      ],
      sqlRegeln: [
        {
          relation: 'Vorlesung',
          spalte: 'Dozentenkürzel',
          notNull: true,
          grund: 'Jede Vorlesung hält genau ein Dozent.',
        },
        {
          relation: 'Hilfskraft',
          spalte: 'Dozentenkürzel',
          notNull: true,
          grund: 'Jede Hilfskraft unterstützt genau einen Dozenten.',
        },
        // „ist“ (1:1): Fremdschlüssel in Hilfskraft oder in Student
        {
          relation: 'Hilfskraft',
          spalte: 'Matrikelnummer',
          notNull: true,
          unique: true,
          optional: true,
          grund: 'Jede Hilfskraft ist genau ein Student (1:1).',
        },
        {
          relation: 'Student',
          spalte: 'HiwiNummer',
          notNull: false,
          unique: true,
          optional: true,
          grund: 'Nicht jeder Student ist Hilfskraft, und keine Hilfskraft gehört zu zwei Studenten (1:1).',
        },
        {
          relation: 'Seminar',
          spalte: 'Vorlesungscode',
          notNull: true,
          grund: 'Jedes Seminar gehört zu genau einer Vorlesung.',
        },
        {
          relation: 'Seminar',
          spalte: 'HiwiNummer',
          notNull: true,
          grund: 'Jedes Seminar leitet genau eine Hilfskraft.',
        },
      ],
    },
    // Knackpunkte: Verbundschlüssel aus Gebäude und Raumnummer, Kann-Beziehung, n:m-Selbstbeziehung.
    tagung: {
      title: 'Tagung',
      jsonFile: 'experten-4-tagung.json',
      szenario: `<p>Eine Fachtagung soll so geplant werden, dass klar ist, wer welchen Vortrag hält, in welchem Raum er stattfindet und welche Helfer die Räume betreuen. Jeder Referent hat eine eindeutige Referentennummer; außerdem werden Name und Fachgebiet gespeichert. Jeder Vortrag hat eine eindeutige Vortragsnummer sowie Titel, Datum, Startzeit und Endzeit. Jeder Helfer hat eine eindeutige Helfernummer, dazu Name und Telefonnummer.</p>
        <p>Die Tagung nutzt mehrere Gebäude. Einen Raum erkennt man erst an Gebäude und Raumnummer zusammen – Raum 101 gibt es in jedem Gebäude. Zu jedem Raum wird außerdem die Kapazität gespeichert.</p>
        <p>Ein Referent kann mehrere Vorträge halten, jeder Vortrag wird von genau einem Referenten gehalten (hält). In einem Raum finden viele Vorträge statt; jeder Vortrag findet in höchstens einem Raum statt – solange die Raumplanung läuft, steht bei manchen Vorträgen noch kein Raum fest (findet statt in).</p>
        <p>Ein Helfer betreut mehrere Räume, und jeder Raum wird von mehreren Helfern betreut (betreut). Erfahrene Helfer arbeiten neue ein: Ein Helfer kann mehrere andere einarbeiten und selbst von mehreren eingearbeitet werden (arbeitet ein).</p>`,
      masterlösung: {
        entities: ['Referent', 'Vortrag', 'Raum', 'Helfer'],
        attributes: {
          Referent: ['Referentennummer', 'Name', 'Fachgebiet'],
          Vortrag: ['Vortragsnummer', 'Titel', 'Datum', 'Startzeit', 'Endzeit'],
          Raum: ['Gebäude', 'Raumnummer', 'Kapazität'],
          Helfer: ['Helfernummer', 'Name', 'Telefonnummer'],
        },
        primaryKeys: {
          Referent: 'Referentennummer',
          Vortrag: 'Vortragsnummer',
          Raum: ['Gebäude', 'Raumnummer'],
          Helfer: 'Helfernummer',
        },
        relationships: [
          { name: 'hält', from: 'Referent', to: 'Vortrag', cardinality: '1:n' },
          { name: 'findet statt in', from: 'Vortrag', to: 'Raum', cardinality: 'n:1' },
          { name: 'betreut', from: 'Helfer', to: 'Raum', cardinality: 'n:m' },
          { name: 'arbeitet ein', from: 'Helfer', to: 'Helfer', cardinality: 'n:m' },
        ],
      },
      regeln: ['Jeden Vortrag hält genau ein Referent.', 'Bei manchen Vorträgen steht der Raum noch nicht fest.'],
      sqlRegeln: [
        {
          relation: 'Vortrag',
          spalte: 'Referentennummer',
          notNull: true,
          grund: 'Jeden Vortrag hält genau ein Referent.',
        },
        {
          relation: 'Vortrag',
          spalte: 'Gebäude',
          notNull: false,
          grund: 'Bei manchen Vorträgen steht der Raum noch nicht fest.',
        },
        {
          relation: 'Vortrag',
          spalte: 'Raumnummer',
          notNull: false,
          grund: 'Bei manchen Vorträgen steht der Raum noch nicht fest.',
        },
      ],
    },
    katastrophenschutz: {
      title: 'Katastrophenschutz-Leitstelle',
      jsonFile: 'experten-5-katastrophenschutz.json',
      szenario: `<p>Eine regionale Leitstelle möchte Einsätze im Katastrophenschutz so modellieren, dass sichtbar wird, welche Einsatzkräfte in welchen Teams organisiert sind, welche Einsätze von welchen Teams übernommen werden und welche Fahrzeuge dabei eingesetzt werden. Für Einsatzkraft werden Funkrufname, Name, Qualifikation und Telefonnummer gespeichert. Teams werden mit Teamname, Standort und Bereitschaftsstufe geführt. Fahrzeuge werden über Kennzeichen, Fahrzeugtyp und Kapazität verwaltet.</p>
        <p>Zwischen Einsatzkraft und Team gibt es zwei unterschiedliche Beziehungen. Jede Einsatzkraft gehört genau zu einem Team, ein Team kann jedoch viele Einsatzkräfte umfassen (gehört zu). Zusätzlich hat jedes Team genau eine Einsatzleitung, und eine Einsatzkraft kann die Leitung für mehrere Teams übernehmen (leitet). Außerdem soll die fachliche Einarbeitung abgebildet werden: Eine erfahrene Einsatzkraft kann mehrere andere Einsatzkräfte einarbeiten, und jede eingearbeitete Einsatzkraft kann wiederum später andere einarbeiten. Jede Einsatzkraft wird von genau einer erfahrenen Einsatzkraft eingearbeitet (arbeitet ein).</p>
        <p>Ein Einsatz wird nicht über eine künstliche Einzel-ID, sondern über einen Verbundschlüssel aus Einsatzgebiet, Datum und Startzeit eindeutig bestimmt. Zusätzlich werden Priorität und Lagebild gespeichert. Mehrere Teams können denselben Einsatz bearbeiten, und ein Team kann an vielen Einsätzen beteiligt sein (bearbeitet). Ebenso können in einem Einsatz mehrere Fahrzeuge verwendet werden, und ein Fahrzeug kann über die Zeit in vielen Einsätzen genutzt werden (nutzt).</p>`,
      masterlösung: {
        entities: ['Einsatzkraft', 'Team', 'Einsatz', 'Fahrzeug'],
        attributes: {
          Einsatzkraft: ['Funkrufname', 'Name', 'Qualifikation', 'Telefonnummer'],
          Team: ['Teamname', 'Standort', 'Bereitschaftsstufe'],
          Einsatz: ['Einsatzgebiet', 'Datum', 'Startzeit', 'Priorität', 'Lagebild'],
          Fahrzeug: ['Kennzeichen', 'Fahrzeugtyp', 'Kapazität'],
        },
        primaryKeys: {
          Einsatzkraft: 'Funkrufname',
          Team: 'Teamname',
          Einsatz: ['Einsatzgebiet', 'Datum', 'Startzeit'],
          Fahrzeug: 'Kennzeichen',
        },
        relationships: [
          { name: 'gehört zu', from: 'Einsatzkraft', to: 'Team', cardinality: 'n:1' },
          { name: 'leitet', from: 'Einsatzkraft', to: 'Team', cardinality: '1:n' },
          { name: 'bearbeitet', from: 'Team', to: 'Einsatz', cardinality: 'n:m' },
          { name: 'nutzt', from: 'Einsatz', to: 'Fahrzeug', cardinality: 'n:m' },
          { name: 'arbeitet ein', from: 'Einsatzkraft', to: 'Einsatzkraft', cardinality: '1:n' },
        ],
      },
      regeln: ['Jede Einsatzkraft gehört zu genau einem Team.', 'Jedes Team hat genau eine Einsatzleitung.'],
      sqlRegeln: [
        {
          relation: 'Einsatzkraft',
          spalte: 'Teamname',
          notNull: true,
          grund: 'Jede Einsatzkraft gehört zu genau einem Team.',
        },
        { relation: 'Team', spalte: 'Funkrufname', notNull: true, grund: 'Jedes Team hat genau eine Einsatzleitung.' },
      ],
    },
  };

  function ermSzenarioAufgabe(s) {
    return {
      title: s.title,
      szenario: s.szenario,
      masterlösung: s.masterlösung,
      kardinalitaeten: s.ohneKardinalitaeten ? false : undefined,
      validator: function () {
        return validateExpertAufgabe(this.masterlösung);
      },
    };
  }

  function rmSzenarioAufgabe(s) {
    return {
      title: s.title,
      szenario: `<p><strong>Überführe das ER-Modell „${s.title}“ in das Relationenmodell.</strong></p>
        <p>Lege die passenden Relationen in der Seitenleiste an. Ein Fremdschlüssel heißt wie der Primärschlüssel oder die Tabelle, auf die er zeigt; eine Beziehungstabelle heißt wie die Beziehung.</p>`,
      jsonFile: s.jsonFile,
      validator: function () {
        return window.RelModel?.checkAndGetResult?.() || { passed: false };
      },
    };
  }

  // SQL-Übung: erst die Überführung, dann NOT NULL und UNIQUE nach den sqlRegeln der Aufgabe
  function sqlValidator() {
    const result = window.RelModel?.checkAndGetResult?.() || { passed: false };
    if (!result.passed) return result;
    const regelCheck = checkSqlRegeln(this.sqlRegeln);
    return regelCheck.passed ? regelCheck : { passed: false, message: regelCheck.error };
  }

  // SQL-Übung: Das Relationenmodell ist vorgegeben, geübt werden NOT NULL und UNIQUE.
  // Steigerung: 1. Spalten genannt, 2. Regeln genannt, ab 3. nur noch der Szenariotext (im Lernpfad Aufgabe 2 bis 6).
  function sqlUebungAufgabe(s, stufe) {
    const spalte = (r) => {
      const was = [r.notNull && 'NOT NULL', r.unique && 'UNIQUE'].filter(Boolean).join(' und ') || 'kein NOT NULL';
      return `<li>„${r.spalte}“ in „${r.relation}“: <strong>${was}</strong> – ${r.grund}</li>`;
    };
    const auftrag = [
      `<p>Setze diese Regeln:</p><ul>${s.sqlRegeln.map(spalte).join('')}</ul>`,
      `<p>Setze NOT NULL und UNIQUE, wo diese Regeln es verlangen:</p><ul>${s.regeln.map((r) => `<li>${r}</li>`).join('')}</ul>`,
      `<p>Die Regeln stehen im Szenario: „genau ein“ verlangt NOT NULL; bei „höchstens ein“ oder „nicht jeder“ darf der Fremdschlüssel leer bleiben; eine 1:1-Beziehung verlangt UNIQUE.</p>${s.szenario}`,
    ][Math.min(stufe, 3) - 1];
    return {
      title: s.title,
      szenario: `<p><strong>Das Relationenmodell zu „${s.title}“ ist schon eingetragen.</strong> Öffne in der Seitenleiste <strong>„SQL erzeugen“</strong> und wähle die Datentypen.</p>${auftrag}`,
      jsonFile: s.jsonFile,
      sqlRegeln: s.sqlRegeln,
      validator: sqlValidator,
    };
  }

  const UEBUNG = [
    SZENARIEN.hotel,
    SZENARIEN.krankenhaus,
    SZENARIEN.bibliothek,
    SZENARIEN.fussball,
    SZENARIEN.fitnessstudio,
  ];
  const EXPERTEN = [
    SZENARIEN.fahrschule,
    SZENARIEN.flugbetrieb,
    SZENARIEN.universitaet,
    SZENARIEN.tagung,
    SZENARIEN.katastrophenschutz,
  ];

  const ermUebungAufgaben = nummeriert(UEBUNG.map(ermSzenarioAufgabe));
  const ermExpertenAufgaben = nummeriert(EXPERTEN.map(ermSzenarioAufgabe));
  const rmUebungAufgaben = nummeriert(UEBUNG.map(rmSzenarioAufgabe));
  const rmExpertenAufgaben = nummeriert(EXPERTEN.map(rmSzenarioAufgabe));
  // SQL-Übung: Aufgabe 1 führt Muss, Kann und UNIQUE am Schul-Relationenmodell ein, danach die Szenarien
  const sqlUebungAufgaben = nummeriert([
    {
      title: 'Muss, Kann und UNIQUE',
      jsonFile: 'schule-auffrischung.json',
      sqlRegeln: [
        {
          relation: 'Schüler',
          spalte: 'Klassenstufe',
          notNull: true,
          grund: 'Jeder Schüler geht in genau eine Klasse.',
        },
        {
          relation: 'Schüler',
          spalte: 'Parallelklasse',
          notNull: true,
          grund: 'Jeder Schüler geht in genau eine Klasse.',
        },
        {
          relation: 'Klasse',
          spalte: 'SchülerNr',
          unique: true,
          grund: 'Ein Schüler ist höchstens in einer Klasse Klassensprecher (1:1).',
        },
      ],
      theory: `<p class="aufgabe-begriff">Neuer Begriff: Muss-Beziehung · Kann-Beziehung</p>
        <p><strong>Muss-Beziehung → NOT NULL:</strong> Muss jede Zeile einen Partner haben, darf der Fremdschlüssel nicht leer bleiben. Bei einer <strong>Kann-Beziehung</strong> darf er leer (NULL) sein.</p>
        <p><strong>1:1 → UNIQUE:</strong> Der Fremdschlüssel einer 1:1-Beziehung darf jeden Wert nur einmal enthalten – sonst wäre ein Schüler Sprecher mehrerer Klassen.</p>`,
      szenario: `<p><strong>Das Relationenmodell der Schule ist schon eingetragen.</strong> Klicke in der Seitenleiste auf <strong>„SQL erzeugen“</strong>. Dort legst du für jede Spalte den Datentyp fest und setzt die Regeln:</p>
        <ul>
          <li>Jeder Schüler geht in genau eine Klasse (Muss-Beziehung): Setze bei „Klassenstufe“ und „Parallelklasse“ in „Schüler“ <strong>NOT NULL</strong>.</li>
          <li>Ein Schüler ist höchstens in einer Klasse Klassensprecher (1:1): Setze bei „SchülerNr“ in „Klasse“ <strong>UNIQUE</strong>.</li>
        </ul>
        <p>Wähle passende Datentypen, z. B. INTEGER für SchülerNr und Klassenstufe.</p>`,
      validator: sqlValidator,
    },
    ...EXPERTEN.map((s, i) => sqlUebungAufgabe(s, i + 1)),
  ]);

  // ---- Aufgaben-Datenbank: RELATIONENMODELL-GRUNDLAGEN (Stufe Einstieg, ERM aus files/schule-grundlagen.json) ----
  const rmGrundlagenAufgaben = nummeriert([
    {
      title: 'Seitenleiste öffnen',
      // Die Seitenleiste bleibt beim Start zu und wird hier nicht automatisch geöffnet.
      seitenleisteSelbstOeffnen: true,
      theory: `<p class="aufgabe-begriff">Neuer Begriff: Relation · Symbol: Name (Attribut, Attribut, …)</p>
        <p><strong>Relationenmodell:</strong> Im Relationenmodell werden Daten in Tabellen (Relationen) organisiert. Jede Tabelle hat Spalten (Attribute) und Zeilen (Datensätze). Primärschlüssel identifizieren jede Zeile eindeutig.</p>
        <p>Die Überführung eines ER-Modells in ein Relationenmodell ist ein wichtiger Schritt beim Datenbank-Entwurf.</p>`,
      objective: `<p>Öffne die <strong>rechte Seitenleiste</strong> „Relationenmodell“, um mit der Überführung zu beginnen.</p>
        <p>Klicke dazu oben rechts in der Tab-Leiste auf <strong>„Relationenmodell“</strong>.</p>`,
      validator: function () {
        const drawer = document.getElementById('relmodel-drawer');
        const isVisible = !!drawer && !drawer.classList.contains('collapsed') && drawer.offsetHeight > 0;
        if (!isVisible) {
          return { passed: false, error: 'Öffne die rechte Seitenleiste über „Relationenmodell“ oben rechts.' };
        }
        return { passed: true };
      },
    },
    {
      title: 'Relationen anlegen',
      theory: `<p><strong>Entitätsklasse → Relation:</strong> Jede Entitätsklasse im ER-Modell wird zu einer eigenen Relation (Tabelle) im Relationenmodell. Der Name der Entitätsklasse wird zum Relationsnamen.</p>`,
      objective: `<p>Lege die Relationen (Tabellen) für die drei Entitätsklassen des Schul-ERM an.</p>
        <p>Erstelle drei Relationen mit den Namen:</p>
        <ol>
          <li><strong>„Schüler“</strong></li>
          <li><strong>„Klasse“</strong></li>
          <li><strong>„Lehrer“</strong></li>
        </ol>
        <p><strong>Hinweis:</strong> Klicke in der rechten Seitenleiste auf „+ Relation hinzufügen“.</p>`,
      validator: function () {
        for (const name of ['Schüler', 'Klasse', 'Lehrer']) {
          if (!getStudentRelByName(name)) return { passed: false, error: `Die Relation „${name}“ fehlt.` };
        }
        return { passed: true };
      },
    },
    {
      title: 'Attribute hinzufügen',
      theory: `<p><strong>Attribute → Spalten:</strong> Die Attribute einer Entitätsklasse im ER-Modell werden zu den Spalten der entsprechenden Relation im Relationenmodell.</p>`,
      objective: `<p>Füge die Attribute der drei Entitätsklassen in die entsprechenden Relationen ein.</p>
        <ul>
          <li><strong>Schüler:</strong> SchülerNr, Vorname, Nachname</li>
          <li><strong>Klasse:</strong> Bezeichnung, Klassenraum</li>
          <li><strong>Lehrer:</strong> Lehrer-Kürzel, Vorname, Nachname</li>
        </ul>`,
      validator: function () {
        const error =
          checkStudentRelation('Schüler', ['SchülerNr', 'Vorname', 'Nachname']) ||
          checkStudentRelation('Klasse', ['Bezeichnung', 'Klassenraum']) ||
          checkStudentRelation('Lehrer', ['Lehrer-Kürzel', 'Vorname', 'Nachname']);
        return error ? { passed: false, error } : { passed: true };
      },
    },
    {
      title: 'Primärschlüssel markieren',
      theory: `<p><strong>Primärschlüssel (PS):</strong> Die Primärschlüssel aus dem ER-Modell werden auch im Relationenmodell als Primärschlüssel markiert. Sie identifizieren jeden Datensatz (Zeile in der Datenbank-Tabelle) eindeutig.</p>`,
      objective: `<p>Markiere die Primärschlüssel in den drei Relationen.</p>
        <ul>
          <li><strong>Schüler:</strong> SchülerNr (PS)</li>
          <li><strong>Klasse:</strong> Bezeichnung (PS)</li>
          <li><strong>Lehrer:</strong> Lehrer-Kürzel (PS)</li>
        </ul>`,
      validator: function () {
        const error =
          checkStudentRelation('Schüler', [], ['SchülerNr']) ||
          checkStudentRelation('Klasse', [], ['Bezeichnung']) ||
          checkStudentRelation('Lehrer', [], ['Lehrer-Kürzel']);
        return error ? { passed: false, error } : { passed: true };
      },
    },
    {
      title: '1:n-Beziehung „geht in“',
      theory: `<p class="aufgabe-begriff">Neuer Begriff: Fremdschlüssel · Symbol: ↑ hinter dem Attributnamen</p>
        <p><strong>1:n-Beziehung abbilden:</strong> Bei einer 1:n-Beziehung wird der Primärschlüssel der 1-Seite als <strong>Fremdschlüssel (FS)</strong> in die Relation der n-Seite aufgenommen.</p>
        <p>Beispiel: Ein Schüler geht in <em>eine</em> Klasse (1-Seite), aber eine Klasse hat <em>viele</em> Schüler (n-Seite). → Der PS von Klasse (Bezeichnung) wird als FS in die Relation Schüler aufgenommen.</p>`,
      objective: `<p><strong>Beziehungen abbilden:</strong> Als nächstes müssen alle Beziehungen nacheinander abgebildet werden, um die Zusammenhänge zwischen den Entitätsklassen auch im Relationenmodell darzustellen. Dazu werden Primärschlüssel zwischen den beteiligten Relationen „verschoben“: Im einfachsten Fall wird der Primärschlüssel einer Seite als sog. Fremdschlüssel in der anderen Seite übernommen, damit eine eindeutige Zuordnung der Datensätze möglich ist.</p>
        <p>Bilde die 1:n-Beziehung <strong>„geht in“</strong> (Schüler n : 1 Klasse) ab.</p>
        <p>Füge bei der Relation <strong>„Schüler“</strong> den Fremdschlüssel <strong>„Bezeichnung“</strong> hinzu und markiere ihn als <strong>Fremdschlüssel (FS)</strong>.</p>`,
      validator: function () {
        if (!studentRelHasAttr('Schüler', 'Bezeichnung'))
          return { passed: false, error: '„Bezeichnung“ fehlt als Fremdschlüssel bei „Schüler“.' };
        if (!studentRelAttrIsFk('Schüler', 'Bezeichnung'))
          return { passed: false, error: '„Bezeichnung“ muss bei „Schüler“ als Fremdschlüssel markiert sein.' };
        return { passed: true };
      },
    },
    {
      title: '1:1-Beziehung „ist Klassensprecher“',
      theory: `<p><strong>1:1-Beziehung abbilden:</strong> Bei einer 1:1-Beziehung wird der Primärschlüssel <em>einer</em> Seite als Fremdschlüssel in die <em>andere</em> Seite aufgenommen.</p>
        <p>Die Richtung ist frei wählbar – entweder Seite A bekommt den Fremdschlüssel von B, oder umgekehrt. <br><strong>Wichtig:</strong> Es wird immer nur <strong>eine</strong> Richtung gewählt, nicht beide gleichzeitig.</p>`,
      objective: `<p>Bilde die 1:1-Beziehung <strong>„ist Klassensprecher“</strong> (Schüler 1 : 1 Klasse) ab.</p>
        <p>Füge bei der Relation <strong>„Klasse“</strong> den Fremdschlüssel <strong>„SchülerNr“</strong> hinzu und markiere ihn als <strong>FS</strong>.</p>
        <p><em>Alternativ könntest du auch Bezeichnung als FS in Schüler einfügen – hier verwenden wir die Variante mit SchülerNr in Klasse.</em></p>`,
      validator: function () {
        if (studentRelAttrIsFk('Klasse', 'SchülerNr')) return { passed: true };
        return { passed: false, error: 'Füge „SchülerNr“ als Fremdschlüssel zur Relation „Klasse“ hinzu.' };
      },
    },
    {
      title: 'n:m-Beziehung „unterrichtet“',
      theory: `<p class="aufgabe-begriff">Neuer Begriff: Beziehungstabelle · Symbol: eigene Relation mit dem Namen der Beziehung</p>
        <p><strong>n:m-Beziehung abbilden:</strong> Eine n:m-Beziehung passt in keine der bestehenden Relationen. Die Beziehung wird deshalb eine eigene Tabelle (Relation): die <strong>Beziehungstabelle</strong>. Sie heißt wie die Beziehung.</p>
        <p>Die Beziehungstabelle erhält die Primärschlüssel <strong>beider beteiligten Entitätsklassen</strong> als <strong>Fremdschlüssel</strong>. Zusammen bilden diese ihren <strong>Primärschlüssel</strong> (einen Verbundschlüssel).</p>`,
      objective: `<p>Bilde die n:m-Beziehung „unterrichtet“ (Lehrer n : m Klasse) als Beziehungstabelle ab.</p>
        <ol>
          <li>Erstelle eine neue Relation <strong>„unterrichtet“</strong></li>
          <li>Füge die Attribute <strong>„Lehrer-Kürzel“</strong> und <strong>„Bezeichnung“</strong> hinzu</li>
          <li>Markiere beide als <strong>Primärschlüssel (PS)</strong> und <strong>Fremdschlüssel (FS)</strong></li>
        </ol>`,
      validator: function () {
        if (!getStudentRelByName('unterrichtet')) return { passed: false, error: 'Die Relation „unterrichtet“ fehlt.' };
        for (const attr of ['Lehrer-Kürzel', 'Bezeichnung']) {
          if (!studentRelHasAttr('unterrichtet', attr))
            return { passed: false, error: `Das Attribut „${attr}“ fehlt bei „unterrichtet“.` };
          if (!studentRelAttrIsPk('unterrichtet', attr))
            return { passed: false, error: `„${attr}“ muss bei „unterrichtet“ als Primärschlüssel markiert sein.` };
          if (!studentRelAttrIsFk('unterrichtet', attr))
            return { passed: false, error: `„${attr}“ muss bei „unterrichtet“ als Fremdschlüssel markiert sein.` };
        }
        return { passed: true };
      },
    },
    {
      title: 'Beziehungsattribut „Fach“',
      theory: `<p><strong>Beziehungsattribute:</strong> Attribute, die im ER-Modell an einer Beziehung hängen, werden in die Beziehungstabelle (bei n:m) oder in die Relation der n-Seite (bei 1:n) übernommen.</p>
        <p>Das Attribut „Fach“ gehört zur Beziehung „unterrichtet“ und wird daher in die Beziehungstabelle „unterrichtet“ aufgenommen.</p>
        <p><strong>Faustregel:</strong> Beziehungsattribute wandern immer dorthin, wo auch die Fremdschlüssel hin wandern.</p>`,
      objective: `<p>Füge das Beziehungsattribut zur Beziehungstabelle hinzu.</p>
        <p>Ergänze bei der Relation <strong>„unterrichtet“</strong> das Attribut <strong>„Fach“</strong>.</p>
        <p><em>Beziehungsattribute sind reguläre Attribute – kein PS und kein FS.</em></p>`,
      validator: function () {
        if (!studentRelHasAttr('unterrichtet', 'Fach'))
          return { passed: false, error: 'Das Attribut „Fach“ fehlt bei der Relation „unterrichtet“.' };
        return { passed: true };
      },
    },
    {
      title: '🎉 Abschluss',
      abschluss: true,
      theory: `<p><strong>Glückwunsch!</strong> Du hast die Überführung des ER-Modells in ein Relationenmodell erfolgreich abgeschlossen!</p>
        <p><strong>Du beherrschst jetzt:</strong></p>
        <ul>
          <li>Relationen anlegen</li>
          <li>Attribute übernehmen</li>
          <li>Primärschlüssel setzen</li>
          <li>1:n-Beziehungen abbilden (FS auf n-Seite)</li>
          <li>1:1-Beziehungen abbilden</li>
          <li>n:m-Beziehungen als Beziehungstabelle abbilden</li>
          <li>Beziehungsattribute übernehmen</li>
        </ul>
        <p><strong>Ausblick:</strong> Mit „SQL erzeugen“ in der Seitenleiste wird aus deinen Relationen SQL-Code (CREATE TABLE). Damit legst du die Tabellen in einer echten Datenbank an.</p>`,
      objective: `<p>🏆 <strong>Fast geschafft – speichere dein Ergebnis!</strong></p>
        <ol>
          <li>Klicke in der Seitenleiste auf <strong>„JSON-Export“</strong> und speichere die Datei</li>
          <li>Klicke in der Seitenleiste auf <strong>„PNG-Export“</strong> und speichere das Bild</li>
        </ol>
        <p>Danach geht es im Menü mit dem Lernpfad „Relationenmodell-Übung“ weiter!</p>`,
      validator: function () {
        return { passed: true };
      },
    },
  ]);

  // ---- Aufgaben-Datenbank: RELATIONENMODELL-AUFFRISCHUNG (Stufe Fortgeschritten, ERM aus files/schule-auffrischung.json) ----
  const rmAuffrischungAufgaben = nummeriert([
    {
      title: 'Relationen mit Schlüsseln',
      // Die Aufgabe sagt „Öffne die Seitenleiste“ – also beim Start zu lassen.
      seitenleisteSelbstOeffnen: true,
      theory: `<p><strong>Regel 1 – Entitätsklasse:</strong> Jede Entitätsklasse wird eine Relation mit allen ihren Attributen. Der Primärschlüssel bleibt Primärschlüssel – auch ein Verbundschlüssel aus mehreren Attributen.</p>`,
      objective: `<p>Das Schul-ERM aus der ERM-Auffrischung ist geladen. Öffne oben rechts die <strong>Seitenleiste „Relationenmodell“</strong> und lege für <strong>„Schüler“</strong>, <strong>„Klasse“</strong> und <strong>„Lehrer“</strong> je eine Relation mit allen Attributen an. Markiere die Primärschlüssel.</p>`,
      validator: function () {
        const error =
          checkStudentRelation('Schüler', ['SchülerNr', 'Vorname', 'Nachname'], ['SchülerNr']) ||
          checkStudentRelation(
            'Klasse',
            ['Klassenstufe', 'Parallelklasse', 'Klassenraum'],
            ['Klassenstufe', 'Parallelklasse'],
          ) ||
          checkStudentRelation('Lehrer', ['Lehrer-Kürzel', 'Vorname', 'Nachname'], ['Lehrer-Kürzel']);
        return error ? { passed: false, error } : { passed: true };
      },
    },
    {
      title: 'Zusammengesetzter Fremdschlüssel',
      theory: `<p><strong>Regel 2 – 1:n:</strong> Der Primärschlüssel der 1-Seite wandert als Fremdschlüssel in die Relation der n-Seite. Ist er ein Verbundschlüssel, wandern <strong>alle</strong> seine Attribute mit – zusammen bilden sie einen zusammengesetzten Fremdschlüssel.</p>`,
      objective: `<p>Bilde die Beziehung <strong>„geht in“</strong> (Schüler n : 1 Klasse) in der rechten Seitenleiste ab. Welche Relation bekommt den Fremdschlüssel, und aus welchen Attributen besteht er? Markiere sie als FS.</p>`,
      validator: function () {
        for (const attr of ['Klassenstufe', 'Parallelklasse']) {
          if (!getStudentFks('Schüler', attr).length)
            return {
              passed: false,
              error: `Der Fremdschlüssel gehört auf die n-Seite „Schüler“ – und zum Schlüssel von „Klasse“ gehört auch „${attr}“.`,
            };
        }
        return { passed: true };
      },
    },
    {
      title: '1:1-Beziehung „ist Klassensprecher“',
      theory: `<p><strong>Regel 3 – 1:1:</strong> Der Fremdschlüssel kommt auf eine Seite – am besten dorthin, wo jede Entität sicher einen Partner hat – und bekommt UNIQUE.</p>
        <p><em>UNIQUE sorgt dafür, dass jede SchülerNr in „Klasse“ nur einmal vorkommt – das setzt du später in der SQL-Übung.</em></p>`,
      objective: `<p>Bilde die Beziehung <strong>„ist Klassensprecher“</strong> ab. Jede Klasse hat einen Klassensprecher, aber nicht jeder Schüler ist einer – der Fremdschlüssel <strong>„SchülerNr“</strong> kommt deshalb in <strong>„Klasse“</strong>. In „Schüler“ bräuchtest du außerdem ein zweites, umbenanntes Paar aus Klassenstufe und Parallelklasse.</p>`,
      validator: function () {
        if (getStudentFks('Klasse', 'SchülerNr').length) return { passed: true };
        return { passed: false, error: 'Füge „SchülerNr“ als Fremdschlüssel zur Relation „Klasse“ hinzu.' };
      },
    },
    {
      title: 'Beziehungstabelle „unterrichtet“',
      theory: `<p><strong>Regel 4 – n:m:</strong> Die Beziehung wird eine eigene Tabelle (Relation), die <strong>Beziehungstabelle</strong> (in Büchern auch Zwischen- oder Koppeltabelle). Sie heißt wie die Beziehung und enthält die Primärschlüssel beider Seiten als Fremdschlüssel – zusammen ihr Primärschlüssel. Beziehungsattribute kommen dazu.</p>`,
      objective: `<p>Bilde <strong>„unterrichtet“</strong> (Lehrer n : m Klasse, mit dem Attribut „Fach“) als Beziehungstabelle ab. Achtung: Der Schlüssel von „Klasse“ hat zwei Attribute.</p>`,
      validator: function () {
        if (!getStudentRelByName('unterrichtet')) return { passed: false, error: 'Die Relation „unterrichtet“ fehlt.' };
        for (const attr of ['Lehrer-Kürzel', 'Klassenstufe', 'Parallelklasse']) {
          const a = getStudentRelAttr('unterrichtet', attr);
          if (!a) return { passed: false, error: `Das Attribut „${attr}“ fehlt bei „unterrichtet“.` };
          if (!a.isPk || !a.isFk)
            return { passed: false, error: `„${attr}“ muss bei „unterrichtet“ als PS und als FS markiert sein.` };
        }
        const fach = getStudentRelAttr('unterrichtet', 'Fach');
        if (!fach) return { passed: false, error: 'Das Beziehungsattribut „Fach“ fehlt bei „unterrichtet“.' };
        if (fach.isPk || fach.isFk)
          return { passed: false, error: '„Fach“ ist ein normales Attribut – kein PS und kein FS.' };
        return { passed: true };
      },
    },
    {
      title: 'Selbstbeziehung „ist befreundet mit“',
      theory: `<p><strong>Selbstbeziehung</strong> (rekursive Beziehung): Sie wird wie jede andere Beziehung abgebildet. Weil beide Fremdschlüssel auf dieselbe Relation zeigen, müssen sie <strong>umbenannt</strong> werden: Name des Primärschlüssels plus Zusatz mit - oder _, z. B. „SchülerNr“ und „SchülerNr-Freund“. Bei einer 1:n-Selbstbeziehung landet der umbenannte Fremdschlüssel in der Relation selbst, z. B. „SchülerNr-Pate“.</p>`,
      objective: `<p>Bilde die n:m-Selbstbeziehung <strong>„ist befreundet mit“</strong> als Beziehungstabelle ab. Beide Fremdschlüssel verweisen auf „SchülerNr“ – benenne sie so, dass sie sich unterscheiden.</p>`,
      validator: function () {
        const rel = getStudentRelByName('ist befreundet mit');
        if (!rel) return { passed: false, error: 'Die Relation „ist befreundet mit“ fehlt.' };
        const keys = rel.attrs.filter(
          (a) => a.isPk && a.isFk && window.RelModel.selfRefFkRawNameMatchesBase(a.name, 'SchülerNr'),
        );
        if (keys.length < 2)
          return {
            passed: false,
            error:
              '„ist befreundet mit“ braucht zwei Attribute, die auf „SchülerNr“ verweisen (z. B. „SchülerNr“ und „SchülerNr-Freund“), jeweils als PS und FS markiert.',
          };
        return { passed: true };
      },
    },
    {
      title: '🎉 Abschluss',
      abschluss: true,
      theory: `<p><strong>Glückwunsch!</strong> Du hast die Transformationsregeln aufgefrischt:</p>
        <ul>
          <li>Entitätsklassen und Verbundschlüssel übernehmen</li>
          <li>1:n und 1:1 mit (zusammengesetzten) Fremdschlüsseln abbilden</li>
          <li>n:m-Beziehungen als Beziehungstabelle abbilden</li>
          <li>Selbstbeziehungen mit umbenannten Fremdschlüsseln abbilden</li>
        </ul>`,
      objective: `<p>🏆 <strong>Fast geschafft – speichere dein Ergebnis!</strong></p>
        <p>Speichere die Relationen in der Seitenleiste mit <strong>„JSON-Export“</strong>.</p>
        <p>Danach geht es im Menü mit dem Lernpfad „Relationenmodell-Experten“ weiter!</p>`,
      validator: function () {
        return { passed: true };
      },
    },
  ]);

  // ---- Lernpfade: id steht auch im Link (?lernpfad=…) ----
  // art: 'erm' oder 'rm'; schritt: Schritt-für-Schritt-Lernpfad (ein Modell, Erklärkästen) statt Szenarien.
  // Symbole: 🔷 ER-Modell erarbeiten, Tabelle (ICON_RM) Relationenmodell erarbeiten, ✏️ üben.
  // version: neuer Speicherplatz, wenn sich die Nummerierung eines Lernpfads ändert.
  // abschlussText: Glückwunsch, wenn alle Szenarien eines Übungs-Lernpfads gelöst sind.
  const ICON_RM = '<svg class="icon-rm" aria-hidden="true"><use href="#icon-tabelle"></use></svg>';
  const LERNPFADE = [
    {
      id: 'erm-grundlagen',
      stufe: 'Einstieg',
      art: 'erm',
      schritt: true,
      icon: '🔷',
      titel: 'ERM-Grundlagen',
      untertitel: 'Erstes ER-Modell, noch ohne Kardinalitäten',
      kardinalitaeten: false,
      aufgaben: ermGrundlagenAufgaben,
    },
    {
      id: 'erm-kardinalitaeten',
      stufe: 'Einstieg',
      art: 'erm',
      schritt: true,
      icon: '🔷',
      titel: 'ERM-Kardinalitäten',
      untertitel: 'Den Beziehungen Zahlen geben',
      // Eigenes Schul-ERM aus den abgeschlossenen Grundlagen, sonst die Vorlage. Das Startmodell ist
      // gesperrt: nur Kardinalitäten ändern und neue Beziehungen anlegen.
      startModell: { lernpfad: 'erm-grundlagen', datei: 'schule-ohne-kardinalitaeten.json' },
      nurKardinalitaeten: true,
      aufgaben: ermKardinalitaetenAufgaben,
    },
    {
      id: 'erm-uebung',
      stufe: 'Einstieg',
      art: 'erm',
      schritt: false,
      icon: '✏️',
      titel: 'ERM-Übung',
      untertitel: 'Fünf Szenarien selbst modellieren',
      abschlussText:
        'Du modellierst jetzt selbstständig Szenarien mit 1:1-, 1:n- und n:m-Beziehungen und Beziehungsattributen. Als Nächstes überführst du ER-Modelle ins Relationenmodell: Lernpfad „Relationenmodell-Grundlagen“.',
      aufgaben: ermUebungAufgaben,
    },
    {
      id: 'rm-grundlagen',
      stufe: 'Einstieg',
      art: 'rm',
      schritt: true,
      icon: ICON_RM,
      titel: 'Relationenmodell-Grundlagen',
      untertitel: 'Das Schul-ERM Schritt für Schritt überführen',
      ermDatei: 'schule-grundlagen.json',
      aufgaben: rmGrundlagenAufgaben,
    },
    {
      id: 'rm-uebung',
      stufe: 'Einstieg',
      art: 'rm',
      schritt: false,
      icon: '✏️',
      titel: 'Relationenmodell-Übung',
      untertitel: 'Die Übungsszenarien überführen',
      abschlussText:
        'Du überführst jetzt ER-Modelle mit allen Beziehungstypen sicher ins Relationenmodell – mit Fremdschlüsseln und Beziehungstabellen.',
      aufgaben: rmUebungAufgaben,
    },
    {
      id: 'erm-auffrischung',
      stufe: 'Fortgeschritten',
      art: 'erm',
      schritt: true,
      icon: '🔷',
      titel: 'ERM-Auffrischung',
      untertitel: 'Alles Wichtige in großen Schritten',
      aufgaben: ermAuffrischungAufgaben,
    },
    {
      id: 'erm-experten',
      stufe: 'Fortgeschritten',
      art: 'erm',
      schritt: false,
      icon: '✏️',
      titel: 'ERM-Experten',
      untertitel: 'Knifflige Szenarien selbst modellieren',
      abschlussText:
        'Du modellierst jetzt auch knifflige Szenarien – mit vermittelnden Entitätsklassen, mehreren Beziehungen zwischen denselben Entitätsklassen, Selbstbeziehungen und Verbundschlüsseln.',
      aufgaben: ermExpertenAufgaben,
    },
    {
      id: 'rm-auffrischung',
      stufe: 'Fortgeschritten',
      art: 'rm',
      schritt: true,
      icon: ICON_RM,
      titel: 'Relationenmodell-Auffrischung',
      untertitel: 'Transformationsregeln kompakt',
      ermDatei: 'schule-auffrischung.json',
      aufgaben: rmAuffrischungAufgaben,
    },
    {
      id: 'rm-experten',
      stufe: 'Fortgeschritten',
      art: 'rm',
      schritt: false,
      icon: '✏️',
      titel: 'Relationenmodell-Experten',
      untertitel: 'Knifflige ER-Modelle überführen',
      abschlussText:
        'Du überführst jetzt auch Selbstbeziehungen, mehrere Beziehungen zwischen denselben Entitätsklassen und Verbundschlüssel. Weiter geht es mit dem Lernpfad „SQL-Übung“.',
      aufgaben: rmExpertenAufgaben,
    },
    {
      id: 'sql-uebung',
      stufe: 'Fortgeschritten',
      art: 'rm',
      schritt: false,
      icon: '✏️',
      titel: 'SQL-Übung',
      untertitel: 'Muss, Kann, NOT NULL und UNIQUE',
      // Das Relationenmodell ist vorgegeben (Musterlösung), geübt wird nur „SQL erzeugen“
      rmVorgabe: true,
      // Version 2: Aufgabe 1 „Muss, Kann und UNIQUE“ vor den Szenarien – der alte Stand passt nicht mehr
      version: 2,
      abschlussText:
        'Du legst jetzt mit NOT NULL fest, welche Fremdschlüssel nicht leer bleiben dürfen, und sicherst 1:1-Beziehungen mit UNIQUE ab.',
      aufgaben: sqlUebungAufgaben,
    },
  ];

  // ---- Eigene Szenarien (Lehrkräfte, js/szenario.js) ----
  const esc = (t) =>
    String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

  // Aufgabentext der Lehrkraft: Leerzeile = Absatz, **Wort** = hervorgehoben, „- “ = Aufzählung. Kein HTML.
  function textAlsHtml(text) {
    const inline = (z) => esc(z).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    return String(text || '')
      .trim()
      .split(/\n\s*\n/)
      .map((absatz) =>
        absatz
          .split('\n')
          .map((z) => z.trim())
          .filter(Boolean),
      )
      .filter((zeilen) => zeilen.length)
      .map((zeilen) =>
        zeilen.every((z) => z.startsWith('- '))
          ? `<ul>${zeilen.map((z) => `<li>${inline(z.slice(2))}</li>`).join('')}</ul>`
          : `<p>${zeilen.map(inline).join(' ')}</p>`,
      )
      .join('');
  }

  // Musterlösung im Format von SZENARIEN aus einem ER-Modell; Kardinalitäten nur, wenn gewünscht und gesetzt
  function masterAusErm(erm, mitKardinalitaeten = true) {
    const nodes = erm?.nodes || [];
    const edges = erm?.edges || [];
    const knoten = (id) => nodes.find((n) => n.id === id);
    const istBeziehungskante = (e) =>
      e.edgeType
        ? e.edgeType === 'relationship'
        : [knoten(e.fromId)?.type, knoten(e.toId)?.type].sort().join() === 'entity,relationship';
    const anderer = (e, id) => knoten(e.fromId === id ? e.toId : e.fromId);
    const attributeVon = (id) =>
      edges
        .filter((e) => !istBeziehungskante(e) && (e.fromId === id || e.toId === id))
        .map((e) => anderer(e, id))
        .filter((n) => n?.type === 'attribute');
    const entities = nodes.filter((n) => n.type === 'entity');
    const relationships = nodes
      .filter((n) => n.type === 'relationship')
      .map((r) => {
        const seiten = edges
          .filter((e) => istBeziehungskante(e) && (e.fromId === r.id || e.toId === r.id))
          .map((e) => ({
            name: anderer(e, r.id)?.name,
            karte: String((e.fromId === r.id ? e.chenTo : e.chenFrom) || '').toLowerCase(),
          }));
        if (seiten.length < 2 || !seiten[0].name || !seiten[1].name) return null;
        const spec = { name: r.name, from: seiten[0].name, to: seiten[1].name };
        if (mitKardinalitaeten && seiten[0].karte && seiten[1].karte)
          spec.cardinality = `${seiten[0].karte}:${seiten[1].karte}`;
        spec.attributes = attributeVon(r.id).map((a) => a.name);
        return spec;
      })
      .filter(Boolean);
    return {
      entities: entities.map((e) => e.name),
      attributes: Object.fromEntries(entities.map((e) => [e.name, attributeVon(e.id).map((a) => a.name)])),
      primaryKeys: Object.fromEntries(
        entities.map((e) => [
          e.name,
          attributeVon(e.id)
            .filter((a) => a.isPrimaryKey)
            .map((a) => a.name),
        ]),
      ),
      relationships,
    };
  }

  // Namen der Musterlösung, die im Text nicht vorkommen (Prüfbericht beim Erstellen)
  function nichtImText(spec, text) {
    const woerter = (String(text || '').match(/[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*/gu) || []).map(normalizeName);
    const kommtVor = (name) => {
      const teile = name.split(/\s+/).map(normalizeName);
      const formen = new Set(teile.length === 1 ? wortformen(name) : []);
      if (istBeziehung.has(name)) verbformen(name).forEach((f) => formen.add(f));
      return woerter.some((w, i) => formen.has(w) || teile.every((t, k) => woerter[i + k] === t));
    };
    const istBeziehung = new Set(spec.relationships.map((r) => r.name));
    const namen = [
      ...spec.entities,
      ...Object.values(spec.attributes).flat(),
      ...spec.relationships.flatMap((r) => [r.name, ...(r.attributes || [])]),
    ];
    return [...new Set(namen)].filter((n) => n && !kommtVor(n));
  }

  // Ein geprüftes Szenario (js/szenario.js) wird ein Übungs-Lernpfad mit einer Aufgabe
  function eigenerLernpfad(sz) {
    const text = textAlsHtml(sz.text);
    const aufgabe =
      sz.aufgabe === 'rm'
        ? {
            title: sz.titel,
            szenario: `<p><strong>Überführe das ER-Modell „${esc(sz.titel)}“ in das Relationenmodell.</strong> Lege die Relationen in der rechten Seitenleiste an. Ein Fremdschlüssel heißt wie der Primärschlüssel oder die Tabelle, auf die er zeigt; eine Beziehungstabelle heißt wie die Beziehung.</p>${text}`,
            erm: sz.erm,
            validator: () => window.RelModel?.checkAndGetResult?.() || { passed: false },
          }
        : {
            title: sz.titel,
            szenario: text,
            masterlösung: masterAusErm(sz.erm, sz.kardinalitaeten),
            kardinalitaeten: sz.kardinalitaeten ? undefined : false,
            validator: function () {
              return validateExpertAufgabe(this.masterlösung);
            },
          };
    return {
      id: `eigen-${sz.id}`,
      stufe: 'Eigene Szenarien',
      art: sz.aufgabe,
      schritt: false,
      eigen: true,
      icon: '✏️',
      titel: sz.titel,
      untertitel: sz.aufgabe === 'rm' ? 'Ins Relationenmodell überführen' : 'ER-Modell zeichnen',
      abschlussText: 'Du hast das Szenario deiner Lehrkraft gelöst.',
      aufgaben: nummeriert([aufgabe]),
    };
  }

  const ARBEITSSTAND_PREFIX = 'erm-editor-arbeitsstand-v1';

  // ---- Aufgabe Manager ----
  const LernpfadManager = {
    state: {
      lernpfadId: null, // Lernpfad-ID, z. B. 'erm-grundlagen'
      aktuelleAufgabe: 1,
      geloesteAufgaben: [],
      freieAufgaben: [],
      lernpfadAktiv: false,
    },

    getLernpfad: function (mode = this.state.lernpfadId) {
      return LERNPFADE.find((r) => r.id === mode) || null;
    },

    getLernpfade: function () {
      return LERNPFADE;
    },

    // Eigene Szenarien ersetzen die bisherigen am Ende der Liste
    setEigeneSzenarien: function (liste) {
      for (let i = LERNPFADE.length - 1; i >= 0; i--) if (LERNPFADE[i].eigen) LERNPFADE.splice(i, 1);
      LERNPFADE.push(...liste.map(eigenerLernpfad));
    },

    getStorageKey: function (mode = this.state.lernpfadId) {
      return 'erm-editor-lernpfad-' + (mode || 'none') + '-v' + (this.getLernpfad(mode)?.version || 1);
    },

    // Aufgaben, die zählen: alle Aufgaben außer der Abschlussaufgabe eines Schritt-Lernpfads
    getAufgaben: function (mode = this.state.lernpfadId) {
      return this.getAlleAufgaben(mode).filter((q) => !q.abschluss);
    },

    // Fortschritt aus dem gespeicherten Stand: { erledigt, gesamt }
    getFortschritt: function (mode) {
      let done = [];
      try {
        done = JSON.parse(localStorage.getItem(this.getStorageKey(mode)) || '{}').geloesteAufgaben || [];
      } catch (_e) {
        // leer lassen
      }
      const aufgaben = this.getAufgaben(mode);
      return { erledigt: aufgaben.filter((q) => done.includes(q.number)).length, gesamt: aufgaben.length };
    },

    // Alle Aufgaben eines Lernpfads gelöst?
    isLernpfadDone: function (mode) {
      const { erledigt, gesamt } = this.getFortschritt(mode);
      return gesamt > 0 && erledigt === gesamt;
    },

    // Szenario-Lernpfade: nächste offene Aufgabe nach der aktuellen, sonst die erste offene
    getNextOpenAufgabe: function () {
      const offen = this.getAufgaben()
        .map((q) => q.number)
        .filter((n) => !this.state.geloesteAufgaben.includes(n));
      return offen.find((n) => n > this.state.aktuelleAufgabe) || offen[0] || null;
    },

    // Arbeitsstand: Schritt-Lernpfade bauen ein Modell auf (ein Speicherplatz), Szenario-Lernpfade speichern je Aufgabe.
    getWorkKey: function (mode = this.state.lernpfadId, number = this.state.aktuelleAufgabe) {
      const lernpfad = this.getLernpfad(mode);
      if (!lernpfad) return null;
      const id = lernpfad.version ? `${mode}-v${lernpfad.version}` : mode;
      return lernpfad.schritt ? `${ARBEITSSTAND_PREFIX}:${id}` : `${ARBEITSSTAND_PREFIX}:${id}:a${Number(number) || 1}`;
    },

    init: function () {
      // Keine globale Aufgabe lädt; init wird erst beim startLernpfad aufgerufen
      this.state.freieAufgaben = [1];
    },

    persist: function () {
      const key = this.getStorageKey();
      // Speichere nur aktuelleAufgabe, geloesteAufgaben, freieAufgaben (nicht lernpfadAktiv)
      const dataToSave = {
        aktuelleAufgabe: this.state.aktuelleAufgabe,
        geloesteAufgaben: this.state.geloesteAufgaben,
        freieAufgaben: this.state.freieAufgaben,
      };
      localStorage.setItem(key, JSON.stringify(dataToSave));
    },

    startLernpfad: function (mode) {
      this.state.lernpfadId = mode;

      // Lade gespeicherte Daten für diese Lernpfad
      const key = this.getStorageKey();
      const saved = localStorage.getItem(key);
      if (saved) {
        try {
          const data = JSON.parse(saved);
          this.state.aktuelleAufgabe = data.aktuelleAufgabe || 1;
          this.state.geloesteAufgaben = data.geloesteAufgaben || [];
          this.state.freieAufgaben = data.freieAufgaben || [1];
        } catch (e) {
          console.warn('Aufgaben-Zustand für ' + mode + ' konnte nicht geladen werden');
          this.state.aktuelleAufgabe = 1;
          this.state.geloesteAufgaben = [];
          this.state.freieAufgaben = [1];
        }
      } else {
        this.state.aktuelleAufgabe = 1;
        this.state.geloesteAufgaben = [];
        this.state.freieAufgaben = [1];
      }

      this.state.lernpfadAktiv = true;
      this.persist();

      // Unterdrücke initiale Validierung für ERM-Lernpfade
      if (this.getLernpfad(mode)?.art === 'erm') {
        if (window.App?.suppressAufgabeCheck) {
          window.App.suppressAufgabeCheck(1000);
        }
      }

      this.renderPanel();
      // UI: Aktualisiere Badge/Dot-Anzeigen im Menü
      if (window.App?.updateLernpfadDots) window.App.updateLernpfadDots();
    },

    getCurrentAufgabe: function () {
      const aufgaben = this.getAlleAufgaben(this.state.lernpfadId);
      return aufgaben.find((q) => q.number === this.state.aktuelleAufgabe) || null;
    },

    getAlleAufgaben: function (mode) {
      return this.getLernpfad(mode)?.aufgaben || [];
    },

    getMaxAufgaben: function (mode = this.state.lernpfadId) {
      return this.getAlleAufgaben(mode).length;
    },

    validateCurrentAufgabe: function (forceRecheck = false) {
      // Nichts tun wenn kein Aufgabe aktiv oder Panel verborgen
      if (!this.state.lernpfadId || !this.state.lernpfadAktiv) return { passed: false };

      const aufgabe = this.getCurrentAufgabe();
      if (!aufgabe) return { passed: false };

      const isAlreadyCompleted = this.state.geloesteAufgaben.includes(aufgabe.number);

      // Aufgabe bereits abgeschlossen – nur bei manuellem Recheck erneut prüfen
      if (isAlreadyCompleted && !forceRecheck) return { passed: true };

      try {
        if (!aufgabe.validator) {
          if (forceRecheck) {
            window.App?.showValidationFailedModal?.(
              'Diese Aufgabe kann gerade nicht geprüft werden.',
              'Für diese Aufgabe fehlt noch eine Prüflogik.',
            );
          }
          return { passed: false, error: 'Für diese Aufgabe fehlt eine Prüflogik.' };
        }

        const result = aufgabe.validator();
        const maxAufgaben = this.getMaxAufgaben();
        const lernpfad = this.getLernpfad();

        if (result.passed) {
          if (aufgabe.abschluss) {
            // Abschlussaufgabe: nur bei manuellem Klick abschließen
            if (!forceRecheck) return { passed: false };
            // Bei der letzten Aufgabe: Zeige das Erfolgs-Modal. Erst nach Klick auf OK
            // wird die Aufgabe als abgeschlossen markiert, der Fullscreen-Konfetti
            // gestartet und die Aufgabenleiste geschlossen.
            window.App?.showAufgabeSuccessModal?.(aufgabe.number, () => {
              this.completeCurrentAufgabe();
              window.App?.playFullscreenConfetti?.();
              this.hidePanel();
            });
            return { passed: true };
          }
          if (isAlreadyCompleted && forceRecheck) {
            window.App?.showAufgabeSuccessModal?.(aufgabe.number, () => {
              const nextNumber = aufgabe.number + 1;
              // Nur Schritt-Lernpfade teilen ein Modell; Szenarien wechseln über die Kreise oder „Nächste Aufgabe“
              if (lernpfad.schritt && nextNumber <= maxAufgaben && nextNumber !== this.state.aktuelleAufgabe) {
                this.state.aktuelleAufgabe = nextNumber;
                if (!this.state.freieAufgaben.includes(nextNumber)) {
                  this.state.freieAufgaben.push(nextNumber);
                }
                this.persist();
              }
              this.renderPanel();
              if (window.App?.updateLernpfadDots) window.App.updateLernpfadDots();
            });
            return { passed: true };
          }

          // Als abgeschlossen markieren
          this.completeCurrentAufgabe();

          // Modal → weiter: Schritt-Lernpfade zur nächsten Aufgabe, ERM-Szenarien zur nächsten offenen Aufgabe,
          // Relationenmodell-Szenarien erst per „Nächste Aufgabe“. Alles gelöst: Glückwunsch zum Lernpfad.
          window.App?.showAufgabeSuccessModal?.(aufgabe.number, () => {
            if (lernpfad.schritt) {
              this.progressToNextAufgabe();
            } else if (this.isLernpfadDone(lernpfad.id)) {
              window.App?.showLernpfadDone?.(lernpfad);
            } else if (lernpfad.art === 'erm') {
              const naechste = this.getAufgabeByNumber(lernpfad.id, this.getNextOpenAufgabe());
              // Nach dem Szenario ohne Kardinalitäten (Hotel) kommen erst die ERM-Kardinalitäten
              if (
                aufgabe.kardinalitaeten === false &&
                naechste.kardinalitaeten !== false &&
                !this.isLernpfadDone('erm-kardinalitaeten')
              ) {
                window.App?.showAppModal?.({
                  title: 'Geschafft!',
                  message: `Als Nächstes lernst du Kardinalitäten: Starte im Menü den Lernpfad „ERM-Kardinalitäten“. Danach geht es hier mit Szenario ${naechste.number} weiter.`,
                  mode: 'alert',
                  confirmLabel: 'OK',
                });
              } else {
                this.jumpToAufgabe(naechste.number);
                window.App?.onAufgabeChanged?.(this.getCurrentAufgabe(), this.state);
              }
            }
            this.renderPanel();
            if (window.App?.updateLernpfadDots) window.App.updateLernpfadDots();
          });
        } else {
          // Keine untere Feedback-Leiste nutzen; bei manuellem Check stattdessen Modal-Hinweis.
          if (forceRecheck) {
            window.App?.showValidationFailedModal?.(
              result.message || 'Noch nicht korrekt. Versuche es erneut.',
              result.error,
            );
          }
        }

        return result;
      } catch (err) {
        console.error('Fehler im Validator:', err);
        if (forceRecheck) {
          window.App?.showValidationFailedModal?.('Prüfung fehlgeschlagen. Bitte erneut versuchen.', err.message);
        }
        return { passed: false, error: err.message };
      }
    },

    completeCurrentAufgabe: function () {
      const number = this.state.aktuelleAufgabe;
      if (!this.state.geloesteAufgaben.includes(number)) {
        this.state.geloesteAufgaben.push(number);
      }
      this.persist();
    },

    progressToNextAufgabe: function () {
      const maxAufgaben = this.getMaxAufgaben();
      if (this.state.aktuelleAufgabe < maxAufgaben) {
        if (window.App?.onBeforeAufgabeChange) {
          window.App.onBeforeAufgabeChange(this.state);
        }
        this.state.aktuelleAufgabe += 1;
        const nextNumber = this.state.aktuelleAufgabe;
        if (!this.state.freieAufgaben.includes(nextNumber)) {
          this.state.freieAufgaben.push(nextNumber);
        }
        this.persist();
        // Arbeitsstand der nächsten Aufgabe laden
        if (window.App?.onAufgabeChanged) {
          const aufgabe = this.getCurrentAufgabe();
          window.App.onAufgabeChanged(aufgabe, this.state);
        }
        return true;
      }
      return false; // Alle Aufgaben abgeschlossen
    },

    jumpToAufgabe: function (number) {
      if (window.App?.onBeforeAufgabeChange) {
        window.App.onBeforeAufgabeChange(this.state);
      }
      this.state.aktuelleAufgabe = number;
      if (!this.state.freieAufgaben.includes(number)) {
        this.state.freieAufgaben.push(number);
      }
      this.persist();
      return true;
    },

    resetAllProgress: function () {
      // Lösche alle Aufgaben-Speicherungen für alle Lernpfade (auch die aus der Zeit vor dem Umbau 2026)
      [
        'erm-editor-lernpfad-grundlagen-v1',
        'erm-editor-lernpfad-experten-v1',
        'erm-editor-lernpfad-experten-v2',
        'erm-editor-lernpfad-experten-v3',
        'erm-editor-lernpfad-experten-v4',
        'erm-editor-lernpfad-relmodel-grundlagen-v1',
        'erm-editor-lernpfad-relmodel-experten-v1',
        'erm-editor-lernpfad-sql-uebung-v1',
        ...LERNPFADE.map((r) => this.getStorageKey(r.id)),
      ].forEach((key) => localStorage.removeItem(key));

      this.state = {
        lernpfadId: null,
        aktuelleAufgabe: 1,
        geloesteAufgaben: [],
        freieAufgaben: [1],
        lernpfadAktiv: false,
      };
      this.hidePanel();
      if (window.App?.updateLernpfadDots) window.App.updateLernpfadDots();
    },

    resetLernpfadProgress: function () {
      const lernpfad = this.getLernpfad();
      if (!lernpfad) return;

      // Lösche alle Arbeitsstände dieser Lernpfad
      const numbers = lernpfad.schritt ? [1] : lernpfad.aufgaben.map((q) => q.number);
      numbers.forEach((n) => localStorage.removeItem(this.getWorkKey(lernpfad.id, n)));

      this.state.aktuelleAufgabe = 1;
      this.state.geloesteAufgaben = [];
      this.state.freieAufgaben = [1];
      this.state.lernpfadAktiv = true;
      this.persist();

      const modal = document.querySelector('.lernpfad-congratulations-modal');
      if (modal) {
        modal.classList.remove('visible');
      }

      this.renderPanel();
      if (window.App?.updateLernpfadDots) window.App.updateLernpfadDots();
    },

    hidePanel: function () {
      // Erst den Aufgaben-Modus verlassen, dann das freie Modell zurückholen (ohne Aufgaben-Sperren)
      this.state.lernpfadAktiv = false;
      if (window.App?.onLernpfadClosing) {
        window.App.onLernpfadClosing(this.state);
      }
      if (window.AppState?.state) window.AppState.state.diagramLocked = false;
      this.persist();
      this.renderPanel();
      // „?“ an offenen Kardinalitäten gibt es nur während einer Aufgabe
      window.Diagram?.renderAll?.();
      const modal = document.querySelector('.lernpfad-congratulations-modal');
      if (modal) {
        modal.classList.remove('visible');
      }
    },

    renderPanel: function () {
      // Update aufgabe panel visibility
      const panel = document.getElementById('aufgabe-panel');
      if (!panel) return;

      if (this.state.lernpfadAktiv && this.state.lernpfadId) {
        panel.classList.add('visible');
      } else {
        panel.classList.remove('visible');
      }

      // Render aufgabe content
      if (this.state.lernpfadId && window.App?.updateAufgabePanel) {
        window.App.updateAufgabePanel(this.getCurrentAufgabe(), this.state);
      }
    },

    getChecklistStatus: function () {
      const lernpfad = this.getLernpfad();
      // SQL-Übung: Relationen sind vorgegeben, eine Checkliste würde nichts zeigen
      if (!lernpfad || lernpfad.schritt || lernpfad.rmVorgabe) return null;
      if (lernpfad.art === 'rm') return getRelmodelChecklistStatus();
      const aufgabe = this.getCurrentAufgabe();
      return aufgabe?.masterlösung ? getExpertChecklistStatus(aufgabe.masterlösung) : null;
    },

    getHints: function () {
      const lernpfad = this.getLernpfad();
      if (lernpfad?.art !== 'erm' || lernpfad.schritt) return [];
      const aufgabe = this.getCurrentAufgabe();
      return aufgabe?.masterlösung ? getExpertHints(aufgabe.masterlösung) : [];
    },
  };

  // ---- Textmarker: Wörter im Szenario anklicken; gehört ein Wort zum ER-Modell, wird es farbig ----
  // Wortformen eines Namens mit Mehrzahl- und Fallendungen, auch mit Umlaut: „Ärzte“ zu „Arzt“,
  // „Behandlungen“ zu „Behandlung“, „Räume“ zu „Raum“.
  // ponytail: feste Endungsliste statt Grammatik – unregelmäßige Formen werden nicht erkannt.
  const UMLAUT = { au: 'äu', a: 'ä', o: 'ö', u: 'ü', Au: 'Äu', A: 'Ä', O: 'Ö', U: 'Ü' };
  function wortformen(name) {
    const umlaut = name.replace(/(au|a|o|u)(?=[^aouäöü]*$)/i, (v) => UMLAUT[v] || v);
    return new Set(
      ['', 'e', 'en', 'n', 'er', 'ern', 's', 'es', 'nen'].flatMap((e) => [name + e, umlaut + e]).map(normalizeName),
    );
  }

  // Beziehungen sind Verben: Grundform und – bei trennbaren Verben – das zusammengesetzte Wort zählen mit:
  // „bestreitet“ → bestreiten, „gehört zu“ → gehört, gehören, „nimmt teil an“ → teilnehmen, teilnimmt,
  // „führt durch“ → durchführen. Bei Hilfsverben („ist Exemplar von“, „hat Hilfskraft“) nur die Wortgruppe,
  // sonst würde jedes „ist“ markiert. ponytail: Liste unregelmäßiger Verben statt Grammatik.
  const UNREGELMAESSIG = {
    nimmt: 'nehmen',
    gibt: 'geben',
    hält: 'halten',
    fährt: 'fahren',
    trägt: 'tragen',
    läuft: 'laufen',
    sieht: 'sehen',
    liest: 'lesen',
    spricht: 'sprechen',
    hilft: 'helfen',
    wirft: 'werfen',
    gilt: 'gelten',
    lässt: 'lassen',
    tritt: 'treten',
  };
  const HILFSVERBEN = new Set(['ist', 'sind', 'hat', 'haben', 'wird', 'werden', 'kann', 'muss']);
  const infinitiv = (verb) => UNREGELMAESSIG[verb.toLowerCase()] || verb.replace(/e?t$/, 'en');

  // Einzelwörter, die für eine Beziehung stehen (ohne den Namen selbst)
  function verbformen(name) {
    const w = name.split(/\s+/);
    if (HILFSVERBEN.has(w[0].toLowerCase())) return [];
    const formen = [w[0], infinitiv(w[0])];
    if (w.length > 1) formen.push(w[1] + infinitiv(w[0]), w[1] + w[0]);
    return formen.map(normalizeName);
  }

  // `${Lernpfad}:${Aufgabe}` → { markiert: Set, klicks } – bleibt beim Neuzeichnen des Panels erhalten
  const textmarkerStand = new Map();

  // Klicks je Szenario: so viele, wie das ER-Modell Elemente hat, plus 5 für Fehlgriffe, mindestens 20 –
  // genug zum Markieren, zu wenig, um einfach jedes Wort durchzuklicken (Szenarien: 94 bis 210 Wörter).
  const textmarkerKlicks = (anzahlElemente) => Math.max(20, anzahlElemente + 5);

  // kopf: Überschrift „Szenario“, dort stehen Legende und Klickzähler
  function textmarker(container, spec, standKey, kopf) {
    const elemente = [
      ...(spec.entities || []).map((name) => ({ art: 'entitaet', name })),
      ...Object.values(spec.attributes || {})
        .flat()
        .map((name) => ({ art: 'attribut', name })),
      ...(spec.relationships || []).flatMap((r) => [
        { art: 'beziehung', name: r.name },
        ...(r.attributes || []).map((name) => ({ art: 'attribut', name })),
      ]),
    ].map((e) => {
      const norm = e.name.split(/\s+/).map(normalizeName);
      // Einzelwörter auch gebeugt, Wortgruppen genau oder als Verbform (siehe verbformen)
      const formen = new Set(norm.length === 1 ? wortformen(e.name) : []);
      if (e.art === 'beziehung') verbformen(e.name).forEach((f) => formen.add(f));
      return { ...e, key: `${e.art}:${normalizeName(e.name)}`, norm, formen };
    });

    // Wörter in <span> verpacken (auch über <strong>-Grenzen hinweg in Lesereihenfolge)
    const woerter = [];
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    const textknoten = [];
    while (walker.nextNode()) textknoten.push(walker.currentNode);
    textknoten.forEach((knoten) => {
      const text = knoten.nodeValue;
      const teile = text.split(/([\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*)/u);
      if (teile.length < 2) return;
      const frag = document.createDocumentFragment();
      teile.forEach((teil, i) => {
        if (i % 2 === 0) {
          // Leerzeichen zwischen zwei Wörtern: eigenes <span>, damit Wortgruppen durchgehend markiert sind
          if (/^\s+$/.test(teil) && i > 0 && i < teile.length - 1) {
            const luecke = document.createElement('span');
            luecke.className = 'tm-luecke';
            luecke.textContent = teil;
            woerter[woerter.length - 1].luecke = luecke;
            frag.appendChild(luecke);
          } else if (teil) frag.appendChild(document.createTextNode(teil));
          return;
        }
        const span = document.createElement('span');
        span.className = 'tm-wort';
        span.textContent = teil;
        span.dataset.i = woerter.length;
        woerter.push({ span, norm: normalizeName(teil) });
        frag.appendChild(span);
      });
      knoten.parentNode.replaceChild(frag, knoten);
    });

    // Wie viele Wörter ab start passen zu Element e? Ganze Wortgruppe, sonst ein Wort (Form), sonst 0
    function treffer(e, start) {
      if (start < 0 || start >= woerter.length) return 0;
      if (e.norm.length > 1 && e.norm.every((n, k) => woerter[start + k]?.norm === n)) return e.norm.length;
      return e.formen.has(woerter[start].norm) ? 1 : 0;
    }

    // Bestes Element für ein Wort: längste Wortgruppe zuerst („ist Exemplar von“ vor „Exemplar“),
    // dann der genaue Name („Spieler“ vor „Spiel“ + er)
    function elementBei(i) {
      let bestes = null;
      let rang = -1;
      elemente.forEach((e) => {
        for (let k = 0; k < e.norm.length; k++) {
          const n = treffer(e, i - k);
          if (n <= k) continue; // reicht nicht bis zum Wort i
          const r = n * 2 + (n === 1 && woerter[i - k].norm === e.norm[0] ? 1 : 0);
          if (r > rang) [bestes, rang] = [e, r];
        }
      });
      return bestes;
    }

    const stand = textmarkerStand.get(standKey) || { markiert: new Set(), klicks: 0 };
    textmarkerStand.set(standKey, stand);
    const { markiert } = stand;
    const erlaubt = textmarkerKlicks(new Set(elemente.map((e) => e.key)).size);

    kopf.insertAdjacentHTML(
      'beforeend',
      ` <span class="tm-tipp">Wörter anklicken: <span class="tm-entitaet">Entitätsklasse</span> <span class="tm-attribut">Attribut</span> <span class="tm-beziehung">Beziehung</span> <span class="tm-zaehler"></span></span>`,
    );
    const zaehler = kopf.querySelector('.tm-zaehler');
    const zaehlen = () => {
      zaehler.textContent = `Klicks: ${stand.klicks} von ${erlaubt}`;
      zaehler.classList.toggle('leer', stand.klicks >= erlaubt);
    };
    zaehlen();

    function zeichnen() {
      woerter.forEach((w) => {
        w.span.className = 'tm-wort';
        if (w.luecke) w.luecke.className = 'tm-luecke';
      });
      elemente
        .filter((e) => markiert.has(e.key))
        .forEach((e) => {
          for (let i = 0; i < woerter.length; i++) {
            const n = treffer(e, i);
            if (n && elementBei(i) === e)
              for (let k = 0; k < n; k++) {
                woerter[i + k].span.classList.add('tm-' + e.art);
                if (k < n - 1) woerter[i + k].luecke?.classList.add('tm-' + e.art);
              }
          }
        });
    }
    zeichnen();

    // Animation neu starten
    const aufleuchten = (el, klasse) => {
      el.classList.remove(klasse);
      void el.offsetWidth;
      el.classList.add(klasse);
    };

    container.addEventListener('click', (event) => {
      const span = event.target.closest('.tm-wort');
      if (!span) return;
      const e = elementBei(Number(span.dataset.i));
      // Markiert bleibt markiert; ein zweiter Klick kostet nichts
      if (e && markiert.has(e.key)) return;
      if (stand.klicks >= erlaubt) {
        aufleuchten(zaehler, 'tm-zaehler-aus');
        return;
      }
      stand.klicks++;
      zaehlen();
      if (!e) {
        aufleuchten(span, 'tm-nein');
        return;
      }
      markiert.add(e.key);
      zeichnen();
    });
  }

  // ---- Export ----
  window.Lernpfad = LernpfadManager;
  LernpfadManager.textmarker = textmarker;
  Object.assign(LernpfadManager, { masterAusErm, nichtImText, textAlsHtml });
  // Liefert eine Aufgaben-Definition nach Lernpfad und Nummer (für Tooltips/Labels)
  LernpfadManager.getAufgabeByNumber = function (mode, number) {
    const aufgaben = LernpfadManager.getAlleAufgaben(mode);
    return aufgaben.find((q) => Number(q.number) === Number(number)) || null;
  };
  LernpfadManager.init();
  // Panel-Zustand nach Seitenneuladen wiederherstellen
  LernpfadManager.renderPanel();
})();
