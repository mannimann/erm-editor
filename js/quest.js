/* ============================================================
   quest.js – Quest-Manager, Definitionen & Validatoren
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

  function getRelationshipByName(name) {
    const normalized = normalizeName(name);
    return S().nodes?.find((n) => n.type === 'relationship' && normalizeName(n.name) === normalized) || null;
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
      const relationship = getRelationshipByName(relationshipSpec.name);
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

  function validateExpertQuest(spec) {
    if (!spec) {
      return { passed: false, error: 'Für diese Quest ist keine Musterlösung hinterlegt.' };
    }

    for (const entityName of spec.entities || []) {
      const entityCheck = validateEntityRequirements(entityName, spec);
      if (!entityCheck.passed) return entityCheck;
    }

    return validateRelationshipRequirements(spec);
  }

  /**
   * Liefert den Live-Checklistenstatus für die aktuelle Szenario-Quest.
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
      const relNode = getRelationshipByName(rel.name);
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
        const relNode = getRelationshipByName(rel.name);
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
   * Liefert eine geordnete Liste von Hinweisen für die aktuelle Szenario-Quest.
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
      const relNode = getRelationshipByName(rel.name);
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

  // Fremdschlüssel (kein PS), der auf baseName zeigt – auch umbenannt wie „SchülerNr-Sprecher“.
  function getStudentFks(relName, baseName) {
    return (getStudentRelByName(relName)?.attrs || []).filter(
      (a) => a.isFk && !a.isPk && window.RelModel.fkRawNameMatches(a.name, baseName),
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
   * Prüft NOT NULL und UNIQUE der Fremdschlüssel nach den Regeln einer Quest (Stufe Fortgeschritten).
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
  function nummeriert(quests) {
    return quests.map((quest, index) => ({ ...quest, number: index + 1 }));
  }

  // ---- Quest-Datenbank: ERM-GRUNDLAGEN (Stufe Einstieg) ----
  const ermGrundlagenQuests = nummeriert([
    {
      title: 'Erste Entitätsklasse',
      theory: `<p class="quest-begriff">Neuer Begriff: Entitätsklasse · Symbol: Rechteck</p>
        <p><strong>Entitätsklasse:</strong> Ein Rechteck im ER-Modell, das eine Gruppe von ähnlichen Objekten der realen Welt darstellt. Beispiel: Schüler, Auto, Person.</p>
        <p class="quest-begriff">Neuer Begriff: Entität · Symbol: –</p>
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
      theory: `<p class="quest-begriff">Neuer Begriff: Attribut · Symbol: Ellipse</p>
        <p><strong>Attribut:</strong> Eine Eigenschaft einer Entitätsklasse. Beispiele: Name, E-Mail, Geburtsdatum.</p>`,
      objective: `<p>Füge zur Entitätsklasse <strong>„Schüler“</strong> zwei Attribute hinzu:</p>
        <ol>
          <li>Attribut <strong>„Vorname“</strong></li>
          <li>Attribut <strong>„Nachname“</strong></li>
        </ol>
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
      theory: `<p class="quest-begriff">Neuer Begriff: Primärschlüssel · Symbol: unterstrichenes Attribut</p>
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
      theory: `<p class="quest-begriff">Neuer Begriff: Beziehung · Symbol: Raute</p>
        <p><strong>Beziehung (Relationship):</strong> Eine Raute, die die Verbindung zwischen zwei Entitätsklassen darstellt. Ihr Name wird von links nach rechts gelesen: Schüler (links) „geht in“ Klasse (rechts).</p>`,
      objective: `<p>Erstelle eine Beziehung zwischen <strong>„Schüler“</strong> und <strong>„Klasse“</strong>:</p>
        <ol>
          <li>Füge über die Werkzeugleiste eine <strong>Beziehung</strong> hinzu (Rechtsklick auf die Raute → Beziehung bearbeiten)</li>
          <li>Name der Beziehung: <strong>„geht in“</strong></li>
          <li><strong>„Schüler“</strong> auf der linken Seite, <strong>„Klasse“</strong> auf der rechten</li>
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
          <li><strong>„Lehrer“</strong> auf der linken Seite, <strong>„Klasse“</strong> auf der rechten</li>
        </ol>`,
      validator: function () {
        return validateRelationshipRequirements({
          relationships: [{ name: 'unterrichtet', from: 'Lehrer', to: 'Klasse' }],
        });
      },
    },
    {
      title: 'Beziehungsattribute',
      theory: `<p class="quest-begriff">Neuer Begriff: Beziehungsattribut · Symbol: Ellipse an der Raute</p>
        <p><strong>Beziehungsattribut:</strong> Auch Beziehungen können Attribute haben! Ein Beispiel: Die Beziehung „unterrichtet“ kann das Attribut „Fach“ besitzen, um das in dieser Klasse unterrichtete Fach festzuhalten.</p>`,
      objective: `<ol>
          <li>Füge zur Beziehung <strong>„unterrichtet“</strong> ein Attribut mit dem Namen <strong>„Fach“</strong> hinzu</li>
          <li>Rechtsklick auf die Beziehung → Attribut hinzufügen</li>
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
      theory: `<p><strong>Glückwunsch!</strong> Du hast alle Grundlagen-Quests abgeschlossen!</p>
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
        <p>Danach geht es im Menü mit der Reihe „ERM-Kardinalitäten“ weiter: Dort bekommen deine Beziehungen Zahlen.</p>`,
      validator: function () {
        // Abschluss-Screen ist immer erfolgreich
        return { passed: true };
      },
    },
  ]);

  // ---- Quest-Datenbank: ERM-KARDINALITÄTEN (Stufe Einstieg) ----
  // Startet mit dem Schul-ERM aus den Grundlagen; an den Linien steht noch „?“.
  const ermKardinalitaetenQuests = nummeriert([
    {
      title: 'Kardinalität und Leserichtung',
      theory: `<p class="quest-begriff">Neuer Begriff: Kardinalität · Symbol: 1, n oder m an der Linie</p>
        <p><strong>Kardinalität:</strong> Sie gibt an, wie viele Entitäten auf jeder Seite einer Beziehung beteiligt sein können:</p>
        <ul>
          <li><strong>1:1</strong> (eins zu eins): Ein Schüler hat einen Schülerausweis, ein Schülerausweis gehört einem Schüler.</li>
          <li><strong>1:n</strong> (eins zu vielen): Eine Klasse hat viele Schüler, ein Schüler gehört zu einer Klasse.</li>
          <li><strong>n:m</strong> (viele zu vielen): Ein Lehrer unterrichtet viele Schüler, ein Schüler hat Unterricht bei vielen Lehrern.</li>
        </ul>
        <p>Gelesen wird von links nach rechts: Schüler (links) n : 1 Klasse (rechts) — viele Schüler gehen in eine Klasse.</p>`,
      objective: `<p>Das Schul-ERM aus den Grundlagen ist geladen – dein eigenes, wenn du die Grundlagen abgeschlossen hast. An den Linien steht noch <strong>„?“</strong>: Die Kardinalitäten fehlen.</p>
        <ol>
          <li>Rechtsklick auf die Raute <strong>„geht in“</strong> → Beziehung bearbeiten</li>
          <li>„Schüler“ links, „Klasse“ rechts, Kardinalität <strong>n:1</strong> (viele Schüler gehen in eine Klasse)</li>
        </ol>`,
      validator: function () {
        return validateRelationshipRequirements({
          relationships: [
            {
              name: 'geht in',
              from: 'Schüler',
              to: 'Klasse',
              cardinality: 'n:1',
              hinweis: 'Wähle bei „geht in“ die Kardinalität n:1: viele Schüler (links) gehen in eine Klasse (rechts).',
            },
          ],
        });
      },
    },
    {
      title: 'Beide Richtungen prüfen',
      theory: `<p><strong>Beide Richtungen prüfen:</strong> Frage erst von links nach rechts, dann von rechts nach links. Ein Lehrer unterrichtet viele Klassen — und eine Klasse hat viele Lehrer. Erst wenn beide Richtungen „viele“ ergeben, ist es n:m.</p>
        <p><strong>Hinweis:</strong> Eine n:m-Beziehung wird im Relationenmodell später eine eigene Tabelle (Relation), die Beziehungstabelle.</p>`,
      objective: `<p>Bestimme die Kardinalität von <strong>„unterrichtet“</strong> (Lehrer links, Klasse rechts). Prüfe beide Richtungen:</p>
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
          <li>Erstelle die Beziehung <strong>„ist Klassenleiter von“</strong> zwischen „Lehrer“ (links) und „Klasse“ (rechts).</li>
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
      theory: `<p><strong>Glückwunsch!</strong> Dein Schul-ERM ist jetzt vollständig.</p>
        <p><strong>Du hast gelernt:</strong></p>
        <ul>
          <li>Kardinalitäten 1:1, 1:n und n:m festlegen</li>
          <li>von links nach rechts lesen</li>
          <li>beide Richtungen prüfen</li>
        </ul>`,
      objective: `<p>🏆 <strong>Fast geschafft – speichere dein Ergebnis!</strong></p>
        <ol>
          <li>Speichere dein ER-Modell mit <strong>„JSON-Export“</strong> und <strong>„PNG-Export“</strong></li>
        </ol>
        <p>Danach geht es im Menü mit der Reihe „ERM-Übung“ weiter: Dort bestimmst du die Kardinalitäten selbst aus dem Text.</p>`,
      validator: function () {
        return { passed: true };
      },
    },
  ]);

  // ---- Quest-Datenbank: ERM-AUFFRISCHUNG (Stufe Fortgeschritten) ----
  // Schul-ERM in großen Schritten; endet mit dem Modell aus files/schule-auffrischung.json.
  const ermAuffrischungQuests = nummeriert([
    {
      title: 'Entitätsklassen mit Schlüsseln',
      theory: `<p><strong>Entitätsklasse</strong> (Rechteck): eine Gruppe gleichartiger Objekte, z. B. alle Schüler. Ein einzelnes Objekt, z. B. die Schülerin Lena, ist eine <strong>Entität</strong>.</p>
        <p><strong>Attribut</strong> (Ellipse): eine Eigenschaft. Der <strong>Primärschlüssel</strong> (unterstrichen) kennzeichnet jede Entität eindeutig – jede Entitätsklasse braucht einen.</p>`,
      objective: `<p>Modelliere die Schule mit drei Entitätsklassen und markiere jeweils den Primärschlüssel (steht zuerst):</p>
        <ul>
          <li><strong>„Schüler“</strong>: „SchülerNr“, „Vorname“, „Nachname“</li>
          <li><strong>„Klasse“</strong>: „Bezeichnung“, „Klassenraum“</li>
          <li><strong>„Lehrer“</strong>: „Lehrer-Kürzel“, „Vorname“, „Nachname“</li>
        </ul>`,
      validator: function () {
        return validateExpertQuest({
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
      theory: `<p><strong>Beziehung</strong> (Raute): verbindet Entitätsklassen. Die <strong>Kardinalität</strong> sagt, wie viele Entitäten jeder Seite beteiligt sind: 1:1, 1:n oder n:m. Gelesen wird von links nach rechts.</p>
        <p>Prüfe immer beide Richtungen: Ein Lehrer unterrichtet viele Klassen — und eine Klasse hat viele Lehrer. Also n:m.</p>`,
      objective: `<p>Verbinde die Entitätsklassen durch zwei Beziehungen:</p>
        <ol>
          <li><strong>„geht in“</strong> zwischen „Schüler“ (links) und „Klasse“ (rechts), Kardinalität <strong>n:1</strong></li>
          <li><strong>„unterrichtet“</strong> zwischen „Lehrer“ (links) und „Klasse“ (rechts), Kardinalität <strong>n:m</strong></li>
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
      objective: `<p>Füge der Beziehung <strong>„unterrichtet“</strong> das Attribut <strong>„Fach“</strong> hinzu (Rechtsklick auf die Raute → Attribut hinzufügen).</p>`,
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
      theory: `<p class="quest-begriff">Neuer Begriff: Selbstbeziehung · Symbol: Raute mit zwei Linien zur selben Entitätsklasse</p>
        <p><strong>Selbstbeziehung:</strong> Eine Entitätsklasse steht mit sich selbst in Beziehung. Beide Seiten der Raute zeigen auf dieselbe Entitätsklasse.</p>`,
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
      theory: `<p class="quest-begriff">Neuer Begriff: Verbundschlüssel · Symbol: mehrere unterstrichene Attribute</p>
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
        <p>Danach geht es im Menü mit der Reihe „ERM-Experten“ weiter!</p>`,
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
        <p>Verbinde das Modell über die Beziehungen <strong>„bucht“</strong> zwischen <strong>„Gast“</strong> und <strong>„Buchung“</strong> sowie <strong>„gilt für“</strong> zwischen <strong>„Zimmer“</strong> und <strong>„Buchung“</strong>.</p>
        <p><em>Kardinalitäten brauchst du hier noch nicht.</em></p>`,
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
      szenario: `<p>Ein Krankenhaus soll so modelliert werden, dass nachvollziehbar ist, welche Patienten behandelt werden, welche Ärzte die Behandlungen durchführen und auf welcher Station ein Patient liegt. Für Patient sollen Versicherungsnummer, Name, Geburtsdatum und Adresse gespeichert werden. Für Arzt werden Personalnummer, Name und Fachbereich geführt. Für Station werden Stationscode, Name und Bettenzahl erfasst.</p>
        <p>Jeder konkrete medizinische Vorgang wird als Behandlung mit Behandlungsnummer, Datum, Diagnose und Medikation dokumentiert. Ein Patient kann im Zeitverlauf mehrere Behandlungen erhalten, jede Behandlung gehört aber genau zu einem Patienten (erhält). Ein Arzt kann mehrere Behandlungen durchführen, jede Behandlung wird jedoch genau von einem Arzt verantwortet (führt durch). Gleichzeitig ist ein Arzt einer Station zugeordnet, auf der mehrere Ärzte arbeiten können (arbeitet auf). Auch ein Patient liegt auf genau einer Station, während eine Station viele Patienten aufnehmen kann (liegt auf).</p>`,
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
      szenario: `<p>Eine Fahrschule möchte ihre Ausbildung verwalten. Jeder Fahrschüler hat eine eindeutige Kundennummer; außerdem werden Name, Geburtsdatum und Führerscheinklasse gespeichert. Jeder Fahrlehrer hat eine eindeutige Personalnummer, dazu kommen Name und Telefonnummer. Ein Fahrschüler lernt im Lauf seiner Ausbildung bei mehreren Fahrlehrern, und ein Fahrlehrer hat viele Fahrschüler.</p>
        <p>Festgehalten wird jede einzelne Fahrstunde mit eindeutiger Stundennummer, Datum, Uhrzeit und Art (z. B. Überlandfahrt). Derselbe Fahrschüler fährt oft viele Stunden beim selben Fahrlehrer. Jede Fahrstunde fährt genau ein Fahrschüler, ein Fahrschüler fährt viele Fahrstunden (fährt). Jede Fahrstunde gibt genau ein Fahrlehrer, ein Fahrlehrer gibt viele Fahrstunden (gibt).</p>`,
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
        <p>Jede Vorlesung wird mit Vorlesungscode, Titel und Credits geführt. Ein Dozent kann mehrere Vorlesungen halten, jede Vorlesung wird jedoch genau von einem Dozenten gehalten (hält). Eine Hilfskraft unterstützt genau einen Dozenten, ein Dozent kann jedoch mehrere Hilfskräfte haben (hat Hilfskraft). Gleichzeitig ist jede Hilfskraft genau einem Studenten zugeordnet, denn eine Hilfskraft ist immer auch ein Student (ist). Zu jeder Vorlesung können mehrere Seminare gehören, jedes Seminar gehört aber genau zu einer Vorlesung (gehört zu). Ein Seminar wird jeweils genau von einer Hilfskraft geleitet, eine Hilfskraft kann jedoch mehrere Seminare leiten (leitet).</p>
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

  function ermSzenarioQuest(s) {
    return {
      title: s.title,
      szenario: s.szenario,
      masterlösung: s.masterlösung,
      kardinalitaeten: s.ohneKardinalitaeten ? false : undefined,
      validator: function () {
        return validateExpertQuest(this.masterlösung);
      },
    };
  }

  // mitRegeln (Stufe Fortgeschritten): zusätzlich NOT NULL und UNIQUE nach den Regeln des Szenarios
  function rmSzenarioQuest(s, mitRegeln = false) {
    const regeln = mitRegeln
      ? `<p>Öffne danach <strong>„SQL erzeugen“</strong>: Wähle die Datentypen und setze <strong>NOT NULL</strong> und <strong>UNIQUE</strong>, wo diese Regeln es verlangen:</p>
        <ul>${s.regeln.map((r) => `<li>${r}</li>`).join('')}</ul>`
      : '';
    return {
      title: s.title,
      szenario: `<p><strong>Überführe das ER-Modell „${s.title}“ in das Relationenmodell.</strong></p>
        <p>Lege die passenden Relationen in der Seitenleiste an. Ein Fremdschlüssel heißt wie der Primärschlüssel, auf den er zeigt; eine Beziehungstabelle heißt wie die Beziehung.</p>${regeln}`,
      jsonFile: s.jsonFile,
      sqlRegeln: mitRegeln ? s.sqlRegeln : null,
      validator: function () {
        const result = window.RelModel?.checkAndGetResult?.() || { passed: false };
        if (!result.passed || !this.sqlRegeln) return result;
        const regelCheck = checkSqlRegeln(this.sqlRegeln);
        return regelCheck.passed ? regelCheck : { passed: false, message: regelCheck.error };
      },
    };
  }

  function szenarioAbschluss(text) {
    return {
      title: '🎉 Abschluss',
      szenario: `<p><strong>Glückwunsch!</strong> ${text}</p><p>Starke Leistung!</p>`,
      validator: function () {
        return { passed: true };
      },
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

  const ermUebungQuests = nummeriert([
    ...UEBUNG.map(ermSzenarioQuest),
    szenarioAbschluss(
      'Du hast alle Übungsquests abgeschlossen. Du modellierst jetzt selbstständig Szenarien mit 1:1-, 1:n- und n:m-Beziehungen und Beziehungsattributen. Als Nächstes überführst du ER-Modelle ins Relationenmodell: Reihe „Relationenmodell-Grundlagen“.',
    ),
  ]);

  const ermExpertenQuests = nummeriert([
    ...EXPERTEN.map(ermSzenarioQuest),
    szenarioAbschluss(
      'Du hast alle Expertenquests abgeschlossen. Du modellierst jetzt auch knifflige Szenarien – mit vermittelnden Entitätsklassen, mehreren Beziehungen zwischen denselben Entitätsklassen, Selbstbeziehungen und Verbundschlüsseln.',
    ),
  ]);

  const rmUebungQuests = nummeriert([
    ...UEBUNG.map((s) => rmSzenarioQuest(s)),
    szenarioAbschluss(
      'Du hast alle Übungsquests zum Relationenmodell abgeschlossen. Du überführst jetzt ER-Modelle mit allen Beziehungstypen sicher ins Relationenmodell – mit Fremdschlüsseln und Beziehungstabellen.',
    ),
  ]);

  const rmExpertenQuests = nummeriert([
    ...EXPERTEN.map((s) => rmSzenarioQuest(s, true)),
    szenarioAbschluss(
      'Du hast alle Expertenquests zum Relationenmodell abgeschlossen. Du überführst jetzt auch Selbstbeziehungen und Verbundschlüssel und legst mit NOT NULL und UNIQUE fest, welche Fremdschlüssel leer bleiben dürfen.',
    ),
  ]);

  // ---- Quest-Datenbank: RELATIONENMODELL-GRUNDLAGEN (Stufe Einstieg, ERM aus files/schule-grundlagen.json) ----
  const rmGrundlagenQuests = nummeriert([
    {
      title: 'Seitenleiste öffnen',
      // Die Seitenleiste bleibt beim Start zu und wird hier nicht automatisch geöffnet.
      seitenleisteSelbstOeffnen: true,
      theory: `<p class="quest-begriff">Neuer Begriff: Relation · Symbol: Name (Attribut, Attribut, …)</p>
        <p><strong>Relationenmodell:</strong> Im Relationenmodell werden Daten in Tabellen (Relationen) organisiert. Jede Tabelle hat Spalten (Attribute) und Zeilen (Datensätze). Primärschlüssel identifizieren jede Zeile eindeutig.</p>
        <p>Die Überführung eines ER-Modells in ein Relationenmodell ist ein wichtiger Schritt beim Datenbank-Entwurf.</p>`,
      objective: `<p>Öffne die Relationenmodell-Seitenleiste, um mit der Überführung zu beginnen.</p>
        <p>Klicke dazu auf den Button <strong>„🗃 Relationenmodell“</strong> oben rechts in der Tab-Leiste.</p>`,
      validator: function () {
        const drawer = document.getElementById('relmodel-drawer');
        const isVisible = !!drawer && !drawer.classList.contains('collapsed') && drawer.offsetHeight > 0;
        if (!isVisible) {
          return { passed: false, error: 'Öffne die Relationenmodell-Seitenleiste über den Button oben rechts.' };
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
        <p><strong>Hinweis:</strong> Klicke auf „+ Relation hinzufügen“ in der Seitenleiste.</p>`,
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
      theory: `<p class="quest-begriff">Neuer Begriff: Fremdschlüssel · Symbol: ↑ hinter dem Attributnamen</p>
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
      theory: `<p class="quest-begriff">Neuer Begriff: Beziehungstabelle · Symbol: eigene Relation mit dem Namen der Beziehung</p>
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
        <p>Danach geht es im Menü mit der Reihe „Relationenmodell-Übung“ weiter!</p>`,
      validator: function () {
        return { passed: true };
      },
    },
  ]);

  // ---- Quest-Datenbank: RELATIONENMODELL-AUFFRISCHUNG (Stufe Fortgeschritten, ERM aus files/schule-auffrischung.json) ----
  const rmAuffrischungQuests = nummeriert([
    {
      title: 'Relationen mit Schlüsseln',
      theory: `<p><strong>Regel 1 – Entitätsklasse:</strong> Jede Entitätsklasse wird eine Relation mit allen ihren Attributen. Der Primärschlüssel bleibt Primärschlüssel – auch ein Verbundschlüssel aus mehreren Attributen.</p>`,
      objective: `<p>Das Schul-ERM aus der ERM-Auffrischung ist geladen. Öffne die Seitenleiste <strong>„🗃 Relationenmodell“</strong> und lege für <strong>„Schüler“</strong>, <strong>„Klasse“</strong> und <strong>„Lehrer“</strong> je eine Relation mit allen Attributen an. Markiere die Primärschlüssel.</p>`,
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
      objective: `<p>Bilde die Beziehung <strong>„geht in“</strong> (Schüler n : 1 Klasse) ab. Welche Relation bekommt den Fremdschlüssel, und aus welchen Attributen besteht er? Markiere sie als FS.</p>`,
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
      theory: `<p><strong>Regel 3 – 1:1:</strong> Der Primärschlüssel einer Seite wandert als Fremdschlüssel in die andere – in welche, ist frei, aber nur in eine. Wähle die Seite, die weniger Spalten braucht.</p>`,
      objective: `<p>Bilde die Beziehung <strong>„ist Klassensprecher“</strong> ab. In „Schüler“ bräuchtest du ein zweites, umbenanntes Paar aus Klassenstufe und Parallelklasse – einfacher ist der Fremdschlüssel <strong>„SchülerNr“</strong> in <strong>„Klasse“</strong>.</p>`,
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
      theory: `<p><strong>Selbstbeziehung:</strong> Sie wird wie jede andere Beziehung abgebildet. Weil beide Fremdschlüssel auf dieselbe Relation zeigen, müssen sie <strong>umbenannt</strong> werden: Name des Primärschlüssels plus Zusatz mit - oder _, z. B. „SchülerNr“ und „SchülerNr-Freund“. Bei einer 1:n-Selbstbeziehung landet der umbenannte Fremdschlüssel in der Relation selbst, z. B. „SchülerNr-Pate“.</p>`,
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
      title: 'Muss, Kann und UNIQUE',
      // Prüft dieselben Regeln wie die Relationenmodell-Experten
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
      theory: `<p><strong>Muss-Beziehung → NOT NULL:</strong> Muss jede Zeile einen Partner haben, darf der Fremdschlüssel nicht leer bleiben. Bei einer <strong>Kann-Beziehung</strong> darf er leer (NULL) sein.</p>
        <p><strong>1:1 → UNIQUE:</strong> Der Fremdschlüssel einer 1:1-Beziehung darf jeden Wert nur einmal enthalten – sonst wäre ein Schüler Sprecher mehrerer Klassen.</p>`,
      objective: `<p>Klicke in der Seitenleiste auf <strong>„SQL erzeugen“</strong>. Dort legst du für jede Spalte den Datentyp fest und setzt die Regeln:</p>
        <ul>
          <li>Jeder Schüler geht in genau eine Klasse: Setze bei „Klassenstufe“ und „Parallelklasse“ in „Schüler“ <strong>NOT NULL</strong>.</li>
          <li>Ein Schüler ist höchstens in einer Klasse Klassensprecher: Setze bei „SchülerNr“ in „Klasse“ <strong>UNIQUE</strong>.</li>
        </ul>
        <p>Wähle passende Datentypen, z. B. INTEGER für SchülerNr und Klassenstufe. Den Code kannst du kopieren oder als .sql-Datei speichern.</p>`,
      validator: function () {
        return checkSqlRegeln(this.sqlRegeln);
      },
    },
    {
      title: '🎉 Abschluss',
      theory: `<p><strong>Glückwunsch!</strong> Du hast die Transformationsregeln aufgefrischt:</p>
        <ul>
          <li>Entitätsklassen und Verbundschlüssel übernehmen</li>
          <li>1:n und 1:1 mit (zusammengesetzten) Fremdschlüsseln abbilden</li>
          <li>n:m-Beziehungen als Beziehungstabelle abbilden</li>
          <li>Selbstbeziehungen mit umbenannten Fremdschlüsseln abbilden</li>
          <li>Muss-Beziehungen mit NOT NULL und 1:1 mit UNIQUE absichern</li>
        </ul>`,
      objective: `<p>🏆 <strong>Fast geschafft – speichere dein Ergebnis!</strong></p>
        <ol>
          <li>Speichere die Relationen in der Seitenleiste mit <strong>„JSON-Export“</strong></li>
          <li>Speichere unter <strong>„SQL erzeugen“</strong> den Code als .sql-Datei</li>
        </ol>
        <p>Danach geht es im Menü mit der Reihe „Relationenmodell-Experten“ weiter!</p>`,
      validator: function () {
        return { passed: true };
      },
    },
  ]);

  // ---- Quest-Reihen: id steht auch im Link (?reihe=…) ----
  // art: 'erm' oder 'rm'; schritt: Schritt-für-Schritt-Reihe (ein Modell, Erklärkästen) statt Szenarien.
  const REIHEN = [
    {
      id: 'erm-grundlagen',
      stufe: 'Einstieg',
      art: 'erm',
      schritt: true,
      icon: '📚',
      titel: 'ERM-Grundlagen',
      untertitel: 'Erstes ER-Modell, noch ohne Kardinalitäten',
      kardinalitaeten: false,
      quests: ermGrundlagenQuests,
    },
    {
      id: 'erm-kardinalitaeten',
      stufe: 'Einstieg',
      art: 'erm',
      schritt: true,
      icon: '🔢',
      titel: 'ERM-Kardinalitäten',
      untertitel: 'Den Beziehungen Zahlen geben',
      // Eigenes Schul-ERM aus den abgeschlossenen Grundlagen, sonst die Vorlage
      startModell: { reihe: 'erm-grundlagen', datei: 'schule-ohne-kardinalitaeten.json' },
      quests: ermKardinalitaetenQuests,
    },
    {
      id: 'erm-uebung',
      stufe: 'Einstieg',
      art: 'erm',
      schritt: false,
      icon: '✏️',
      titel: 'ERM-Übung',
      untertitel: 'Fünf Szenarien selbst modellieren',
      quests: ermUebungQuests,
    },
    {
      id: 'rm-grundlagen',
      stufe: 'Einstieg',
      art: 'rm',
      schritt: true,
      icon: '🗄',
      titel: 'Relationenmodell-Grundlagen',
      untertitel: 'Das Schul-ERM Schritt für Schritt überführen',
      ermDatei: 'schule-grundlagen.json',
      quests: rmGrundlagenQuests,
    },
    {
      id: 'rm-uebung',
      stufe: 'Einstieg',
      art: 'rm',
      schritt: false,
      icon: '✏️',
      titel: 'Relationenmodell-Übung',
      untertitel: 'Die Übungsszenarien überführen',
      quests: rmUebungQuests,
    },
    {
      id: 'erm-auffrischung',
      stufe: 'Fortgeschritten',
      art: 'erm',
      schritt: true,
      icon: '🔁',
      titel: 'ERM-Auffrischung',
      untertitel: 'Alles Wichtige in großen Schritten',
      quests: ermAuffrischungQuests,
    },
    {
      id: 'erm-experten',
      stufe: 'Fortgeschritten',
      art: 'erm',
      schritt: false,
      icon: '⚡',
      titel: 'ERM-Experten',
      untertitel: 'Knifflige Szenarien selbst modellieren',
      quests: ermExpertenQuests,
    },
    {
      id: 'rm-auffrischung',
      stufe: 'Fortgeschritten',
      art: 'rm',
      schritt: true,
      icon: '🔁',
      titel: 'Relationenmodell-Auffrischung',
      untertitel: 'Transformationsregeln kompakt',
      ermDatei: 'schule-auffrischung.json',
      quests: rmAuffrischungQuests,
    },
    {
      id: 'rm-experten',
      stufe: 'Fortgeschritten',
      art: 'rm',
      schritt: false,
      icon: '⚡',
      titel: 'Relationenmodell-Experten',
      untertitel: 'Überführen mit NOT NULL und UNIQUE',
      quests: rmExpertenQuests,
    },
  ];

  const QUEST_WORK_PREFIX = 'erm-editor-quest-work-v1';

  // ---- Quest Manager ----
  const QuestManager = {
    state: {
      questMode: null, // Reihen-ID, z. B. 'erm-grundlagen'
      currentQuestNumber: 1,
      completedQuests: [],
      unlockedQuests: [],
      questsPanelVisible: false,
    },

    getSeries: function (mode = this.state.questMode) {
      return REIHEN.find((r) => r.id === mode) || null;
    },

    getSeriesList: function () {
      return REIHEN;
    },

    getStorageKey: function (mode = this.state.questMode) {
      return 'erm-editor-quests-' + (mode || 'none') + '-v1';
    },

    // Alle Aufgaben einer Reihe gelöst (die Abschlussquest zählt nicht)?
    isSeriesDone: function (mode) {
      try {
        const done = JSON.parse(localStorage.getItem(this.getStorageKey(mode)) || '{}').completedQuests || [];
        const total = this.getMaxQuests(mode);
        return total > 1 && Array.from({ length: total - 1 }, (_, i) => i + 1).every((n) => done.includes(n));
      } catch (_e) {
        return false;
      }
    },

    // Arbeitsstand: Schritt-Reihen bauen ein Modell auf (ein Speicherplatz), Szenario-Reihen speichern je Quest.
    getWorkKey: function (mode = this.state.questMode, number = this.state.currentQuestNumber) {
      const reihe = this.getSeries(mode);
      if (!reihe) return null;
      return reihe.schritt ? `${QUEST_WORK_PREFIX}:${mode}` : `${QUEST_WORK_PREFIX}:${mode}:q${Number(number) || 1}`;
    },

    init: function () {
      // Keine globale Quest lädt; init wird erst beim startQuestSeries aufgerufen
      this.state.unlockedQuests = [1];
    },

    persist: function () {
      const key = this.getStorageKey();
      // Speichere nur currentQuestNumber, completedQuests, unlockedQuests (nicht questsPanelVisible)
      const dataToSave = {
        currentQuestNumber: this.state.currentQuestNumber,
        completedQuests: this.state.completedQuests,
        unlockedQuests: this.state.unlockedQuests,
      };
      localStorage.setItem(key, JSON.stringify(dataToSave));
    },

    startQuestSeries: function (mode) {
      this.state.questMode = mode;

      // Lade gespeicherte Daten für diese Questreihe
      const key = this.getStorageKey();
      const saved = localStorage.getItem(key);
      if (saved) {
        try {
          const data = JSON.parse(saved);
          this.state.currentQuestNumber = data.currentQuestNumber || 1;
          this.state.completedQuests = data.completedQuests || [];
          this.state.unlockedQuests = data.unlockedQuests || [1];
        } catch (e) {
          console.warn('Quest-Zustand für ' + mode + ' konnte nicht geladen werden');
          this.state.currentQuestNumber = 1;
          this.state.completedQuests = [];
          this.state.unlockedQuests = [1];
        }
      } else {
        this.state.currentQuestNumber = 1;
        this.state.completedQuests = [];
        this.state.unlockedQuests = [1];
      }

      this.state.questsPanelVisible = true;
      this.persist();

      // Unterdrücke initiale Validierung für ERM-Reihen
      if (this.getSeries(mode)?.art === 'erm') {
        if (window.App?.suppressQuestCheck) {
          window.App.suppressQuestCheck(1000);
        }
      }

      this.renderPanel();
      // UI: Aktualisiere Badge/Dot-Anzeigen im Menü
      if (window.App?.updateQuestDots) window.App.updateQuestDots();
    },

    getCurrentQuest: function () {
      const quests = this.getQuestsForMode(this.state.questMode);
      return quests.find((q) => q.number === this.state.currentQuestNumber) || null;
    },

    getQuestsForMode: function (mode) {
      return this.getSeries(mode)?.quests || [];
    },

    getMaxQuests: function (mode = this.state.questMode) {
      return this.getQuestsForMode(mode).length;
    },

    validateCurrentQuest: function (forceRecheck = false) {
      // Nichts tun wenn kein Quest aktiv oder Panel verborgen
      if (!this.state.questMode || !this.state.questsPanelVisible) return { passed: false };

      const quest = this.getCurrentQuest();
      if (!quest) return { passed: false };

      const isAlreadyCompleted = this.state.completedQuests.includes(quest.number);

      // Quest bereits abgeschlossen – nur bei manuellem Recheck erneut prüfen
      if (isAlreadyCompleted && !forceRecheck) return { passed: true };

      try {
        if (!quest.validator) {
          if (forceRecheck) {
            window.App?.showValidationFailedModal?.(
              'Diese Quest kann gerade nicht geprüft werden.',
              'Für diese Aufgabe fehlt noch eine Prüflogik.',
            );
          }
          return { passed: false, error: 'Für diese Aufgabe fehlt eine Prüflogik.' };
        }

        const result = quest.validator();
        const maxQuests = this.getMaxQuests();
        const reihe = this.getSeries();

        if (result.passed) {
          if (quest.number === maxQuests) {
            // Abschlussquest: nur bei manuellem Klick abschließen
            if (!forceRecheck) return { passed: false };
            // Bei der letzten Quest: Zeige das Erfolgs-Modal. Erst nach Klick auf OK
            // wird die Quest als abgeschlossen markiert, der Fullscreen-Konfetti
            // gestartet und das Quest-Panel geschlossen.
            window.App?.showQuestSuccessModal?.(quest.number, () => {
              this.completeCurrentQuest();
              window.App?.playFullscreenConfetti?.();
              this.hidePanel();
            });
            return { passed: true };
          }
          if (isAlreadyCompleted && forceRecheck) {
            window.App?.showQuestSuccessModal?.(quest.number, () => {
              const nextNumber = quest.number + 1;
              if (nextNumber <= maxQuests && nextNumber !== this.state.currentQuestNumber) {
                this.state.currentQuestNumber = nextNumber;
                if (!this.state.unlockedQuests.includes(nextNumber)) {
                  this.state.unlockedQuests.push(nextNumber);
                }
                this.persist();
              }
              this.renderPanel();
              if (window.App?.updateQuestDots) window.App.updateQuestDots();
            });
            return { passed: true };
          }

          // Als abgeschlossen markieren
          this.completeCurrentQuest();

          // Modal → nächste Quest laden (Relationenmodell-Szenarien wechseln erst per „Nächste Aufgabe“)
          window.App?.showQuestSuccessModal?.(quest.number, () => {
            if (!(reihe?.art === 'rm' && !reihe.schritt)) {
              this.progressToNextQuest();
            }
            this.renderPanel();
            if (window.App?.updateQuestDots) window.App.updateQuestDots();
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

    completeCurrentQuest: function () {
      const number = this.state.currentQuestNumber;
      if (!this.state.completedQuests.includes(number)) {
        this.state.completedQuests.push(number);
      }
      this.persist();
    },

    progressToNextQuest: function () {
      const maxQuests = this.getMaxQuests();
      if (this.state.currentQuestNumber < maxQuests) {
        if (window.App?.onBeforeQuestChange) {
          window.App.onBeforeQuestChange(this.state);
        }
        this.state.currentQuestNumber += 1;
        const nextNumber = this.state.currentQuestNumber;
        if (!this.state.unlockedQuests.includes(nextNumber)) {
          this.state.unlockedQuests.push(nextNumber);
        }
        this.persist();
        // Arbeitsstand der nächsten Quest laden
        if (window.App?.onQuestChanged) {
          const quest = this.getCurrentQuest();
          window.App.onQuestChanged(quest, this.state);
        }
        return true;
      }
      return false; // Alle Quests abgeschlossen
    },

    jumpToQuest: function (number) {
      if (window.App?.onBeforeQuestChange) {
        window.App.onBeforeQuestChange(this.state);
      }
      this.state.currentQuestNumber = number;
      if (!this.state.unlockedQuests.includes(number)) {
        this.state.unlockedQuests.push(number);
      }
      this.persist();
      return true;
    },

    resetAllProgress: function () {
      // Lösche alle Quest-Speicherungen für alle Reihen (auch die der Reihen vor dem Umbau 2026)
      [
        'erm-editor-quests-grundlagen-v1',
        'erm-editor-quests-experten-v1',
        'erm-editor-quests-experten-v2',
        'erm-editor-quests-experten-v3',
        'erm-editor-quests-experten-v4',
        'erm-editor-quests-relmodel-grundlagen-v1',
        'erm-editor-quests-relmodel-experten-v1',
        ...REIHEN.map((r) => this.getStorageKey(r.id)),
      ].forEach((key) => localStorage.removeItem(key));

      this.state = {
        questMode: null,
        currentQuestNumber: 1,
        completedQuests: [],
        unlockedQuests: [1],
        questsPanelVisible: false,
      };
      this.hidePanel();
      if (window.App?.updateQuestDots) window.App.updateQuestDots();
    },

    resetCurrentSeriesProgress: function () {
      const reihe = this.getSeries();
      if (!reihe) return;

      // Lösche alle Arbeitsstände dieser Questreihe
      const numbers = reihe.schritt ? [1] : reihe.quests.map((q) => q.number);
      numbers.forEach((n) => localStorage.removeItem(this.getWorkKey(reihe.id, n)));

      this.state.currentQuestNumber = 1;
      this.state.completedQuests = [];
      this.state.unlockedQuests = [1];
      this.state.questsPanelVisible = true;
      this.persist();

      const modal = document.querySelector('.quest-congratulations-modal');
      if (modal) {
        modal.classList.remove('visible');
      }

      this.renderPanel();
      if (window.App?.updateQuestDots) window.App.updateQuestDots();
    },

    hidePanel: function () {
      if (window.App?.onQuestPanelClosing) {
        window.App.onQuestPanelClosing(this.state);
      }
      this.state.questsPanelVisible = false;
      if (window.AppState?.state) window.AppState.state.diagramLocked = false;
      this.persist();
      this.renderPanel();
      // „?“ an offenen Kardinalitäten gibt es nur während einer Quest
      window.Diagram?.renderAll?.();
      const modal = document.querySelector('.quest-congratulations-modal');
      if (modal) {
        modal.classList.remove('visible');
      }
    },

    renderPanel: function () {
      // Update quest panel visibility
      const panel = document.getElementById('quest-panel');
      if (!panel) return;

      if (this.state.questsPanelVisible && this.state.questMode) {
        panel.classList.add('visible');
      } else {
        panel.classList.remove('visible');
      }

      // Render quest content
      if (this.state.questMode && window.App?.updateQuestPanel) {
        window.App.updateQuestPanel(this.getCurrentQuest(), this.state);
      }
    },

    getChecklistStatus: function () {
      const reihe = this.getSeries();
      if (!reihe || reihe.schritt) return null;
      if (reihe.art === 'rm') return getRelmodelChecklistStatus();
      const quest = this.getCurrentQuest();
      return quest?.masterlösung ? getExpertChecklistStatus(quest.masterlösung) : null;
    },

    getHints: function () {
      const reihe = this.getSeries();
      if (reihe?.art !== 'erm' || reihe.schritt) return [];
      const quest = this.getCurrentQuest();
      return quest?.masterlösung ? getExpertHints(quest.masterlösung) : [];
    },
  };

  // ---- Export ----
  window.Quest = QuestManager;
  // Liefert eine Quest-Definition nach Reihenname und Nummer (für Tooltips/Labels)
  QuestManager.getQuestByNumber = function (mode, number) {
    const quests = QuestManager.getQuestsForMode(mode);
    return quests.find((q) => Number(q.number) === Number(number)) || null;
  };
  QuestManager.init();
  // Panel-Zustand nach Seitenneuladen wiederherstellen
  QuestManager.renderPanel();
})();
