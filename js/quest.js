/* ============================================================
   quest.js – Quest-Manager, Definitionen & Validatoren
   ============================================================ */
'use strict';

(function () {
  // ---- Hilfsfunktionen ----

  function S() {
    return window.AppState?.state || {};
  }

  function normalizeEntityName(name) {
    return String(name || '')
      .trim()
      .toLocaleLowerCase('de');
  }

  function normalizeAttributeName(name) {
    return String(name || '')
      .trim()
      .toLocaleLowerCase('de');
  }

  function getEntityByName(name) {
    const normalized = normalizeEntityName(name);
    return S().nodes?.find((n) => n.type === 'entity' && normalizeEntityName(n.name) === normalized) || null;
  }

  function getAttributeByName(parentId, name) {
    const normalized = normalizeAttributeName(name);
    const attrs =
      S().nodes?.filter((n) => n.type === 'attribute' && normalizeAttributeName(n.name) === normalized) || [];
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

  function getRelationshipByName(name) {
    const normalized = normalizeEntityName(name);
    return S().nodes?.find((n) => n.type === 'relationship' && normalizeEntityName(n.name) === normalized) || null;
  }

  function normalizeCardinality(value) {
    const v = String(value || '1')
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
      return { passed: false, error: `Entitätsklasse "${entityName}" fehlt` };
    }

    const expectedAttributes = spec.attributes?.[entityName] || [];
    for (const attributeName of expectedAttributes) {
      if (!getAttributeByName(entity.id, attributeName)) {
        return {
          passed: false,
          error: `Bei der Entitätsklasse "${entityName}" fehlt das Attribut "${attributeName}"`,
        };
      }
    }

    const expectedPrimaryKeys = toArray(spec.primaryKeys?.[entityName]);
    for (const primaryKeyName of expectedPrimaryKeys) {
      const attribute = getAttributeByName(entity.id, primaryKeyName);
      if (!attribute) {
        return {
          passed: false,
          error: `Bei der Entitätsklasse "${entityName}" fehlt der Primärschlüssel "${primaryKeyName}"`,
        };
      }
      if (!attribute.isPrimaryKey) {
        return {
          passed: false,
          error: `Das Attribut "${primaryKeyName}" muss bei "${entityName}" als Primärschlüssel markiert sein`,
        };
      }
    }

    return { passed: true };
  }

  function validateRelationshipRequirements(spec) {
    for (const relationshipSpec of spec.relationships || []) {
      const relationship = getRelationshipByName(relationshipSpec.name);
      if (!relationship) {
        return { passed: false, error: `Beziehung "${relationshipSpec.name}" fehlt` };
      }

      // Selbstbeziehung: from === to
      if (normalizeEntityName(relationshipSpec.from) === normalizeEntityName(relationshipSpec.to)) {
        const entity = getEntityByName(relationshipSpec.from);
        if (!entity) {
          return { passed: false, error: `Die Entitätsklasse "${relationshipSpec.from}" muss existieren` };
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
            error: `Die Selbstbeziehung "${relationshipSpec.name}" muss auf beiden Seiten mit "${relationshipSpec.from}" verbunden sein`,
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

        if (sortedCards[0] !== sortedExpected[0] || sortedCards[1] !== sortedExpected[1]) {
          return {
            passed: false,
            error: `Die Selbstbeziehung "${relationshipSpec.name}" braucht die Kardinalität ${relationshipSpec.cardinality}`,
          };
        }
      } else {
        // Normale Beziehung zwischen zwei verschiedenen Entitätsklassen
        const fromEntity = getEntityByName(relationshipSpec.from);
        const toEntity = getEntityByName(relationshipSpec.to);
        if (!fromEntity || !toEntity) {
          return {
            passed: false,
            error: `Die Entitätsklassen "${relationshipSpec.from}" und "${relationshipSpec.to}" müssen existieren`,
          };
        }

        const fromCardinality = getCardinalityForEntityOnRelationship(relationship.id, fromEntity.id);
        const toCardinality = getCardinalityForEntityOnRelationship(relationship.id, toEntity.id);
        if (!fromCardinality || !toCardinality) {
          return {
            passed: false,
            error: `Die Beziehung "${relationshipSpec.name}" muss "${relationshipSpec.from}" und "${relationshipSpec.to}" verbinden`,
          };
        }

        const [expectedFrom, expectedTo] = String(relationshipSpec.cardinality || '')
          .split(':')
          .map((value) => normalizeCardinality(value));

        if (fromCardinality !== expectedFrom || toCardinality !== expectedTo) {
          return {
            passed: false,
            error:
              `Die Beziehung "${relationshipSpec.name}" braucht die Kardinalität ` +
              `${relationshipSpec.cardinality} zwischen "${relationshipSpec.from}" und "${relationshipSpec.to}"`,
          };
        }
      }

      const relationshipAttributes = relationshipSpec.attributes || [];
      for (const attributeName of relationshipAttributes) {
        if (!getAttributeByName(relationship.id, attributeName)) {
          return {
            passed: false,
            error: `Bei der Beziehung "${relationshipSpec.name}" fehlt das Attribut "${attributeName}"`,
          };
        }
      }
    }

    return { passed: true };
  }

  function validateExpertQuest(spec) {
    if (!spec) {
      return { passed: false, error: 'Für diese Expertenquest ist keine Musterlösung hinterlegt' };
    }

    for (const entityName of spec.entities || []) {
      const entityCheck = validateEntityRequirements(entityName, spec);
      if (!entityCheck.passed) return entityCheck;
    }

    return validateRelationshipRequirements(spec);
  }

  /**
   * Liefert den Live-Checklistenstatus für die aktuelle Expertenquest.
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
      if (normalizeEntityName(rel.from) === normalizeEntityName(rel.to)) {
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
          ok = sortedCards[0] === sortedExpected[0] && sortedCards[1] === sortedExpected[1];
        }
      } else {
        const fromCard = getCardinalityForEntityOnRelationship(relNode.id, fromEntity.id);
        const toCard = getCardinalityForEntityOnRelationship(relNode.id, toEntity.id);
        ok = fromCard === expectedFrom && toCard === expectedTo;
      }
      if (ok) relationships.done++;
      relationships.items.push({ label: `${rel.name} (${rel.cardinality})`, ok });
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
   * Liefert eine geordnete Liste von Hinweisen für die aktuelle Expertenquest.
   * Reihenfolge: fehlende Entitäten → fehlende Beziehungen/Kardinalitäten →
   * fehlende Attribute → fehlende Primärschlüssel.
   */
  function getExpertHints(spec) {
    if (!spec) return [];
    const hints = [];

    for (const name of spec.entities || []) {
      if (!getEntityByName(name)) {
        hints.push(`Die Entitätsklasse „${name}" fehlt.`);
      }
    }

    for (const rel of spec.relationships || []) {
      const relNode = getRelationshipByName(rel.name);
      if (!relNode) {
        hints.push(`Die Beziehung „${rel.name}" fehlt.`);
        continue;
      }
      const fromEntity = getEntityByName(rel.from);
      const toEntity = getEntityByName(rel.to);
      if (!fromEntity || !toEntity) {
        hints.push(`Die Beziehung „${rel.name}" muss „${rel.from}" und „${rel.to}" verbinden.`);
        continue;
      }
      const [expectedFrom, expectedTo] = String(rel.cardinality || '')
        .split(':')
        .map((v) => normalizeCardinality(v));
      if (normalizeEntityName(rel.from) === normalizeEntityName(rel.to)) {
        const edges =
          S().edges?.filter(
            (e) =>
              e.edgeType === 'relationship' &&
              ((e.fromId === relNode.id && e.toId === fromEntity.id) ||
                (e.fromId === fromEntity.id && e.toId === relNode.id)),
          ) || [];
        if (edges.length < 2) {
          hints.push(`Die Selbstbeziehung „${rel.name}" muss auf beiden Seiten mit „${rel.from}" verbunden sein.`);
        } else {
          const cards = edges.map((e) => {
            if (e.fromId === relNode.id) return normalizeCardinality(e.chenTo);
            return normalizeCardinality(e.chenFrom);
          });
          const sortedCards = [...cards].sort();
          const sortedExpected = [expectedFrom, expectedTo].sort();
          if (sortedCards[0] !== sortedExpected[0] || sortedCards[1] !== sortedExpected[1]) {
            hints.push(
              `Die Kardinalität bei „${rel.name}" muss ${rel.cardinality} sein (Selbstbeziehung auf „${rel.from}").`,
            );
          }
        }
      } else {
        const fromCard = getCardinalityForEntityOnRelationship(relNode.id, fromEntity.id);
        const toCard = getCardinalityForEntityOnRelationship(relNode.id, toEntity.id);
        if (fromCard !== expectedFrom || toCard !== expectedTo) {
          hints.push(
            `Die Kardinalität bei „${rel.name}" muss ${rel.cardinality} sein (zwischen „${rel.from}" und „${rel.to}").`,
          );
        }
      }
      for (const attrName of rel.attributes || []) {
        if (!getAttributeByName(relNode.id, attrName)) {
          hints.push(`Bei der Beziehung „${rel.name}" fehlt das Attribut „${attrName}".`);
        }
      }
    }

    for (const entityName of spec.entities || []) {
      const entity = getEntityByName(entityName);
      if (!entity) continue;
      for (const attrName of spec.attributes?.[entityName] || []) {
        if (!getAttributeByName(entity.id, attrName)) {
          hints.push(`Bei „${entityName}" fehlt das Attribut „${attrName}".`);
        }
      }
    }

    for (const entityName of spec.entities || []) {
      const entity = getEntityByName(entityName);
      if (!entity) continue;
      for (const pkName of toArray(spec.primaryKeys?.[entityName])) {
        const attr = getAttributeByName(entity.id, pkName);
        if (!attr) {
          hints.push(`Bei „${entityName}" fehlt der Primärschlüssel „${pkName}".`);
        } else if (!attr.isPrimaryKey) {
          hints.push(`„${pkName}" muss bei „${entityName}" als Primärschlüssel markiert sein.`);
        }
      }
    }

    return hints;
  }

  // ---- Quest-Datenbank: GRUNDLAGEN (13 Quests) ----
  const grundlagenQuests = [
    {
      id: 1,
      number: 1,
      title: 'Erste Entitätsklasse',
      theory: `<p><strong>Entitätsklasse:</strong> Ein Rechteck im ER-Modell, das eine Gruppe von ähnlichen Objekten der realen Welt darstellt. Beispiel: Student, Auto, Person.</p>`,
      objective: `<p>Erstelle eine Entitätsklasse mit dem Namen <strong>"Schüler"</strong></p>`,
      validator: function () {
        const schueler = getEntityByName('Schüler');
        if (!schueler) return { passed: false, error: 'Erstelle eine Entitätsklasse mit dem Namen "Schüler"' };
        return { passed: true };
      },
    },
    {
      id: 2,
      number: 2,
      title: 'Attribute hinzufügen',
      theory: `<p><strong>Attribut:</strong> Eine Eigenschaft einer Entitätsklasse. Beispiele: Name, Email, Geburtsdatum.</p>`,
      objective: `<p>Füge zur Entitätsklasse <strong>"Schüler"</strong> zwei Attribute hinzu:</p>
        <ol>
          <li>Attribut <strong>"Vorname"</strong></li>
          <li>Attribut <strong>"Nachname"</strong></li>
        </ol>
        <p><strong>Hinweis:</strong> Markiere sie NICHT als Primärschlüssel.</p>`,
      validator: function () {
        const schueler = getEntityByName('Schüler');
        if (!schueler) return { passed: false, error: 'Entitätsklasse "Schüler" existiert nicht' };
        const vorname = getAttributeByName(schueler.id, 'Vorname');
        const nachname = getAttributeByName(schueler.id, 'Nachname');
        if (!vorname) return { passed: false, error: 'Attribut "Vorname" fehlt' };
        if (!nachname) return { passed: false, error: 'Attribut "Nachname" fehlt' };
        return { passed: true };
      },
    },
    {
      id: 3,
      number: 3,
      title: 'Primärschlüssel setzen',
      theory: `<p><strong>Primärschlüssel:</strong> Ein oder mehrere Attribute, die einen Datensatz oder eine Entität eindeutig kennzeichnen. Keine zwei Schüler haben die gleiche SchülerNr. Der Primärschlüssel wird unterstrichen dargestellt.</p>`,
      objective: `<ol>
          <li>Erstelle ein Attribut <strong>"SchülerNr"</strong> bei der Entitätsklasse <strong>"Schüler"</strong></li>
          <li>Markiere "SchülerNr" als <strong>Primärschlüssel</strong></li>
        </ol>`,
      validator: function () {
        const schueler = getEntityByName('Schüler');
        if (!schueler) return { passed: false, error: 'Entitätsklasse "Schüler" existiert nicht' };
        const attr = getAttributeByName(schueler.id, 'SchülerNr');
        if (!attr) return { passed: false, error: 'Attribut "SchülerNr" fehlt' };
        if (!attr.isPrimaryKey) return { passed: false, error: '"SchülerNr" muss als Primärschlüssel markiert sein' };
        return { passed: true };
      },
    },
    {
      id: 4,
      number: 4,
      title: 'Zweite Entitätsklasse',
      theory: `<p><strong>Mehrere Entitätsklassen:</strong> Realistische Systeme brauchen oft mehrere Entitätsklassen, die miteinander in Beziehung stehen.</p>`,
      objective: `<p>Erstelle eine neue Entitätsklasse mit dem Namen <strong>"Klasse"</strong></p>`,
      validator: function () {
        const klasse = getEntityByName('Klasse');
        if (!klasse) return { passed: false, error: 'Entitätsklasse "Klasse" existiert nicht' };
        return { passed: true };
      },
    },
    {
      id: 5,
      number: 5,
      title: 'Verbundschlüssel',
      theory: `<p><strong>Verbundschlüssel:</strong> Manchmal werden mehrere Attribute kombiniert, um eine Entität eindeutig zu identifizieren. Für Schulklassen verwenden wir Klassenstufe + Parallelklasse (z.B. 5a, 5b, 10c).</p>
        <p>Diese beiden Attribute zusammen bilden den eindeutigen Identifier einer Klasse.</p>`,
      objective: `<ol>
          <li>Erstelle zwei Attribute bei der Entitätsklasse <strong>"Klasse"</strong>:
            <ul>
              <li><strong>"Klassenstufe"</strong></li>
              <li><strong>"Parallelklasse"</strong></li>
            </ul>
          </li>
          <li>Markiere <strong>BEIDE</strong> als Primärschlüssel</li>
        </ol>`,
      validator: function () {
        const klasse = getEntityByName('Klasse');
        if (!klasse) return { passed: false, error: 'Entitätsklasse "Klasse" existiert nicht' };
        const klassenstufe = getAttributeByName(klasse.id, 'Klassenstufe');
        const parallelklasse = getAttributeByName(klasse.id, 'Parallelklasse');
        if (!klassenstufe) return { passed: false, error: 'Attribut "Klassenstufe" fehlt' };
        if (!parallelklasse) return { passed: false, error: 'Attribut "Parallelklasse" fehlt' };
        if (!klassenstufe.isPrimaryKey)
          return { passed: false, error: '"Klassenstufe" muss als Primärschlüssel markiert sein' };
        if (!parallelklasse.isPrimaryKey)
          return { passed: false, error: '"Parallelklasse" muss als Primärschlüssel markiert sein' };
        return { passed: true };
      },
    },
    {
      id: 6,
      number: 6,
      title: 'Beziehung erstellen',
      theory: `<p><strong>Beziehung (Relationship):</strong> Eine Raute, die die Verbindung zwischen zwei Entitätsklassen darstellt.</p>
        <p><strong>Kardinalität:</strong> Beschreibt, wie viele Instanzen an jeder Seite beteiligt sind:</p>
        <ul>
          <li><strong>1:1</strong> (eins-zu-eins): Ein Schüler hat einen Schülerausweis, ein Schülerausweis gehört einem Schüler.</li>
          <li><strong>1:n</strong> (eins-zu-vielen): Eine Klasse hat viele Schüler, ein Schüler gehört zu einer Klasse.</li>
          <li><strong>n:m</strong> (viele-zu-vielen): Ein Lehrer unterrichtet viele Schüler, ein Schüler hat Unterricht bei vielen Lehrern. </li>
        </ul>`,
      objective: `<p>Erstelle eine Beziehung zwischen <strong>"Schüler"</strong> und <strong>"Klasse"</strong>:</p>
        <ol>
          <li>Name der Beziehung: <strong>"geht in"</strong></li>
          <li><strong>"Schüler"</strong> auf der linken Seite, <strong>"Klasse"</strong> auf der rechten</li>
          <li>Kardinalität: <strong>n:1</strong> (viele Schüler sind in einer Klasse)</li>
        </ol>`,
      validator: function () {
        const schueler = getEntityByName('Schüler');
        const klasse = getEntityByName('Klasse');
        if (!schueler || !klasse)
          return { passed: false, error: 'Entitätsklassen "Schüler" und "Klasse" müssen existieren' };

        const rel = getRelationshipByName('geht in');
        if (!rel) return { passed: false, error: 'Beziehung "geht in" nicht gefunden' };

        const schuelerCard = getCardinalityForEntityOnRelationship(rel.id, schueler.id);
        const klasseCard = getCardinalityForEntityOnRelationship(rel.id, klasse.id);
        if (!schuelerCard || !klasseCard) {
          return { passed: false, error: 'Beziehung muss Schüler und Klasse verbinden' };
        }

        if (schuelerCard !== 'n' || klasseCard !== '1') {
          return { passed: false, error: 'Kardinalität muss für Schüler n und für Klasse 1 sein' };
        }

        return { passed: true };
      },
    },
    {
      id: 7,
      number: 7,
      title: 'Dritte Entitätsklasse',
      theory: `<p><strong>Erweitern des Modells:</strong> Ein ER-Modell kann mehrere Entitätsklassen enthalten.</p>`,
      objective: `<p>Erstelle eine neue Entitätsklasse mit dem Namen <strong>"Lehrer"</strong></p>`,
      validator: function () {
        if (countEntities() !== 3) return { passed: false, error: 'Du brauchst jetzt genau 3 Entitätsklassen' };
        const lehrer = getEntityByName('Lehrer');
        if (!lehrer) return { passed: false, error: 'Entitätsklasse "Lehrer" existiert nicht' };
        return { passed: true };
      },
    },
    {
      id: 8,
      number: 8,
      title: 'Primärschlüssel für Lehrer',
      theory: `<p><strong>Konsistenz:</strong> Alle Entitätsklassen müssen einen Primärschlüssel haben. Für Lehrer verwenden wir ein kurzes Kürzel als Kennzeichnung (z.B. MUS, MAN, BER).</p>`,
      objective: `<ol>
          <li>Erstelle drei Attribute bei der Entitätsklasse <strong>"Lehrer"</strong>:
            <ul>
              <li><strong>"Lehrer-Kürzel"</strong></li>
              <li><strong>"Vorname"</strong></li>
              <li><strong>"Nachname"</strong></li>
            </ul>
          </li>
          <li>Markiere nur <strong>"Lehrer-Kürzel"</strong> als Primärschlüssel</li>
        </ol>`,
      validator: function () {
        const lehrer = getEntityByName('Lehrer');
        if (!lehrer) return { passed: false, error: 'Entitätsklasse "Lehrer" existiert nicht' };
        const attr = getAttributeByName(lehrer.id, 'Lehrer-Kürzel');
        const vorname = getAttributeByName(lehrer.id, 'Vorname');
        const nachname = getAttributeByName(lehrer.id, 'Nachname');
        if (!attr) return { passed: false, error: 'Attribut "Lehrer-Kürzel" fehlt' };
        if (!vorname) return { passed: false, error: 'Attribut "Vorname" fehlt' };
        if (!nachname) return { passed: false, error: 'Attribut "Nachname" fehlt' };
        if (!attr.isPrimaryKey)
          return { passed: false, error: '"Lehrer-Kürzel" muss als Primärschlüssel markiert sein' };
        return { passed: true };
      },
    },
    {
      id: 9,
      number: 9,
      title: 'Zweite Beziehung',
      theory: `<p><strong>Mehrere Beziehungen:</strong> Entitätsklassen können mit mehreren anderen Entitätsklassen in Beziehung stehen.</p>
        <p><strong>Kardinalität:</strong> Beschreibt, wie viele Instanzen an jeder Seite beteiligt sind:</p>  
        <ul>
          <li><strong>1:1</strong> (eins-zu-eins): Ein Schüler hat einen Schülerausweis, ein Schülerausweis gehört einem Schüler.</li>
          <li><strong>1:n</strong> (eins-zu-vielen): Eine Klasse hat viele Schüler, ein Schüler gehört zu einer Klasse.</li>
          <li><strong>n:m</strong> (viele-zu-vielen): Ein Lehrer unterrichtet viele Schüler, ein Schüler hat Unterricht bei vielen Lehrern. </li>
        </ul>
        <p><strong>Hinweis:</strong> n:m-Beziehungen werden später in der Datenbank zu einer eigenen Tabelle umgewandelt.</p>`,
      objective: `<p>Erstelle eine Beziehung zwischen <strong>"Lehrer"</strong> und <strong>"Klasse"</strong>:</p>
        <ol>
          <li>Name der Beziehung: <strong>"unterrichtet"</strong></li>
          <li><strong>"Lehrer"</strong> auf der linken Seite, <strong>"Klasse"</strong> auf der rechten</li>
          <li>Kardinalität: <strong>n:m</strong> (ein Lehrer unterrichtet viele Klassen, eine Klasse hat Unterricht bei vielen Lehrern)</li>
        </ol>`,
      validator: function () {
        const lehrer = getEntityByName('Lehrer');
        const klasse = getEntityByName('Klasse');
        if (!lehrer || !klasse)
          return { passed: false, error: 'Entitätsklassen "Lehrer" und "Klasse" müssen existieren' };

        const rel = getRelationshipByName('unterrichtet');
        if (!rel) return { passed: false, error: 'Beziehung "unterrichtet" nicht gefunden' };

        const lehrerCard = getCardinalityForEntityOnRelationship(rel.id, lehrer.id);
        const klasseCard = getCardinalityForEntityOnRelationship(rel.id, klasse.id);
        if (!lehrerCard || !klasseCard) {
          return { passed: false, error: 'Beziehung muss Lehrer und Klasse verbinden' };
        }

        if (lehrerCard !== 'n' || klasseCard !== 'n') {
          return { passed: false, error: 'Kardinalität muss n:m sein (beide Seiten viele)' };
        }

        return { passed: true };
      },
    },
    {
      id: 10,
      number: 10,
      title: 'Beziehungsattribute',
      theory: `<p><strong>Beziehungsattribute:</strong> Auch Beziehungen können Attribute haben! Ein Beispiel: Die Beziehung "unterrichtet" kann das Attribut "Fach" besitzen, um das in dieser Klasse unterrichtete Fach festzuhalten.</p>`,
      objective: `<ol>
          <li>Füge zur Beziehung <strong>"unterrichtet"</strong> ein Attribut mit dem Namen <strong>"Fach"</strong> hinzu</li>
          <li>Rechtklick auf die Beziehung → Attribut hinzufügen</li>
        </ol>`,
      validator: function () {
        const rel = getRelationshipByName('unterrichtet');
        if (!rel) return { passed: false, error: 'Beziehung "unterrichtet" existiert nicht' };
        const attr = getAttributeByName(rel.id, 'Fach');
        if (!attr) return { passed: false, error: 'Attribut "Fach" fehlt bei Beziehung "unterrichtet"' };
        return { passed: true };
      },
    },
    {
      id: 11,
      number: 11,
      title: 'Weitere Beziehung ergänzen',
      theory: `<p><strong>Zusätzliche Beziehung:</strong> Zwischen denselben Entitätsklassen kann es mehrere unterschiedliche Beziehungen geben, wenn sie verschiedene Bedeutungen haben. Zwischen zwei Entitätsklassen sind also mehr als eine Beziehung möglich.</p>`,
      objective: `<ol>
          <li>Erstelle eine <strong>NEUE</strong> Beziehung zwischen <strong>"Schüler"</strong> und <strong>"Klasse"</strong></li>
          <li>Name: <strong>"ist Klassensprecher"</strong></li>
          <li>Kardinalität: <strong>1:1</strong></li>
        </ol>
        <p><strong>Hinweis:</strong> Das ist eine NEUE Beziehung, zusätzlich zur bisherigen Beziehung.</p>`,
      validator: function () {
        const rel = getRelationshipByName('ist Klassensprecher');
        if (!rel) return { passed: false, error: 'Beziehung "ist Klassensprecher" nicht gefunden' };

        const schueler = getEntityByName('Schüler');
        const klasse = getEntityByName('Klasse');
        if (!schueler || !klasse) {
          return { passed: false, error: 'Entitätsklassen "Schüler" und "Klasse" müssen existieren' };
        }

        const schuelerCard = getCardinalityForEntityOnRelationship(rel.id, schueler.id);
        const klasseCard = getCardinalityForEntityOnRelationship(rel.id, klasse.id);
        if (!schuelerCard || !klasseCard) {
          return { passed: false, error: 'Beziehung muss Schüler und Klasse verbinden' };
        }

        if (schuelerCard !== '1' || klasseCard !== '1') {
          return { passed: false, error: 'Kardinalität sollte 1:1 sein' };
        }

        return { passed: true };
      },
    },
    {
      id: 12,
      number: 12,
      title: 'Selbstbeziehung',
      theory: `<p><strong>Selbstbeziehung:</strong> Eine Entitätsklasse kann auch mit sich selbst in Beziehung stehen! Beide Seiten der Beziehung zeigen dann auf dieselbe Entitätsklasse.</p>
        <p><strong>Beispiel:</strong> Ein Schüler kann mit mehreren anderen Schülern befreundet sein – und ein anderer Schüler kann ebenfalls mit vielen befreundet sein. Das ist eine n:m-Selbstbeziehung innerhalb von "Schüler".</p>`,
      objective: `<ol>
          <li>Erstelle eine <strong>Selbstbeziehung</strong> bei der Entitätsklasse <strong>"Schüler"</strong></li>
          <li>Name der Beziehung: <strong>"ist befreundet mit"</strong></li>
          <li>Verbinde die Beziehung auf <strong>beiden Seiten</strong> mit <strong>"Schüler"</strong></li>
          <li>Kardinalität: <strong>n:m</strong> (ein Schüler kann viele Freunde haben)</li>
        </ol>`,
      validator: function () {
        const schueler = getEntityByName('Schüler');
        if (!schueler) return { passed: false, error: 'Entitätsklasse "Schüler" existiert nicht' };

        const rel = getRelationshipByName('ist befreundet mit');
        if (!rel) return { passed: false, error: 'Beziehung "ist befreundet mit" nicht gefunden' };

        const edges =
          S().edges?.filter(
            (e) =>
              e.edgeType === 'relationship' &&
              ((e.fromId === rel.id && e.toId === schueler.id) || (e.fromId === schueler.id && e.toId === rel.id)),
          ) || [];

        if (edges.length < 2) {
          return { passed: false, error: '"ist befreundet mit" muss auf beiden Seiten mit "Schüler" verbunden sein' };
        }

        const cards = edges.map((e) => {
          if (e.fromId === rel.id) return normalizeCardinality(e.chenTo);
          return normalizeCardinality(e.chenFrom);
        });

        if (!cards.includes('n') || cards.filter((c) => c === 'n').length < 2) {
          return { passed: false, error: 'Kardinalität muss n:m sein (beide Seiten n)' };
        }

        return { passed: true };
      },
    },
    {
      id: 13,
      number: 13,
      title: '🎉 Abschluss',
      theory: `<p><strong>Glückwunsch!</strong> Du hast alle Grundlagen-Quests abgeschlossen!</p>
        <p>Du hast gelernt: Entitätsklassen, Attribute, Primärschlüssel, Beziehungen, Kardinalitäten, Verbundschlüssel und Selbstbeziehungen zu modellieren.</p>`,
      objective: `<p>🏆 <strong>Fast geschafft – speichere dein Ergebnis!</strong></p>
        <ol>
          <li>Gib deinem ER-Modell in der Titelleiste einen <strong>Namen</strong> (z.B. "Schule")</li>
          <li>Klicke auf <strong>"JSON-Export"</strong> in der Titelleiste oben rechts und speichere die Datei</li>
          <li>Klicke auf <strong>"PNG-Export"</strong> und speichere das Bild</li>
        </ol>
        <p>Danach kannst du die Expertenquests im Menü starten!</p>`,
      validator: function () {
        // Quest 13 ist immer erfolgreich als Abschluss-Screen
        return { passed: true };
      },
    },
  ];

  // ---- Quest-Datenbank: EXPERTEN (8 Quests mit Musterlösungen) ----
  const expertenQuests = [
    {
      id: 1,
      number: 1,
      title: 'Hotel-Verwaltung',
      szenario: `<p>Ein kleines Hotel möchte seine Reservierungen sauber modellieren. Dafür werden Gäste, Zimmer und einzelne Buchungen getrennt verwaltet, damit nachvollziehbar bleibt, wer wann welches Zimmer reserviert hat.</p>
        <p>Lege die Entitätsklasse <strong>"Gast"</strong> mit den Attributen <strong>"Gastnummer"</strong>, <strong>"Vorname"</strong>, <strong>"Nachname"</strong>, <strong>"E-Mail"</strong> und <strong>"Telefon"</strong> an. Verwende <strong>"Gastnummer"</strong> als Primärschlüssel.</p>
        <p>Lege außerdem die Entitätsklasse <strong>"Zimmer"</strong> mit den Attributen <strong>"Zimmernummer"</strong>, <strong>"Kategorie"</strong> und <strong>"PreisProNacht"</strong> an. <strong>"Zimmernummer"</strong> ist der Primärschlüssel. Jede Reservierung wird als Entitätsklasse <strong>"Buchung"</strong> mit den Attributen <strong>"Buchungsnummer"</strong>, <strong>"Anreisedatum"</strong>, <strong>"Abreisedatum"</strong> und <strong>"AnzahlNaechte"</strong> modelliert; Primärschlüssel ist <strong>"Buchungsnummer"</strong>.</p>
        <p>Verbinde das Modell über die Beziehungen <strong>"bucht"</strong> zwischen <strong>"Gast"</strong> und <strong>"Buchung"</strong> mit Kardinalität <strong>1:n</strong> sowie <strong>"gilt für"</strong> zwischen <strong>"Zimmer"</strong> und <strong>"Buchung"</strong> ebenfalls mit <strong>1:n</strong>.</p>`,
      masterlösung: {
        entities: ['Gast', 'Zimmer', 'Buchung'],
        attributes: {
          Gast: ['Gastnummer', 'Vorname', 'Nachname', 'E-Mail', 'Telefon'],
          Zimmer: ['Zimmernummer', 'Kategorie', 'PreisProNacht'],
          Buchung: ['Buchungsnummer', 'Anreisedatum', 'Abreisedatum', 'AnzahlNaechte'],
        },
        primaryKeys: {
          Gast: 'Gastnummer',
          Zimmer: 'Zimmernummer',
          Buchung: 'Buchungsnummer',
        },
        relationships: [
          { name: 'bucht', from: 'Gast', to: 'Buchung', cardinality: '1:n' },
          { name: 'gilt für', from: 'Zimmer', to: 'Buchung', cardinality: '1:n' },
        ],
      },
      validator: function () {
        return validateExpertQuest(this.masterlösung);
      },
    },
    {
      id: 2,
      number: 2,
      title: 'Bibliothek',
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
      validator: function () {
        return validateExpertQuest(this.masterlösung);
      },
    },
    {
      id: 3,
      number: 3,
      title: 'Universität / Studiendekan',
      szenario: `<p>Ein Universitätssystem soll so modelliert werden, dass klar sichtbar wird, welche Studenten an welchen Vorlesungen teilnehmen und welcher Professor die jeweilige Lehrveranstaltung verantwortet. Für die Studierenden sollen Matrikelnummer, Vorname, Nachname und E-Mail erfasst werden. Für jede Vorlesung werden Vorlesungscode, Titel, Kreditpunkte und Wochenstunden gespeichert. Professoren werden mit ProfessorenKürzel, Name und Fachgebiet geführt.</p>
        <p>Damit die Teilnahme historisch nachvollziehbar bleibt, soll jede einzelne Teilnahme als eigener Vorgang erfasst werden. Dafür wird eine Belegung mit Belegnummer, Semester, Status und Note gespeichert. Ein Student kann im Laufe seines Studiums mehrere Belegungen haben, jede Belegung gehört aber genau zu einem Studenten (belegt). Eine Vorlesung kann in vielen Belegungen vorkommen, jede einzelne Belegung bezieht sich jedoch auf genau eine Vorlesung (gilt für). Ein Professor kann mehrere Vorlesungen unterrichten, während jede Vorlesung genau einem Professor zugeordnet ist (unterrichtet).</p>`,
      masterlösung: {
        entities: ['Student', 'Vorlesung', 'Professor', 'Belegung'],
        attributes: {
          Student: ['Matrikelnummer', 'Vorname', 'Nachname', 'E-Mail'],
          Vorlesung: ['Vorlesungscode', 'Titel', 'Kreditpunkte', 'Wochenstunden'],
          Professor: ['ProfessorenKürzel', 'Name', 'Fachgebiet'],
          Belegung: ['Belegnummer', 'Semester', 'Status', 'Note'],
        },
        primaryKeys: {
          Student: 'Matrikelnummer',
          Vorlesung: 'Vorlesungscode',
          Professor: 'ProfessorenKürzel',
          Belegung: 'Belegnummer',
        },
        relationships: [
          { name: 'belegt', from: 'Student', to: 'Belegung', cardinality: '1:n' },
          { name: 'gilt für', from: 'Vorlesung', to: 'Belegung', cardinality: '1:n' },
          { name: 'unterrichtet', from: 'Professor', to: 'Vorlesung', cardinality: '1:n' },
        ],
      },
      validator: function () {
        return validateExpertQuest(this.masterlösung);
      },
    },
    {
      id: 4,
      number: 4,
      title: 'Krankenhaus-System',
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
      validator: function () {
        return validateExpertQuest(this.masterlösung);
      },
    },
    {
      id: 5,
      number: 5,
      title: 'Fitnessstudio-Kursplanung',
      szenario: `<p>Ein Fitnessstudio möchte seine Kursorganisation so abbilden, dass sichtbar wird, welche Mitglieder an welchen Kursen teilnehmen und welche Trainer welche Kurse übernehmen. Für Mitglied sollen Mitgliedsnummer, Name, Telefonnummer und E-Mail gespeichert werden. Für Kurs werden Kurscode, Titel, Schwierigkeitsstufe und Maximalplätze erfasst. Für Trainer sollen Trainerkürzel, Name und Lizenz geführt werden.</p>
        <p>Ein Mitglied kann im Laufe der Zeit mehrere Kurse belegen, und ein Kurs kann von vielen Mitgliedern besucht werden (belegt). Zu jeder Belegung soll zusätzlich das Anmeldedatum festgehalten werden. Ebenso kann ein Trainer mehrere Kurse leiten, während ein Kurs auch von mehreren Trainern betreut werden kann (leitet). Zu dieser Zuordnung soll der Wochentag dokumentiert werden.</p>`,
      masterlösung: {
        entities: ['Mitglied', 'Kurs', 'Trainer'],
        attributes: {
          Mitglied: ['Mitgliedsnummer', 'Name', 'Telefonnummer', 'E-Mail'],
          Kurs: ['Kurscode', 'Titel', 'Schwierigkeitsstufe', 'Maximalplätze'],
          Trainer: ['Trainerkürzel', 'Name', 'Lizenz'],
        },
        primaryKeys: {
          Mitglied: 'Mitgliedsnummer',
          Kurs: 'Kurscode',
          Trainer: 'Trainerkürzel',
        },
        relationships: [
          { name: 'belegt', from: 'Mitglied', to: 'Kurs', cardinality: 'n:m', attributes: ['Anmeldedatum'] },
          { name: 'leitet', from: 'Trainer', to: 'Kurs', cardinality: 'n:m', attributes: ['Wochentag'] },
        ],
      },
      validator: function () {
        return validateExpertQuest(this.masterlösung);
      },
    },
    {
      id: 6,
      number: 6,
      title: 'Lehre und Hilfskräfte',
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
      validator: function () {
        return validateExpertQuest(this.masterlösung);
      },
    },
    {
      id: 7,
      number: 7,
      title: 'Musikfestival-Organisation',
      szenario: `<p>Ein großes Musikfestival soll so modelliert werden, dass klar wird, welche Künstler wann auftreten, auf welcher Bühne ein Auftritt stattfindet und wie Crewmitglieder die Abläufe unterstützen. Für Künstler werden Künstlercode, Name und Genre gespeichert. Für Bühne sollen Bühnenname, Kapazität und Bereich geführt werden. Für Crewmitglied werden Crewnummer, Name und Rolle erfasst.</p>
        <p>Ein geplanter Auftritt soll nicht über eine künstliche Einzel-ID, sondern über einen Verbundschlüssel aus Bühnenname, Datum und Startzeit eindeutig sein. Zusätzlich werden beim Auftritt die Attribute Endzeit und Status gespeichert. Ein Künstler kann mehrere Auftritte haben, jeder Auftritt gehört aber genau zu einem Künstler (spielt). Eine Bühne kann viele Auftritte haben, jeder Auftritt findet aber genau auf einer Bühne statt (findet statt auf).</p>
        <p>Auch bei der Crew gibt es mehrere Zusammenhänge: Ein Crewmitglied kann mehrere Bühnen betreuen, und jede Bühne wird von mehreren Crewmitgliedern betreut (betreut). Außerdem gibt es eine Hierarchie innerhalb der Crew: Ein Crewmitglied kann andere Crewmitglieder einarbeiten, und ein Crewmitglied kann wiederum von mehreren erfahrenen Kolleginnen und Kollegen eingearbeitet werden (arbeitet ein).</p>`,
      masterlösung: {
        entities: ['Künstler', 'Bühne', 'Auftritt', 'Crewmitglied'],
        attributes: {
          Künstler: ['Künstlercode', 'Name', 'Genre'],
          Bühne: ['Bühnenname', 'Kapazität', 'Bereich'],
          Auftritt: ['Bühnenname', 'Datum', 'Startzeit', 'Endzeit', 'Status'],
          Crewmitglied: ['Crewnummer', 'Name', 'Rolle'],
        },
        primaryKeys: {
          Künstler: 'Künstlercode',
          Bühne: 'Bühnenname',
          Auftritt: ['Bühnenname', 'Datum', 'Startzeit'],
          Crewmitglied: 'Crewnummer',
        },
        relationships: [
          { name: 'spielt', from: 'Künstler', to: 'Auftritt', cardinality: '1:n' },
          { name: 'findet statt auf', from: 'Auftritt', to: 'Bühne', cardinality: 'n:1' },
          { name: 'betreut', from: 'Crewmitglied', to: 'Bühne', cardinality: 'n:m' },
          { name: 'arbeitet ein', from: 'Crewmitglied', to: 'Crewmitglied', cardinality: 'n:m' },
        ],
      },
      validator: function () {
        return validateExpertQuest(this.masterlösung);
      },
    },
    {
      id: 8,
      number: 8,
      title: 'Katastrophenschutz-Leitstelle',
      szenario: `<p>Eine regionale Leitstelle möchte Einsätze im Katastrophenschutz so modellieren, dass sichtbar wird, welche Einsatzkräfte in welchen Teams organisiert sind, welche Einsätze von welchen Teams übernommen werden und welche Fahrzeuge dabei eingesetzt werden. Für Einsatzkraft werden Funkrufname, Name, Qualifikation und Telefonnummer gespeichert. Teams werden mit Teamname, Standort und Bereitschaftsstufe geführt. Fahrzeuge werden über Kennzeichen, Fahrzeugtyp und Kapazität verwaltet.</p>
        <p>Zwischen Einsatzkraft und Team gibt es zwei unterschiedliche Beziehungen. Jede Einsatzkraft gehört genau zu einem Team, ein Team kann jedoch viele Einsatzkräfte umfassen (gehört zu). Zusätzlich hat jedes Team genau eine Einsatzleitung, und eine Einsatzkraft kann die Leitung für mehrere Teams übernehmen (leitet). Außerdem soll die fachliche Einarbeitung abgebildet werden: Eine erfahrene Einsatzkraft kann mehrere andere Einsatzkräfte einarbeiten, und jede eingearbeitete Einsatzkraft kann wiederum später andere einarbeiten (arbeitet ein).</p>
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
      validator: function () {
        return validateExpertQuest(this.masterlösung);
      },
    },
    {
      id: 9,
      number: 9,
      title: '🎉 Abschluss',
      szenario: `<p><strong>Glückwunsch!</strong> Du hast alle Expertenquests abgeschlossen.</p>
        <p>Du kannst jetzt auch komplexe Aufgaben im ER-Modell erfolgreich bearbeiten - mit 1:n-, n:m- und 1:1-Beziehungen, Beziehungsattributen, Verbundschlüsseln und Selbstbeziehungen.</p>
        <p>Starke Leistung!</p>`,
      validator: function () {
        // Quest 9 ist immer erfolgreich als Abschluss-Screen
        return { passed: true };
      },
    },
  ];

  // ---- Quest Manager ----
  // Hilfsfunktionen für Relmodel-Grundlagen-Validatoren
  function normalizeRelToken(name) {
    return String(name || '')
      .toLowerCase()
      .replace(/[\s_-]+/g, '')
      .trim();
  }

  function getStudentRelByName(name) {
    const rels = window.RelModel?.getStudentRelations?.() || [];
    const n = normalizeRelToken(name);
    return rels.find((r) => normalizeRelToken(r.name) === n) || null;
  }

  function studentRelHasAttr(relName, attrName) {
    const rel = getStudentRelByName(relName);
    if (!rel) return false;
    const n = normalizeRelToken(attrName);
    return rel.attrs.some((a) => normalizeRelToken(a.name) === n);
  }

  function studentRelAttrIsPk(relName, attrName) {
    const rel = getStudentRelByName(relName);
    if (!rel) return false;
    const n = normalizeRelToken(attrName);
    const attr = rel.attrs.find((a) => normalizeRelToken(a.name) === n);
    return !!attr?.isPk;
  }

  function studentRelAttrIsFk(relName, attrName) {
    const rel = getStudentRelByName(relName);
    if (!rel) return false;
    const n = normalizeRelToken(attrName);
    const attr = rel.attrs.find((a) => normalizeRelToken(a.name) === n);
    return !!attr?.isFk;
  }

  function countStudentRelations() {
    return (window.RelModel?.getStudentRelations?.() || []).length;
  }

  /**
   * Liefert eine Checkliste für Relmodel-Experten-Quests.
   * Liest die Musterlösung aus RelModel.generateSolution() und
   * vergleicht sie mit den studentischen Eingaben.
   */
  function getRelmodelChecklistStatus() {
    const solution = window.RelModel?.generateSolution?.(window.AppState?.state) || [];
    const studentRels = window.RelModel?.getStudentRelations?.() || [];
    if (solution.length === 0) return null;

    const relations = { total: 0, done: 0, items: [] };
    const attributes = { total: 0, done: 0, items: [] };
    const primaryKeys = { total: 0, done: 0, items: [] };
    const foreignKeys = { total: 0, done: 0, items: [] };

    for (const solRel of solution) {
      relations.total++;
      const sn = normalizeRelToken(solRel.name);
      const studRel = studentRels.find((r) => normalizeRelToken(r.name) === sn);
      const found = !!studRel;
      if (found) relations.done++;
      relations.items.push({ label: solRel.name, ok: found });

      if (!studRel) continue;

      // Nicht-FK-Attribute (Pflicht)
      for (const attr of solRel.attrs.filter((a) => !a.isFk)) {
        attributes.total++;
        const ok = studRel.attrs.some((a) => normalizeRelToken(a.name) === normalizeRelToken(attr.name));
        if (ok) attributes.done++;
        attributes.items.push({ label: `${solRel.name}.${attr.name}`, ok });
      }

      // Primärschlüssel
      for (const attr of solRel.attrs.filter((a) => a.isPk)) {
        primaryKeys.total++;
        const studAttr = studRel.attrs.find((a) => normalizeRelToken(a.name) === normalizeRelToken(attr.name));
        const ok = !!studAttr?.isPk;
        if (ok) primaryKeys.done++;
        primaryKeys.items.push({ label: `${solRel.name}.${attr.name}`, ok });
      }

      // Fremdschlüssel
      for (const attr of solRel.attrs.filter((a) => a.isFk)) {
        foreignKeys.total++;
        const studAttr = studRel.attrs.find((a) => normalizeRelToken(a.name) === normalizeRelToken(attr.name));
        const ok = !!studAttr?.isFk;
        if (ok) foreignKeys.done++;
        foreignKeys.items.push({ label: `${solRel.name}.${attr.name}`, ok });
      }
    }

    return { relations, attributes, primaryKeys, foreignKeys };
  }

  // ---- Quest-Datenbank: RELMODEL GRUNDLAGEN (10 Quests) ----
  const relmodelGrundlagenQuests = [
    {
      id: 1,
      number: 1,
      title: 'Seitenleiste öffnen',
      theory: `<p><strong>Relationenmodell:</strong> Im Relationenmodell werden Daten in Tabellen (Relationen) organisiert. Jede Tabelle hat Spalten (Attribute) und Zeilen (Datensätze). Primärschlüssel identifizieren jede Zeile eindeutig.</p>
        <p>Die Überführung eines ER-Modells in ein Relationenmodell ist ein wichtiger Schritt beim Datenbank-Entwurf.</p>`,
      objective: `<p>Öffne die Relationenmodell-Seitenleiste, um mit der Überführung zu beginnen.</p>
        <p>Klicke dazu auf den Button <strong>„🗃 Relationenmodell"</strong> oben rechts in der Tab-Leiste.</p>`,
      validator: function () {
        // Suche nach dem Drawer UI-Element selbst und prüfe mehrere Möglichkeiten
        const drawer = document.getElementById('relmodel-drawer');
        if (!drawer)
          return { passed: false, error: 'Öffne die Relationenmodell-Seitenleiste über den Button oben rechts.' };

        // Prüfe ob Drawer sichtbar ist
        const isVisible = !drawer.classList.contains('collapsed') && drawer.offsetHeight > 0;
        if (!isVisible) {
          return { passed: false, error: 'Öffne die Relationenmodell-Seitenleiste über den Button oben rechts.' };
        }
        return { passed: true };
      },
    },
    {
      id: 2,
      number: 2,
      title: 'Relationen anlegen',
      theory: `<p><strong>Entitätsklasse → Relation:</strong> Jede Entitätsklasse im ER-Modell wird zu einer eigenen Relation (Tabelle) im Relationenmodell. Der Name der Entitätsklasse wird zum Relationsnamen.</p>`,
      objective: `<p>Lege die Relationen (Tabellen) für die drei Entitätsklassen des Schul-ERM an.</p>
        <p>Erstelle drei Relationen mit den Namen:</p>
        <ol>
          <li><strong>„Schüler"</strong></li>
          <li><strong>„Klasse"</strong></li>
          <li><strong>„Lehrer"</strong></li>
        </ol>
        <p><strong>Hinweis:</strong> Klicke auf „+ Relation hinzufügen" in der Seitenleiste.</p>`,
      validator: function () {
        if (!getStudentRelByName('Schüler')) return { passed: false, error: 'Relation „Schüler" fehlt.' };
        if (!getStudentRelByName('Klasse')) return { passed: false, error: 'Relation „Klasse" fehlt.' };
        if (!getStudentRelByName('Lehrer')) return { passed: false, error: 'Relation „Lehrer" fehlt.' };
        return { passed: true };
      },
    },
    {
      id: 3,
      number: 3,
      title: 'Attribute hinzufügen',
      theory: `<p><strong>Attribute → Spalten:</strong> Die Attribute einer Entitätsklasse im ER-Modell werden zu den Spalten der entsprechenden Relation im Relationenmodell.</p>`,
      objective: `<p>Füge die Attribute der drei Entitätsklassen in die entsprechenden Relationen ein.</p>
        <ul>
          <li><strong>Schüler:</strong> SchülerNr, Vorname, Nachname</li>
          <li><strong>Klasse:</strong> Klassenstufe, Parallelklasse</li>
          <li><strong>Lehrer:</strong> Lehrer-Kürzel, Vorname, Nachname</li>
        </ul>`,
      validator: function () {
        for (const attr of ['SchülerNr', 'Vorname', 'Nachname']) {
          if (!studentRelHasAttr('Schüler', attr))
            return { passed: false, error: `Attribut „${attr}" fehlt bei der Relation „Schüler".` };
        }
        for (const attr of ['Klassenstufe', 'Parallelklasse']) {
          if (!studentRelHasAttr('Klasse', attr))
            return { passed: false, error: `Attribut „${attr}" fehlt bei der Relation „Klasse".` };
        }
        for (const attr of ['Lehrer-Kürzel', 'Vorname', 'Nachname']) {
          if (!studentRelHasAttr('Lehrer', attr))
            return { passed: false, error: `Attribut „${attr}" fehlt bei der Relation „Lehrer".` };
        }
        return { passed: true };
      },
    },
    {
      id: 4,
      number: 4,
      title: 'Primärschlüssel markieren',
      theory: `<p><strong>Primärschlüssel (PS):</strong> Die Primärschlüssel aus dem ER-Modell werden auch im Relationenmodell als Primärschlüssel markiert. Sie identifizieren jede Zeile eindeutig.</p>
        <p>Ein <strong>Verbundschlüssel</strong> besteht aus mehreren Attributen, die zusammen den Primärschlüssel bilden (z.B. Klassenstufe + Parallelklasse).</p>`,
      objective: `<p>Markiere die Primärschlüssel in den drei Relationen.</p>
        <ul>
          <li><strong>Schüler:</strong> SchülerNr (PS)</li>
          <li><strong>Klasse:</strong> Klassenstufe + Parallelklasse (Verbundschlüssel, beide PS)</li>
          <li><strong>Lehrer:</strong> Lehrer-Kürzel (PS)</li>
        </ul>`,
      validator: function () {
        if (!studentRelAttrIsPk('Schüler', 'SchülerNr'))
          return { passed: false, error: '„SchülerNr" muss bei „Schüler" als Primärschlüssel markiert sein.' };
        if (!studentRelAttrIsPk('Klasse', 'Klassenstufe'))
          return { passed: false, error: '„Klassenstufe" muss bei „Klasse" als Primärschlüssel markiert sein.' };
        if (!studentRelAttrIsPk('Klasse', 'Parallelklasse'))
          return { passed: false, error: '„Parallelklasse" muss bei „Klasse" als Primärschlüssel markiert sein.' };
        if (!studentRelAttrIsPk('Lehrer', 'Lehrer-Kürzel'))
          return { passed: false, error: '„Lehrer-Kürzel" muss bei „Lehrer" als Primärschlüssel markiert sein.' };
        return { passed: true };
      },
    },
    {
      id: 5,
      number: 5,
      title: '1:n-Beziehung „geht in"',
      theory: `<p><strong>1:n-Beziehung auflösen:</strong> Bei einer 1:n-Beziehung wird der Primärschlüssel der 1-Seite als <strong>Fremdschlüssel (FS)</strong> in die Relation der n-Seite aufgenommen.</p>
        <p>Wichtig: Hat die 1-Seite einen <strong>Verbundschlüssel</strong>, wird <strong>immer der gesamte Primärschlüssel</strong> als Fremdschlüssel übernommen, also <strong>alle</strong> beteiligten Attribute.</p>
        <p>Beispiel: Ein Schüler geht in <em>eine</em> Klasse (1-Seite), aber eine Klasse hat <em>viele</em> Schüler (n-Seite). → Der PS von Klasse (Klassenstufe, Parallelklasse) wird als FS in die Relation Schüler aufgenommen.</p>`,
      objective: `<p>Löse die 1:n-Beziehung „geht in" (Schüler n : 1 Klasse) auf.</p>
        <p>Füge bei der Relation <strong>„Schüler"</strong> die Fremdschlüssel <strong>„Klassenstufe"</strong> und <strong>„Parallelklasse"</strong> hinzu und markiere sie als <strong>Fremdschlüssel (FS)</strong>.</p>`,
      validator: function () {
        if (!studentRelHasAttr('Schüler', 'Klassenstufe'))
          return { passed: false, error: '„Klassenstufe" fehlt als Fremdschlüssel bei „Schüler".' };
        if (!studentRelHasAttr('Schüler', 'Parallelklasse'))
          return { passed: false, error: '„Parallelklasse" fehlt als Fremdschlüssel bei „Schüler".' };
        if (!studentRelAttrIsFk('Schüler', 'Klassenstufe'))
          return { passed: false, error: '„Klassenstufe" muss bei „Schüler" als Fremdschlüssel markiert sein.' };
        if (!studentRelAttrIsFk('Schüler', 'Parallelklasse'))
          return { passed: false, error: '„Parallelklasse" muss bei „Schüler" als Fremdschlüssel markiert sein.' };
        return { passed: true };
      },
    },
    {
      id: 6,
      number: 6,
      title: '1:1-Beziehung „ist Klassensprecher"',
      theory: `<p><strong>1:1-Beziehung auflösen:</strong> Bei einer 1:1-Beziehung wird der Primärschlüssel <em>einer</em> Seite als Fremdschlüssel in die <em>andere</em> Seite aufgenommen.</p>
        <p>Die Richtung ist frei wählbar – entweder Seite A bekommt den Fremdschlüssel von B, oder umgekehrt. <br><strong>Wichtig:</strong> Es wird immer nur <strong>eine</strong> Richtung gewählt, nicht beide gleichzeitig.</p>`,
      objective: `<p>Löse die 1:1-Beziehung „ist Klassensprecher" (Schüler 1 : 1 Klasse) auf.</p>
        <p>Füge bei der Relation <strong>„Klasse"</strong> den Fremdschlüssel <strong>„SchülerNr"</strong> hinzu und markiere ihn als <strong>FS</strong>.</p>
        <p><em>Alternativ könntest du auch Klassenstufe + Parallelklasse als FS in Schüler einfügen – hier verwenden wir die Variante mit SchülerNr in Klasse.</em></p>`,
      validator: function () {
        // Akzeptiere beide Richtungen
        const klHatSchuelerNr = studentRelHasAttr('Klasse', 'SchülerNr') && studentRelAttrIsFk('Klasse', 'SchülerNr');
        // Alternative: Schüler hat Klassenstufe+Parallelklasse als FK (das haben sie aber schon von Quest 5)
        // Wir prüfen, ob die Relation Klasse den FK SchülerNr hat
        if (klHatSchuelerNr) return { passed: true };
        return { passed: false, error: 'Füge „SchülerNr" als Fremdschlüssel zur Relation „Klasse" hinzu.' };
      },
    },
    {
      id: 7,
      number: 7,
      title: 'n:m-Beziehung „unterrichtet"',
      theory: `<p><strong>n:m-Beziehung auflösen:</strong> Eine n:m-Beziehung kann nicht direkt in eine bestehende Relation aufgenommen werden. Stattdessen wird eine <strong>neue Hilfsrelation</strong> (auch: Zwischentabelle) erstellt.</p>
        <p>Die Hilfsrelation erhält die Primärschlüssel beider beteiligten Entitätsklassen als <strong>Fremdschlüssel</strong>. Zusammen bilden diese den <strong>Primärschlüssel (Verbundschlüssel)</strong> der Hilfsrelation.</p>`,
      objective: `<p>Löse die n:m-Beziehung „unterrichtet" (Lehrer n : m Klasse) auf.</p>
        <ol>
          <li>Erstelle eine neue Relation <strong>„unterrichtet"</strong></li>
          <li>Füge die Attribute <strong>„Lehrer-Kürzel"</strong>, <strong>„Klassenstufe"</strong> und <strong>„Parallelklasse"</strong> hinzu</li>
          <li>Markiere alle drei als <strong>Primärschlüssel (PS)</strong> und <strong>Fremdschlüssel (FS)</strong></li>
        </ol>`,
      validator: function () {
        const rel = getStudentRelByName('unterrichtet');
        if (!rel) return { passed: false, error: 'Relation „unterrichtet" fehlt.' };
        for (const attr of ['Lehrer-Kürzel', 'Klassenstufe', 'Parallelklasse']) {
          if (!studentRelHasAttr('unterrichtet', attr))
            return { passed: false, error: `Attribut „${attr}" fehlt bei „unterrichtet".` };
          if (!studentRelAttrIsPk('unterrichtet', attr))
            return { passed: false, error: `„${attr}" muss bei „unterrichtet" als Primärschlüssel markiert sein.` };
          if (!studentRelAttrIsFk('unterrichtet', attr))
            return { passed: false, error: `„${attr}" muss bei „unterrichtet" als Fremdschlüssel markiert sein.` };
        }
        return { passed: true };
      },
    },
    {
      id: 8,
      number: 8,
      title: 'Beziehungsattribut „Fach"',
      theory: `<p><strong>Beziehungsattribute:</strong> Attribute, die im ER-Modell an einer Beziehung hängen, werden in die entsprechende Hilfsrelation (bei n:m) oder in die Relation der n-Seite (bei 1:n) übernommen.</p>
        <p>Das Attribut „Fach" gehört zur Beziehung „unterrichtet" und wird daher in die Hilfsrelation „unterrichtet" aufgenommen.</p>
        <p><strong>Faustregel:</strong> Beziehungsattribute wandern immer dorthin, wo auch die Fremdschlüssel hin wandern.</p>`,
      objective: `<p>Füge das Beziehungsattribut zur Hilfsrelation hinzu.</p>
        <p>Ergänze bei der Relation <strong>„unterrichtet"</strong> das Attribut <strong>„Fach"</strong>.</p>
        <p><em>Beziehungsattribute sind reguläre Attribute – kein PS und kein FS.</em></p>`,
      validator: function () {
        if (!studentRelHasAttr('unterrichtet', 'Fach'))
          return { passed: false, error: 'Attribut „Fach" fehlt bei der Relation „unterrichtet".' };
        return { passed: true };
      },
    },
    {
      id: 9,
      number: 9,
      title: 'Selbstbeziehung „ist befreundet mit"',
      theory: `<p><strong>Selbstbeziehung auflösen:</strong> Selbstbeziehungen werden genau wie andere Beziehungen aufgelöst. Bei einer n:m-Selbstbeziehung entsteht eine Hilfsrelation, in der derselbe Primärschlüssel zweimal vorkommt – einmal für jede Seite der Beziehung.</p>
        <p>Da beide Fremdschlüssel auf dieselbe Relation verweisen, müssen sie <strong>umbenannt</strong> werden, damit sie sich unterscheiden (z.B. „SchülerNr" und „SchülerNr-Freund").</p>`,
      objective: `<p>Löse die n:m-Selbstbeziehung „ist befreundet mit" (Schüler n : m Schüler) auf.</p>
        <ol>
          <li>Erstelle eine neue Relation <strong>„ist befreundet mit"</strong></li>
          <li>Füge zwei Fremdschlüssel-Attribute hinzu, die beide auf SchülerNr verweisen (z.B. <strong>„SchülerNr"</strong> und <strong>„SchülerNr-Freund"</strong>)</li>
          <li>Markiere beide als <strong>PS</strong> und <strong>FS</strong></li>
        </ol>`,
      validator: function () {
        const rel = getStudentRelByName('ist befreundet mit');
        if (!rel) return { passed: false, error: 'Relation „ist befreundet mit" fehlt.' };
        // Muss mindestens 2 Attribute haben, die PK und FK sind
        const pkFkAttrs = rel.attrs.filter((a) => a.isPk && a.isFk);
        if (pkFkAttrs.length < 2)
          return {
            passed: false,
            error: '„ist befreundet mit" braucht mindestens zwei Attribute, die jeweils als PS und FS markiert sind.',
          };
        return { passed: true };
      },
    },
    {
      id: 10,
      number: 10,
      title: '🎉 Abschluss',
      theory: `<p><strong>Glückwunsch!</strong> Du hast die Überführung des ER-Modells in ein Relationenmodell erfolgreich abgeschlossen!</p>
        <p><strong>Du beherrschst jetzt:</strong></p>
        <ul>
          <li>Relationen anlegen</li>
          <li>Attribute übernehmen</li>
          <li>Primärschlüssel setzen</li>
          <li>1:n-Beziehungen auflösen (FS auf n-Seite)</li>
          <li>1:1-Beziehungen auflösen</li>
          <li>n:m-Beziehungen in Hilfsrelationen auflösen</li>
          <li>Beziehungsattribute übernehmen</li>
          <li>Selbstbeziehungen modellieren</li>
        </ul>`,
      objective: `<p>🏆 <strong>Fast geschafft – speichere dein Ergebnis!</strong></p>
        <ol>
          <li>Klicke auf <strong>„JSON-Export"</strong> in der Seitenleiste und speichere die Datei</li>
          <li>Klicke auf <strong>„PNG-Export"</strong> und speichere das Bild</li>
        </ol>
        <p>Danach kannst du die Relationenmodell-Expertenquests im Menü starten!</p>`,
      validator: function () {
        return { passed: true };
      },
    },
  ];

  // ---- Quest-Datenbank: RELMODEL EXPERTEN (9 Quests) ----
  const relmodelExpertenQuests = [
    {
      id: 1,
      number: 1,
      title: 'Hotel-Verwaltung',
      szenario: `<p><strong>Überführe das ER-Modell «Hotel-Verwaltung» in das Relationenmodell.</strong></p>
        <p>Erstelle die passenden Relationen in der Seitenleiste.</p>`,
      jsonFile: '01_hotel.json',
      validator: function () {
        return window.RelModel?.checkAndGetResult?.() || { passed: false };
      },
    },
    {
      id: 2,
      number: 2,
      title: 'Bibliothek',
      szenario: `<p><strong>Überführe das ER-Modell «Bibliothek» in das Relationenmodell.</strong></p>
        <p>Erstelle die passenden Relationen in der Seitenleiste.</p>`,
      jsonFile: '02_bibliothek.json',
      validator: function () {
        return window.RelModel?.checkAndGetResult?.() || { passed: false };
      },
    },
    {
      id: 3,
      number: 3,
      title: 'Universität',
      szenario: `<p><strong>Überführe das ER-Modell «Universität» in das Relationenmodell.</strong></p>
        <p>Erstelle die passenden Relationen in der Seitenleiste.</p>`,
      jsonFile: '03_universitaet.json',
      validator: function () {
        return window.RelModel?.checkAndGetResult?.() || { passed: false };
      },
    },
    {
      id: 4,
      number: 4,
      title: 'Krankenhaus',
      szenario: `<p><strong>Überführe das ER-Modell «Krankenhaus» in das Relationenmodell.</strong></p>
        <p>Erstelle die passenden Relationen in der Seitenleiste.</p>`,
      jsonFile: '04_krankenhaus.json',
      validator: function () {
        return window.RelModel?.checkAndGetResult?.() || { passed: false };
      },
    },
    {
      id: 5,
      number: 5,
      title: 'Fitnessstudio',
      szenario: `<p><strong>Überführe das ER-Modell «Fitnessstudio» in das Relationenmodell.</strong></p>
        <p>Erstelle die passenden Relationen in der Seitenleiste.</p>`,
      jsonFile: '05_fitnessstudio.json',
      validator: function () {
        return window.RelModel?.checkAndGetResult?.() || { passed: false };
      },
    },
    {
      id: 6,
      number: 6,
      title: 'Lehre & Hilfskräfte',
      szenario: `<p><strong>Überführe das ER-Modell «Lehre & Hilfskräfte» in das Relationenmodell.</strong></p>
        <p>Erstelle die passenden Relationen in der Seitenleiste.</p>`,
      jsonFile: '06_universitaet2.json',
      validator: function () {
        return window.RelModel?.checkAndGetResult?.() || { passed: false };
      },
    },
    {
      id: 7,
      number: 7,
      title: 'Musikfestival',
      szenario: `<p><strong>Überführe das ER-Modell «Musikfestival» in das Relationenmodell.</strong></p>
        <p>Erstelle die passenden Relationen in der Seitenleiste.</p>`,
      jsonFile: '07_musikfestival.json',
      validator: function () {
        return window.RelModel?.checkAndGetResult?.() || { passed: false };
      },
    },
    {
      id: 8,
      number: 8,
      title: 'Katastrophenschutz-Leitstelle',
      szenario: `<p><strong>Überführe das ER-Modell «Katastrophenschutz-Leitstelle» in das Relationenmodell.</strong></p>
        <p>Erstelle die passenden Relationen in der Seitenleiste.</p>`,
      jsonFile: '08_katastrophenschutz.json',
      validator: function () {
        return window.RelModel?.checkAndGetResult?.() || { passed: false };
      },
    },
    {
      id: 9,
      number: 9,
      title: '🎉 Abschluss',
      szenario: `<p><strong>Glückwunsch!</strong> Du hast alle Relationenmodell-Expertenquests abgeschlossen.</p>
        <p>Du kannst jetzt ER-Modelle sicher und selbstständig in Relationenmodelle überführen – mit allen Beziehungstypen, Fremdschlüsseln und Hilfsrelationen.</p>
        <p>Starke Leistung!</p>`,
      validator: function () {
        return { passed: true };
      },
    },
  ];

  const QuestManager = {
    state: {
      questMode: null, // 'grundlagen' oder 'experten'
      currentQuestNumber: 1,
      completedQuests: [],
      unlockedQuests: [],
      questsPanelVisible: false,
    },

    getStorageKey: function (mode = this.state.questMode) {
      if (mode === 'experten') return 'erm-editor-quests-experten-v4';
      if (mode === 'relmodel-grundlagen') return 'erm-editor-quests-relmodel-grundlagen-v1';
      if (mode === 'relmodel-experten') return 'erm-editor-quests-relmodel-experten-v1';
      return 'erm-editor-quests-' + (mode || 'none') + '-v1';
    },

    init: function () {
      // Keine globale Quest lädt; init wird erst beim startQuestSeries aufgerufen
      this.state.unlockedQuests = [1];
    },

    persist: function () {
      const key = this.getStorageKey();
      // Speichere nur questMode, currentQuestNumber, completedQuests, unlockedQuests (nicht questsPanelVisible)
      const dataToSave = {
        currentQuestNumber: this.state.currentQuestNumber,
        completedQuests: this.state.completedQuests,
        unlockedQuests: this.state.unlockedQuests,
      };
      localStorage.setItem(key, JSON.stringify(dataToSave));
    },

    startQuestSeries: function (mode) {
      this.state.questMode = mode; // 'grundlagen' oder 'experten'

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

      // Unterdrücke initiale Validierung für ERM-Grundlagen und -Experten
      if (mode === 'grundlagen' || mode === 'experten') {
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
      if (mode === 'grundlagen') return grundlagenQuests;
      if (mode === 'experten') return expertenQuests;
      if (mode === 'relmodel-grundlagen') return relmodelGrundlagenQuests;
      if (mode === 'relmodel-experten') return relmodelExpertenQuests;
      return [];
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

          // Manuelle Wiederholung: Erfolg anzeigen, dann zur nächsten Quest navigieren
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

          // Modal → nächste Quest laden
          window.App?.showQuestSuccessModal?.(quest.number, () => {
            if (this.state.questMode !== 'relmodel-experten') {
              this.progressToNextQuest();
            }
            this.renderPanel();
            if (window.App?.updateQuestDots) window.App.updateQuestDots();
          });
        } else {
          // Keine untere Feedback-Leiste nutzen; bei manuellem Check stattdessen Modal-Hinweis.
          if (forceRecheck) {
            window.App?.showValidationFailedModal?.('Noch nicht korrekt. Versuche es erneut.', result.error);
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
        // Auto-load hook für Relmodel-Experten
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
      // Lösche alle Quest-Speicherungen für alle Reihen
      localStorage.removeItem('erm-editor-quests-grundlagen-v1');
      localStorage.removeItem('erm-editor-quests-experten-v1');
      localStorage.removeItem('erm-editor-quests-experten-v2');
      localStorage.removeItem('erm-editor-quests-experten-v3');
      localStorage.removeItem('erm-editor-quests-experten-v4');
      localStorage.removeItem('erm-editor-quests-relmodel-grundlagen-v1');
      localStorage.removeItem('erm-editor-quests-relmodel-experten-v1');

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
      if (!this.state.questMode) return;

      // Lösche alle Arbeitsststände für diese Questreihe aus localStorage
      const mode = this.state.questMode;
      const prefix = 'erm-editor-quest-work-v1';
      const maxQuests = this.getMaxQuests();

      // Für Grundlagen und Relmodel-Grundlagen: eine Key löschen
      if (mode === 'grundlagen') {
        localStorage.removeItem(`${prefix}:erm:grundlagen`);
      } else if (mode === 'relmodel-grundlagen') {
        localStorage.removeItem(`${prefix}:relmodel:grundlagen`);
        // Lösche auch alle Relationen-Speiche
        if (window.RelModel?.clearStorage) {
          window.RelModel.clearStorage(`${prefix}:relmodel:grundlagen`);
        }
      }
      // Für Experten und Relmodel-Experten: alle Quest-Keys löschen
      else if (mode === 'experten') {
        for (let i = 1; i <= maxQuests; i++) {
          localStorage.removeItem(`${prefix}:erm:experten:q${i}`);
        }
      } else if (mode === 'relmodel-experten') {
        for (let i = 1; i <= maxQuests; i++) {
          localStorage.removeItem(`${prefix}:relmodel:experten:q${i}`);
          // Lösche auch alle Relationen-Speicher für diese Quest
          if (window.RelModel?.clearStorage) {
            window.RelModel.clearStorage(`${prefix}:relmodel:experten:q${i}`);
          }
        }
      }

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
      if (this.state.questMode === 'experten') {
        const quest = this.getCurrentQuest();
        return quest?.masterlösung ? getExpertChecklistStatus(quest.masterlösung) : null;
      }
      if (this.state.questMode === 'relmodel-experten') {
        return getRelmodelChecklistStatus();
      }
      return null;
    },

    getHints: function () {
      if (this.state.questMode === 'experten') {
        const quest = this.getCurrentQuest();
        return quest?.masterlösung ? getExpertHints(quest.masterlösung) : [];
      }
      return [];
    },
  };

  // ---- Export ----
  window.Quest = QuestManager;
  // Liefert eine Quest-Definition nach Reihenname und Nummer (für Tooltips/Labels)
  QuestManager.getQuestByNumber = function (mode, number) {
    const quests = QuestManager.getQuestsForMode(mode);
    if (!Array.isArray(quests)) return null;
    return quests.find((q) => Number(q.number) === Number(number)) || null;
  };
  QuestManager.init();
  // Panel-Zustand nach Seitenneuladen wiederherstellen
  QuestManager.renderPanel();
})();
