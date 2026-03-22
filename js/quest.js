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

  // ---- Quest-Datenbank: GRUNDLAGEN (13 Quests) ----
  const grundlagenQuests = [
    {
      id: 1,
      number: 1,
      title: 'Erste Entitätsklasse',
      theory: `<p><strong>Entitätsklasse:</strong> Ein Rechteck im ER-Modell, das eine Gruppe von ähnlichen Objekten der realen Welt darstellt. Beispiel: Student, Auto, Person.</p>`,
      objective: `<p>Erstelle eine Entitätsklasse mit dem exakten Namen <strong>"Schüler"</strong></p>`,
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
      objective: `<p>Füge zur Entitätsklasse "Schüler" zwei weitere Attribute hinzu:</p>
        <ol>
          <li>Attribut "Vorname"</li>
          <li>Attribut "Nachname"</li>
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
      objective: `<p>Aufgabe:</p>
        <ol>
          <li>Erstelle ein Attribut "SchülerNr" bei der Entitätsklasse "Schüler"</li>
          <li>Markiere "SchülerNr" als Primärschlüssel</li>
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
      objective: `<p>Aufgabe:</p>
        <ol>
          <li>Erstelle zwei Attribute bei der Entitätsklasse "Klasse":
            <ul>
              <li>"Klassenstufe" (z.B. 5, 6, 7, 8...)</li>
              <li>"Parallelklasse" (z.B. a, b, c...)</li>
            </ul>
          </li>
          <li>Markiere BEIDE als Primärschlüssel</li>
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
      objective: `<p>Erstelle eine Beziehung zwischen "Schüler" und "Klasse":</p>
        <ol>
          <li>Name der Beziehung: <strong>"geht in"</strong></li>
          <li>Kardinalität: <strong>n:1</strong> (viele Schüler sind in einer Klasse)</li>
          <li>Schüler auf der linken Seite, Klasse auf der rechten</li>
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
      objective: `<p>Aufgabe:</p>
        <ol>
          <li>Erstelle drei Attribute bei der Entitätsklasse "Lehrer":
            <ul>
              <li>"Lehrer-Kürzel" (Primärschlüssel, z.B. MUS, MAN, BER)</li>
              <li>"Vorname"</li>
              <li>"Nachname"</li>
            </ul>
          </li>
          <li>Markiere nur "Lehrer-Kürzel" als Primärschlüssel</li>
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
      objective: `<p>Erstelle eine Beziehung zwischen "Lehrer" und "Klasse":</p>
        <ol>
          <li>Name der Beziehung: <strong>"unterrichtet"</strong></li>
          <li>Kardinalität: <strong>n:m</strong> (ein Lehrer unterrichtet viele Klassen, eine Klasse hat Unterricht bei vielen Lehrern)</li>
          <li>Lehrer auf der linken Seite, Klasse auf der rechten</li>
          <li>Die Beziehung verbindet Lehrer mit dem Lehrer-Kürzel zu Klasse</li>
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
      objective: `<p>Aufgabe:</p>
        <ol>
          <li>Füge zur Beziehung <strong>"unterrichtet"</strong> ein Attribut mit dem Namen <strong>"Fach"</strong> hinzu</li>
          <li>Rechtklick auf die Beziehung → "Attribut hinzufügen"</li>
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
      theory: `<Zwischen><strong>Zusätzliche Beziehung:</strong> Zwischen denselben Entitätsklassen kann es mehrere unterschiedliche Beziehungen geben, wenn sie verschiedene Bedeutungen haben. Zwischen zwei Entitätsklassen sind also mehr als eine Beziehung möglich.</p>`,
      objective: `<p>Aufgabe:</p>
        <ol>
          <li>Erstelle eine NEUE Beziehung zwischen "Schüler" und "Klasse"</li>
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
      objective: `<p>Aufgabe:</p>
        <ol>
          <li>Erstelle eine <strong>Selbstbeziehung</strong> bei der Entitätsklasse "Schüler"</li>
          <li>Name der Beziehung: <strong>"ist befreundet mit"</strong></li>
          <li>Kardinalität: <strong>n:m</strong> (ein Schüler kann viele Freunde haben)</li>
          <li>Verbinde die Beziehung auf <strong>beiden Seiten</strong> mit "Schüler"</li>
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
          <li>Gib deinem ER-Modell in der Titelleiste einen Namen (z.B. "Schule")</li>
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
      szenario: `
        <p><strong>Szenario:</strong></p>
        <p>Ein Hotel verwaltet Zimmer und Gäste. Jedes Zimmer hat eine Nummern-ID, Kategorie (Einzeln, Doppel, Suite) und Preis pro Nacht.</p>
        <p>Jeder Gast hat eine ID, Vorname, Nachname, Adresse und Email.</p>
        <p>Ein Gast kann MEHRERE Zimmer über die Tage hinweg buchen. Eine Buchung dokumentiert: Gast, Zimmer, Ankunftsdatum, Abreisedatum, Anzahl Nächte.</p>
      `,
      masterlösung: {
        entities: ['Gast', 'Zimmer', 'Buchung'],
        attributes: {
          Gast: ['GastID', 'Vorname', 'Nachname', 'Adresse', 'Email'],
          Zimmer: ['ZimmerID', 'Kategorie', 'Preis'],
          Buchung: ['BuchungsID', 'Ankunftsdatum', 'Abreisedatum', 'AnzahlNaechte'],
        },
        primaryKeys: {
          Gast: 'GastID',
          Zimmer: 'ZimmerID',
          Buchung: 'BuchungsID',
        },
        relationships: [
          { name: 'tätigt', from: 'Gast', to: 'Buchung', cardinality: '1:n' },
          { name: 'wird gebucht in', from: 'Zimmer', to: 'Buchung', cardinality: '1:n' },
        ],
      },
    },
    {
      id: 2,
      number: 2,
      title: 'Krankenhaus-System',
      szenario: `
        <p><strong>Szenario:</strong></p>
        <p>Ein Krankenhaus behandelt Patienten. Jeder Patient (PatientID, Name, Geburtsdatum, Versicherungsnummer) wird von mehreren Ärzten (ArztID, Name, Fachbereich) behandelt.</p>
        <p>Eine Behandlung (BehandlungsID, Datum, Diagnose, Medikamente) bezieht sich auf einen Patient und Arzt.</p>
        <p>Ärzte arbeiten auf Stationen (StationsID, Name, Leiter). Patienten liegen in Stationen.</p>
      `,
      masterlösung: {
        entities: ['Patient', 'Arzt', 'Behandlung', 'Station'],
        attributes: {
          Patient: ['PatientID', 'Name', 'Geburtsdatum', 'Versicherungsnummer'],
          Arzt: ['ArztID', 'Name', 'Fachbereich'],
          Behandlung: ['BehandlungsID', 'Datum', 'Diagnose', 'Medikamente'],
          Station: ['StationsID', 'Name', 'Leiter'],
        },
        primaryKeys: {
          Patient: 'PatientID',
          Arzt: 'ArztID',
          Behandlung: 'BehandlungsID',
          Station: 'StationsID',
        },
        relationships: [
          { name: 'wird behandelt in', from: 'Patient', to: 'Behandlung', cardinality: '1:n' },
          { name: 'führt durch', from: 'Arzt', to: 'Behandlung', cardinality: '1:n' },
          { name: 'arbeitet auf', from: 'Arzt', to: 'Station', cardinality: 'n:1' },
          { name: 'liegt auf', from: 'Patient', to: 'Station', cardinality: 'n:1' },
        ],
      },
    },
    {
      id: 3,
      number: 3,
      title: 'Online-Shop',
      szenario: `
        <p><strong>Szenario:</strong></p>
        <p>Ein Online-Shop verkauft Produkte an Kunden.</p>
        <p>Kunden (KundenID, Vorname, Nachname, Email, Adresse) tätigen Bestellungen.</p>
        <p>Eine Bestellung (BestellID, Bestelldatum, Gesamtpreis) besteht aus mehreren Bestellpositionen.</p>
        <p>Eine Bestellposition (PositionsID, Menge, Stückpreis) bezieht sich auf ein Produkt.</p>
        <p>Produkte (ProduktID, Name, Beschreibung, Lagermenge) haben Kategorien (KategorieID, Name).</p>
      `,
      masterlösung: {
        entities: ['Kunde', 'Bestellung', 'Bestellposition', 'Produkt', 'Kategorie'],
        attributes: {
          Kunde: ['KundenID', 'Vorname', 'Nachname', 'Email', 'Adresse'],
          Bestellung: ['BestellID', 'Bestelldatum', 'Gesamtpreis'],
          Bestellposition: ['PositionsID', 'Menge', 'Stückpreis'],
          Produkt: ['ProduktID', 'Name', 'Beschreibung', 'Lagermenge'],
          Kategorie: ['KategorieID', 'Name'],
        },
        primaryKeys: {
          Kunde: 'KundenID',
          Bestellung: 'BestellID',
          Bestellposition: 'PositionsID',
          Produkt: 'ProduktID',
          Kategorie: 'KategorieID',
        },
        relationships: [
          { name: 'tätigt', from: 'Kunde', to: 'Bestellung', cardinality: '1:n' },
          { name: 'enthält', from: 'Bestellung', to: 'Bestellposition', cardinality: '1:n' },
          { name: 'bezieht sich auf', from: 'Bestellposition', to: 'Produkt', cardinality: 'n:1' },
          { name: 'gehört zu', from: 'Produkt', to: 'Kategorie', cardinality: 'n:1' },
        ],
      },
    },
    {
      id: 4,
      number: 4,
      title: 'Bibliothek',
      szenario: `
        <p><strong>Szenario:</strong></p>
        <p>Eine Öffentliche Bibliothek verleiht Bücher an Mitglieder.</p>
        <p>Mitglieder (MitgliedID, Name, Adresse, Telefon) leihen Exemplare aus.</p>
        <p>Ein Buch (BuchID, Titel, Autor, ISBN) kann mehrere Exemplare haben.</p>
        <p>Jedes Exemplar (ExemplarID, AnschaffungsDatum, Zustand) gehört zu einem Buch.</p>
        <p>Eine Ausleihe (AusleihID, AusleihDatum, FälligkeitsDatum, RückgabeDatum) dokumentiert wer welches Exemplar wann ausgeliehen/zurückgegeben hat.</p>
      `,
      masterlösung: {
        entities: ['Mitglied', 'Buch', 'Exemplar', 'Ausleihe'],
        attributes: {
          Mitglied: ['MitgliedID', 'Name', 'Adresse', 'Telefon'],
          Buch: ['BuchID', 'Titel', 'Autor', 'ISBN'],
          Exemplar: ['ExemplarID', 'AnschaffungsDatum', 'Zustand'],
          Ausleihe: ['AusleihID', 'AusleihDatum', 'FälligkeitsDatum', 'RückgabeDatum'],
        },
        primaryKeys: {
          Mitglied: 'MitgliedID',
          Buch: 'BuchID',
          Exemplar: 'ExemplarID',
          Ausleihe: 'AusleihID',
        },
        relationships: [
          { name: 'gehört zu', from: 'Exemplar', to: 'Buch', cardinality: 'n:1' },
          { name: 'leiht aus', from: 'Mitglied', to: 'Ausleihe', cardinality: '1:n' },
          { name: 'wird ausgeliehen in', from: 'Exemplar', to: 'Ausleihe', cardinality: 'n:1' },
        ],
      },
    },
    {
      id: 5,
      number: 5,
      title: 'Flughafen-Management',
      szenario: `
        <p><strong>Szenario:</strong></p>
        <p>Ein Flughafen verwaltet Flüge und Passagiere.</p>
        <p>Flug (FlugID, FlugNummer, Abflugzeit, Ankunftszeit) wird mit einem Flugzeug durchgeführt.</p>
        <p>Passagier (PassagierID, Name, Passport, Adresse, Email).</p>
        <p>Bordkarte (BordkartenID, Sitznummer, Status) dokumentiert die Buchung eines Passagiers für einen Flug.</p>
        <p>Flugzeug (FlugzeugID, Modell, Kapazität, Baujahr).</p>
      `,
      masterlösung: {
        entities: ['Flug', 'Passagier', 'Bordkarte', 'Flugzeug'],
        attributes: {
          Flug: ['FlugID', 'FlugNummer', 'Abflugzeit', 'Ankunftszeit'],
          Passagier: ['PassagierID', 'Name', 'Passport', 'Adresse', 'Email'],
          Bordkarte: ['BordkartenID', 'Sitznummer', 'Status'],
          Flugzeug: ['FlugzeugID', 'Modell', 'Kapazität', 'Baujahr'],
        },
        primaryKeys: {
          Flug: 'FlugID',
          Passagier: 'PassagierID',
          Bordkarte: 'BordkartenID',
          Flugzeug: 'FlugzeugID',
        },
        relationships: [
          { name: 'nutzt', from: 'Flug', to: 'Flugzeug', cardinality: 'n:1' },
          { name: 'bucht', from: 'Passagier', to: 'Bordkarte', cardinality: '1:n' },
          { name: 'hat Bordkarte für', from: 'Flug', to: 'Bordkarte', cardinality: '1:n' },
        ],
      },
    },
    {
      id: 6,
      number: 6,
      title: 'Wohnzimmerverwaltung (Property Management)',
      szenario: `
        <p><strong>Szenario:</strong></p>
        <p>Eine Hausverwaltung verwaltet Immobilien und Mieter.</p>
        <p>Immobilie (ImmobilienID, Adresse, Baujahr, AnzahlWohnungen).</p>
        <p>Wohnung (WohnungsID, Etage, Größe, Miete) liegt in einer Immobilie.</p>
        <p>Mieter (MieterID, Name, Telefon, Email) mieten Wohnungen.</p>
        <p>Mietvertrag (VertragID, StartDatum, EndDatum, Miete, Kaution) dokumentiert das Mietverhältnis.</p>
      `,
      masterlösung: {
        entities: ['Immobilie', 'Wohnung', 'Mieter', 'Mietvertrag'],
        attributes: {
          Immobilie: ['ImmobilienID', 'Adresse', 'Baujahr', 'AnzahlWohnungen'],
          Wohnung: ['WohnungsID', 'Etage', 'Größe', 'Miete'],
          Mieter: ['MieterID', 'Name', 'Telefon', 'Email'],
          Mietvertrag: ['VertragID', 'StartDatum', 'EndDatum', 'Miete', 'Kaution'],
        },
        primaryKeys: {
          Immobilie: 'ImmobilienID',
          Wohnung: 'WohnungsID',
          Mieter: 'MieterID',
          Mietvertrag: 'VertragID',
        },
        relationships: [
          { name: 'liegt in', from: 'Wohnung', to: 'Immobilie', cardinality: 'n:1' },
          { name: 'hat', from: 'Mieter', to: 'Mietvertrag', cardinality: '1:n' },
          { name: 'bezieht sich auf', from: 'Mietvertrag', to: 'Wohnung', cardinality: 'n:1' },
        ],
      },
    },
    {
      id: 7,
      number: 7,
      title: 'Universität / Studiendekan',
      szenario: `
        <p><strong>Szenario:</strong></p>
        <p>Eine Universität organisiert Vorlesungen, Studenten und Professoren.</p>
        <p>Student (StudentID, Name, Matrikelnummer, Email).</p>
        <p>Vorlesung (VorlesungsID, Titel, Kredite, Wochenstunden).</p>
        <p>Professor (ProfessorID, Name, Fachbereich).</p>
        <p>Anmeldung (AnmeldungsID, Semester, Note, Status) dokumentiert die Teilnahme eines Studenten an einer Vorlesung.</p>
      `,
      masterlösung: {
        entities: ['Student', 'Vorlesung', 'Professor', 'Anmeldung'],
        attributes: {
          Student: ['StudentID', 'Name', 'Matrikelnummer', 'Email'],
          Vorlesung: ['VorlesungsID', 'Titel', 'Kredite', 'Wochenstunden'],
          Professor: ['ProfessorID', 'Name', 'Fachbereich'],
          Anmeldung: ['AnmeldungsID', 'Semester', 'Note', 'Status'],
        },
        primaryKeys: {
          Student: 'StudentID',
          Vorlesung: 'VorlesungsID',
          Professor: 'ProfessorID',
          Anmeldung: 'AnmeldungsID',
        },
        relationships: [
          { name: 'meldet sich an', from: 'Student', to: 'Anmeldung', cardinality: '1:n' },
          { name: 'hat Anmeldung für', from: 'Vorlesung', to: 'Anmeldung', cardinality: '1:n' },
          { name: 'unterrichtet', from: 'Professor', to: 'Vorlesung', cardinality: '1:n' },
        ],
      },
    },
    {
      id: 8,
      number: 8,
      title: 'Sportverein / Fitnessclub',
      szenario: `
        <p><strong>Szenario:</strong></p>
        <p>Ein Sportverein verwaltet Mitglieder, Kurse und Trainer.</p>
        <p>Mitglied (MitgliedID, Name, Geburtsdatum, Telefon, Email, Beitrittsdatum).</p>
        <p>Kurs (KursID, Titel, Schwierigkeitsstufe, MaximalanzahlPlätze).</p>
        <p>Trainer (TrainerID, Name, Lizenz, Spezialität).</p>
        <p>Kursanmeldung (AnmeldungsID, Anmeldedatum, Status) dokumentiert die Anmeldung eines Mitglieds zu einem Kurs.</p>
      `,
      masterlösung: {
        entities: ['Mitglied', 'Kurs', 'Trainer', 'Kursanmeldung'],
        attributes: {
          Mitglied: ['MitgliedID', 'Name', 'Geburtsdatum', 'Telefon', 'Email', 'Beitrittsdatum'],
          Kurs: ['KursID', 'Titel', 'Schwierigkeitsstufe', 'MaximalanzahlPlätze'],
          Trainer: ['TrainerID', 'Name', 'Lizenz', 'Spezialität'],
          Kursanmeldung: ['AnmeldungsID', 'Anmeldedatum', 'Status'],
        },
        primaryKeys: {
          Mitglied: 'MitgliedID',
          Kurs: 'KursID',
          Trainer: 'TrainerID',
          Kursanmeldung: 'AnmeldungsID',
        },
        relationships: [
          { name: 'unterrichtet', from: 'Trainer', to: 'Kurs', cardinality: '1:n' },
          { name: 'meldet sich an', from: 'Mitglied', to: 'Kursanmeldung', cardinality: '1:n' },
          { name: 'hat Anmeldung für', from: 'Kurs', to: 'Kursanmeldung', cardinality: '1:n' },
        ],
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

    init: function () {
      const saved = localStorage.getItem('erm-editor-quests-v1');
      if (saved) {
        try {
          this.state = { ...this.state, ...JSON.parse(saved) };
        } catch (e) {
          console.warn('Quest-Zustand konnte nicht geladen werden');
        }
      } else {
        this.state.unlockedQuests = [1];
      }
    },

    persist: function () {
      localStorage.setItem('erm-editor-quests-v1', JSON.stringify(this.state));
    },

    startQuestSeries: function (mode) {
      this.state.questMode = mode; // 'grundlagen' oder 'experten'
      this.state.currentQuestNumber = 1;
      if (!this.state.unlockedQuests.includes(1)) {
        this.state.unlockedQuests.push(1);
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

      if (!quest.validator) return { passed: false };

      try {
        const result = quest.validator();
        const maxQuests = this.state.questMode === 'grundlagen' ? 13 : 8;

        if (result.passed && quest.number === maxQuests && !forceRecheck) {
          return { passed: false };
        }

        if (result.passed) {
          if (quest.number === maxQuests) {
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
      this.state = {
        questMode: null,
        currentQuestNumber: 1,
        completedQuests: [],
        unlockedQuests: [1],
        questsPanelVisible: false,
      };
      this.persist();
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
  };

  // ---- Export ----
  window.Quest = QuestManager;
  QuestManager.init();
  // Panel-Zustand nach Seitenneuladen wiederherstellen
  QuestManager.renderPanel();
})();
