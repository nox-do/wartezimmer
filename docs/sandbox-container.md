# Sandbox-Container (Scan + Render)

## Ziel

Der Sandbox-Container liefert eine isolierte, eingebettete Dokumentvorschau mit vorgeschaltetem Virenscan und minimalem Betriebsaufwand.

## Rolle im System

- nimmt interne Preview-Auftraege vom `app`-Service an
- scannt Dokumente vor jeder Vorschau (Pflichtschritt)
- rendert freigegebene Dokumente in ein einbettbares View-Format (Standard + Fallback)
- verwaltet nur sessionbezogene Preview-Artefakte (keine fachliche Dokumenthoheit)

## Container-Grenzen (v1)

- **Erreichbarkeit**: nur intern im Docker-Netz
- **Keine direkte MFA-Kommunikation**: MFA spricht nur mit `app`
- **Keine Fachentscheidungen**: Loeschen/Export bleibt im Dokumentmodul des `app`
- **Scanner-Engine lokal**: ClamAV laeuft in der Sandbox-Zone; Signaturen liegen im dedizierten `clamav_db`-Volume

## Spawn-/Restart-Policy (v1)

- Sandbox wird als normaler Compose-Service betrieben (`restart: unless-stopped`).
- **Kein Neu-Spawn pro Praxisoeffnung**, pro MFA-Login oder pro Dokument.
- Regelfall:
  - Start beim System-/Compose-Start
  - dauerhaft laufend waehrend Betrieb
- Neustart nur bei:
  - Deployment/Update,
  - Crash/Healthcheck-Failure,
  - Host-Neustart,
  - manuellem Admin-Restart,
  - **Tagesreset** (`day-lifecycle/reset` → `purge-day` + kontrollierter Runtime-Restart).

## Interner Ablauf (Pipeline)

1. MFA ruft `POST /api/v1/documents/{documentId}/preview` am **app**-Service auf.
2. **app** bindet das Dokument an die Patient-`previewSessionId` und ruft die Sandbox intern auf (`PUT /internal/preview/sessions/...`).
3. Quelldatei kommt aus dem Sandbox-**Intake-Store** (`documentRef` = `documents.id`; Upload/Form2PDF liegen dort in Custody).
4. Virenscan (ClamAV) laeuft synchron bei Dokumentuebergabe.
5. Bei sauberem Ergebnis: Standard-Render `interactive_pdf`.
6. Bei Problemen im Standard-Render: Fallback `raster_fallback`.
7. Embed wird ueber den **App-Proxy** an den Browser geliefert (Token an Session + Dokument gebunden).
8. Bei neuem Dokument fuer dieselbe Session: alter Preview-Slot wird ersetzt.

Details: `docs/sandbox-interface.md`.

## Session-Isolation

- pro `previewSessionId` eigener Slot (`currentDocumentId`, `status`, `embedArtifact`)
- kein Cross-Session-Sharing von laufenden Artefakten
- bereinigtes Ersetzen bei Auto-Replace (alte Artefakte freigeben)

## Preview-Modi (v1)

- `interactive_pdf`:
  - sanitized PDF fuer Client-Interaktion (Zoom/Seiten/Suche via `pdf.js`)
- `raster_fallback`:
  - seitenweise Bild-/Canvas-Ausgabe fuer robuste Kompatibilitaet

Fallback ist kein Fehlerzustand, sondern ein expliziter Kompatibilitaetsmodus.

## Sicherheitsvorgaben

**v1 (umgesetzt):**

- nur intern im Docker-Netz erreichbar (kein oeffentlicher Port)
- Tagesreset: Intake wird geleert, Container-Neustart — kein Langzeit-State in der Sandbox
- Virenscan (ClamAV) vor jeder Vorschau
- MIME-Allowlist (z. B. PDF, JPEG, PNG)
- Groessenlimit pro Datei (konfigurierbar)
- Netzwerk-Egress minimal halten (nur noetig fuer Signaturupdates, falls aktiviert)
- Schreibzugriff praktisch nur auf explizite Mounts (`sandbox_intake_data`, `clamav_db`) plus ephemere Preview-Artefakte

**Optional / spaeter (nicht v1):**

- non-root (`USER node` o. a.) — aktuell laeuft der Prozess als root; fuer den isolierten, taeglich resetteten Betrieb akzeptiert
- readonly root filesystem — aktuell nicht gesetzt; Hauptrisiko wird durch interne Erreichbarkeit und Tages-Lebenszyklus abgefedert

## Volumes und Speicher

Compose (`docker-compose.yml`, `docker-compose.delivery.yml`):

| Mount / Volume               | Service | Pfad im Container                     | Zweck                                                                                                                |
| ---------------------------- | ------- | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `sandbox_intake_data`        | sandbox | `/var/lib/praxis-flow/sandbox-intake` | Patient-Uploads + Form2PDF-Custody (`SANDBOX_INTAKE_BASE_PATH`); Tagesreset via `POST /internal/documents/purge-day` |
| `clamav_db`                  | sandbox | `/var/lib/clamav`                     | ClamAV-Signatur-DB (`freshclam` beim Start / manuell)                                                                |
| — (ephemeral)                | sandbox | Preview-Artefakte im Prozess          | Session-Preview-Cache; bei Container-Restart verwerfbar                                                              |
| Env `SANDBOX_DOCS_BASE_PATH` | app     | Default `/var/lib/praxis-flow/docs`   | Pfad-Allowlist fuer Sandbox-Embed-Proxy (kein Shared Volume mit Sandbox noetig)                                      |

**Nicht mehr v1:** separates `docs_data`-Volume (fruehe Entwuerfe). Nach Upgrade ungenutztes Docker-Volume `praxis_flow_docs_data` optional entfernen (`docker volume rm`, wenn leer/unlinkt).

Logs: stdout → Docker `json-file` mit Rotation (`max-size` / `max-file` in Compose), kein separates `logs_data`-Volume.

**Day-Reset:** App leert Intake per `purge-day`, dann `POST /internal/runtime/restart` → Sandbox-Prozess exit, Compose startet Container neu; Intake-Volume wird geleert, ClamAV-DB bleibt.

## Health und Betriebschecks

- `GET /internal/health/live` -> Prozess lebt
- `GET /internal/health/ready` -> scan + render pipeline bereit
- Readiness prueft zusaetzlich:
  - Scanner erreichbar
  - Signaturstand nicht aelter als `CLAMAV_MAX_SIGNATURE_AGE_HOURS`

## Fehlerverhalten

- Scanfehler/Timeout -> kein Embed, Status `blocked_malware` oder `scan_error`
- Renderfehler -> Status `render_error`
- Standard-Render fehlgeschlagen, Fallback erfolgreich -> Status `ready`, `previewMode=raster_fallback`
- Container-Neustart:
  - Sessionstatus wird aus `app` neu aufgebaut
  - alte ephemere Artefakte duerfen verloren gehen

## Update-/Maintenance-Regeln

- fester Image-Tag, kein `latest`
- Signaturupdate-Strategie klar festlegen:
  - Start-Hook (`CLAMAV_AUTO_UPDATE_ON_START=true`) versucht `freshclam` beim Containerstart
  - Versuch wird in `/var/lib/clamav/freshclam-last-attempt.json` persistiert; Log: `/var/log/clamav/freshclam.log`
  - zusaetzlich manueller Trigger ueber `POST /internal/scanner/update`
  - fuer Offline-Praxen: kontrollierter, manueller Updateprozess
- Logrotation aktivieren (Docker json-file driver in Compose; siehe `docs/deployment-docker.md`)

## Nicht-Ziele (v1)

- keine vollstaendige Content-Extraktion/OCR
- keine direkte Bearbeitung/Annotation im Viewer
- kein direkter Dateidownload aus Sandbox
