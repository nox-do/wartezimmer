# Plan: Manager — HTTPS aufräumen

Stand: 2026-08-29

Status: **Schnitte 1–3 umgesetzt und reviewt.** Produkt-Happy-Path:
[`plan-proxy-tls-manager.md`](plan-proxy-tls-manager.md). ACME/Compose/Caddy:
[`plan-proxy-tls.md`](plan-proxy-tls.md).

Eine Installation, ein Betreiber, ein Manager. Kein Multi-Tenant, kein
Zentral-Produkt, kein SMTP, kein Captive-Adapter.

---

## Was „Aufräumen“ hier heißt

HTTPS in Assistent und Netzwerk **läuft**. Das Problem ist Drift und
Überzeichnung: neun Fehlerklassen im Vertrag, Copy für alle neun, aber das
Backend setzt die meisten nie; Wizard und Netzwerk erzählen dieselbe Strecke
mit unterschiedlicher Fehler-UI; Status hat eine dritte Sprache.

Aufräumen = **eine Autorität, gemeinsame Begriffe und Copy-Quellen, eine
Aktion pro sichtbarem Fall** — auf der Fläche, die die Strecke wirklich führt.
Kontext-Zusätze bleiben (Wizard: Einrichtung fortsetzen; Status: Manager
schließen). Nicht: überall derselbe Satz. Nicht: neue Schicht, neue FSM,
gemeinsame Prepare-Komponente, Mock als zweiten Vertrag.

---

## Festgelegt (Scope)

1. `GET /host/status` → `tls` (`TlsStatus`) ist die Autorität. Renderer leitet
   keinen zweiten TLS-State aus Wizard-Feldern ab.
2. Assistent Schritt 6 endet bei Mail/PEM (`prepare`). Vorschau/Apply bleiben
   HTTP. Diagnose, Cert, Cutover, Reset, Renew leben unter **Netzwerk**.
3. Zwei Einstiege in `prepare` (Assistent *oder* Netzwerk „Später“) bleiben.
   Das ist Produkt, kein Bug.
4. Apply-Fail: Graph unverändert (`dns-verified` + `applyReady` + `lastError`).
   Sichtbar machen nur im Renderer. Keine `fail`-Transition dafür.
5. Die neun `TlsErrorClass`-Werte bleiben Produktvertrag
   ([`plan-proxy-tls.md`](plan-proxy-tls.md)). Offen ist nur, welche Copy die UI
   **bindet**. Union nicht streichen.
6. Kein Boot-, View-Unmount- oder IPC-Mitnahme.
7. `host-tls.ts` nicht „weil groß“ zerlegen.
8. Mock (`docs/mocks/lan-tls-wizard/`) zeigt Lücken; `TlsStatus` gilt.
9. `state/tls/` (Token, acme-dns, Caddyfile) nicht committen.

### Nicht-Ziele

- Keine zentrale TLS-Policy, kein `appMode: https`
- Keine TLS-State-Machine in `POST /host/network`
- Wizard nicht auf DNS-Warten umbiegen
- Kein Internet-Portal, kein Captive-Produkt
- Kein neues Backup-Format, kein Restore-Wizard
- Kein `GET /tls/operator-request` — Token-Replay über `prepare` gleicher
  Identität (siehe Invariante unten)
- Keine gemeinsame Name/Lease-Svelte-Komponente in diesem Plan (beide Flächen
  nutzen schon `tls-identity.ts` + `TLS_LEASE_STALE_LAN_COPY`)
- Keine Änderung an Renew-/Degraded-Semantik, Rebind- oder Zweitgerät-Fläche
- Portweiterleitungs- und Stale-LAN-Warnung nicht durch Copy-Aufräumen
  entfernen
- Setup-API und `host-tls`-Graph in Schnitt 1 unberührt (kein Lab/Smoke-Umbau)

---

## Ist: zwei Flächen, ein Backend

```text
Assistent 6:  Angebot → Name → Lease → Mail|PEM ──prepare──► awaiting-operator-dns
                                                          │
Netzwerk:     dasselbe, wenn tls.state=off                │
              danach: verify-dns → obtain|check → apply  │
Status:       nur Hinweis + Button „Fortsetzen“ → Netzwerk
```

| Fläche | Dateien | Bis wohin |
| ------ | ------- | --------- |
| Assistent | `wizard-controller.ts`, `WizardHttpsPanel.svelte` | `prepare` + Mail/PEM. Fehler = generischer Footer (`error: string`) |
| Netzwerk | `tls-network-controller.ts`, `TlsNetworkPanel.svelte` | Start *und* Fortsetzung. `tlsErrorCopy` nur bei `tls.state === error` |
| Status | `tlsResumeCard` / `TlsResumeCard.svelte` | Keine Aktionen außer Tab-Wechsel |

Namenswahl (Vorschlag / Label / Domain = Fork managed/custom) sitzt in
`tls-identity.ts`. Wizard-Phasen: `offer | hostname | lease | mail`.
Netzwerk-Start: `offer | hostname | lease` — Mail/PEM folgt dort aus
`tls.state`, nicht als vierte Startphase. Reihenfolge ist gleich, der Assistent
hat einen Extra-Schritt vor Vorschau.

**Prepare-Replay:** Nur wenn `tls.state !== off` und Identität gleich: Rückgabe
ohne Persistenz, ohne ACME-Register, ohne Tokenwechsel, ohne Änderung von
`TLS_LAN_IP`. Der **Erstaufruf** (`state === off`) ist nicht idempotent
(schreibt State/Secrets, registriert extern). Zwei parallele Starts von `off`
sind im Single-User-Manager kein Produktfall.

Identitätswechsel braucht `reset` (Wizard macht das explizit).

---

## Ist: welche Klasse das Backend wirklich setzt

`TlsErrorClass` hat neun Werte. `lastError` auf dem Status ist **kein** DNS-Tagebuch.
Vor Cutover werden `a-record` / `collision` / `dns-filter` beim **Lesen**
(`readTlsStatus`) zu Warten umgebogen: `state → awaiting-operator-dns`,
`lastError → null` (`PRE_CUTOVER_DNS_WAIT_CLASSES`).

`verify-dns` persistiert bei rot **gar keine** Klasse. Es bleibt
`awaiting-operator-dns`, `lastError = null`, und die Checkliste (`checks`) trägt
die Wahrheit (fehlt / Catch-all / andere IP / CNAME).

Die Setup-API antwortet bei Fehlern nur `{ error: message }` — **kein**
`errorClass` im HTTP-Body. Die UI liest Klassen aus `GET /host/status` →
`tls.lastError`, nicht aus der Exception.

| Klasse | Wer setzt persistentes `lastError`? | UI sieht sie wann? |
| ------ | ------------------------------------- | ------------------- |
| `a-record` | nur transient in `verify-dns`-Catch auf der Observation | Checkliste, nicht `tlsErrorCopy` |
| `collision` | **nirgends** als `lastError`. Andere IP vs. Catch-all in `checks[].message` | Checkliste. Copy tot, außer Alt-`.env` |
| `dns-filter` | Typ auf `TlsDnsObservation`, `verifyDnsDefault` setzt ihn **nicht** | Copy tot |
| `isolation` | **nirgends** | Copy tot; Text mischt Gast-WLAN und Port 443 |
| `firewall` | Custom-`check` Catch (Default, nicht PEM-Validierung); **Apply-Fail** schreibt `lastError` auf `dns-verified` ohne `state=error` | Custom-Fail: Error-Block. Apply-Fail: Panel ignoriert `lastError`, nur Controller-`error` |
| `port-443` | **nirgends** | Copy tot |
| `clock` | `validateCustomCertificate` wirft `TlsCertificateError` **vor** persistierendem Catch (Staging, `check-certificate`, Custom-Renew). API liefert nur `message`. | **Nicht** verlässlich in `tls.lastError`. Footer/Controller-Text |
| `acme` | `prepare` (Register), `obtain` (auch Managed-Renew darüber), `repair` (Prepare-Retry) | Network Error-Block; Wizard Exception-Text |
| `cert-name` | wie `clock`: Wurf vor Persistenz | wie `clock` |

`check-certificate` validiert **außerhalb** des `try`; der Catch-Zweig
`error instanceof TlsCertificateError` ist für Staging-PEM praktisch tot.
Lokale Checks werfen `TlsRuntimeUnavailableError` ohne Klasse; `obtain` mappt
das immer auf `acme`.

**Apply-Fail (eigener Fall, kein `error`-State):** nach Rollback bleibt
`state === dns-verified`, `applyReady === true`, `cutoverApplied === false`,
`lastError.class === firewall`. Dann: `tlsCanApply === true`,
`tlsCanRepair === false`. Primäraktion = **erneut apply**. Eine Backend-
`fail`-Transition wäre **nicht** äquivalent: vor Cutover setzt `fail`
`applyReady = false`; Repair stellt das Gate nicht wieder her. Graph und
Apply-Rollback-Test bleiben.

### Betriebsnotiz (nicht Schnitt 1)

- Post-Cutover-`repair`: löscht `lastError` und persistiert, **dann** Reload;
  scheitert der Reload, bleibt der Fehler nur beim Aufrufer.
- Managed Reset: `degraded`/`acme` nur kurz persistiert, sofort mit
  `dns-verified` überschrieben, dann `obtain`.
- Custom Renew: bei Validierungs-/Reload-/Check-Fehler **kein** neues
  persistiertes `lastError`.
- Diese Semantik in diesem Plan **nicht** ändern.

---

## Ist: Copy-Drift

Gemeinsame **Quellen**, nicht wortgleiche Sätze überall.

| Thema | Quelle | Kontext-Zusatz erlaubt |
| ----- | ------ | ---------------------- |
| DNS warten | `tlsDnsWaitCopy` nur bei `state === awaiting-operator-dns` | Wizard: Einrichtung fortsetzen. Status: Manager schließen. **Nicht** auf `error` / `dns-verified` / Obtain |
| DNS rot | Check-Message aus Setup | kein „Name vergeben“ |
| Persistierter Fail | `tlsErrorCopy` bei `state === error && !cutoverApplied` | Status-Resume: gleiche Fail-Wörter, Button „Fortsetzen“. Post-Cutover unverändert |
| Apply-Fail | `tlsErrorCopy` für `lastError` + Apply-Button | nicht Repair |
| Stale LAN | `TLS_LEASE_STALE_LAN_COPY` | **wortgleich** (dasselbe Gate) |
| Cutover | `TLS_CUTOVER_CONFIRM_MESSAGE` | inline und Confirm **dieselbe Konstante** |
| Port 443 weiterleiten | bestehende Warnung | nicht entfernen |

Heute: Netzwerk zeigt `tlsDnsWaitCopy` bei jedem `!cutoverApplied` — das ist
die Drift, die Schnitt 1 schließt.

---

## Vergleichsliste

- [x] `verify-dns` setzt kein persistentes `lastError`; rot = Warten + `checks`
- [x] `obtain` → immer `acme`; Custom-`check` Catch → meist `firewall` (PEM-Validierung nicht darin)
- [x] `clock` / `cert-name` nicht verlässlich in `lastError`; API ohne `errorClass`
- [x] `apply`-Fail: `firewall` auf `dns-verified` + `applyReady`; Repair-Gate greift nicht
- [x] `isolation` / `port-443` / `dns-filter` / `collision` als `lastError`: unbenutzt
- [x] Wizard nach Prepare-Fehler: Footer, keine Klassen-Copy
- [x] Network `startPhase` vs. Wizard: gleiche Name/Lease-Reihenfolge; Mail nur Wizard-Schritt
- [x] Token-Replay: nur Replay-Zweig idempotent
- [x] Reset vor Cutover: leer; nach Cutover managed = Reissue, custom = kein HTTP-Rollback
- [x] Mutierende Fehler (`apply`, `obtain`/`check`, `prepare`): Backend persistiert, Controller-`fail()` ruft kein `onAfterMutation` — `lastError` erst nach Poll/Tab

---

## UI-Gates (Schnitt 1)

Drei Fälle, nicht zwei:

| Fall | Gate | Copy | Primäraktion |
| ---- | ---- | ---- | ------------ |
| **Warten** | `state === awaiting-operator-dns` | Checkliste + `tlsDnsWaitCopy` | DNS prüfen |
| **Persistierter Fail** | `state === error && !cutoverApplied` | `tlsErrorCopy(lastError)` | `repair` wenn `tlsCanRepair`; Reset sekundär |
| **Apply-Fail** | `dns-verified && applyReady && !cutoverApplied && lastError` | `tlsErrorCopy(lastError)` (heute `firewall`) | **erneut apply**; nicht repair |

`tlsDnsWaitCopy` nicht bei `error`, `dns-verified`, `obtaining-certificate`.

Post-Cutover (`cutoverApplied`): Schnitt 1 **nicht** umbauen — Renew/Degraded/`tlsCanRepair` nach Cutover bleiben. Das Panel-Gate `error && !cutoverApplied` existiert schon; die Tabelle darf es nicht aufweichen.

Nach mutierendem API-Fehler zuerst Status holen (`onAfterMutation`), dann Gates am neuen `tls` auswerten. Ohne Refresh sieht der Renderer `lastError` nicht — Apply-Fail und persistierter Fail wären nur Footer. Client-Validierung (Lease-Haken, Name) bleibt Footer ohne Refresh. Structured Notice aus `lastError`; `state.error` nur Fallback, wenn nach Refresh kein `lastError` da ist (PEM/`clock`).

---

## Schnitte (Reihenfolge, klein)

- [x] Schnitt 1 — Netzwerk
- [x] Schnitt 2 — Wizard
- [x] Schnitt 3 — Status

Schnitte 1–3 umgesetzt und reviewt.

### 0 — Tabelle in diesem Dokument halten

Wenn Backend eine Klasse neu setzt oder Copy ändert: hier eine Zeile.

### 1 — Netzwerk: drei Fälle sichtbar (nur Renderer) — **erledigt**

Dateien: `tls-network-view-model.ts`, `TlsNetworkPanel.svelte`,
`tls-network-controller.ts` (Refresh nach mutierendem Catch), deren Tests.
Kein `host-tls.ts`, keine Setup-API, kein Lab/Smoke.

- Gates wie oben. Post-Cutover-Zweig unverändert.
- Catch von `apply` / `obtainOrCheck` / `prepare` (`submitLease`): nach `fail`
  `onAfterMutation` (Status). Dann Notice aus `lastError`, Footer nur Fallback.
- Copy nur für Klassen schärfen, die **wirklich** in `lastError` landen
  (`acme`, `firewall` inkl. Apply-Fail). `cert-name`/`clock`: Fallback im
  Switch darf bleiben; keine Mini-UI, bis Setup sie persistiert.
- `isolation`: nicht bewerben, solange ungesetzt; kein WLAN-Adapter vortäuschen.

### 2 — Wizard: nur Prepare/PEM — **erledigt**

Footer-Fehler bleibt. Kein DNS-Diagnose-Wizard. Prepare-Fail darf
`tlsErrorCopy('acme')` nutzen — ein Import. PEM-Fehler: Exception-`message`
(Klasse kommt nicht über die API).

### 3 — Status: gemeinsame Begriffe, keine zweite Aktion — **erledigt**

Resume-Titel an `tlsNetworkSubtitle` / dieselben Warte- vs. Fail-Wörter.
Button „Fortsetzen“. Kein „unter Netzwerk“ in der Copy. Warte-Zusatz
(Manager schließen) nur im DNS-Warte-Fall. Apply-Fail nicht als
„Installation fehlgeschlagen“ ohne Cutover-Kontext. Kein Cutover auf Status.

### 4 — Bewusst nicht

- `host-tls.ts` splitten; Apply-Fail auf `fail` umbiegen
- Local-Check-IDs auf neun Klassen mappen
- Name/Lease-Markup zusammenziehen
- Mock-Fehler-UI für ungesetzte Klassen
- `errorClass` in die Setup-HTTP-Fehlerantwort (eigener Auftrag)

---

## Abgrenzung zu den anderen Plänen

| Dokument | Rolle |
| -------- | ----- |
| `plan-proxy-tls.md` | Caddy, ACME-DNS, Overlay, Port 443; Klassenliste im Vertrag |
| `plan-proxy-tls-manager.md` | Mailtext, Namenswahl, Cutover-Warnung, Flächen-Soll |
| **dieses** | Drift Assistent/Netzwerk/Status; welche Klasse die UI wann zeigt |

Konflikt: Produktpläne zuerst lesen, dann **hier** eine Zeile entscheiden.
