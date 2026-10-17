# PVS-Anbindung — geplanter Umfang und Architektur

Stand: 17. Oktober 2026. Planungsstand, noch kein implementierter Vertrag.

Ziel sind zwei zusammenhängende Funktionen: einen Besuch einem bestehenden
PVS-Patienten zuordnen und ein geprüftes Dokument aus der MFA-Vorschau an dessen
Patientenakte übertragen. Die Anbindung bleibt herstellerunabhängig; die tatsächliche
Kompatibilität wird je unterstütztem Adapter beziehungsweise Profil geprüft.

## 1. Fachlicher Ablauf

1. **Anmeldung:** Den vorhandenen Lookup für Nachname + Geburtsdatum oder
   Telefonnummer + Geburtsdatum gegen die konfigurierte Patientendatenquelle nutzen.
   Eine automatische PVS-Zuordnung setzt einen eindeutigen Treffer und eine stabile
   externe Patientenkennung voraus. Ein Name oder eine Telefonnummer allein genügt
   dafür nicht. Ohne Treffer, bei Mehrdeutigkeit oder ausgefallenem Lookup bleibt
   der Check-in möglich.
2. **Zuordnung:** Patientenkennung und zugehörigen Patientenbestand am Besuch
   speichern. Anzeigename und PVS-Zuordnung bleiben getrennt. Die Zuordnung kann
   auch erst später durch die MFA erfolgen.
3. **Vorschau:** Dokument und Zielpatient mit Name, Geburtsdatum und externer
   Patientennummer anzeigen. Bei vorhandener Zuordnung ist keine erneute Suche
   nötig. Ein eindeutiger Lookup-Treffer wird als einzelnes Ziel angeboten;
   andernfalls sucht und wählt die MFA über einen Ablauf ähnlich der vorhandenen
   Kontaktsuche beim Abwesenheit-Setzen. Kein Treffer bedeutet Suche korrigieren
   oder Übertragung abbrechen, nicht eine Patientenakte anlegen.
4. **Übertragung:** Die MFA prüft Dokument und Ziel und löst „An PVS übertragen“
   aus. Der Server prüft Zuordnung, Berechtigung, Dokumentfreigabe und Verbindung.
   Ohne gültiges Ziel findet keine Übertragung statt.
5. **Ergebnis:** Bereitstellung zur Übergabe und bestätigte PVS-Übernahme getrennt
   anzeigen. Ein unbekannter Ausgang ist ein eigener Zustand und kein sicherer
   Fehlschlag, der blind erneut gesendet werden darf.

Eingegebene Merkmale und Lookup-Treffer sind Zuordnungshilfen, kein
Identitätsnachweis des Patienten. Eine spätere Namensänderung in der Oberfläche
ändert keine externe Patientenreferenz.

## 2. Bausteine und Zuständigkeiten

Die Komponenten laufen zunächst als Module der bestehenden App. Es ist kein
zusätzlicher Dienst, Container oder lokaler Hintergrundagent vorgesehen.

| Baustein         | Verantwortung                                                                  | Grenze                                                      |
| ---------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------- |
| Lookup-Adapter   | Kontakte suchen und Kandidaten mit externer Referenz liefern                   | entscheidet nicht über Dokumentübergaben                    |
| Besuchszuordnung | eindeutigen Treffer oder MFA-Auswahl am Besuch festhalten                      | verändert keine PVS-Stammdaten                              |
| Dokumentübergabe | festes Ziel, Dokument, Versuch und Ergebnis verwalten                          | kennt keine GDT-Feldkennungen oder Herstellerpfade          |
| Übergabeadapter  | Datei oder Stream mit dem vereinbarten Transport übergeben, Ergebnis melden    | entscheidet nicht selbst, welcher Patient gemeint ist       |
| Sandbox          | bestehende Dokumentverwahrung, Scan, Vorschau und freigegebenen Inhalt liefern | kennt weder PVS-Zugangsdaten noch Patientenzuordnungsregeln |

Flow-Core bleibt für Patient und Besuch im Ablauf zuständig. Externe Zuordnung
und Dokumentübergaben gehören in die App und ihre Persistenz, nicht als
GDT-spezifische Felder in den Flow-Core. „Attribut am Visit“ bezeichnet fachlich
die Zuordnung zum Besuch; die konkrete Speicherung kann eine eigene Tabelle mit
`visit_id` sein. Eine Änderung der Flow-Core-Patientenverwaltung ist dafür nicht nötig.

## 3. Identitäten und Mapping

| Kennung                                 | Bedeutung und Eigentümer                                                                 |
| --------------------------------------- | ---------------------------------------------------------------------------------------- |
| `patientId` intern                      | unsere lokale Patient-UUID; aktuell beim Check-in neu erzeugt, keine PVS-Patientennummer |
| `visitId`                               | unser konkreter Besuch; Bezugspunkt der Zuordnung                                        |
| Wartenummer                             | Anzeige im Tages- und Nummernkreis, keine externe Identität                              |
| `identityRef`                           | bestehender Anzeigename/Freitext; keine belastbare PVS-Referenz                          |
| `documentId`                            | unser Dokument und Bezugspunkt der Übergabe                                              |
| `patientNamespace` + `patientId` extern | konkrete Patientenakte in einem bestimmten externen Patientenbestand                     |
| `connectionId`                          | konfigurierte Verbindung zum Zielsystem mit Transport und Einstellungen                  |
| `transferId`                            | unsere konkrete Dokumentübergabe zur Nachverfolgung                                      |

Geplante externe Referenz, Feldnamen noch vorläufig:

```ts
type ExternalPatientRef = {
  patientNamespace: string;
  patientId: string;
};
```

Die externe Patientennummer bleibt unverändert als Zeichenfolge erhalten,
einschließlich führender Nullen. Der Namespace bezeichnet den Patientenbestand,
nicht bloß den Hersteller. Dieselbe Nummer in zwei Beständen bezeichnet nicht
automatisch dieselbe Person. Mehrere Verbindungen können denselben Bestand nutzen.

Die Besuchszuordnung hält die Referenz, ihre Herkunft (eindeutiger Lookup oder
MFA-Auswahl), Zeitpunkt und bei manueller Auswahl die handelnde MFA fest.
Der Zielpatient muss anhand der zur Auswahl verwendeten Merkmale prüfbar bleiben.
Vom Client übermittelter Freitext begründet keine Zuordnung; der Server validiert
die ausgewählte Referenz gegen die konfigurierte Quelle.

Jede gestartete Übergabe hält Dokument, externe Zielreferenz und Verbindung fest.
Eine spätere Korrektur der Besuchszuordnung adressiert laufende oder abgeschlossene
Übergaben nicht um. Während einer laufenden Übergabe wird eine widersprechende
Neuzuordnung abgewiesen. Die Übernahme der Zuordnung bei einem Besuchsnachfolger
(Topic-Supersede) muss ausdrücklich geregelt werden; ein neuer unabhängiger
Check-in übernimmt sie nicht automatisch.

## 4. Lookup und Übergabe sind getrennte Schnittstellen

Erste Lookup-Quelle ist die vorhandene CSV-Anbindung, ergänzt um eine explizite
Spalte für die PVS-Patientennummer und den konfigurierten Patientenbestand.
CSV-Zeilennummer, Dateiname und Personenname ersetzen diese Kennung nicht.
Eindeutigkeit muss anhand externer Referenzen bewertet werden; verschiedene
Patienten dürfen nicht aufgrund gleicher Namen zusammengefasst werden.

GDT ist ein möglicher Übergabeadapter. Es bietet allein keinen allgemeinen
Suchzugriff auf den Patientenstamm. Ein PVS-seitig ausgelöster Stammdatenexport
ist ein anderer Ablauf und zunächst nicht Teil dieser Planung.

Der GDT-Adapter bildet die externe Patientennummer auf Feld 3000 ab. Sender und
Empfänger sind konfigurierte Kommunikationskennungen, keine Patienten- oder
Besuchs-IDs. Dokumentverweis, Pflichtfelder, Zeichensatz und Version richten sich
nach dem unterstützten Profil. Unsere internen IDs werden nicht als
PVS-Patientennummer ausgegeben.

Die Architektur erlaubt spätere API-Adapter. Das bedeutet keine Zusage, bereits
beliebige PVS-APIs zu implementieren. Ein Adapter darf nur Ziele aus dem ihm
zugeordneten Patientenbestand bedienen.

## 5. Direkte Übergabe und Dokumentlebenszyklus

Der PVS-Weg verwendet nicht den bisherigen allgemeinen Export mit Warteordner
und zusätzlicher JSON-Metadatei. Er erzeugt keine zweite Dokumentablage oder ein
Archiv in unserer App. Der bestehende manuelle Dateiexport ist ein separater
Bestandsweg; sein Ausbau oder seine Entfernung ist nicht Teil dieses Vorhabens.

- **API-Adapter:** Inhalt nach Möglichkeit aus der Sandbox zum Ziel streamen.
- **GDT-Adapter:** Datei im vereinbarten PVS-Übergabeverzeichnis bereitstellen.
  Diese transportbedingte Bereitstellung gehört zum Adapter. Dokument vollständig
  veröffentlichen, danach erst die auslösende GDT-Datei. Container- und
  PVS-seitig erreichbare Pfade müssen explizit abgebildet werden.

Dokumentstatus und Übergabestatus sind getrennte Sachverhalte. Geplant sind
mindestens laufend, bereitgestellt, bestätigt übernommen, fehlgeschlagen und
Ausgang unklar. Nicht jeder Adapter kann eine Übernahme bestätigen. Eine
erfolgreiche Dateiablage oder das Verschwinden einer Datei beweist sie nicht.

Übergabe-Metadaten dürfen für Fehlerbehandlung und Nachvollziehbarkeit gespeichert
werden; eine zusätzliche Inhaltskopie ist nicht vorgesehen. Doppelklicks und
konkurrierende Übergaben desselben Dokuments müssen abgefangen werden. Nach
ungewissem Ausgang ist vor einer Wiederholung eine Klärung erforderlich;
garantierte einmalige PVS-Ablage ist ohne Unterstützung des Empfängers nicht zusagbar.

Die bestehende Exportfunktion darf nicht unverändert vorgeschaltet werden:
Sie löscht die Sandbox-Quelle nach der Dateiablage. Für jeden PVS-Adapter muss vor
Freigabe feststehen, wann die Verantwortung für die Datei übergeht und wann
Sandbox-Quelle und Übergabedateien entfernt werden dürfen. Ebenso müssen
Entlassung, Tagesreset und Sandbox-Neustart mit laufenden oder unklaren Übergaben
abgestimmt sein. Es gibt keine Zusage dauerhafter Wiederholbarkeit: Die bestehende
Sandbox-Verwahrung ist flüchtig.

## 6. Ausdrückliche Nicht-Ziele

- Kein eigenes PVS und kein dauerhafter, synchronisierter Patientenstamm.
- Keine Anlage, Zusammenführung oder Änderung von Patientenakten im PVS.
- Kein Rückschreiben von Telefonnummern, Adressen oder anderen Stammdaten.
- Keine automatische Zuordnung allein aus Namen, Telefonnummern oder unscharfer Ähnlichkeit.
- Keine Identitätsprüfung oder Patientenanmeldung im PVS durch den Lookup.
- Keine automatische Anmeldung in unserer Warteliste durch einen GDT-Watcher.
- Keine Übertragung allein durch Upload, Formularabschluss oder Entlassung;
  die MFA löst sie aus der Vorschau aus.
- Keine Rücksynchronisation von PVS-Behandlungsstatus, Terminen, Abrechnung oder Wartelisten.
- Kein Import von PVS-Dokumenten, keine strukturierte Befund-/Diagnosenübernahme;
  übertragen wird das geprüfte Dokument.
- Keine neue Dokumentablage, kein Langzeitarchiv und keine dauerhafte lokale Versandwarteschlange.
- Keine direkte Manipulation der PVS-Datenbank und keine Automatisierung seiner Oberfläche.
- Keine pauschale Zusage für alle Hersteller, GDT-Versionen, Dateiformate oder kostenfreie PVS-Freischaltungen.
- Kein universelles Integrationsframework und kein zusätzlicher Dienst für den ersten Umfang.

## 7. Geprüfte Integrationspunkte im bestehenden Code

### Wiederverwenden

| Bestehender Teil                                                            | Verwendung für die PVS-Anbindung                                                                            |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `app/src/shared/contacts/csv-scanner.ts`, `csv-encoding.ts`                 | CSV-Erkennung, Listen/Einzeldateien, Zeichensätze und Parser beibehalten                                    |
| Normalisierung unter `app/src/shared/contacts/` und `app/src/shared/phone/` | Namen, Geburtsdaten und Telefonnummern für die Suche normalisieren; daraus keine externe Identität ableiten |
| `app/src/routes/identity-routes.ts`                                         | MFA-Suchendpoint mit Validierung und Rate-Limit weiterverwenden und um die Referenz ergänzen                |
| `ui/src/lib/components/mfa/MfaCheckinModal.svelte`                          | Such-/Trefferauswahl als gemeinsamen Teil herauslösen; keinen zweiten Suchdialog unabhängig nachbauen       |
| `ui/src/lib/components/mfa/DocumentPreviewOverlay.svelte`                   | bestehende Vorschau, Dokumentauswahl und Anzeige der Scan-/Preview-Freigabe nutzen                          |
| `app/src/shared/sandbox/sandbox-client.ts`                                  | freigegebenen Dokumentinhalt aus bestehender Sandbox-Verwahrung beziehen                                    |
| `app/src/shared/sandbox/sandbox-intake-gate.ts`                             | bestehende Sperren für laufende Dokumentarbeit, Entlassung und Tagesreset nutzen                            |
| Staff-Authentifizierung und Rollenprüfung                                   | neue Zuordnungs- und Übergabeaktionen im vorhandenen Berechtigungsmodell absichern                          |

### Erweitern

| Integrationspunkt                                                                            | Erforderliche Änderung                                                                                                                                                                       |
| -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app/src/shared/contacts/contact-lookup-runtime.ts`                                          | gemeinsame Kandidaten mit optionaler externer Referenz liefern; bisherige Namensergebnisse für Bestandsaufrufer daraus ableiten; exakten Abgleich und MFA-Teilsuche fachlich getrennt halten |
| `contact-lookup-config.ts`, `contact-lookup-preview.ts`, `csv-scanner.ts`                    | optionales Mapping der PVS-Patientennummer und konfigurierten Namespace durch Validierung, Vorschau und Selector-Auflösung führen                                                            |
| `contact-lookup-cache.ts`, `contact-lookup-day-refresh.ts`                                   | Cache und Telefonindex um Referenzen erweitern; vorhandene Invalidierung/Erneuerung nutzen und Quellkonfiguration berücksichtigen                                                            |
| Kandidatenschlüssel in Backend und MFA-UI                                                    | unterschiedliche PVS-IDs auch bei gleichen Personenmerkmalen getrennt halten; keine Zusammenfassung allein über Name, Geburtsdatum und Telefon                                               |
| `ui/src/lib/components/ops/OpsContactLookupForm.svelte`, Ops-Settings und `openapi/ops.yaml` | Mapping und Quellenkonfiguration ergänzen; CSV ohne PVS-Kennung bleibt für Bestandsfunktionen verwendbar                                                                                     |
| `app/src/routes/checkin-routes.ts`, `app/src/shared/flow-core/flow-core-checkin.ts`          | automatische Zuordnung serverseitig ermitteln und zusammen mit dem Besuch konsistent speichern; vorhandener Freitext-Fallback bleibt ausschließlich Anzeige                                  |
| `ui/src/lib/mfa/mfa-checkin-api.ts`, `MfaCheckinModal.svelte`                                | gewählten Kandidaten zur serverseitigen Prüfung übermitteln; bisher wird beim Check-in nur `identityRef` weitergegeben                                                                       |
| `app/src/shared/flow-core/visit-supersede-bridge.ts`                                         | bestehende Übernahme von Host-Zustand und Dokumenten um die geregelte Patientenreferenz ergänzen; gestartete Übergaben behalten ihren ursprünglichen Zielbezug                               |
| `DocumentPreviewOverlay.svelte`, `ui/src/lib/documents/document-api.ts`                      | Zielpatient, gegebenenfalls Suche/Auswahl, PVS-Aktion und getrennte Übergabeanzeige ergänzen                                                                                                 |
| Dokumentlisten, Pending-Zählung, Entlassung und Tagesreset                                   | Übergaben und Dokumentabschluss gemeinsam berücksichtigen; das vorhandene Gate kennt nur laufende Operationen, keine extern noch ausstehenden Übernahmen                                     |
| `openapi/identity.yaml`, `checkin.yaml`, `documents.yaml` und Auth-Routenregeln              | Referenzen und neue Aktionen vertraglich ergänzen; generierte Schemas und Typen anschließend regulär erzeugen                                                                                |

Die heutige MFA-Suche beendet die Suche am Ergebnislimit. „Ein sichtbarer Treffer“
ist deshalb kein eigenständiger Nachweis der Eindeutigkeit. Automatische Zuordnung
benötigt einen vollständigen exakten Abgleich oder eine explizite Aussage über
Mehrdeutigkeit; die begrenzte Teilsuche bleibt der manuellen Auswahl vorbehalten.

### Neu

- Kleiner gemeinsamer Lookup-Vertrag mit CSV als erster Implementierung und
  optionaler externer Referenz. Keine parallele CSV-Suche nur für PVS-Zwecke.
- Besuchszuordnungsmodul mit App-seitiger Persistenz, serverseitiger Prüfung der
  Referenz sowie Aktionen zum Lesen, Setzen und Korrigieren einer Zuordnung.
  Vorzugsweise eigene Tabelle mit `visit_id`; `identity_ref_override` bleibt Anzeige.
- Übergabemodul mit persistenten Metadaten, festem Ziel, Versuch/Ergebnis und
  Schutz vor konkurrierendem Versand, einschließlich Serveraktion und Statusabfrage.
- Übergabeadapter-Vertrag und erster GDT-Adapter mit profilbezogener Konfiguration,
  Pfadabbildung, Veröffentlichung und Bereinigung der Transportdateien.
- Gezielte Prüfungen für ID-Erhalt, gleichnamige Patienten, fehlende Kennungen,
  manipulierte/veraltete Auswahl, Doppelsenden, unklaren Ausgang und Lebenszyklus.

### Bewusst nicht als PVS-Implementierung übernehmen

`app/src/shared/queue/mark-absence-lookup.ts` sucht einen bereits vorhandenen Besuch
über Telefonnummer oder Wartenummer. Sein CSV-Fallback vergleicht Anzeigenamen.
Diese Besuchssuche darf keine PVS-Zuordnung begründen. Wiederverwendbar sind der
gemeinsame Kontakt-Lookup und das Bedienmuster, nicht diese Zuordnungsregel.

`app/src/shared/documents/filesystem-export.ts` und der Endpoint
`export-filesystem` sind der bestehende manuelle Export. Ihre Warteordnerstruktur,
JSON-Metadatei, Abschlussstatus und sofortige Sandbox-Bereinigung bilden keinen
PVS-Übergabeprozess ab. Der neue Weg nutzt die bestehenden Freigabeprüfungen und
den Inhaltszugriff, ruft aber nicht zuerst diesen Export auf.

## 8. Rückwärtsprüfung aus Sicht der Integration

Die bestehenden OpenAPI-Verträge beschreiben unsere Clients, noch keine
vollständige PVS-Anbindung. Im ersten Umfang ruft das PVS unsere HTTP-API nicht
auf: Es liefert den CSV-Bestand mit stabiler Patientenkennung und übernimmt
Dokumente über den vereinbarten GDT-Dateiweg. Unsere MFA-Oberfläche ruft die
App auf; die App verwendet Lookup und Übergabeadapter. CSV und GDT benötigen
zusätzlich einen dokumentierten Dateivertrag, den OpenAPI nicht ersetzt.

### Use-Case 1: Anmeldung und Zuordnung

Vom späteren Ziel rückwärts ergibt sich diese Kette:

```text
PVS-Akte ← externe Patientenreferenz am Besuch
         ← eindeutiger exakter Abgleich oder geprüfte MFA-Auswahl
         ← Kontakt mit PVS-Patientennummer aus konfiguriertem Bestand
```

Heute liefern `phone-dob-lookup` und `mfa-lookup` keine externe Referenz;
`POST /checkins` übernimmt unter anderem einen Anzeigenamen. Die externe
Zuordnung kann damit noch nicht durchgängig abgebildet werden.

Der geplante Vertrag muss festlegen:

- Lookup-Kandidaten enthalten optional die externe Referenz. Kein Treffer,
  mehrere Treffer, fehlende externe Kennung und nicht verfügbare Quelle werden
  fachlich unterscheidbar behandelt. Der Check-in bleibt in allen Fällen möglich.
- Automatisches Matching erfolgt serverseitig mit den strengeren Kriterien.
  Manuelle Auswahl wird gegen die Quelle geprüft. Eine vom Terminal gesendete
  externe Referenz oder ein `identityRef` ist kein vertrauenswürdiger Nachweis.
- Eine MFA kann die Zuordnung eines vorhandenen Besuchs lesen, setzen und
  korrigieren. Reine Namensänderungen bleiben davon unabhängig.
- PVS-IDs, Kandidatenlisten und Übergabedetails werden nur für den erforderlichen
  Staff-Kontext ausgeliefert; Terminal, Portal und TV benötigen sie nicht.
- Die CSV-Quelle und die Zielverbindung beziehen sich nachweislich auf denselben
  Patientenbestand. Referenzen aus einem anderen Bestand werden abgewiesen.
  Ein Quellenwechsel darf bestehende Zuordnungen nicht still umdeuten.

Die Quelle ist ein Exportbestand, keine zugesagte Live-Suche im PVS. Aktualisierung,
Kennungsstabilität und der Umgang mit inzwischen geänderten oder zusammengeführten
PVS-Akten müssen im Einrichtungsvertrag beschrieben werden. Ohne verlässliche
Kennung wird keine automatische Zielzuordnung zugesagt.

### Use-Case 2: Vorschau und Dokumentübergabe

```text
PVS-Ablage ← unterstütztes Profil + erreichbares Dokument + externe Patientenreferenz
           ← Übergabe mit festgehaltenem Ziel und auswertbarem Status
           ← MFA-Aktion auf geprüftem Dokument und zugeordnetem Besuch
```

Heute existiert nur `export-filesystem` mit Dokumentstatus als Antwort. Es fehlen
ein PVS-Übergabevertrag und eine getrennte Statusabfrage.

Geplant sind folgende fachliche Operationen; konkrete Pfade werden erst mit dem
OpenAPI-Entwurf festgelegt:

| Operation                          | Erforderlicher Vertrag                                                                                                                     |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Zuordnung lesen/setzen/korrigieren | Besuch, externe Referenz, Herkunft, Prüfdaten und Versions-/Konfliktschutz                                                                 |
| PVS-Übergabe starten               | Dokument und erwartete Zuordnungsversion; Server fixiert Ziel und passende Verbindung und prüft die Freigabe                               |
| Übergabe lesen                     | `transferId`, festes Dokument/Ziel, laufend/bereitgestellt/bestätigt/fehlgeschlagen/unklar, gegebenenfalls Fehler und erlaubte Folgeaktion |
| Wiederholung nach geklärtem Fehler | kein paralleler Zweitversand; Ausgang und bisherige Übergabe müssen berücksichtigt werden                                                  |

Zuordnungsversion beziehungsweise gleichwertiger Konfliktschutz verhindert,
dass eine MFA ein Dokument nach einer zwischenzeitlichen Zieländerung unbemerkt
an einen anderen Patienten sendet. Der Klick darf keine abweichende freie
Patientennummer oder einen beliebigen Dateipfad einschleusen.

Die Startantwort bestätigt nur den tatsächlich erreichten Zustand, keine
automatische Aktenablage. Ohne Importbestätigung endet die maschinelle Aussage
bei „bereitgestellt“. Die Oberfläche muss diesen Zustand auch nach dem Schließen
der Vorschau wiederfinden können. Wiederholte Startaufrufe dürfen nicht zu
unkontrollierten neuen Übergaben führen.

### Was die Praxis-IT zur Einrichtung benötigt

1. CSV-Vertrag: Spalten, Zeichensatz, Aktualisierung und stabile Patientennummer;
   Zuordnung zum konkreten Patientenbestand.
2. GDT-Profil: Version, Pflichtfelder, Kommunikationskennungen, unterstützte
   Dokumenttypen und Importauslösung.
3. Transportvertrag: erreichbare Verzeichnisse/Pfade, Zugriffsrechte,
   Veröffentlichungsreihenfolge sowie Verantwortungsübergang und Bereinigung.
4. Rückmeldevertrag: was als bestätigt gilt, was ohne Bestätigung sichtbar bleibt
   und wie fehlgeschlagene oder unklare Übergaben geklärt werden.

Ein Aufruf unserer API durch ein externes PVS ist kein Bestandteil dieses
ersten Umfangs. Dafür wären separat ein Integrationsclient mit eigenen
Berechtigungen und ein externer API-Vertrag nötig. MFA-Cookies, Captive-Schlüssel
oder ein Rollenheader sind kein dafür vorgesehener Ersatz. Ein späterer
ausgehender API-Adapter benötigt ebenfalls einen eigenen Herstellervertrag und
passende Zugangsdaten, aber nicht automatisch eine eingehende PVS-API.

## 9. Umsetzung und noch offene Entscheidungen

1. Bestehenden Lookup um externe Referenzen erweitern, Besuchszuordnung und
   MFA-Auswahl durchgängig abbilden. Die tatsächlichen Matching-Regeln müssen die
   strengere PVS-Zuordnung von der bisherigen Namensanzeige unterscheiden.
2. Zielpatient und Aktion in die Vorschau aufnehmen, Übergaben unabhängig vom
   allgemeinen Dateiexport führen.
3. Ein GDT-Profil gegen ein konkretes Test-PVS erproben. Das ist ein
   Kompatibilitätsnachweis, keine Herstellerbindung der Domain.

Vor produktiver Freigabe offen: konkretes GDT-Profil und verfügbare Rückmeldungen,
unterstützte Dokumentformate (zunächst PDF anstreben), Pfade und Dateinamensregeln,
Verantwortungsübergang und Bereinigung, Umgang mit unklarem Ausgang sowie
Lebenszyklus bei Entlassung, Tagesreset und Besuchsnachfolge. Ein API-Adapter ist
eine spätere Erweiterung, kein Bestandteil des ersten GDT-Umfangs.

Bestehende Architektur: [Dokumente](architecture/documents.md),
[Host und Flow-Core](architecture/transaction-ownership.md).

## 10. Internetrecherche: Erfahrungen und Konsequenzen

Recherche vom 17. Oktober 2026. Anwenderberichte sind Hinweise auf konkrete
Integrationsprobleme, keine Zusage über alle Versionen eines PVS. Ältere Fehler
können inzwischen behoben sein. Technische Herstellerantworten sind jeweils vom
Anwenderbericht zu unterscheiden. Die folgenden Anforderungen sind unsere
Ableitung aus den Quellen.

### Befunde und Quellen

- **Unser Grundablauf wird praktisch eingesetzt:** Ein tomedo-Anwender beschreibt
  einen lokalen CSV-Bestand mit Patienten-ID, Zuordnung und PDF-Import über GDT.
  Laut Bericht funktioniert die Ablage, allerdings wird zusätzlich die GDT-Datei
  als unerwünschter Anhang importiert. Der Bericht beschreibt auch OCR-basierte
  Zuordnung; diese übernehmen wir nicht in unseren Umfang.
  [tomedo: GDT-Import mit Anhang, Diskussion März 2026](https://forum.tomedo.de/index.php/116965/gdt-import-mit-anhang-aber-bitte-ohne-gdt-datei).
- **Dateiverschwinden ist kein Übernahmenachweis:** Ein MEDICAL-OFFICE-Anwender
  berichtet im Juli 2024 von einer kommentarlos gelöschten GDT ohne PDF-Import.
  Die technische Antwort nennt fehlende Felder als häufige Ursache und verlangt
  für diesen PDF-Import die Feldkennungen 6302–6305. Ein weiterer Anwender berichtet
  im Mai 2025 von verarbeiteten Daten, aber einem gelöschten und nicht importierten
  PDF. Die Ursache des zweiten Falls ist damit nicht abschließend geklärt.
  [MEDICAL OFFICE: AMEDTEK-Import, Juli 2024](https://forum.indamed.de/index.php?page=Thread&threadID=9879),
  [MEDICAL OFFICE: PDF-Import, Seite 2, Mai 2025](https://portal.indamed.de/forum/topic/pdf-importieren-mit-parametern-name-kategorie-zuordnen/?part=2).
- **Importauslösung ist Teil der Kompatibilität:** Die TURBOMED-Anleitung
  beschreibt den Import beim Beenden der externen Anwendung sowie einen manuellen
  Import, wenn die Datei zu diesem Zeitpunkt noch nicht geschrieben ist. Daraus
  folgt keine pauschale Aussage, dass sämtliche TURBOMED-Konfigurationen einen
  Hintergrundimport ausschließen. Ein jederzeit aktiver Ordnerimport ist durch
  das Vorhandensein von GDT aber nicht belegt.
  [CGM: TURBOMED-Anbindungsanleitung, Handbuch 25.4.2](https://support.cgm.com/CGM_TURBOMED/Handbuch_%28Version_25.4.2%29/GDT_Schnittstelle_anbinden/GDT-Schnittstelle_-_Anbindungsanleitung).
- **Patientennummern können unterschiedliche Kennungsräume haben:** Im
  tomedo-Forum werden alternative Patientenkennungen aus Altsystemen und ein
  Export mit einer speziell konfigurierten Kennung beschrieben. Wir müssen die
  Übereinstimmung zwischen CSV-Kennung und erwartetem GDT-Ident prüfen, statt nur
  eine beliebige Spalte namens Patientennummer zu übernehmen.
  [tomedo: Import ohne Patientennummer, April 2023](https://forum.tomedo.de/index.php/66713/import-gdt-datei-auch-ohne-patientennummer),
  [tomedo: abweichende Exportkennung, April 2024](https://forum.tomedo.de/index.php/82693/wie-kann-man-beim-gdt-export-verhindern-dass-die-patientennummer-mit-ur-ubertragen-wird).
- **Netzpfade und mehrere Importmechanismen können kollidieren:** Ein Bericht
  beschreibt unterschiedliche Mountpfade eines Netzlaufwerks an verschiedenen
  Arbeitsplätzen. Ein anderer beschreibt Konflikte zwischen geändertem
  GDT-Anhangimport und einem zusätzlich konfigurierten PDF-Lauscher nach einem
  Update. Die Prüfung muss am tatsächlich importierenden Arbeitsplatz erfolgen.
  [tomedo: Netzlaufwerk und Dateilauscher, 2021](https://forum.tomedo.de/index.php/47503/datei-lauscher-verstehen-gdt-anbindung-wackelig),
  [tomedo: Importprobleme nach Quartalsupdate, 2023](https://forum.tomedo.de/%E2%80%A6r/qa-theme/zollsoft-theme/favicon/index.php/69917/gdt-import-spinnt-seit-quartalsupdate).

Auf Reddit fanden sich ergänzende, aber weniger konkrete Aussagen zum
Einrichtungsaufwand und zu spezialisierten Supportmitarbeitern. Sie sind kein
technischer Nachweis bestimmter Importfähigkeiten.
[Reddit: x.vianova-Datenexport](https://www.reddit.com/r/de_EDV/comments/1su7jbo/spezifische_frage_f%C3%BCr_pvs_mvz_datenexport_aus/).
Die gezielte Suche auf Stack Overflow nach medizinischem GDT,
Gerätedatentransfer und Satzart 6310 lieferte keine belastbaren einschlägigen
Beiträge; das ist keine Aussage, dass dort grundsätzlich keine existieren.

### Verbindliche Eigenschaften eines unterstützten GDT-Profils

Zusätzlich zu Version und Feldbelegung muss jedes freigegebene Profil festhalten:

1. **Importauslösung:** Unterstützt es unsere aus der Vorschau ausgelöste Übergabe
   ohne vorherigen Programmstart aus dem PVS? Ein ausschließlich an einen
   PVS-seitigen Geräteaufruf gebundener Rückweg erfüllt diesen Ablauf nicht.
   Eine nötige manuelle PVS-Aktion muss ausdrücklich als Einschränkung ausgewiesen
   werden; sie ist keine nahtlose Übertragung aus unserer Vorschau.
2. **Kennungsraum:** Welche Patientenkennung erwartet Feld 3000, und entspricht
   diese exakt der Lookup-Quelle? Präfixe und führende Nullen bleiben erhalten.
3. **Dateiverantwortung:** Kopiert das PVS den Inhalt in seine Verwahrung oder
   speichert es einen Verweis auf unsere Übergabedatei? Ein dauerhafter Verweis
   auf eine von uns zu betreibende Inhaltsablage erfüllt unser Nicht-Ziel einer
   eigenen dauerhaften Dokumentablage nicht.
4. **Arbeitsplatz und Pfade:** Welcher Prozess auf welchem Rechner importiert,
   welche Pfade sieht er, und welche anderen Lauscher greifen auf die Dateien zu?
5. **Akteneintrag:** Welcher Titel, welche Kategorie und welche Anhänge entstehen?
   Eine zusätzlich importierte GDT-Datei ist als Verhalten zu dokumentieren.
6. **Ergebnis und Bereinigung:** Welche Rückmeldung bestätigt tatsächlich die
   Übernahme, und wer darf welche Datei wann löschen? Ohne Bestätigung bleibt die
   maschinelle Aussage bei „bereitgestellt“.

### Praktischer Nachweis für unseren Dokument-Use-Case

PDF aus unserer Vorschau bei geschlossener Zielakte übertragen. Anschließend die
richtige Akte öffnen und Patient, vollständigen PDF-Inhalt, Titel, Kategorie und
Anhänge prüfen. Soweit möglich auch bei einer anderen geöffneten Patientenakte
testen. Nach der vereinbarten Bereinigung der Übergabedateien muss das Dokument
weiterhin aus dem PVS verfügbar sein.

Ergänzend den Betrieb mit mehreren Dokumenten, konkurrierenden MFA-Aktionen,
unterbrochener Verbindung und Neustart des Importprozesses prüfen. Diese Tests
belegen die konkrete Profil-/PVS-Konfiguration, nicht automatisch alle Hersteller
oder Versionen. Ein erfolgreicher manueller Test ersetzt keine im Produkt
auswertbare Importbestätigung.
