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
      objective: `<p>Füge zur Entitätsklasse <strong>"Schüler"</strong> zwei weitere Attribute hinzu:</p>
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
              <li><strong>"Klassenstufe"</strong> (z.B. 5, 6, 7, 8...)</li>
              <li><strong>"Parallelklasse"</strong> (z.B. a, b, c...)</li>
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
          <li>Kardinalität: <strong>n:1</strong> (viele Schüler sind in einer Klasse)</li>
          <li><strong>"Schüler"</strong> auf der linken Seite, <strong>"Klasse"</strong> auf der rechten</li>
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
      theory: `<p><strong>Erweitern des Modells:</strong> Wir fügen eine dritte Entitätsklasse hinzu, um das Szenario realistischer zu machen.</p>`,
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
      theory: `<p><strong>Konsistenz:</strong> Alle Entitätsklassen müssen einen Primärschlüssel haben. Für Lehrer verwenden wir ein kurzes Kürzel als Kennzeichnung.</p>`,
      objective: `<ol>
          <li>Erstelle drei Attribute bei der Entitätsklasse <strong>"Lehrer"</strong>:
            <ul>
              <li><strong>"Lehrer-Kürzel"</strong> (z.B. MUS, MAN, BER)</li>
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
      theory: `<p><strong>Mehrere Beziehungen:</strong> Entitätsklassen können mit mehreren anderen Klassen in Beziehung stehen.</p>
        <ul>
          <li><strong>1:1</strong> (eins-zu-eins): Ein Schüler hat einen Schülerausweis, ein Schülerausweis gehört einem Schüler.</li>
          <li><strong>1:n</strong> (eins-zu-vielen): Eine Klasse hat viele Schüler, ein Schüler gehört zu einer Klasse.</li>
          <li><strong>n:m</strong> (viele-zu-vielen): Ein Lehrer unterrichtet viele Schüler, ein Schüler hat Unterricht bei vielen Lehrern. </li>
        </ul>
        <p><strong>Hinweis:</strong> n:m-Beziehungen werden später in der Datenbank zu einer eigenen Tabelle umgewandelt.</p>`,
      objective: `<p>Erstelle eine Beziehung zwischen <strong>"Lehrer"</strong> und <strong>"Klasse"</strong>:</p>
        <ol>
          <li>Name der Beziehung: <strong>"unterrichtet"</strong></li>
          <li>Kardinalität: <strong>n:m</strong> (ein Lehrer unterrichtet viele Klassen, eine Klasse hat Unterricht bei vielen Lehrern)</li>
          <li><strong>"Lehrer"</strong> auf der linken Seite, <strong>"Klasse"</strong> auf der rechten</li>
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
          <li>Kardinalität: <strong>n:m</strong> (ein Schüler kann viele Freunde haben)</li>
          <li>Verbinde die Beziehung auf <strong>beiden Seiten</strong> mit <strong>"Schüler"</strong></li>
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
        <p>Du hast gelernt: Entitätsklassen, Attribute, Primärschlüssel, Beziehungen, Kardinalitäten, Verbundschlüssel und Selbstbeziehungen zu modellieren.</p>
        <p>Bevor du mit den <strong>Expertenquests</strong> weitermachst: Speichere dein fertiges ER-Modell!</p>`,
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
      szenario: `<p>Eine Bibliothek möchte nicht nur Bücher, sondern auch einzelne Exemplare und Ausleihen erfassen. So kann sie nachverfolgen, welches konkrete Exemplar ausgeliehen wurde und wer es gerade besitzt.</p>
        <p>Modelliere die Entitätsklasse <strong>"Mitglied"</strong> mit den Attributen <strong>"Mitgliedsnummer"</strong>, <strong>"Name"</strong>, <strong>"Adresse"</strong> und <strong>"Telefonnummer"</strong>. Der Primärschlüssel ist <strong>"Mitgliedsnummer"</strong>.</p>
        <p>Für Bücher verwende die Entitätsklasse <strong>"Buch"</strong> mit <strong>"ISBN"</strong>, <strong>"Titel"</strong>, <strong>"Autor"</strong> und <strong>"Erscheinungsjahr"</strong>; Primärschlüssel ist <strong>"ISBN"</strong>. Jedes konkrete Buch wird als Entitätsklasse <strong>"Exemplar"</strong> mit <strong>"Inventarnummer"</strong>, <strong>"Anschaffungsdatum"</strong> und <strong>"Zustand"</strong> modelliert, wobei <strong>"Inventarnummer"</strong> der Primärschlüssel ist. Eine Ausleihe wird als Entitätsklasse <strong>"Ausleihe"</strong> mit <strong>"Ausleihnummer"</strong>, <strong>"Ausleihdatum"</strong>, <strong>"Fälligkeitsdatum"</strong> und <strong>"Rückgabedatum"</strong> angelegt; Primärschlüssel ist <strong>"Ausleihnummer"</strong>.</p>
        <p>Verknüpfe das Modell über <strong>"ist Exemplar von"</strong> zwischen <strong>"Exemplar"</strong> und <strong>"Buch"</strong> mit <strong>n:1</strong>, über <strong>"leiht aus"</strong> zwischen <strong>"Mitglied"</strong> und <strong>"Ausleihe"</strong> mit <strong>1:n</strong> sowie über <strong>"wird ausgeliehen in"</strong> zwischen <strong>"Exemplar"</strong> und <strong>"Ausleihe"</strong> mit <strong>1:n</strong>.</p>`,
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
      szenario: `<p>Ein Universitätssystem soll so modelliert werden, dass klar sichtbar wird, welche Studierenden welche Vorlesungen belegen und welcher Professor die jeweilige Vorlesung hält. Zusätzlich soll zu jeder Belegung das Semester und die spätere Leistung festgehalten werden.</p>
        <p>Lege dafür die Entitätsklasse Student mit den Attributen Matrikelnummer, Vorname, Nachname und E-Mail an; Matrikelnummer ist der Primärschlüssel. Für Lehrveranstaltungen verwende die Entitätsklasse Vorlesung mit Vorlesungscode, Titel, Kreditpunkte und Wochenstunden; Primärschlüssel ist Vorlesungscode. Professoren werden als Entitätsklasse Professor mit ProfessorenKürzel, Name und Fachgebiet modelliert; Primärschlüssel ist ProfessorenKürzel.</p>
        <p>Die Teilnahme an einer Vorlesung wird als Entitätsklasse Belegung mit den Attributen Belegnummer, Semester, Status und Note erfasst; Belegnummer dient als Primärschlüssel. Verbinde Student und Belegung über die Beziehung (belegt) mit 1:n, Vorlesung und Belegung über (gilt für) mit 1:n und Professor und Vorlesung über (unterrichtet) mit 1:n.</p>`,
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
      szenario: `<p>Ein Krankenhaus möchte dokumentieren, welche Patienten auf welchen Stationen liegen und welche Ärzte einzelne Behandlungen durchführen. Dazu sollen medizinische Maßnahmen separat von Stammdaten und Stationen modelliert werden.</p>
        <p>Verwende die Entitätsklasse Patient mit den Attributen Versicherungsnummer, Name, Geburtsdatum und Adresse; Primärschlüssel ist Versicherungsnummer. Ärzte werden als Entitätsklasse Arzt mit Personalnummer, Name und Fachbereich angelegt; Primärschlüssel ist Personalnummer. Für Stationen nutze die Entitätsklasse Station mit Stationscode, Name und Bettenzahl; Primärschlüssel ist Stationscode.</p>
        <p>Jede Maßnahme wird als Entitätsklasse Behandlung mit Behandlungsnummer, Datum, Diagnose und Medikation modelliert; Behandlungsnummer ist der Primärschlüssel. Verbinde Patient und Behandlung über (erhält) mit 1:n, Arzt und Behandlung über (führt durch) mit 1:n, Arzt und Station über (arbeitet auf) mit n:1 sowie Patient und Station über (liegt auf) mit n:1.</p>`,
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
      szenario: `<p>Ein Fitnessstudio bietet verschiedene Kurse an, die von Trainern geleitet und von Mitgliedern besucht werden. Da ein Mitglied mehrere Kurse belegen kann und umgekehrt ein Kurs von mehreren Mitgliedern besucht wird, stehen Mitglieder und Kurse in einer n:m-Beziehung zueinander. Ebenso können Trainer mehrere Kurse an verschiedenen Tagen übernehmen.</p>
        <p>Modelliere die Entitätsklasse Mitglied mit den Attributen Mitgliedsnummer, Name, Telefonnummer und E-Mail; Primärschlüssel ist Mitgliedsnummer. Kurse werden als Entitätsklasse Kurs mit Kurscode, Titel, Schwierigkeitsstufe und Maximalplätze erfasst; Primärschlüssel ist Kurscode. Trainer werden als Entitätsklasse Trainer mit Trainerkürzel, Name und Lizenz geführt; Primärschlüssel ist Trainerkürzel.</p>
        <p>Verbinde Mitglied und Kurs über (belegt) mit n:m und hänge das Beziehungsattribut Anmeldedatum an die Beziehung. Verbinde außerdem Trainer und Kurs über (leitet) mit n:m und hänge das Beziehungsattribut Wochentag an die Beziehung.</p>`,
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
      szenario: `<p>An einer Hochschule soll ein System modelliert werden, das die Zuordnung von Dozenten, studentischen Hilfskräften, Vorlesungen und Seminaren abbildet. Ein Dozent hält Vorlesungen und beschäftigt Hilfskräfte (HiWis). Jeder HiWi ist gleichzeitig ein eingeschriebener Student und leitet Seminare, die jeweils einer Vorlesung zugeordnet sind. Studierende können sowohl Vorlesungen als auch Seminare besuchen.</p>
        <p>Modelliere die Entitätsklasse Dozent mit Dozentenkürzel, Name und Fachgebiet; Primärschlüssel ist Dozentenkürzel. Studierende werden als Entitätsklasse Student mit Matrikelnummer, Name und E-Mail erfasst; Primärschlüssel ist Matrikelnummer. Hilfskräfte erhalten eine eigene Entitätsklasse Hilfskraft mit HiwiNummer, Stundenlohn und Vertragsbeginn; Primärschlüssel ist HiwiNummer. Vorlesungen werden als Entitätsklasse Vorlesung mit Vorlesungscode, Titel und Kreditpunkte modelliert; Primärschlüssel ist Vorlesungscode. Seminare erscheinen als Entitätsklasse Seminar mit Seminarnummer, Thema und Raum; Primärschlüssel ist Seminarnummer.</p>
        <p>Verbinde Dozent und Vorlesung über (hält) mit 1:n, Dozent und Hilfskraft über (hat Hilfskraft) mit 1:n, Student und Hilfskraft über (ist) mit 1:1, Seminar und Vorlesung über (gehört zu) mit n:1, Hilfskraft und Seminar über (leitet) mit 1:n, Student und Vorlesung über (besucht) mit n:m sowie Student und Seminar über (nimmt teil an) mit n:m.</p>`,
      masterlösung: {
        entities: ['Dozent', 'Student', 'Hilfskraft', 'Vorlesung', 'Seminar'],
        attributes: {
          Dozent: ['Dozentenkürzel', 'Name', 'Fachgebiet'],
          Student: ['Matrikelnummer', 'Name', 'E-Mail'],
          Hilfskraft: ['HiwiNummer', 'Stundenlohn', 'Vertragsbeginn'],
          Vorlesung: ['Vorlesungscode', 'Titel', 'Kreditpunkte'],
          Seminar: ['Seminarnummer', 'Thema', 'Raum'],
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
      szenario: `<p>Ein Musikfestival soll so modelliert werden, dass Künstler, Bühnen, Auftritte und Crewmitglieder abgebildet werden. Jeder Auftritt findet auf einer bestimmten Bühne an einem Datum zu einer Startzeit statt — diese drei Angaben zusammen identifizieren einen Auftritt eindeutig (Verbundschlüssel). Crewmitglieder arbeiten andere Crewmitglieder ein (Selbstbeziehung).</p>
        <p>Modelliere die Entitätsklasse Künstler mit Künstlername, Genre und Herkunftsland; Primärschlüssel ist Künstlername. Bühnen werden als Entitätsklasse Bühne mit Bühnenname, Kapazität und Standort erfasst; Primärschlüssel ist Bühnenname. Auftritte werden als Entitätsklasse Auftritt mit Bühnenname, Datum, Startzeit und Dauer modelliert; der Verbundschlüssel besteht aus Bühnenname, Datum und Startzeit. Crewmitglieder erscheinen als Entitätsklasse Crewmitglied mit CrewNummer, Name und Qualifikation; Primärschlüssel ist CrewNummer.</p>
        <p>Verbinde Künstler und Auftritt über (spielt) mit 1:n, Auftritt und Bühne über (findet statt auf) mit n:1, Crewmitglied und Auftritt über (betreut) mit n:m. Erstelle zusätzlich die Selbstbeziehung (arbeitet ein) bei Crewmitglied mit n:m — beide Seiten der Beziehung zeigen auf Crewmitglied.</p>`,
      masterlösung: {
        entities: ['Künstler', 'Bühne', 'Auftritt', 'Crewmitglied'],
        attributes: {
          Künstler: ['Künstlername', 'Genre', 'Herkunftsland'],
          Bühne: ['Bühnenname', 'Kapazität', 'Standort'],
          Auftritt: ['Bühnenname', 'Datum', 'Startzeit', 'Dauer'],
          Crewmitglied: ['CrewNummer', 'Name', 'Qualifikation'],
        },
        primaryKeys: {
          Künstler: 'Künstlername',
          Bühne: 'Bühnenname',
          Auftritt: ['Bühnenname', 'Datum', 'Startzeit'],
          Crewmitglied: 'CrewNummer',
        },
        relationships: [
          { name: 'spielt', from: 'Künstler', to: 'Auftritt', cardinality: '1:n' },
          { name: 'findet statt auf', from: 'Auftritt', to: 'Bühne', cardinality: 'n:1' },
          { name: 'betreut', from: 'Crewmitglied', to: 'Auftritt', cardinality: 'n:m' },
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
      szenario: `<p>Eine Katastrophenschutz-Leitstelle koordiniert Einsatzkräfte, Teams, Einsätze und Fahrzeuge. Jeder Einsatz wird durch Einsatzgebiet, Datum und Startzeit eindeutig identifiziert (Verbundschlüssel). Eine Einsatzkraft gehört zu genau einem Team, kann dieses aber auch leiten — es existieren also zwei verschiedene Beziehungen zwischen Einsatzkraft und Team. Erfahrene Einsatzkräfte arbeiten neue Einsatzkräfte ein (Selbstbeziehung).</p>
        <p>Modelliere die Entitätsklasse Einsatzkraft mit Dienstnummer, Name, Rang und Spezialgebiet; Primärschlüssel ist Dienstnummer. Teams werden als Entitätsklasse Team mit Teamcode, Bezeichnung und Einsatzgebiet erfasst; Primärschlüssel ist Teamcode. Einsätze werden als Entitätsklasse Einsatz mit Einsatzgebiet, Datum, Startzeit und Priorität modelliert; der Verbundschlüssel besteht aus Einsatzgebiet, Datum und Startzeit. Fahrzeuge erscheinen als Entitätsklasse Fahrzeug mit Kennzeichen, Typ und Kapazität; Primärschlüssel ist Kennzeichen.</p>
        <p>Verbinde Einsatzkraft und Team über (gehört zu) mit n:1 und über (leitet) mit 1:n. Verbinde Team und Einsatz über (bearbeitet) mit n:m sowie Einsatz und Fahrzeug über (nutzt) mit n:m. Erstelle zusätzlich die Selbstbeziehung (arbeitet ein) bei Einsatzkraft mit 1:n — beide Seiten der Beziehung zeigen auf Einsatzkraft.</p>`,
      masterlösung: {
        entities: ['Einsatzkraft', 'Team', 'Einsatz', 'Fahrzeug'],
        attributes: {
          Einsatzkraft: ['Dienstnummer', 'Name', 'Rang', 'Spezialgebiet'],
          Team: ['Teamcode', 'Bezeichnung', 'Einsatzgebiet'],
          Einsatz: ['Einsatzgebiet', 'Datum', 'Startzeit', 'Priorität'],
          Fahrzeug: ['Kennzeichen', 'Typ', 'Kapazität'],
        },
        primaryKeys: {
          Einsatzkraft: 'Dienstnummer',
          Team: 'Teamcode',
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
  ];

  // ---- Quest Manager ----
  const QuestManager = {
    state: {
      questMode: null, // 'grundlagen' oder 'experten'
      currentQuestNumber: 1,
      completedQuests: [],
      unlockedQuests: [],
      questsPanelVisible: false,
    },

    getStorageKey: function (mode = this.state.questMode) {
      const version = mode === 'experten' ? 'v3' : 'v1';
      return 'erm-editor-quests-' + (mode || 'none') + '-' + version;
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
      this.renderPanel();
    },

    getCurrentQuest: function () {
      const quests = this.state.questMode === 'grundlagen' ? grundlagenQuests : expertenQuests;
      return quests.find((q) => q.number === this.state.currentQuestNumber) || null;
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
        const maxQuests = this.state.questMode === 'grundlagen' ? 13 : 8;

        if (result.passed && quest.number === maxQuests && !forceRecheck) {
          return { passed: false };
        }

        if (result.passed) {
          if (quest.number === maxQuests) {
            if (this.state.questMode === 'experten') {
              this.completeCurrentQuest();
              window.App?.showQuestSuccessModal?.(quest.number, () => {
                window.App?.playFullscreenConfetti?.();
                this.hidePanel();
              });
              return { passed: true };
            }

            window.App?.playFullscreenConfetti?.();
            this.completeCurrentQuest();
            this.hidePanel();
            return { passed: true };
          }

          // Manuelle Wiederholung: Erfolg anzeigen, aber Fortschritt nicht verändern
          if (isAlreadyCompleted && forceRecheck) {
            window.App?.showQuestSuccessModal?.(quest.number, () => {
              if (this.progressToNextQuest()) {
                this.renderPanel();
              }
            });
            return { passed: true };
          }

          // Als abgeschlossen markieren
          this.completeCurrentQuest();

          // Modal → nächste Quest laden
          window.App?.showQuestSuccessModal?.(quest.number, () => {
            this.progressToNextQuest();
            this.renderPanel();
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
      const maxQuests = this.state.questMode === 'grundlagen' ? 13 : 8;
      if (this.state.currentQuestNumber < maxQuests) {
        this.state.currentQuestNumber += 1;
        const nextNumber = this.state.currentQuestNumber;
        if (!this.state.unlockedQuests.includes(nextNumber)) {
          this.state.unlockedQuests.push(nextNumber);
        }
        this.persist();
        return true;
      }
      return false; // Alle Quests abgeschlossen
    },

    jumpToQuest: function (number) {
      this.state.currentQuestNumber = number;
      if (!this.state.unlockedQuests.includes(number)) {
        this.state.unlockedQuests.push(number);
      }
      this.persist();
      return true;
    },

    resetAllProgress: function () {
      // Lösche alle Quest-Speicherungen für beide Reihen
      localStorage.removeItem('erm-editor-quests-grundlagen-v1');
      localStorage.removeItem('erm-editor-quests-experten-v1');
      localStorage.removeItem('erm-editor-quests-experten-v2');
      localStorage.removeItem('erm-editor-quests-experten-v3');

      this.state = {
        questMode: null,
        currentQuestNumber: 1,
        completedQuests: [],
        unlockedQuests: [1],
        questsPanelVisible: false,
      };
      this.hidePanel();
    },

    resetCurrentSeriesProgress: function () {
      if (!this.state.questMode) return;
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
    },

    hidePanel: function () {
      this.state.questsPanelVisible = false;
      this.persist();
      const panel = document.getElementById('quest-panel');
      if (panel) {
        panel.classList.remove('visible');
      }
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
      if (this.state.questMode !== 'experten') return null;
      const quest = this.getCurrentQuest();
      return quest?.masterlösung ? getExpertChecklistStatus(quest.masterlösung) : null;
    },

    getHints: function () {
      if (this.state.questMode !== 'experten') return [];
      const quest = this.getCurrentQuest();
      return quest?.masterlösung ? getExpertHints(quest.masterlösung) : [];
    },
  };

  // ---- Export ----
  window.Quest = QuestManager;
  QuestManager.init();
  // Panel-Zustand nach Seitenneuladen wiederherstellen
  QuestManager.renderPanel();
})();
