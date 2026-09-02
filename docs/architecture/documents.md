# Dokumente — Sandbox & Anamnese-Vorlagen

Stand: 2026-08-31 · Ist (Sandbox-Client, Compose-Volumes, `app/src/shared/forms/`)

**Scope:** App↔Sandbox-Vertrag, Container/Pipeline, Formular-Template-Konvention.  
Nicht: Compose-Ports allgemein → [`../operations/runtime.md`](../operations/runtime.md) · API-Rollen → [`apis.md`](apis.md)

## 1. Sandbox-Schnittstelle (Ist)

- Scan vor erster Vorschau **Pflicht** (ClamAV, synchron)
- Viewer-Slot pro **Patient-Upload-Session** (`documents.session_id` = `previewSessionId`), nicht pro MFA-Login
- Auto-Replace innerhalb derselben Patient-Session; mehrere MFAs an **verschiedenen** Tickets parallel möglich
- Fachliches Löschen: `POST /api/v1/documents/{id}/discard` (App); Sandbox nur Custody/Preview

### App-API (MFA)

| Aktion          | Endpoint                       | Wirkung                                                                                                                               |
| --------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| Vorschau wählen | `POST /documents/{id}/preview` | Scan + Render-Vorbereitung; Status im Response (`scanning` / `ready` / `blocked_malware` / `render_error`) inkl. `preview`-Embed-Info |
| Verwerfen       | `POST /documents/{id}/discard` | zuerst `DELETE /internal/documents/{ref}`; bei Sandbox-Fehler `502 SANDBOX_UNAVAILABLE`, DB unverändert                               |

Kein separates Preview-Status-GET — Status kommt aus dem Preview-POST.

**Zwei-Stufen-Preview:** Standard `interactive_pdf` (pdf.js); Fallback `raster_fallback` (Seiten/Canvas) — Kompatibilitätsmodus, kein Fehlerzustand.

### Intern App → Sandbox (nur Docker-Netz)

| Endpoint                                       | Zweck                                                 |
| ---------------------------------------------- | ----------------------------------------------------- |
| `PUT /internal/preview/sessions/{id}/document` | Scan + Preview binden                                 |
| `GET /internal/preview/sessions/{id}`          | Status / Embed-Pfad                                   |
| `DELETE …/document`                            | Slot/Cache lösen, nicht Fachdokument                  |
| `PUT/GET/DELETE /internal/documents/{ref}/…`   | Intake-Custody (`documentRef` = `documents.id`)       |
| `POST /internal/form2pdf/render`               | Template → PDF                                        |
| `POST /internal/documents/purge-day`           | Tagesreset Intake                                     |
| `GET/POST /internal/scanner/status\|update`    | ClamAV-Lage / `freshclam`                             |
| `POST /internal/runtime/restart`               | kontrollierter Prozessneustart (u. a. nach Day-Reset) |

Auth: interner Token (`SANDBOX_INTERNAL_TOKEN`). MFA spricht **nur** `app`; Embed über App-Proxy (Session+Dokument gebunden).

## 2. Sandbox-Container

| Grenze             | Ist                                                                                                                                      |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Erreichbarkeit     | nur Compose-Netz, kein Host-Port                                                                                                         |
| Fachentscheidungen | App (Discard/Export)                                                                                                                     |
| ClamAV             | lokal in Sandbox; Signaturen Volume `clamav_db`                                                                                          |
| Lifecycle          | `restart: unless-stopped`; kein Spawn pro Login/Dokument; Neustart bei Deploy/Crash/Admin/**Tagesreset** (`purge-day` + Runtime-Restart) |

**Pipeline:** MFA Preview → App bindet Session → Sandbox Scan → `interactive_pdf` oder Fallback → Embed via App-Proxy → Auto-Replace bei neuem Dokument derselben Session.

Volumes: `sandbox_intake_data` (Custody), `clamav_db`; Preview-Artefakte ephemer. App `SANDBOX_DOCS_BASE_PATH` = Allowlist für Embed-Proxy (kein Shared-Volume nötig). MIME-Allowlist + Größenlimit; Egress minimal (Signaturupdates).

Ops-Volumes/Compose: [`../operations/runtime.md`](../operations/runtime.md) § Persistenz.

## 3. Anamnese-Vorlagen

Konvention unter `app/src/shared/forms/`:

```text
template-registry.ts
consent/privacy-notice-v1.ts
templates/definitions/*.v1.ts + index.ts
templates/sections/<id>.sections.ts   # titleKey + pdfTitle + fieldIds
```

Portal: `ui/src/lib/portal/anamnese-*.ts` — lädt Template inkl. Sections von `GET …/form-templates/{id}`.

| Feld Definition    | Bedeutung                                             |
| ------------------ | ----------------------------------------------------- |
| `id`               | stabile kebab-case API-ID                             |
| `name` / `version` | Anzeige / Inkrement bei Feldänderung                  |
| `category`         | `erstanamnese` \| `kurz` \| `stammdaten` \| `spezial` |
| `fields`           | API-Contract                                          |

Neues Template: Definition + Sections + Index-Eintrag.  
Datenschutz: Consent-Text + Template `datenschutz-einwilligung` → zweites PDF über form2pdf (`source=form`).

Menü `/portal/menu` wählt aktuell ein Default-Template fest. Nicht in `templates/`: Sandbox-Renderer, OpenAPI, MFA-Dokumentenliste.

## 4. Abgrenzung

| Nicht hier                          | Wohin                                                   |
| ----------------------------------- | ------------------------------------------------------- |
| Endpoint-Rollen MFA vs. Portal      | [`apis.md`](apis.md)                                    |
| Tagesreset fachlich                 | [`system.md`](system.md) §5                             |
| Weitere Formulare (Kurzanamnese, …) | noch nicht umgesetzt — bei Bedarf neues Definition-Paar |
