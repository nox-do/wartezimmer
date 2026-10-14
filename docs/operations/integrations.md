# Integrationen — Grenzen

**Scope:** Was Wartezimmer anbindet oder bewusst **nicht** ist.

Nicht: LAN-TLS/Proxy → [`tls.md`](tls.md) · Compose-Alltag → [`runtime.md`](runtime.md)

## 1. Guest-WLAN und Captive-Grenzen

|                       |                                                                                                                                                                                                                                                                                   |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Wir liefern**       | Portal-UI (`/portal/*`), Wartenummer-Prüfung, Session-API                                                                                                                                                                                                                         |
| **Wir liefern nicht** | Router, AP, Captive-Hardware, eigenen Captive-Datenpfad (DHCP/Firewall/`ndsctl`)                                                                                                                                                                                                  |
| **Session-Hooks**     | `sessions/captive-authorize` (Portal → App; `wlanAuthorized` immer `false` bis Adapter), `sessions/verify-ticket-code` (S2S Bearer `AUTH_KEY_CAPTIVE` / Rolle `captive`)                                                                                                          |
| **Manager heute**     | Gateway stets `enabled: false` (`DISABLED_GATEWAY_PLAN`); Fokus Restricted-Netz / Portal-URL — kein Captive-Wizard in Portal-v1                                                                                                                                                   |
| **Lab**               | openNDS-Gateway-Stack **entfernt** aus dem Repo (Compose/`gateway/`); Historie: [`../archive/gateway-captive-portal.md`](../archive/gateway-captive-portal.md); Adapter-Entwurf: [`../archive/roadmap-captive-portal-adapters.md`](../archive/roadmap-captive-portal-adapters.md) |

WLAN-Hardware bleibt Praxis-IT. Ein öffentliches Internet-Portal gehört nicht zum Produktumfang.
Restricted-IP-/Listener-Grenze (Portal-v1) ist davon getrennt und wird unter
[`tls.md`](tls.md) und [`restricted-lifecycle.md`](restricted-lifecycle.md) beschrieben.

## 2. SMS / WhatsApp — Rückholbenachrichtigungen

**Release 6.1.3:** Wir haben SMS mit echtem Empfang erfolgreich getestet.
WhatsApp haben wir noch nicht praktisch getestet, auch den SMS-Fallback nicht.
Die Funktion bleibt optional, experimentell und standardmäßig deaktiviert.
Bei WhatsApp haben wir außerdem Datenschutzbedenken. Wer es ausprobieren möchte,
sollte vorab den Datenschutz klären und den Versand mit Testempfängern prüfen.
Wir freuen uns über Feedback; bitte keine Zugangsdaten oder Patienteninformationen
mitschicken.

| Provider         | Stand                                         |
| ---------------- | --------------------------------------------- |
| `mock`           | Dev/Test                                      |
| `seven`          | SMS (seven.io)                                |
| `seven_whatsapp` | WhatsApp-Recall über denselben Anbieter-Kanal |

Konfiguration: Ops → Messaging (`ops/messaging/providers`). Credentials Klartext in DB/Backup — [`backup.md`](backup.md).
Fachlich: Rückholbenachrichtigung optional beim MFA-Rückholen, nicht am Standard-Check-in ([`flows.md`](../flows.md)).
Die MFA fragt mündlich nach der Zustimmung und bestätigt sie im Dialog „Abwesend setzen“; am Terminal erscheint keine Zustimmungscheckbox. Bei eingetragener Mobilnummer ist die Bestätigung erforderlich. Eine leere Nummer erlaubt Abwesenheit ohne Benachrichtigung und löscht eine zuvor gespeicherte Rückholzustimmung. Eine Terminalnummer allein berechtigt nicht zum Versand.

Abwesenheit, Mobilnummer und Zustimmung werden über `set_absence` gemeinsam in einer Transaktion gespeichert. Der Zustimmungsnachweis in `visit_recall_consent` enthält Besuch, normalisierte Nummer, Zeitpunkt, MFA-Sitzung und Textversion `mfa-oral-recall-v1`. Die Textversion entspricht der Checkbox `mfa.recallConsentLabel`. Auch Nummernkorrekturen vor einem erneuten Versand erfordern die Bestätigung (`recallConsentConfirmed: true` beim Callback-PUT); der Versand prüft die Zustimmung für die konkrete Nummer erneut. Die Tabelle wird beim Zurücksetzen der Besuchsdaten mit gelöscht.

Der normale Rückholaufruf wählt WhatsApp, wenn aktiviert und vollständig eingerichtet, sonst SMS. Bei eindeutig abgelehntem WhatsApp-Versand folgt SMS; bei Timeout, unlesbarer Antwort oder Serverfehler bleibt der Ausgang **unklar**, ohne automatischen Zweitversand. `notifyChannel: sms` bleibt ein API-Override. Retry nach fehlgeschlagenem SMS-Versuch verwendet wieder SMS.

Pro Besuch speichert `visit_recall_delivery` nur den aktuellen Rückholversand (Fenster, Nummer, Provider-ID und Status), keine Historie. Alle 15 Sekunden fragt die App offene, angenommene Nachrichten über seven `/api/journal/outbound?id=…` ab. `DELIVERED`/`READ` bestätigen die Zustellung; `NOTDELIVERED`/`FAILED`/`REJECTED`/`EXPIRED` erlauben bei WhatsApp einen einmaligen SMS-Fallback. Fehlende oder unbekannte Statuswerte und Abfragefehler lösen keinen Versand aus. Die konkrete WhatsApp-Journalantwort ist vor Inbetriebnahme mit dem eingerichteten Konto zu prüfen.

Die MFA sieht „An Nachrichtendienst übergeben“ getrennt von „Zugestellt laut Nachrichtendienst“. Die Zustellanzeige beruht auf einem passenden `DELIVERED`-/`READ`-Bericht im Anbieterjournal, nicht auf dem erfolgreichen Versandaufruf allein. „Erneut senden“ verwendet die bestehende Nummer und Zustimmung; „Nummer korrigieren“ verlangt eine neue Bestätigung. Unklarer Versand ist nicht automatisch oder über den normalen Retry wiederholbar. Mock-Ergebnisse werden als **Simulation – keine Nachricht verschickt** angezeigt.

Beim normalen Neustart bleiben Ergebnisse erhalten; unterbrochene Sendungen werden als unklar markiert. Nach Rückkehr oder Ablauf erfolgen keine weiteren Versuche. Tagesreset, Update und Restore behalten ihren bisherigen Vertrag: Laufzeitdaten werden verworfen. Providerseitig bereits übergebene Nachrichten lassen sich nicht zurückrufen. `ttl` wird auf die verbleibenden Rückholminuten begrenzt (mindestens eine Minute); SMS-Netze können diese Vorgabe ignorieren.

### Einrichtung und Funktionsprüfung

1. Bei seven.io einen Live-API-Key mit den Berechtigungen `sms` für den Versand und `journal` für die Zustellstatus-Abfrage anlegen. Für WhatsApp zusätzlich `waba` aktivieren; weitere Rechte benötigt diese Integration nicht. Ein Sandbox-Key simuliert den Versand. In Ops → Messaging API-Key, SMS-Absender und SMS-Aktivierung speichern. „Zugangsdaten hinterlegt“ bestätigt nur vorhandene Felder, keinen erfolgreichen Versand.
2. WhatsApp bei seven einrichten: registrierte Absendernummer, API-Key mit WABA-Berechtigung und freigegebenes Template. Vorlage mit genau zwei Textparametern: `{{1}}` = Rückkehrzeit, `{{2}}` = Wartenummer. Praxisname im festen Vorlagentext hinterlegen; keine Diagnose oder Patientennamen aufnehmen. Beispiel: „Praxis Muster: Bitte kommen Sie bis {{1}} Uhr zurück. Ihre Wartenummer {{2}} bleibt bis dahin reserviert.“ Die Freigabe dieses Texts erfolgt beim Anbieter.
3. Absender, Template-Name und freigegebene Sprache in Ops speichern und WhatsApp aktivieren. WhatsApp verwendet vorerst diese konfigurierte Sprache; SMS weiterhin die Check-in-Sprache.
4. Auf kontrollierten Testgeräten SMS allein, WhatsApp und einen Empfänger ohne WhatsApp prüfen. Dabei tatsächlichen Empfang, Journalstatus und genau einen SMS-Fallback beobachten. Fehler-/Timeout-Fälle sind zusätzlich durch automatisierte Tests mit simulierten Antworten abgedeckt.
5. Erst nach erfolgreicher Funktionsprüfung mit Patienten verwenden. Anbietervereinbarung, Verwendungszweck und Speicherdauer legt die Praxis vor dem Einsatz fest.

Antworten der seven-Sandbox mit `debug: "true"` und ohne Nachrichten-ID werden
als `simulated` angezeigt. Sie bestätigen keinen tatsächlichen Versand und liefern
keinen Journal-Zustellbericht. Zustellung und WhatsApp-Fallback müssen mit dem
eingerichteten Konto und kontrollierten Testempfängern geprüft werden.

Providerverträge: [WhatsApp](https://docs.seven.io/en/rest-api/endpoints/whatsapp), [SMS](https://docs.seven.io/en/rest-api/endpoints/sms), [Journal](https://docs.seven.io/en/rest-api/endpoints/logbook).

**Smoke nur in einer isolierten Testinstallation:** Das Skript verändert Providerkonfigurationen und verwendet Dummy-Credentials.

Smoke: `npm run smoke:messaging-recall`. API-Skizze: [`../architecture/apis.md`](../architecture/apis.md).

## 3. Kontaktabgleich über CSV

|           |                                                                                                              |
| --------- | ------------------------------------------------------------------------------------------------------------ |
| **Heute** | Import-Ordner (`CONTACT_LOOKUP_BASE_PATH` / Ops-Pfad), rekursiver CSV-Scan, Preview + Spalten-Mapping in Ops |
| **Nicht** | Vendor-PVS-/KIS-Adapter, PVS-UI im Patientenportal                                                           |

Check-in ohne CSV-Treffer bleibt möglich ([`flows.md`](../flows.md)).

## 4. eGK — nicht implementiert

|                  |                                                                                                                                   |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| **Zweck**        | Terminal-Check-in per eGK statt nur Rufnummer/Geburtsdatum                                                                        |
| **Rolle**        | Adapter, kein Kartenterminal-Produkt                                                                                              |
| **Blocker**      | Terminal-Hardware, Kartenterminal-API, Compliance                                                                                 |
| **API (Skizze)** | `POST /api/v1/identity/egk-lookup` in [`../architecture/apis.md`](../architecture/apis.md) — **kein** produktiver Lookup-Endpoint |

Ops-Toggle/`terminalAuthEgkEnabled` und Flow-Texte beschreiben das Zielbild; produktives TI/eGK ist bewusst Abgrenzung ([`product.md`](../product.md)).

## 5. Verweise

| Thema                          | Dokument                                                                                                                                                                         |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fachliche Abläufe              | [`../flows.md`](../flows.md)                                                                                                                                                     |
| Produkt-Abgrenzung             | [`../product.md`](../product.md)                                                                                                                                                 |
| API / OpenAPI                  | [`../architecture/apis.md`](../architecture/apis.md), `openapi/`                                                                                                                 |
| Captive-Lab / Adapter-Entwurf  | [`../archive/gateway-captive-portal.md`](../archive/gateway-captive-portal.md), [`../archive/roadmap-captive-portal-adapters.md`](../archive/roadmap-captive-portal-adapters.md) |
| Docs-Übersicht „nicht Produkt“ | [`../README.md`](../README.md)                                                                                                                                                   |
