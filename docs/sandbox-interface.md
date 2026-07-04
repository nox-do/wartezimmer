# Sandbox-Schnittstelle (Preview + Virenpruefung)

## Ziel

Dieses Dokument beschreibt die fachliche und technische Schnittstelle fuer Dokumentvorschau in der Sandbox:

- Dokument wird vor der **ersten** Vorschau synchron gescannt (ClamAV)
- Vorschau-Slot ist pro **Patient-Upload-Session** (`documents.session_id`), nicht pro MFA-Login
- neues Dokument ersetzt automatisch den Sandbox-Slot dieser Patient-Session
- fachliche Loeschen-Aktion bleibt im Dokument-API (`discard`)

## Leitentscheidungen (v1)

- **Scan vor View ist Pflicht**: ohne Scan keine Vorschau.
- **Sessiongebundener Viewer-Slot**: jede Patient-Upload-Session hat genau ein aktuelles Preview-Dokument im Sandbox-Store.
- **Auto-Replace pro Session**: waehlt MFA ein neues Dokument, wird der Slot ueberschrieben.
- **Keine globale Viewer-Sperre**: mehrere MFAs koennen parallel unterschiedliche Dokumente sehen.
- **Loeschen bleibt fachlich im Dokumentmodul**: `POST /api/v1/documents/{documentId}/discard`.
- **Zwei-Stufen-Preview**:
  - Standard: `interactive_pdf` (sanitized PDF, Client-Interaktion via `pdf.js`)
  - Fallback: `raster_fallback` (seitenweise Bild-/Canvas-Ansicht bei Rendering-Problemen)

## Begriffe

- `mfaSessionId`: angemeldete MFA-Session (aus Auth-Kontext, API-Key-Rolle `mfa`)
- `previewSessionId`: technische Viewer-Session-ID in v1 = `documents.session_id` (Patient-Portal-Session des Tickets)
- `currentDocumentId`: aktuell an diese Session gebundenes Dokument

**Hinweis:** Zwei MFAs am selben Ticket teilen sich denselben Slot, wenn die Dokumente dieselbe Patient-Session nutzen. Parallele Vorschau verschiedener Tickets bleibt getrennt (unterschiedliche `session_id`).

## Externe API (App-Backend)

### 1) Dokument zur Vorschau auswaehlen

- `POST /api/v1/documents/{documentId}/preview`
- Aufrufkontext: MFA-Auth (enthaelt `mfaSessionId`)
- Wirkung:
  - setzt `currentDocumentId` fuer diese MFA-Session
  - startet/erzwingt Scan (immer bei Dokumentuebergabe)
  - startet bei sauberem Scan die Rendervorbereitung im Standardmodus
  - wechselt bei Bedarf automatisch in Fallback-Modus
- Ergebnisstatus:
  - `scanning`
  - `ready`
  - `blocked_malware`
  - `render_error`

Beispielantwort (vereinfacht):

```json
{
  "previewSessionId": "ps_123",
  "documentId": "doc_abc",
  "status": "scanning"
}
```

### 2) Vorschau-Status/Embed-Info lesen (geplant)

- v1 liefert den Preview-Status aktuell im Ergebnis von
  `POST /api/v1/documents/{documentId}/preview` (Feld `preview`).
- Ein separates Session-Status-Read-Endpoint ist fuer v1 nicht aktiv.

### 3) Dokument loeschen (fachlich)

- `POST /api/v1/documents/{documentId}/discard` (MFA) bzw. Patient-Delete
- Regel: App ruft zuerst `DELETE /internal/documents/{documentRef}` auf; DB-Status (`discarded_by_*`) nur bei Erfolg
- Bei Sandbox-Fehler: `502 SANDBOX_UNAVAILABLE`, Dokument bleibt in bearbeitbarem Status
- Wenn `documentId == currentDocumentId` der Preview-Session: Viewer-Status wird auf `empty` gesetzt

## Interne API (App -> Sandbox-Container)

- `PUT /internal/preview/sessions/{previewSessionId}/document`
  - payload: `documentRef`, `mimeType` (liest aus Sandbox-Custody / Intake-Store)
  - Wirkung: synchroner Malware-Scan (ClamAV) auf der Quelldatei, danach `ready` + Embed
- `GET /internal/preview/sessions/{previewSessionId}`
  - status + ggf. `embedPath`
- `DELETE /internal/preview/sessions/{previewSessionId}/document`
  - loescht nur Session-Bindung/Cache, nicht das Fachdokument
- `POST /internal/form2pdf/render`
  - payload: `templateId`, `templateName`, `templateVersion`, `answers`
  - Wirkung: templatebasiertes Formular in PDF rendern, Artefaktpfad + Hash zurueckgeben
- `PUT /internal/documents/{documentRef}/intake` / `GET .../content` / `DELETE ...`
  - Wirkung: Patient-Upload und Formular-PDFs liegen in Sandbox-Custody (`documentRef` = `documents.id`); Export in der App streamt ueber `GET .../content`
- `POST /internal/documents/purge-day`
  - Wirkung: Tagesreset — alle Intake-Artefakte entfernen (App ruft nach Business-Day-Reset auf)
- `GET /internal/scanner/status`
  - Wirkung: liefert Scannerzustand (`enabled`, Engine-Version, Signaturalter, `ready`)
- `POST /internal/scanner/update`
  - Wirkung: stoesst Signaturupdate (`freshclam`) an; Fehler werden als `502 SANDBOX_SCANNER_UPDATE_FAILED` signalisiert
- `POST /internal/runtime/restart`
  - Wirkung: fordert kontrollierten Sandbox-Prozessneustart an (Container respawn durch Restart-Policy)
  - Nutzung: wird vom App-Tagesreset (`day-lifecycle/reset`) intern aufgerufen

Hinweis: Diese Endpunkte sind nur im internen Docker-Netz erreichbar.

## Session- und Parallelitaetsregeln

- Schluessel: `previewSessionId` (= Patient-`session_id` aus Upload)
- Auto-Replace gilt nur innerhalb derselben Patient-Session.
- Zwei MFAs koennen parallel verschiedene **Tickets/Sessions** sehen; gleiche Patient-Session: letzter Preview gewinnt.
- Gleichzeitige Aufrufe in derselben Session: letzter erfolgreicher `preview`-Aufruf gewinnt.
- **Re-Scan:** bei Dokumentwechsel in der Preview-Session; erneutes Oeffnen desselben Dokuments bei `preview_requested` nutzt Sandbox-Cache (kein zweiter ClamAV-Lauf), solange das Custody-Artefakt unveraendert ist.

## Embed-Zugriff (App-Proxy)

- Browser: `GET /internal/preview/embed/{previewSessionId}?access=…&documentId=…`
- Token ist an `previewSessionId` **und** `documentId` gebunden; alte Tokens der Session werden bei neuem Preview widerrufen.
- App-Proxy streamt die Sandbox-Antwort (kein vollstaendiger Buffer auf der App).

## Timeouts (App -> Sandbox, Defaults)

- `SANDBOX_REQUEST_TIMEOUT_MS`: 7000 (JSON/sonstige Calls)
- `SANDBOX_PREVIEW_PUT_TIMEOUT_MS`: max(45000, Scan-Timeout + 10000)
- `SANDBOX_EMBED_TIMEOUT_MS`: 120000 (grosse PDFs)

## Zustandsmodell (pro Session)

- `empty` -> kein Dokument gesetzt
- `scanning` -> Scan laeuft
- `ready` -> Embed verfuegbar
- `blocked_malware` -> Vorschau gesperrt, nur Discard erlaubt
- `render_error` -> Scan ok, Rendern fehlgeschlagen

## Preview-Modi und Fallback-Regeln

- `interactive_pdf` (Standard):
  - Sanitized PDF wird eingebettet; Interaktion (Zoom/Seiten/Suche) ueber `pdf.js`.
- `raster_fallback`:
  - Gerenderte Seitenbilder/Canvas statt interaktivem PDF.
  - Aktiv, wenn `interactive_pdf` technisch fehlschlaegt oder unzuverlaessig ist.

Typische Fallback-Trigger:

- PDF parser/render error
- unsupported/instabile PDF-Features
- Render-/Scan-Timeout
- Qualitaetscheck fehlgeschlagen (z. B. leere/kaputte Seite)

## Fehlerregeln

- Malware erkannt:
  - kein Embed
  - Status `blocked_malware`
  - UI zeigt klare Handlungsoption: `discard`
- Timeout im Scan/Render:
  - Status `render_error` (oder `scan_timeout`)
  - erneuter Preview-Aufruf erlaubt
- Fallback aktiv:
  - Status bleibt `ready`, aber `previewMode=raster_fallback`
  - UI zeigt Hinweis "Kompatibilitaetsmodus"

## Audit/Logging-Minimum

- pro Preview-Aufruf loggen:
  - `previewSessionId`, `documentId`, `resultStatus`, Dauer
- keine Dokumentinhalte im Log
- Malware-Fund als Sicherheitsereignis markieren (ohne Dateiinhalt)
